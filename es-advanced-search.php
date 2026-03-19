<?php
/*
Plugin Name: ES Advanced Search
Description: Emporio Surfaces API-based advanced search plugin
Version: 1.0
Author: Emporio Surfaces
*/

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

// Constants
define( 'ESAS_PATH', plugin_dir_path( __FILE__ ) );
define( 'ESAS_URL',  plugin_dir_url( __FILE__ ) );
define( 'ESAS_VERSION', '1.3.0' );

// Composer autoload
if ( file_exists( ESAS_PATH . 'vendor/autoload.php' ) ) {
    require_once ESAS_PATH . 'vendor/autoload.php';
}

use ESAdvSearch\API\ESAS_BatchesAPI;
use ESAdvSearch\Assets\ESAS_Enqueue;

// Bootstrap main class
add_action( 'plugins_loaded', function() {

    ESAS_Enqueue::init();
    ESAS_BatchesAPI::init();

});