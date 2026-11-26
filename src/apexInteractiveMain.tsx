import {mockIPC} from '@tauri-apps/api/mocks';
import {createApexFixture,fixtureIpc} from './apexInteractiveFixture';

// The preview is a browser-only entry, never the native application.
if('__TAURI_INTERNALS__' in window)throw new Error('APEX_FIXTURE_NATIVE_RUNTIME_FORBIDDEN');
const loopback=location.protocol==='http:'&&location.hostname==='127.0.0.1';
const nativeFixture=location.protocol==='apex-fixture:'&&location.hostname==='preview';
// Native fixture is a separate Swift-only app with no Tauri commands.
if(!loopback&&!nativeFixture)throw new Error('APEX_FIXTURE_ORIGIN_REQUIRED');
const fixture=createApexFixture();
mockIPC(command=>fixtureIpc(command,fixture),{shouldMockEvents:true});
void import('./apexInteractiveApp').then(m=>m.mountFixture(fixture)).catch(error=>{
 const root=document.getElementById('root');
 if(root)root.textContent='Ошибка запуска тестового стенда: '+String(error);
});
