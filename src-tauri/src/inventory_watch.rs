use notify::{Config, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};
use std::{
    collections::{HashMap, HashSet},
    path::PathBuf,
    sync::{atomic::{AtomicBool, Ordering}, Arc, Mutex},
    time::Duration,
};
use tauri::{AppHandle, Emitter, State};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InventoryWatchRoot {
    pub channel_id: String,
    pub path: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InventoryWatchEvent {
    pub channel_id: String,
    pub path: String,
    pub kind: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InventoryWatchRegistration {
    pub watched_channel_ids: Vec<String>,
    pub offline_channel_ids: Vec<String>,
}

pub struct InventoryWatchState {
    watcher: Arc<Mutex<Option<RecommendedWatcher>>>,
    roots: Arc<Mutex<HashMap<String, PathBuf>>>,
    // Re-registration requests can overlap after moving I/O off the UI thread.
    registration: Arc<Mutex<()>>,
}
impl Default for InventoryWatchState {
    fn default() -> Self {
        Self {
            watcher: Arc::new(Mutex::new(None)),
            roots: Arc::new(Mutex::new(HashMap::new())),
            registration: Arc::new(Mutex::new(())),
        }
    }
}

fn watcher_path_key(path: &std::path::Path) -> String {
    let mut value = path.to_string_lossy().replace('\\', "/");
    #[cfg(windows)]
    {
        if let Some(rest) = value.strip_prefix("//?/UNC/") {
            value = format!("//{rest}");
        } else if let Some(rest) = value.strip_prefix("//?/") {
            value = rest.to_string();
        }
        value = value.to_ascii_lowercase();
    }
    while value.len() > 1 && value.ends_with('/') {
        value.pop();
    }
    value
}

fn event_can_change_inventory(event: &Event) -> bool {
    // Scanning/fingerprinting reads files. Some external filesystems surface those
    // reads as Access events. Feeding Access back into render-inventory-changed
    // creates a scan -> access event -> scan feedback loop and can make VYRON look
    // permanently busy. Inventory truth changes on create/modify/remove/rename,
    // never on read-only access.
    !matches!(event.kind, EventKind::Access(_))
}

fn event_channel_ids(event: &Event, roots: &HashMap<String, PathBuf>) -> Vec<(String, String)> {
    let mut seen = HashSet::new();
    let mut out = Vec::new();
    for event_path in &event.paths {
        let event_key = watcher_path_key(event_path);
        for (channel_id, root) in roots {
            let root_key = watcher_path_key(root);
            let inside = event_key == root_key
                || event_key
                    .strip_prefix(&root_key)
                    .map(|rest| rest.starts_with('/'))
                    .unwrap_or(false);
            if inside && seen.insert(channel_id.clone()) {
                out.push((
                    channel_id.clone(),
                    event_path.to_string_lossy().into_owned(),
                ));
            }
        }
    }
    out
}

// Registering recursive FSEvents watchers can touch a slow/disconnected disk.
// It must not execute on the Tauri command dispatcher / AppKit thread.
#[tauri::command]
pub async fn inventory_watch_roots(
    app: AppHandle,
    state: State<'_, InventoryWatchState>,
    roots: Vec<InventoryWatchRoot>,
) -> Result<InventoryWatchRegistration, String> {
    let watcher_slot = state.watcher.clone();
    let shared_roots = state.roots.clone();
    let registration = state.registration.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _registration_guard = registration.lock()
            .map_err(|_| "INVENTORY_WATCH_REGISTRATION_LOCK_FAILED".to_string())?;
        register_inventory_watch_roots(app, watcher_slot, shared_roots, roots)
    })
    .await
    .map_err(|e| format!("INVENTORY_WATCH_TASK_FAILED: {e}"))?
}

