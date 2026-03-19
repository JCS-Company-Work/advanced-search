<?php

namespace ESAdvSearch\Assets;

class ESAS_Enqueue {

    public static function init() {

        // Enqueue front-end scripts
        add_action('wp_enqueue_scripts', [__CLASS__, 'enqueue_scripts']);

    }

    public static function enqueue_scripts() {

        // Always load the site-wide search script
        wp_enqueue_script(
            'advanced-search',
            plugin_dir_url(__FILE__) . '/../../../assets/js/search.js',
            [],
            ESAS_VERSION,
            true
        );

        // Only enqueue TileFilter on category pages, grouped-products template, or /search-results page
        if (
            is_category()
            || is_page_template('grouped-products.php')
            || is_page_template('batches.php')
        ) {

            wp_enqueue_script(
                'tile-filter',
                plugin_dir_url(__FILE__) . '/../../../assets/js/TileFilter.js',
                [],
                ESAS_VERSION,
                true
            );

            // Determine category/slug value for localisation
            $category_value = '';
            if ( is_category() ) {
                $category_value = (string) get_queried_object()->slug;
            } elseif ( is_page_template('grouped-products.php') ) {
                $category_value = (string) get_field('batch_search_term');
            }

            wp_localize_script('tile-filter', 'ESAS', [
                'endpoint' => esc_url( rest_url('custom/v1/es-advanced-search') ),
                'category' => $category_value ?: '',
            ]);

            // Styles for the filter UI
            wp_enqueue_style(
                'tile-filter-css',
                plugin_dir_url(__FILE__) . '/../../../assets/css/tile-filter.css',
                [],
                ESAS_VERSION
            );
        }
    }


}