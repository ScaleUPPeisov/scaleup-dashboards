use notify::{Config, Event, RecommendedWatcher, RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};
use std::{
    collections::{HashMap, HashSet},
    path::PathBuf,
    sync::{Arc, Mutex},
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
    watcher: Mutex<Option<RecommendedWatcher>>,
    roots: Arc<Mutex<HashMap<String, PathBuf>>>,
}
impl Default for InventoryWatchState {
    fn default() -> Self {
        Self {
            watcher: Mutex::new(None),
            roots: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

fn event_channel_ids(event: &Event, roots: &HashMap<String, PathBuf>) -> Vec<(String, String)> {
    let mut seen = HashSet::new();
    let mut out = Vec::new();
    for event_path in &event.paths {
        for (channel_id, root) in roots {
            if event_path.starts_with(root) || event_path == root {
                if seen.insert(channel_id.clone()) {
                    out.push((
                        channel_id.clone(),
                        event_path.to_string_lossy().into_owned(),
                    ));
                }
            }
        }
    }
    out
}

#[tauri::command]
pub fn inventory_watch_roots(
    app: AppHandle,
    state: State<'_, InventoryWatchState>,
    roots: Vec<InventoryWatchRoot>,
) -> Result<InventoryWatchRegistration, String> {
    let shared_roots = state.roots.clone();
    let event_roots = shared_roots.clone();
    let event_app = app.clone();

    let mut watcher = RecommendedWatcher::new(
        move |result: notify::Result<Event>| {
            let Ok(event) = result else { return };
            let Ok(roots) = event_roots.lock() else { return };
            let kind = format!("{:?}", event.kind);
            for (channel_id, path) in event_channel_ids(&event, &roots) {
                let _ = event_app.emit(
                    "render-inventory-changed",
                    InventoryWatchEvent {
                        channel_id,
                        path,
                        kind: kind.clone(),
                    },
                );
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
    if let Ok(mut watcher_guard) = state.watcher.lock() {
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
    use notify::event::{CreateKind, EventKind};

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
    fn real_filesystem_create_event_is_observed() {
        use std::{fs, sync::mpsc, time::{Duration, Instant}};
        let root = std::env::temp_dir().join(format!("vyron-inventory-watch-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).expect("temp render dir");

        let (tx, rx) = mpsc::channel();
        let mut watcher = RecommendedWatcher::new(
            move |result: notify::Result<Event>| { let _ = tx.send(result); },
            Config::default(),
        ).expect("watcher");
        watcher.watch(&root, RecursiveMode::Recursive).expect("watch root");

        // macOS FSEvents registration becomes active asynchronously. Writing once
        // immediately after watch() creates a CI-only race. Re-touch the same
        // fixture for a short bounded window and finish as soon as the real
        // RecommendedWatcher observes it. Runtime behavior is unchanged.
        let target = root.join("001 — Ready Videos.mov");
        let deadline = Instant::now() + Duration::from_secs(3);
        let mut found = false;
        let mut attempt = 0u32;
        while Instant::now() < deadline && !found {
            attempt += 1;
            fs::write(&target, format!("fixture-video-bytes-{attempt}")).expect("write fixture");
            let slice_deadline = Instant::now() + Duration::from_millis(150);
            while Instant::now() < slice_deadline {
                let remaining = slice_deadline.saturating_duration_since(Instant::now());
                match rx.recv_timeout(remaining) {
                    Ok(Ok(event)) if event.paths.iter().any(|p| p == &target) => {
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
        assert!(found, "filesystem watcher did not observe created/updated render file");
    }

    #[cfg(windows)]
    #[test]
    fn windows_drive_letter_long_path_event_maps_to_channel() {
        let mut roots = HashMap::new();
        let root = PathBuf::from(r"D:\Render\Очень длинная папка & Видео (2026)\Канал");
        roots.insert("win".to_string(), root.clone());
        let event = Event {
            kind: EventKind::Create(CreateKind::File),
            paths: vec![root.join("001 — Ready Videos.mov")],
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
            paths: vec![root.join("002.mov")],
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
