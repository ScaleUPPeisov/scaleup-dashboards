import {describe,it,expect} from 'vitest';
import {availableReconnectBrowsers,resolveReconnectBrowser} from './reconnectBrowserChoiceCore';
describe('reconnect browser choice',()=>{
 it('uses the profile preferred browser when installed',()=>{const rows=[{id:'default',label:'Default',available:true},{id:'chrome',label:'Chrome',available:true},{id:'safari',label:'Safari',available:true}];expect(resolveReconnectBrowser(rows,'safari','chrome')).toBe('safari')});
 it('falls back to remembered browser when profile preference is unavailable',()=>{const rows=[{id:'default',label:'Default',available:true},{id:'chrome',label:'Chrome',available:true},{id:'safari',label:'Safari',available:false}];expect(resolveReconnectBrowser(rows,'safari','chrome')).toBe('chrome')});
 it('removes unavailable browsers and always keeps a safe default',()=>{expect(availableReconnectBrowsers([{id:'chrome',label:'Chrome',available:false}])).toEqual([{id:'default',label:'Браузер по умолчанию',available:true}])});
});
