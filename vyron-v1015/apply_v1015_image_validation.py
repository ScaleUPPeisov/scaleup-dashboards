#!/usr/bin/env python3
from pathlib import Path
import json

VERSION='1.0.15'
BASE='1.0.14'

def must(cond,msg):
    if not cond:
        raise SystemExit('VYRON 1.0.15 image validation: '+msg)

# Version bump from the exact released 1.0.14 source.
p=Path('package.json');x=json.loads(p.read_text());must(x.get('version')==BASE,'expected package 1.0.14');x['version']=VERSION;p.write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n')
p=Path('src-tauri/tauri.conf.json');x=json.loads(p.read_text());must(x.get('version')==BASE,'expected tauri 1.0.14');x['version']=VERSION;p.write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n')
p=Path('src-tauri/Cargo.toml');s=p.read_text();must('version = "1.0.14"' in s,'expected Cargo 1.0.14');p.write_text(s.replace('version = "1.0.14"','version = "1.0.15"',1))
p=Path('package-lock.json')
if p.exists():
    x=json.loads(p.read_text())
    if x.get('version')==BASE:x['version']=VERSION
    if isinstance(x.get('packages'),dict) and isinstance(x['packages'].get(''),dict) and x['packages'][''].get('version')==BASE:x['packages']['']['version']=VERSION
    p.write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n')

p=Path('src-tauri/src/production_manager.rs');s=p.read_text()
helper_marker='''fn is_image(p: &Path) -> bool { IMAGE_EXT.contains(&ext(p).as_str()) }
fn is_audio(p: &Path) -> bool { AUDIO_EXT.contains(&ext(p).as_str()) }'''
helper_new='''fn is_image(p: &Path) -> bool { IMAGE_EXT.contains(&ext(p).as_str()) }
fn is_audio(p: &Path) -> bool { AUDIO_EXT.contains(&ext(p).as_str()) }
fn nonempty_image(p:&Path)->bool{p.is_file()&&is_image(p)&&fs::metadata(p).map(|m|m.len()>0).unwrap_or(false)}
fn project_has_renderable_image(folder:&Path,manifest_image:&Path)->bool{
    if nonempty_image(manifest_image){return true;}
    fs::read_dir(folder).ok().into_iter().flatten().filter_map(Result::ok).any(|e|{
        let name=e.file_name().to_string_lossy().to_string();
        if name.starts_with('.') {return false;}
        let ft=match e.file_type(){Ok(x)=>x,Err(_)=>return false};
        if !ft.is_file(){return false;}
        nonempty_image(&e.path())
    })
}'''
must(helper_marker in s,'image helper marker not found');s=s.replace(helper_marker,helper_new,1)

old='''        let images=fs::read_dir(folder).ok().into_iter().flatten().filter_map(Result::ok).map(|e|e.path()).filter(|x|x.is_file()&&is_image(x)).collect::<Vec<_>>();
        if images.len()!=1{errs.push(format!("изображений: {}, должно быть 1",images.len()));}'''
new='''        // VYRON validates renderability, not the number of visual assets. ENDLUME owns
        // multi-image transitions and may legitimately use 1, 2 or more images.
        // Prefer the exact manifest image produced by VYRON. If it was manually changed
        // or removed, accept any other non-hidden supported image in the project folder.
        if !project_has_renderable_image(folder,Path::new(&p.image_path)){
            errs.push("изображение не найдено".to_string());
        }'''
must(old in s,'exact 1-image validator block not found');s=s.replace(old,new,1)
must('изображений: {}, должно быть 1' not in s,'legacy exact-one error still present')
must('images.len()!=1' not in s,'legacy exact-one condition still present')

# Regression tests use only std + the already-used uuid crate; no new dependency.
test=r'''

#[cfg(test)]
mod v1015_image_validation_tests {
    use super::*;

    fn temp_project(name:&str)->PathBuf{
        let p=std::env::temp_dir().join(format!("vyron-v1015-{name}-{}",Uuid::new_v4()));
        fs::create_dir_all(&p).unwrap();
        p
    }

    #[test]
    fn one_manifest_image_is_valid(){
        let d=temp_project("one");let img=d.join("image.png");fs::write(&img,b"png").unwrap();
        assert!(project_has_renderable_image(&d,&img));let _=fs::remove_dir_all(d);
    }

    #[test]
    fn multiple_images_are_valid_for_endlume(){
        let d=temp_project("many");let img=d.join("image.png");fs::write(&img,b"png").unwrap();fs::write(d.join("transition.jpg"),b"jpg").unwrap();
        assert!(project_has_renderable_image(&d,&img));let _=fs::remove_dir_all(d);
    }

    #[test]
    fn fallback_image_is_valid_if_manifest_path_was_changed(){
        let d=temp_project("fallback");fs::write(d.join("other.webp"),b"webp").unwrap();
        assert!(project_has_renderable_image(&d,&d.join("missing.png")));let _=fs::remove_dir_all(d);
    }

    #[test]
    fn hidden_phantom_image_does_not_make_empty_project_valid(){
        let d=temp_project("hidden");fs::write(d.join(".phantom.png"),b"hidden").unwrap();
        assert!(!project_has_renderable_image(&d,&d.join("missing.png")));let _=fs::remove_dir_all(d);
    }
}
'''
must('mod v1015_image_validation_tests' not in s,'tests already present');s=s.rstrip()+test+'\n';p.write_text(s)

print('VYRON 1.0.15 image validation hotfix applied')
