import {mockIPC} from '@tauri-apps/api/mocks';
import {createApexFixture,fixtureIpc} from './apexInteractiveFixture';

// The preview is a browser-only entry, never the native application.
if('__TAURI_INTERNALS__' in window)throw new Error('APEX_FIXTURE_NATIVE_RUNTIME_FORBIDDEN');
if(location.protocol!=='http:'||location.hostname!=='127.0.0.1')throw new Error('APEX_FIXTURE_LOOPBACK_REQUIRED');
const fixture=createApexFixture();
mockIPC(command=>fixtureIpc(command,fixture),{shouldMockEvents:true});
void import('./apexInteractiveApp').then(m=>m.mountFixture(fixture)).catch(error=>{
 const root=document.getElementById('root');
 if(root)root.textContent='Ошибка запуска тестового стенда: '+String(error);
});
