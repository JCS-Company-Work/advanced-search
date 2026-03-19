class TileFilter {

    /** ---------------------------
     * Constructor & Initialization
     * --------------------------- */
    constructor() {

        // Initialise full state with safe defaults
        this.state = {
            activeFilters: {},
            pagination: {
                page: 1,
                // REMOVED: perPage: 33,  // Don't hardcode this
                pages: {}
            },
            activeItems: [],   // after filters applied
            visibleItems: [],   // after pagination applied
            parentVisibleItems: []
        };

        // Array to hold tile data from reference JSON file
        this.tiles = [];

        // Guard flag to prevent hash writes during hashchange handling
        this._handlingHashChange = false;

        // Activate methods required on page load
        this.init();

    }

    // Functions to initialise on DOMContentLoaded
    init = () => {
        // Parse hash FIRST to get page number and filters from URL
        this.deserializeHash();
        
        this.loadBatches();
        this.activateFilters();
        this.liveTextSearch();
        this.activateSorting();
        this.setInitialPage();
        
        // Listen for hash changes (back/forward browser navigation)
        this.listenForHashChanges();
    }

    // Ensure initial #page=1 hash if pagination is present and no page is specified
    setInitialPage = () => {

        setTimeout(() => {
            if (document.querySelector('.mixitup-page-list') && !window.location.hash.match(/page=\d+/)) {
                history.replaceState(null, '', window.location.pathname + window.location.search + '#page=1');
            }
        }, 0);

    }

    async loadBatches() {

        // Build endpoint URL dynamically
        const endpoint = ESAS.category && ESAS.category.toLowerCase() !== 'all' 
            ? `${ESAS.endpoint}?category=${ESAS.category}`
            : ESAS.endpoint;

        try {
            const res = await fetch(endpoint, { method: 'GET' });

            if (!res.ok) throw new Error('Network response was not ok');

            const data = await res.json();
            console.log(data);

            this.tiles = data;

            this.loadInitialState();

        } catch (err) {
            console.error('Failed to load products:', err);
            return [];
        }
    } 

    loadInitialState = () => {

        // Build initial activeFilters from URL
        this.deserializeHash(); // no longer overwrites activeFilters

        // Check if there are active filters
        const isActive = Object.keys(this.state.activeFilters).length > 0 ? true : false;

        if(isActive) {

            // Activate active filters in panel
            for (const key in this.state.activeFilters) {
                    
                if (Object.prototype.hasOwnProperty.call(this.state.activeFilters, key)) {

                    // Extract active values for current filter group
                    const values = this.state.activeFilters[key];

                    // Loop over active values
                    values.forEach(value => {
                        if (key !== 'textsearch') {
                            const el = document.querySelector(`[data-toggle="${value}"]`);
                            if (el) {
                                el.classList.add('mixitup-control-active');
                            } else {
                                console.warn(`No element found for data-toggle="${value}"`);
                            }
                        }
                    });
                }
            }

            // Activate Reset Filters button
            this.setupResetButton();

        }

        // Update results but DON'T reset page - we already loaded it from the hash
        this.displayResults(false);

    }

    activateSorting = () => {

        const sortEl = document.querySelector('.control-group .dropdown');

        sortEl.addEventListener('click', () => {

            const selectedText = sortEl.querySelector('.select span').textContent;

            const dropdownMenu = sortEl.querySelectorAll('.dropdown-menu > li > a');

            dropdownMenu.forEach(menuItem => {

                if(menuItem.textContent == selectedText) {

                    const sortingParams = menuItem.getAttribute('data-sort');

                    this.applySort(sortingParams);
                }

            });

        });

    }

    applySort(value) {
        // value will be something like "menu-order:asc"
        // Split if you need key + direction:
        const [key, direction] = value.split(':');

        // Convert key to camel case
        const camelKey = key.replace(/-([a-z])/g, (_, c) => c.toUpperCase());;

        // Example: sort elements with class .product-tile
        const container = document.querySelector('.product-list');
        const tiles = Array.from(container.children);

        tiles.sort((a, b) => {
        const aVal = parseFloat(a.dataset[camelKey]);
        const bVal = parseFloat(b.dataset[camelKey]);
        return direction === 'asc' ? aVal - bVal : bVal - aVal;
        });

        tiles.forEach(tile => container.appendChild(tile));
        
    }

    /** ---------------------------
     * UI Setup / Event Binding
     * --------------------------- */
    activateFilters = () => {

        // Handle filter button clicks
        document.querySelectorAll('#accordion .control').forEach(button => {

            button.addEventListener('click', () => {
        
                // Toggle the button's selected state
                button.classList.toggle('mixitup-control-active');
        
                // Extract value of currently selected filter
                const value = button.getAttribute('data-toggle');
        
                // Extract value of current filter group
                const group = button.closest('.control-group').getAttribute('data-filter-group');
        
                // Initialize array if group doesn't exist in activeFilters
                if (!this.state.activeFilters[group]) {
                    this.state.activeFilters[group] = [];
                }
        
                // Add or remove the filter value in the activeFilters object
                if (button.classList.contains('mixitup-control-active')) {
        
                    // If filter button is currently active, add value to the state object
                    this.state.activeFilters[group].push(value);
        
                } else {
        
                    // Check for value in current filter group in state object
                    const index = this.state.activeFilters[group].indexOf(value);
        
                    // If value is found, remove it from the filter group
                    if (index > -1) {
        
                        this.state.activeFilters[group].splice(index, 1);
        
                    }
        
                    // Check if filter group is empty so remove it from state object to ensure selectors are created correctly
                    // This logic controls the correct return of results after filters are unchecked but not when the rest button is clicked
                    if(Object.values(this.state.activeFilters[group]).length === 0) {
        
                        // Check the number of currently active properties
                        const stateProps = Object.keys(this.state.activeFilters).length;
        
                        // Check if there are other active properties on state object
                        if(stateProps > 1) {
        
                            // Delete empty property if there are
                            delete this.state.activeFilters[group];
        
                        } else if(stateProps <= 1) {
        
                            // If this is the only active property, reset activeFilters to an empty array
                            this.state.activeFilters = [];
        
                        }
                        
                    }
        
                }

                // show hide tiles based on results
                this.displayResults(true);

                // Update hash based on selection
                this.setHash();

            });
        
        });
    
    }

    liveTextSearch = () => {

        // Save search input to global variable
        this.filterInput = document.querySelector(".live-filter");
    
        // Debounce function to optimize performance
        const debounce = (func, delay) => {

            let timeout;

            return (...args) => {

                clearTimeout(timeout);
                timeout = setTimeout(() => func.apply(this, args), delay);

            };

        };
    
        // Main filtering logic
        const filterList = () => {

            // User search query lowercased and with whitespace trimmed
            const query = this.filterInput.value.trim().toLowerCase();

            if (query) {

                // Add search value to state
                this.state.activeFilters['textsearch'] = [query];

                // Add mixitup-control-active to search input as we have query value
                this.filterInput.classList.add('mixitup-control-active');
                
            } else {

                // Remove key if query is empty
                delete this.state.activeFilters['textsearch']; 

                // Remove mixitup-control-active from search input as we have no query
                this.filterInput.classList.remove('mixitup-control-active');
            }

            // Update hash based on selection
            this.setHash();

            // Filter tiles on page
            this.displayResults(true);

        };

        // Prevent Enter key from submitting the form
        this.filterInput.addEventListener("keydown", (event) => {
            if (event.key === "Enter") {
                event.preventDefault();
            }
        });
    
        // Attach debounced event listener
        this.filterInput.addEventListener("input", debounce(filterList, 200));

    }; 

    setupResetButton = () => {

        const resetBtn = document.getElementById('reset-filters');
        if (!resetBtn) return;

        // Attach click listener once
        resetBtn.addEventListener('click', this.reset);

        // Toggle "active" class based on whether filters are applied
        if (Object.keys(this.state.activeFilters).length > 0) {
            resetBtn.classList.add('active');
        } else {
            resetBtn.classList.remove('active');
        }
    };

    reset = (event) => {
        if (event) event.preventDefault();

        // Clear search input
        if (this.filterInput) this.filterInput.value = "";

        // Remove active classes from all filter buttons
        document.querySelectorAll('.ui-accordion button.mixitup-control-active')
            .forEach(btn => btn.classList.remove('mixitup-control-active'));

        // Reset state
        this.state.activeFilters = {};
        this.state.pagination.page = 1;

        // Update URL hash
        this.setHash();

        // Show all tiles
        document.querySelectorAll('.product-list > li').forEach(tile => {
            tile.classList.remove('hide', 'displaynoneclass');
            tile.classList.add('show');
        });

        // Refresh results and counts
        this.displayResults(true);
        this.countResults();

        // Update reset button state
        this.setupResetButton();
    };

    /** ---------------------------
     * Filtering Logic
     * --------------------------- */

    /**
     * Filters the full list of tiles based on the current active filters in the state.
     * @returns {Array} Filtered list of tiles
     */
    filterTiles = () => {

        if (!Object.keys(this.state.activeFilters).length) {
            return [...this.tiles].sort((a,b) => a.menu_order - b.menu_order);
        }

        // Filter tiles based on all active filters while guarding against null/undefined tile values.
        const filteredParents = this.tiles.filter(tile =>

            Object.entries(this.state.activeFilters).every(([key, value]) => {

                // No active values for this key → always pass.
                if (!value?.length) return true;

                if (key === 'textsearch') {
                    // Join all tile values into a single string and search
                    const text = Object.values(tile).join(" ").toLowerCase();
                    const valueWords = value[0].split(/\s+/);
                    return valueWords.every(word => text.includes(word));

                } else if(key === 'categories') {

                    // Match if any filter value (which may be multi-word) appears within the categories string
                    return value.some(item =>
                        tile.categories.includes(item.toLowerCase())
                    );

                } else if (key === 'decor') {
                    // Guard: ensure tile[key] is an array before using .includes()
                    return Array.isArray(tile[key])
                        ? tile[key].includes('bookmatch')
                        : false;

                } else if(key === 'usage') {

                    // Check for matching values between value array and JSON array as can be multiple matches
                    return value.some(item => tile[key].includes(item));

                } else if(key === 'quantity') {

                    // For quantity, value will be an array of band strings like ["sqm-50-60", "sqm-80+"]
                    // Return true if the tile matches ANY selected band
                    return value.some(band => {

                        // Parse the band string to get min and max values
                        const sqmBand = this.parseSqmBand(band);
                        
                        // If max is '+' we only need to return tiles with quantity greater than the minimum
                        if (sqmBand.max === '+') {
                            return tile[key] >= sqmBand.min;
                        }

                        // Otherwise, return tiles within the min-max range (inclusive)
                        return tile[key] >= sqmBand.min && tile[key] <= sqmBand.max;

                    });


                } else {

                    // Normalise both sides to lowercase string arrays
                    const fieldValues = Array.isArray(tile[key])
                        ? tile[key].map(val => (val || '').toString().toLowerCase())
                        : [(tile[key] || '').toString().toLowerCase()];

                    const filterValues = Array.isArray(value)
                        ? value.map(val => (val || '').toString().toLowerCase())
                        : [(value || '').toString().toLowerCase()];

                    // Match if ANY filter string is contained within ANY field string
                    return fieldValues.some(fieldString =>
                        filterValues.some(filterString => fieldString.includes(filterString))
                    );
                }
            })
        );


        // Include all children of filtered parents
        const filteredTiles = [];
        filteredParents.forEach(parent => {
            filteredTiles.push(parent);
            if (parent.children && parent.children.length) {
                filteredTiles.push(...parent.children);
            }
        });

        return filteredTiles.sort((a,b) => a.menu_order - b.menu_order);
    };

    /**
     * Parse a sqm band string (e.g. "sqm-50-60" or "sqm-50+") into an object with min and max numeric values.
     * 
     * @param {string} band 
     * @returns {Object} An object with `min` and `max` properties representing the numeric range.
     */
    parseSqmBand(band) {

        // Remove 'sqm-' prefix
        let str = band.replace(/^sqm-/, '');

        // If it's a plus band (e.g. '80+')
        if (str.endsWith('+')) {
            return { min: parseInt(str.replace('+', ''), 10), max: '+' };
        }

        // Split on dash for range
        const [min, max] = str.split('-').map(Number);

        // Return as numbers
        return { min, max };

    }

    getDOMIds() {

        const allDomIds = this.activeIDs();

        return this.state.activeItems.filter(item =>
            allDomIds.includes(item.id)
        );

    }

    setVisibleParentItems() {
    
        // Loop over all top-level parent <li> elements
        return Array.from(document.querySelectorAll('.product-list > li')).filter(parentEl => {

            const parentId = parseInt(parentEl.getAttribute('data-postid-order') || parentEl.getAttribute('data-id'), 10);

            // Check if parent itself matches any active/visible items
            const parentMatches = this.state.visibleItems.some(item => item.id === parentId);

            // Check if any child group-option matches active/visible items
            const childrenMatch = Array.from(parentEl.querySelectorAll('.group-option[data-id]')).some(childEl => {
                const childId = parseInt(childEl.getAttribute('data-id'), 10);
                return this.state.visibleItems.some(item => item.id === childId);
            });

            // Keep parent if parent itself OR any child matches
            return parentMatches || childrenMatch;

        }).map(el => {
            const id = parseInt(el.getAttribute('data-postid-order') || el.getAttribute('data-id'), 10);
            // Return the full API item object if available, otherwise a minimal object with just the ID
            return this.state.activeItems.find(item => item.id === id) || { id };
        });

    }

    /**
     * Collect unique ids of batches (parent and child) that are present in the DOM
     * @return array 
     */
    activeIDs() {

        // Collect IDs from single-item parents
        const parentIds = Array.from(document.querySelectorAll('.product-list > li[data-id]'))
            .map(el => parseInt(el.getAttribute('data-id'), 10));

        // Collect IDs from group-option children
        const childIds = Array.from(document.querySelectorAll('.product-list .group-option[data-id]'))
            .map(el => parseInt(el.getAttribute('data-id'), 10));

        // Merge & deduplicate
        return [...new Set([...parentIds, ...childIds])];

    }

     /** ---------------------------
     * Display & DOM Updates
     * --------------------------- */

    /**
     * Display results after filtering, pagination and DOM sync
     * 
     * @param {boolean} resetPage - Whether to reset pagination to the first page
     */
    displayResults = (resetPage = false) => {

        // All items from API that match filters (parents + children)
        this.state.activeItems = this.filterTiles(); 

        // Get all IDs that exist in the DOM
        this.state.visibleItems = this.getDOMIds();

        // Determine which parents should be visible
        this.state.parentVisibleItems = this.setVisibleParentItems();

        // Split parentVisibleItems into pages
        this.setPagination(resetPage);

        // Update pagination buttons
        this.addPaginationButtons();

        // Show tiles for current page
        this.showHideTiles();

        // Update total count
        this.countResults();

    };
    
    /**
     * Show and hide tiles (both parent products and child batch options)
     * based on pagination state and active filters.
     * 
     * Parents:
     * - Only visible if included in the current page.
     * 
     * Children:
     * - Visible if their parent is visible.
     * 
     * Single products:
     * - Treated like parents.
     * 
     * @return {void}
     */
    showHideTiles = () => {

        const currentPageParents = this.getCurrentPageParents();

        const tiles = document.querySelectorAll('.product-list > li');

        tiles.forEach(tile => {

            const parentId = parseInt(tile.getAttribute('data-postid-order') || tile.getAttribute('data-id'), 10);
            const isParentVisible = currentPageParents.some(item => item.id === parentId);

            if (!isParentVisible) {
                this.hideTile(tile);

                // skip children
                return; 
            }

            const groupOptions = tile.querySelectorAll('.group-option[data-id]');
            if (groupOptions.length > 0) {
                this.updateGroupOptions(tile, groupOptions);
            } else {

                this.showTile(tile);
                this.updateOptions(tile);
            }
        });
    };

    /** Display helper functions */

    /**
     * Returns the parent items on the current pagination page.
     * @return {Array} Array of parent items (objects with IDs)
     */
    getCurrentPageParents = () => {
        const currentPageNum = this.state.pagination.page;
        const currentPageKey = `page${currentPageNum}`;
        return this.state.pagination.pages[currentPageKey] || [];
    };

    /**
    * Hides a tile element completely.
    * Adds 'hide' and 'displaynoneclass', removes 'show'.
    * @param {HTMLElement} tile
    */
    hideTile = (tile) => {
        tile.classList.remove('show');
        tile.classList.add('hide', 'displaynoneclass');
    };

    /**
     * Shows a tile element.
     * Adds 'show', removes 'hide' and 'displaynoneclass'.
     * @param {HTMLElement} tile
     */
    showTile = (tile) => {
        tile.classList.remove('hide', 'displaynoneclass');
        tile.classList.add('show');
    };

    /**
     * Updates child options of a grouped product.
     * Shows/hides children based on `visibleItems` and parent visibility.
     * Updates parent tile visibility and option counts.
     * @param {HTMLElement} tile - Parent tile element
     * @param {NodeListOf<HTMLElement>} groupOptions - Child options
     */
    updateGroupOptions = (tile, groupOptions) => {
        let hasVisibleChild = false;

        groupOptions.forEach(opt => {
            const childId = parseInt(opt.getAttribute('data-id'), 10);
            const childVisible = this.state.visibleItems.some(item => item.id === childId);

            opt.classList.toggle('hide', !childVisible);
            opt.classList.toggle('displaynoneclass', !childVisible);
            opt.classList.toggle('show', childVisible);

            if (childVisible) hasVisibleChild = true;
        });

        hasVisibleChild ? this.showTile(tile) : this.hideTile(tile);

        if (hasVisibleChild) this.updateOptions(tile);
    };

    /**
     * Updates the display of available options and size/finish counts
     * for a given parent tile element.
     * Counts only children that are currently visible.
     * Works for single products as well.
     * 
     * @param {HTMLElement} tile - The parent tile element
     */
    updateOptions = (tile) => {
        if (!tile) return;

        // For grouped products: count only children that are currently visible
        const visibleChildren = tile.querySelectorAll('.modal-grouped-products .group-option.show');
        const optionsCount = visibleChildren.length || 0;

        const availableOptions = tile.querySelector('.options-count');
        const sizeFinishOptions = tile.querySelector('.size-finish-count');

        // Update DOM text
        if (availableOptions) {
            availableOptions.textContent = optionsCount === 1
                ? '1 option available'
                : `${optionsCount} options available`;
        }

        if (sizeFinishOptions) {
            sizeFinishOptions.textContent = optionsCount === 1
                ? '1 size & finish available'
                : `${optionsCount} sizes & finishes available`;
        }
    };

    /**
     * Updates the displayed text showing the range of visible parent items.
     * - Calculates start and end indices for the current page.
     * - Uses total number of parent items to display: "X to Y of Z".
     * - Updates all elements with class '.mixitup-page-stats' with this text.
     */
    countResults = () => {
        const { page } = this.state.pagination;
        const perPage = this.itemsPerPage(); // Get actual items per page dynamically
        const totalParents = this.state.parentVisibleItems.length;

        const startIndex = (page - 1) * perPage + 1;
        const endIndex = Math.min(page * perPage, totalParents);

        // No results text
        const noResults = document.querySelector('.no-results');

        // Pagination controls
        const pagination = document.querySelector('.controls-pagination');

        // Batch count items
        const pageStats = document.querySelectorAll('.mixitup-page-stats');

        let displayText;
        
        if(totalParents > 0) {

            displayText = `${startIndex} to ${endIndex} of ${totalParents}`;

            // Display no results message
            noResults.style.display = 'none';

            // Hide pagination controls
            pagination.style.display = 'block';
    
            pageStats.forEach(resultBox => resultBox.textContent = displayText);

        } else {

            displayText = 0;

            // Display no results message
            noResults.style.display = 'block';

            // Hide pagination controls
            pagination.style.display = 'none';

            // Hide batch count items
            pageStats.forEach(resultBox => resultBox.style.display = 'none');

        }

    };

    /** ---------------------------
     * Pagination
     * --------------------------- */

    /**
     * Set up pagination for visible parents
     * @param {boolean} resetPage
     */
    setPagination(resetPage = false) {

        // Items per page (responsive)
        const itemsNum = this.itemsPerPage();

        // Paginate only parent items
        this.state.pagination.pages = this.paginate(this.state.parentVisibleItems, itemsNum);

        const totalPages = Object.keys(this.state.pagination.pages).length;

        // Reset page if out of range
        if (resetPage || this.state.pagination.page > totalPages) {
            this.state.pagination.page = 1;
        }

        // REMOVED: this.setHash();
        // Hash should only be updated by user actions, not during rendering

    }

    itemsPerPage() {

        // Device width
        const width = window.innerWidth;

        let itemsPerPage = "";

        // Determine device type and set number of items
        if (width < 768) {
            itemsPerPage = 16;
        } else if (width > 767 && width < 1365) {
            itemsPerPage = 30;
        } else if (width > 1364 && width < 1800) {
            itemsPerPage = 36;
        } else {
            itemsPerPage = 40;
        }

        return itemsPerPage;

    }

    paginate(array, perPage = 5) {

        return array.reduce((acc, item, index) => {
            // Work out which page this item belongs to
            const pageNum = Math.floor(index / perPage) + 1;

            // Create the key name, e.g. "page1", "page2", ...
            const key = `page${pageNum}`;

            // If this page doesn't exist yet, initialise it as an empty array
            acc[key] = acc[key] || [];

            // Push the current item into the right page array
            acc[key].push(item);

            // Return the accumulator for the next iteration
            return acc;
        }, {}); // Start with an empty object {}

    }

    /**
     * 
     * determine which pages to show
     * includes first, last, current, neighbors, and extra pages at edges
     * @param {*} total 
     * @param {*} current 
     * @returns 
     */
    _getCondensedPages(total, current) {

        const pages = new Set([1, total, current]);

        // previous page
        if (current > 1) pages.add(current - 1);   

        // next page
        if (current < total) pages.add(current + 1); 

        // If on first page, add extra neighbors
        if (current === 1 && total > 3) pages.add(2).add(3);

        // If on last page, add extra neighbors
        if (current === total && total > 3) pages.add(total - 1).add(total - 2);

        // return sorted array
        return [...pages].sort((a, b) => a - b); 

    }

    /**
     * 
     * create a button element
     * attaches click handler to update pagination state and scroll to top
     * @param {string} label 
     * @param {*} page 
     * @param {string} extraClasses 
     * @returns 
     */
    _createPaginationButton(label, page, extraClasses = '') {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = label;
        btn.className = `mixitup-control ${extraClasses}`.trim();
        btn.dataset.page = page;

        btn.addEventListener('click', (e) => {
            e.preventDefault();
            
            const newPage = this._resolvePage(page);

            // Scroll smoothly to top
            window.scrollTo({ top: 0, behavior: 'smooth' });

            // Update state
            this.state.pagination.page = newPage;

            // Display new results WITHOUT resetting page
            this.displayResults(false);

            // Update URL hash AFTER rendering
            this.setHash();

            // Update active button styling
            this.updatePaginationActiveState();
        });

        return btn;
    }

    /**
     * resolve page number from button input
     * handles 'prev', 'next', or numeric pages
     * @param {string|number} page 
     * @returns {number} The page number to navigate to
     */
    _resolvePage(page) {
        const { page: current } = this.state.pagination;
        const total = Object.keys(this.state.pagination.pages).length;
        if (page === 'prev') return Math.max(current - 1, 1);
        if (page === 'next') return Math.min(current + 1, total);
        return parseInt(page, 10);
    }

    // --- your main method below ---
    addPaginationButtons() {
        const container = document.querySelector('.mixitup-page-list');
        if (!container) return;

        container.innerHTML = '';

        const total   = Object.keys(this.state.pagination.pages).length;
        const current = this.state.pagination.page;

        container.appendChild(
            this._createPaginationButton('«', 'prev', 'mixitup-control-prev')
        );

        this._getCondensedPages(total, current).forEach(i => {
            const isFirst = i === 1;
            const isLast  = i === total;
            const label   = isFirst ? 'First' : isLast ? 'Last' : i;
            const classes = [
                i === current && 'mixitup-control-active',
                isFirst && 'first-page-btn',
                isLast && 'last-page-btn'
            ].filter(Boolean).join(' ');
            container.appendChild(this._createPaginationButton(label, i, classes));
        });

        container.appendChild(
            this._createPaginationButton('»', 'next', 'mixitup-control-next')
        );
    }

    /**
     * Updates the pagination buttons to reflect the current active page.
     * - Finds all buttons in the pagination container.
     * - Toggles the 'mixitup-control-active' class based on whether
     *   the button's page number matches the current pagination page.
     */
    updatePaginationActiveState = () => {
        const paginationContainer = document.querySelector('.mixitup-page-list');
        const currentPage = this.state.pagination.page;

        paginationContainer.querySelectorAll('.mixitup-control').forEach(btn => {
            const page = btn.dataset.page;
            if (!isNaN(parseInt(page))) {
                btn.classList.toggle('mixitup-control-active', parseInt(page) === currentPage);
            }
        });
    };

    /** ---------------------------
     * State & URL Hash Helpers
     * --------------------------- */
    serializeUiState = () => {
        let output = '';

        // Serialize active filters
        for (const key in this.state.activeFilters) {
            const values = this.state.activeFilters[key];

            if (!values?.length) continue; // skip empty or undefined

            output += `${key}=${values.join(',')}&`;
        }

        // Serialize pagination page
        if (this.state.pagination?.page != null) {
            output += `page=${this.state.pagination.page}&`;
        }

        // Remove trailing '&'
        output = output.replace(/&$/g, '');

        return output;
    };

    deserializeHash = () => {
        
        // Ensure state objects exist
        this.state = this.state || {};
        this.state.activeFilters = this.state.activeFilters || {};
        this.state.pagination = this.state.pagination || { page: 1 }; // Removed perPage: 33

        // Extract hash string
        const hash = window.location.hash.replace(/^#/, '');
        if (!hash) return;

        // Split into key=value pairs
        const groups = hash.split('&');

        groups.forEach((group) => {
            const [key, value] = group.split('=').map(decodeURIComponent);
            if (!key || value === undefined) return;

            if (key === 'page') {
                // Update existing pagination.page
                this.state.pagination.page = parseInt(value, 10) || 1;
            } else if (key === 'textsearch') {
                // Update existing activeFilters
                this.state.activeFilters[key] = [value];

                // Set input value if exists
                if (this.filterInput) this.filterInput.value = value;
            } else {
                this.state.activeFilters[key] = value.split(',');
            }
        });
    };

    setHash = () => {
        // Don't update hash while handling a popstate event
        if (this._handlingHashChange) return;

        // Serialized string of current ui state
        const currentState = this.serializeUiState();
        
        // Activate/Deactivate Reset Filters button functionality
        this.setupResetButton();

        const newHash = currentState ? `#${currentState}` : '';
        const newUrl = window.location.pathname + window.location.search + newHash;
        const currentUrl = window.location.href;

        // Only update if different
        if (newUrl !== currentUrl) {
            // Use pushState - creates history entry, NO reload, NO hashchange event
            history.pushState(null, '', newUrl);
        }
    }

    /**
     * Listen for browser back/forward navigation
     * Use popstate since we're using pushState (not hashchange)
     */
    listenForHashChanges = () => {
        window.addEventListener('popstate', () => {
            // Set flag to prevent setHash from creating new history during this
            this._handlingHashChange = true;
            
            // Re-parse the hash from URL into state
            this.deserializeHash();
            
            // Update the UI
            this.state.activeItems = this.filterTiles(); 
            this.state.visibleItems = this.getDOMIds();
            this.state.parentVisibleItems = this.setVisibleParentItems();
            
            this.setPagination(false);
            this.addPaginationButtons();
            this.showHideTiles();
            this.countResults();
            this.syncFilterButtonsWithState();
            
            // Clear flag
            this._handlingHashChange = false;

            // Scroll to top after state change
            setTimeout(() => {
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }, 0);

        });
    };

    syncFilterButtonsWithState = () => {
        // Build a Set of active filter values (excluding textsearch)
        const activeValues = new Set();
        for (const key in this.state.activeFilters) {
            if (key === 'textsearch') continue;
            const values = this.state.activeFilters[key];
            values.forEach(value => activeValues.add(value));
        }

        // Only update class if needed
        document.querySelectorAll('#accordion .control').forEach(btn => {
            const value = btn.getAttribute('data-toggle');
            const shouldBeActive = activeValues.has(value);
            const isActive = btn.classList.contains('mixitup-control-active');
            if (shouldBeActive && !isActive) {
                btn.classList.add('mixitup-control-active');
            } else if (!shouldBeActive && isActive) {
                btn.classList.remove('mixitup-control-active');
            }
        });

        // Update search input if present
        if (this.filterInput && this.state.activeFilters.textsearch) {
            this.filterInput.value = this.state.activeFilters.textsearch[0];
            this.filterInput.classList.add('mixitup-control-active');
        } else if (this.filterInput) {
            this.filterInput.value = '';
            this.filterInput.classList.remove('mixitup-control-active');
        }
    };
}

// Initialise class on page load
document.addEventListener('DOMContentLoaded', () => new TileFilter());