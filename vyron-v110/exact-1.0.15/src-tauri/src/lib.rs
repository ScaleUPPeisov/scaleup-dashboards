#![recursion_limit = "512"]
mod updater_bridge;
mod license;
mod storage;
mod files;
mod system;
mod youtube;
mod youtube_intelligence;
mod ai;
mod production_manager;

#[cfg_attr(mobile,tauri::mobile_entry_point)]
pub fn run(){
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![updater_bridge::prepare_updater_tempdir,
            license::license_status,license::activate_license,
            storage::load_state,storage::save_state,
            files::import_images,files::add_tracks,files::refresh_job,files::prepare_job_folder,files::ensure_channel_inbox,files::scan_channel_inbox,files::ingest_tracks,files::ingest_cover,files::write_job_metadata,files::enqueue_render,files::reveal_path,files::open_endlume,
            system::diagnostics,system::default_workspace,
            youtube::youtube_channel_stats,youtube::youtube_oauth_browsers,youtube_intelligence::youtube_channel_analytics,youtube_intelligence::youtube_competitor_snapshot,youtube_intelligence::youtube_discover_competitors,youtube::youtube_oauth_profiles,youtube::youtube_google_config_status,youtube::youtube_google_config_import,youtube::youtube_oauth_connect_global,youtube::youtube_oauth_profile_health,youtube::youtube_cache_thumbnail,youtube::youtube_oauth_connect,youtube::youtube_oauth_disconnect,youtube::youtube_upload_video,youtube::youtube_list_existing_videos,youtube::youtube_backup_existing_videos,youtube::youtube_update_existing_video,
            production_manager::production_storage_status,production_manager::start_production_import,production_manager::stop_production_import,production_manager::production_import_status,production_manager::set_production_music_library,production_manager::index_production_music_library,production_manager::build_production_batch,production_manager::resume_production_batch,production_manager::find_production_recovery,production_manager::restart_production_batch,production_manager::read_production_batch_status,production_manager::list_production_batches,production_manager::production_channel_state,production_manager::validate_production_batch,production_manager::delete_production_batch_projects,production_manager::delete_production_job_folder,production_manager::open_production_batch_in_endlume,production_manager::production_endlume_handoff_consumed,
            ai::ai_generate_metadata
        ])
        .run(tauri::generate_context!())
        .expect("error while running VYRON")
}
