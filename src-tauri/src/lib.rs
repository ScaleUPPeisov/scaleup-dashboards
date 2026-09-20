#![recursion_limit = "512"]
mod updater_bridge;
mod license;
mod storage;
mod security;
mod files;
mod system;
mod youtube;
mod studio_drafts;
mod youtube_intelligence;
mod ai;
mod production_manager;
mod shorts_factory;
mod local_delete;

#[cfg_attr(mobile,tauri::mobile_entry_point)]
pub fn run(){
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![studio_drafts::studio_drafts_start_bridge,studio_drafts::studio_drafts_list,studio_drafts::studio_drafts_clear,updater_bridge::prepare_updater_tempdir,
            license::license_status,license::activate_license,
            storage::load_state,storage::save_state,security::security_keychain_diagnostics,security::security_keychain_runtime_diagnostics,security::security_oauth_inventory,
            files::import_images,files::add_tracks,files::refresh_job,files::prepare_job_folder,files::ensure_channel_inbox,files::scan_channel_inbox,files::ingest_tracks,files::ingest_cover,files::write_job_metadata,files::enqueue_render,files::reveal_path,files::open_endlume,local_delete::trash_local_file,
            system::diagnostics,system::default_workspace,
            youtube::youtube_channel_stats,youtube::youtube_oauth_credential_states,youtube::youtube_oauth_recovery_diagnostic,youtube::youtube_keychain_migration_diagnostics,youtube::youtube_oauth_browsers,youtube_intelligence::youtube_channel_analytics,youtube_intelligence::youtube_competitor_snapshot,youtube_intelligence::youtube_discover_competitors,youtube::youtube_oauth_profiles,youtube::youtube_oauth_reconciliation_diagnostics,youtube::youtube_google_project_diagnostic,youtube::youtube_google_config_status,youtube::youtube_google_config_import,youtube::youtube_oauth_import_profile_credentials_file,youtube::youtube_oauth_connect_global,youtube::youtube_oauth_reconnect_existing,youtube::youtube_oauth_profile_health,youtube::youtube_channel_statistics,youtube::youtube_channel_statistics_batch,youtube::youtube_cache_thumbnail,youtube::youtube_oauth_connect,youtube::youtube_oauth_disconnect,youtube::youtube_upload_video,youtube::youtube_resume_upload,youtube::youtube_upload_sessions,youtube::youtube_active_uploads,youtube::youtube_cancel_upload_session,youtube::youtube_video_processing_status,youtube::youtube_set_thumbnail,youtube::youtube_file_fingerprint,youtube::youtube_list_existing_videos,youtube::youtube_retry_existing_video_hydration,youtube::youtube_backup_existing_videos,youtube::youtube_update_existing_video,youtube::youtube_update_existing_schedule,youtube::youtube_list_playlists,youtube::youtube_playlist_membership,
            production_manager::production_storage_status,production_manager::start_production_import,production_manager::stop_production_import,production_manager::production_import_status,production_manager::set_production_music_library,production_manager::index_production_music_library,production_manager::build_production_batch,production_manager::resume_production_batch,production_manager::find_production_recovery,production_manager::restart_production_batch,production_manager::read_production_batch_status,production_manager::list_production_batches,production_manager::production_channel_state,production_manager::validate_production_batch,production_manager::validate_production_projects,production_manager::delete_production_batch_projects,production_manager::cleanup_completed_production_assets,production_manager::preview_global_production_project_cleanup,production_manager::execute_global_production_project_cleanup,production_manager::archive_production_rendered_videos,shorts_factory::shorts_scan_folder,shorts_factory::shorts_probe_source,shorts_factory::shorts_validate_file,shorts_factory::shorts_render_segment,production_manager::delete_production_job_folder,production_manager::open_production_batch_in_endlume,production_manager::production_endlume_handoff_consumed,
            ai::ai_generate_metadata
        ])
        .run(tauri::generate_context!())
        .expect("error while running VYRON")
}