fn register_inventory_watch_roots(
    app: AppHandle,
    watcher_slot: Arc<Mutex<Option<RecommendedWatcher>>>,
    shared_roots: Arc<Mutex<HashMap<String, PathBuf>>>,
    roots: Vec<InventoryWatchRoot>,
) -> Result<InventoryWatchRegistration, String> {
    let event_roots = shared_roots.clone();
    let event_app = app.clone();
    // A single project creates many filesystem events (each copied MP3 and
    // checkpoint). Coalesce them per channel, keeping the trailing update so
    // a busy external HDD does not trigger one full UI inventory scan per file.
    let pending_events = Arc::new(Mutex::new(HashMap::<String, (String, String)>::new()));
    let flush_scheduled = Arc::new(AtomicBool::new(false));

    let mut watcher = RecommendedWatcher::new(
        move |result: notify::Result<Event>| {
            let Ok(event) = result else { return };
            if !event_can_change_inventory(&event) {
                return;
            }
            // Never invoke Tauri event dispatch while holding the roots mutex:
            // UI event processing may re-register watchers and otherwise wait
            // on this same lock during a large production batch.
            let affected = {
                let Ok(roots) = event_roots.lock() else { return };
                event_channel_ids(&event, &roots)
            };
            if affected.is_empty() { return; }
            let kind = format!("{:?}", event.kind);
            let schedule_flush = {
                let Ok(mut pending) = pending_events.lock() else { return };
                for (channel_id, path) in affected {
                    pending.insert(channel_id, (path, kind.clone()));
                }
                // Swap while holding the mutex so the flushing worker cannot
                // create a lost-event window between draining and re-arming.
                !flush_scheduled.swap(true, Ordering::AcqRel)
            };
            if schedule_flush {
                let pending = pending_events.clone();
                let scheduled = flush_scheduled.clone();
                let app = event_app.clone();
                std::thread::spawn(move || {
                    std::thread::sleep(Duration::from_millis(180));
                    let changes = {
                        let Ok(mut events) = pending.lock() else { return };
                        let changes = std::mem::take(&mut *events);
                        scheduled.store(false, Ordering::Release);
                        changes
                    };
                    for (channel_id, (path, kind)) in changes {
                        let _ = app.emit(
                            "render-inventory-changed",
                            InventoryWatchEvent { channel_id, path, kind },
                        );
                    }
                });
            }
        },
        Config::default(),
    )
    .map_err(|e| format!("INVENTORY_WATCH_CREATE_FAILED: {e}"))?;

    let mut watched = Vec::new();
    let mut offline = Vec::new();
    let mut next_roots = HashMap::new();

    for root in roots {
        let channel_id = root.channel_id.trim().to_string();
        let raw = root.path.trim();
        if channel_id.is_empty() || raw.is_empty() {
            continue;
        }
        let path = PathBuf::from(raw);
        if path.is_dir() {
            let canonical = path.canonicalize().unwrap_or(path);
            watcher
                .watch(&canonical, RecursiveMode::Recursive)
                .map_err(|e| format!("INVENTORY_WATCH_PATH_FAILED: {channel_id}: {e}"))?;
            next_roots.insert(channel_id.clone(), canonical);
            watched.push(channel_id);
        } else {
            offline.push(channel_id);
        }
    }

    if let Ok(mut roots_guard) = shared_roots.lock() {
        *roots_guard = next_roots;
    } else {
        return Err("INVENTORY_WATCH_ROOT_LOCK_FAILED".into());
    }
    if let Ok(mut watcher_guard) = watcher_slot.lock() {
        *watcher_guard = Some(watcher);
    } else {
        return Err("INVENTORY_WATCH_STATE_LOCK_FAILED".into());
    }

    watched.sort();
    offline.sort();
    Ok(InventoryWatchRegistration {
        watched_channel_ids: watched,
        offline_channel_ids: offline,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use notify::event::{AccessKind, CreateKind};

    #[test]
    fn event_maps_only_to_affected_channel() {
        let mut roots = HashMap::new();
        roots.insert("a".to_string(), PathBuf::from("/tmp/VYRON Render/A"));
        roots.insert("b".to_string(), PathBuf::from("/tmp/VYRON Render/B"));
        let event = Event {
            kind: EventKind::Create(CreateKind::File),
            paths: vec![PathBuf::from("/tmp/VYRON Render/B/001 — Ready Videos.mov")],
            attrs: Default::default(),
        };
        let ids = event_channel_ids(&event, &roots);
        assert_eq!(ids.len(), 1);
        assert_eq!(ids[0].0, "b");
    }

    #[test]
    fn read_only_access_event_does_not_trigger_inventory_refresh() {
        let event = Event {
            kind: EventKind::Access(AccessKind::Any),
            paths: vec![PathBuf::from("/tmp/VYRON Render/A/001 — Ready Videos.mov")],
            attrs: Default::default(),
        };
        assert!(!event_can_change_inventory(&event));
    }

    #[test]
    fn create_event_still_triggers_inventory_refresh() {
        let event = Event {
            kind: EventKind::Create(CreateKind::File),
            paths: vec![PathBuf::from("/tmp/VYRON Render/A/002 — Ready Videos.mov")],
            attrs: Default::default(),
        };
        assert!(event_can_change_inventory(&event));
    }

    #[test]
    fn real_filesystem_create_event_is_observed() {
        use std::{fs, sync::mpsc, time::{Duration, Instant}};
        let root = std::env::temp_dir().join(format!("vyron-inventory-watch-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).expect("temp render dir");
        // FSEvents can report /private/var/... while temp_dir() is /var/...
        // Canonicalize before watching and before comparing event paths.
        let root = root.canonicalize().expect("canonical temp render dir");

        let (tx, rx) = mpsc::channel();
        let mut watcher = RecommendedWatcher::new(
            move |result: notify::Result<Event>| { let _ = tx.send(result); },
            Config::default(),
        ).expect("watcher");
        watcher.watch(&root, RecursiveMode::Recursive).expect("watch root");

        // macOS FSEvents registration is asynchronous and can coalesce a file
        // write into an event for the watched directory itself. Production maps
        // both the root and any descendant path to the affected channel, so the
        // physical test validates that contract instead of one backend-specific
        // event-path shape.
        std::thread::sleep(Duration::from_millis(500));
        let target = root.join("001 — Ready Videos.mov");
        let deadline = Instant::now() + Duration::from_secs(8);
        let mut found = false;
        let mut attempt = 0u32;
        while Instant::now() < deadline && !found {
            attempt += 1;
            fs::write(&target, format!("fixture-video-bytes-{attempt}")).expect("write fixture");
            let slice_deadline = Instant::now() + Duration::from_millis(500);
            while Instant::now() < slice_deadline {
                let remaining = slice_deadline.saturating_duration_since(Instant::now());
                match rx.recv_timeout(remaining) {
                    Ok(Ok(event)) if event.paths.iter().any(|p| p == &root || p.starts_with(&root)) => {
                        found = true;
                        break;
                    }
                    Ok(_) => {}
                    Err(mpsc::RecvTimeoutError::Timeout) => break,
                    Err(e) => panic!("watch channel failed: {e}"),
                }
            }
        }
        drop(watcher);
        let _ = fs::remove_dir_all(&root);
        assert!(found, "filesystem watcher did not observe a root/descendant render event");
    }

    #[cfg(windows)]
    #[test]
    fn windows_drive_letter_long_path_event_maps_to_channel() {
        let mut roots = HashMap::new();
        let root = PathBuf::from(r"D:\Render\Очень длинная папка & Видео (2026)\Канал");
        roots.insert("win".to_string(), root.clone());
        let event = Event {
            kind: EventKind::Create(CreateKind::File),
            paths: vec![PathBuf::from(r"\\?\D:\Render\Очень длинная папка & Видео (2026)\Канал\001 — Ready Videos.mov")],
            attrs: Default::default(),
        };
        assert_eq!(event_channel_ids(&event, &roots)[0].0, "win");
    }

    #[cfg(windows)]
    #[test]
    fn windows_unc_event_maps_to_channel() {
        let mut roots = HashMap::new();
        let root = PathBuf::from(r"\\server\share\Render\Aether Riff");
        roots.insert("unc".to_string(), root.clone());
        let event = Event {
            kind: EventKind::Create(CreateKind::File),
            paths: vec![PathBuf::from(r"\\?\UNC\server\share\Render\Aether Riff\002.mov")],
            attrs: Default::default(),
        };
        assert_eq!(event_channel_ids(&event, &roots)[0].0, "unc");
    }

    #[test]
    fn spaces_cyrillic_ampersand_parentheses_are_lexically_safe() {
        let mut roots = HashMap::new();
        roots.insert(
            "c".to_string(),
            PathBuf::from("/Volumes/TOSHIBA EXT/Рендер & Видео (2026)/Канал"),
        );
        let event = Event {
            kind: EventKind::Create(CreateKind::File),
            paths: vec![PathBuf::from(
                "/Volumes/TOSHIBA EXT/Рендер & Видео (2026)/Канал/001.mov",
            )],
            attrs: Default::default(),
        };
        assert_eq!(event_channel_ids(&event, &roots)[0].0, "c");
    }
}
