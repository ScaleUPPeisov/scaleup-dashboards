import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {testFilePath} from './testFilePath';

const read=(p:string)=>readFileSync(testFilePath(p,import.meta.url),'utf8');

describe('VYRON 2.1.15 Windows process/shell boundary audit',()=>{
  it('never routes runtime URL or path handling through cmd.exe or PowerShell shells',()=>{
    const runtime=[
      '../src-tauri/src/files.rs',
      '../src-tauri/src/production_manager.rs',
      '../src-tauri/src/shorts_factory.rs',
      '../src-tauri/src/youtube.rs',
      '../src-tauri/src/system.rs',
      '../src-tauri/src/updater_bridge.rs',
    ].map(read).join('\n');

    expect(runtime).not.toMatch(/Command::new\(\s*["']cmd(?:\.exe)?["']\s*\)/i);
    expect(runtime).not.toMatch(/Command::new\(\s*["']powershell(?:\.exe)?["']\s*\)/i);
    expect(runtime).not.toMatch(/\/C["']?\s*,?\s*["']start/i);
  });

  it('passes Google OAuth URL as one explorer.exe process argument on Windows',()=>{
    const youtube=read('../src-tauri/src/youtube.rs');
    const block=youtube.split('#[cfg(target_os = "windows")]')[1]?.split('#[cfg(target_os = "linux")]')[0]||'';
    expect(block).toContain('Command::new("explorer.exe")');
    expect(block).toContain('.arg(url)');
    expect(block).not.toContain('cmd');
    expect(block).not.toContain('/C');
  });

  it('passes filesystem and executable paths as process args instead of interpolated shell strings',()=>{
    const files=read('../src-tauri/src/files.rs');
    const production=read('../src-tauri/src/production_manager.rs');
    const shorts=read('../src-tauri/src/shorts_factory.rs');

    expect(files).toContain('Command::new("explorer")');
    expect(files).toContain('x.arg(&p)');
    expect(production).toContain('Command::new(&app).spawn()');
    expect(shorts).toContain('Command::new(ffprobe)');
    expect(shorts).toContain('.arg(path)');
    expect(shorts).toContain('Command::new(ffmpeg)');
    expect(shorts).toContain('.arg(source)');
  });
});
