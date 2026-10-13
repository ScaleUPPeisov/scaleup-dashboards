from pathlib import Path

source_path = Path("src-tauri/src/production_manager.rs")
tests_path = Path("src-tauri/src/production_manager_tests.rs")
s = source_path.read_text()


def replace_once(old: str, new: str, label: str) -> None:
    global s
    count = s.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected 1 match, found {count}")
    s = s.replace(old, new, 1)


replace_once(
    "    path::{Path, PathBuf},\n",
    "    path::{Component, Path, PathBuf},\n",
    "path import",
)

marker = "fn atomic_json<T: Serialize>(path: &Path, value: &T) -> Result<(), String> {\n"
helper = '''const INVALID_FINAL_RENDER_DESTINATION: &str = "INVALID_FINAL_RENDER_DESTINATION";

fn is_production_batches_path(path: &Path) -> bool {
    let parts = path
        .components()
        .filter_map(|component| match component {
            Component::Normal(value) => Some(value.to_string_lossy().to_ascii_lowercase()),
            _ => None,
        })
        .collect::<Vec<_>>();
    parts
        .windows(2)
        .any(|pair| pair[0] == "productionmanager" && pair[1] == "batches")
}

fn validate_final_render_destination(path: &Path) -> Result<(), String> {
    if is_production_batches_path(path) {
        return Err(INVALID_FINAL_RENDER_DESTINATION.into());
    }
    Ok(())
}

fn render_output_dir(output_workspace: &str, channel_name: &str) -> Result<PathBuf, String> {
    let path = PathBuf::from(output_workspace)
        .join("Render")
        .join(safe_component(channel_name));
    validate_final_render_destination(&path)?;
    fs::create_dir_all(&path).map_err(|e| format!("Render output: {e}"))?;
    let resolved = path
        .canonicalize()
        .map_err(|e| format!("Render output: {e}"))?;
    validate_final_render_destination(&resolved)?;
    Ok(resolved)
}

'''
replace_once(marker, helper + marker, "render output helpers")

replace_once(
    '        output_dir: broot.join("Rendered").to_string_lossy().into_owned(),\n',
    '''        output_dir: render_output_dir(
            &resolve_output_workspace(&plan.request)?,
            &plan.request.channel_name,
        )?
        .to_string_lossy()
        .into_owned(),
''',
    "manifest output_dir",
)

replace_once(
    '    destination_paths.push(PathBuf::from(&plan.batch_root).join("Rendered").to_string_lossy().into_owned());\n',
    '''    let output_workspace = resolve_output_workspace(&plan.request)?;
    destination_paths.push(
        render_output_dir(&output_workspace, &plan.request.channel_name)?
            .to_string_lossy()
            .into_owned(),
    );
''',
    "recovery render destination",
)

replace_once(
    '''    let (m, _) = load_manifest(&manifest_path)?;
    let app = PathBuf::from(&endlume_path);
''',
    '''    let (m, _) = load_manifest(&manifest_path)?;
    let final_destination = PathBuf::from(&m.output_dir);
    validate_final_render_destination(&final_destination)?;
    fs::create_dir_all(&final_destination).map_err(|e| format!("Render output: {e}"))?;
    let resolved_final_destination = final_destination
        .canonicalize()
        .map_err(|e| format!("Render output: {e}"))?;
    validate_final_render_destination(&resolved_final_destination)?;
    let app = PathBuf::from(&endlume_path);
''',
    "ENDLUME pre-render destination guard",
)

source_path.write_text(s)

tests = tests_path.read_text()
sentinel = "acceptance_render_output_routes_to_channel_render_root"
if sentinel in tests:
    raise SystemExit("routing tests already exist unexpectedly")

tests += '''

#[test]
fn acceptance_render_output_routes_to_channel_render_root() {
    let (ws, cid, name) = fixture(1, 2);
    let plan = plan_build(&request(&ws, &cid, &name, 1, 1, "even", false)).unwrap();
    let summary = execute_plan(None, &plan).unwrap();
    let (manifest, _) = load_manifest(&summary.manifest_path).unwrap();
    let expected = ws.join("Render").join(&name).canonicalize().unwrap();
    assert_eq!(PathBuf::from(&manifest.output_dir), expected);
    assert!(expected.is_dir());
    assert!(!is_production_batches_path(&expected));
    assert!(PathBuf::from(&manifest.root_path)
        .starts_with(ws.join("ProductionManager").join("Batches")));
    cleanup(&ws);
}

#[test]
fn acceptance_final_render_destination_rejects_batches_tree() {
    let forbidden = PathBuf::from(
        "/Volumes/TOSHIBA EXT/ВАЙРОН/ProductionManager/Batches/channel/batch/Rendered",
    );
    assert_eq!(
        validate_final_render_destination(&forbidden).unwrap_err(),
        INVALID_FINAL_RENDER_DESTINATION
    );
}

#[test]
fn acceptance_render_output_is_channel_isolated() {
    let root = std::env::temp_dir().join(format!("vyron-render-routing-{}", Uuid::new_v4()));
    fs::create_dir_all(&root).unwrap();
    let first = render_output_dir(&root.to_string_lossy(), "Channel Alpha").unwrap();
    let second = render_output_dir(&root.to_string_lossy(), "Channel Beta").unwrap();
    assert_eq!(
        first,
        root.join("Render")
            .join("Channel Alpha")
            .canonicalize()
            .unwrap()
    );
    assert_eq!(
        second,
        root.join("Render")
            .join("Channel Beta")
            .canonicalize()
            .unwrap()
    );
    assert_ne!(first, second);
    assert!(!is_production_batches_path(&first));
    assert!(!is_production_batches_path(&second));
    let _ = fs::remove_dir_all(root);
}
'''

tests_path.write_text(tests)
