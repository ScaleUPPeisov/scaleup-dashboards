import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';

const app=readFileSync('src/App.tsx','utf8'),settings=readFileSync('src/SettingsOS.tsx','utf8'),api=readFileSync('src/api.ts','utf8'),runtime=readFileSync('src/updaterRuntime.ts','utf8'),history=readFileSync('src/errorHistory.ts','utf8'),config=JSON.parse(readFileSync('src-tauri/tauri.conf.json','utf8'));

describe('VYRON remote in-app update product contract',()=>{
 it('keeps the existing signed stable feed and public key contract',()=>{expect(config.plugins.updater.endpoints[0]).toBe('https://raw.githubusercontent.com/ScaleUPPeisov/scaleup-dashboards/main/vyron-updates/latest.json');expect(config.plugins.updater.pubkey).toContain('dW50cnVzdGVk');expect(config.plugins.updater.endpoints).toHaveLength(2)});
 it('uses the existing Tauri updater with separate download/install instead of a second download manager',()=>{expect(api).toContain("import { check } from '@tauri-apps/plugin-updater'");expect(api).toContain('await update.download(');expect(api).toContain('await update.install()');expect(api).not.toContain('downloadAndInstall(')});
 it('renders a persistent updater indicator in Sidebar and removes floating UpdateNotice',()=>{expect(app).toContain('<UpdaterSidebar/>');expect(app).toContain('🔔 Обновление');expect(app).toContain('ОБНОВИТЬ');expect(app).not.toContain('function UpdateNotice(')});
 it('checks on startup and then every six hours without per-navigation polling',()=>{expect(app).toContain('6*60*60_000');expect(app).not.toContain('setTimeout(()=>void run(),30_000)')});
 it('Settings and Sidebar share the same updater runtime state',()=>{expect(app).toContain("from './updaterRuntime'");expect(settings).toContain("from './updaterRuntime'");expect(settings).not.toContain('api.checkUpdate()')});
 it('does zero YouTube updater work and leaves videos.insert accounting untouched',()=>{expect(runtime.toLowerCase()).not.toContain('youtube');expect(runtime).not.toContain('videos.insert');expect(api.slice(api.indexOf('checkUpdate:async')).split('\n};')[0]).not.toContain('ytInvoke')});
 it('records updater stage plus current and target versions in Error Center metadata',()=>{expect(history).toContain("'updater-check'");expect(history).toContain('currentVersion?:string');expect(history).toContain('targetVersion?:string');expect(runtime).toContain('currentVersion,targetVersion')});
 it('requires explicit install/restart after download and contains active-job blocking UI',()=>{expect(runtime).toContain("status:'READY_TO_INSTALL'");expect(runtime).toContain('if(blockers.length)');expect(app).toContain('Сначала завершите задачи');expect(settings).toContain('Сначала завершите активные операции')});
});
