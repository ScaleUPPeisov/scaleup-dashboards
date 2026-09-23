import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';

const read=(name:string)=>readFileSync('src/'+name,'utf8');

describe('VYRON 3.1.1 global UI overflow contract',()=>{
  const css=read('ui-layout-contract.css');

  it('loads the final layout contract after every legacy stylesheet',()=>{
    const main=read('main.tsx');
    expect(main).toContain("import './ui-layout-contract.css';");
    expect(main.lastIndexOf("ui-layout-contract.css")).toBeGreaterThan(main.lastIndexOf("v216.css"));
  });

  it('buttons may shrink and wrap without unreadable font hacks',()=>{
    expect(css).toContain('min-width:0!important');
    expect(css).toContain('white-space:normal!important');
    expect(css).toContain('overflow-wrap:anywhere');
    expect(css).not.toMatch(/font-size:\s*[0-6](?:px|rem)/);
  });

  it('account reconnect uses compact visible Russian label and full accessible explanation',()=>{
    const s=read('AccountsPage.tsx');
    expect(s).toContain("?'Войти заново':'Переподключить'");
    expect(s).toContain("Переподключить через браузер");
    expect(s).not.toContain("?'Войти заново через браузер':'Переподключить через браузер'");
    expect(css).toContain('.accountActions button,.accountRowStats .accountActions button{white-space:normal!important;width:100%');
  });

  it('external disk warning separates flexible message from actions',()=>{
    const s=read('PublisherOS.tsx');
    expect(s).toContain('renderSourceOfflineMessage');
    expect(s).toContain('renderSourceOfflineActions');
    expect(css).toContain('.renderSourceOffline{');
    expect(css).toContain('grid-template-columns:minmax(0,1fr) auto!important');
  });

  it('topbar has no fixed-height wrapping trap and keeps groups responsive',()=>{
    expect(css).toContain('.topbar.vyronMasterTopbar{');
    expect(css).toContain('height:auto!important');
    expect(css).toContain('.vyronMasterTopbar .topStatus{');
    expect(css).toContain('display:flex!important');
  });

  it('tabs and modal footers wrap inside their own viewport',()=>{
    expect(css).toContain('flex-wrap:wrap!important');
    expect(css).toContain('max-height:calc(100vh - 24px)!important');
    expect(css).toContain('.confirmModal footer');
  });

  it('encodes the physical acceptance width and reduced-height matrix',()=>{
    expect(css).toContain('@media(max-width:1440px)');
    expect(css).toContain('@media(max-width:1280px)');
    expect(css).toContain('@media(max-width:1024px)');
    expect(css).toContain('@media(max-height:760px)');
  });

  it('prevents global horizontal overflow while leaving data containers locally scrollable',()=>{
    expect(css).toContain('html,body,#root,.appShell,.main,.pageWrap{max-width:100%;overflow-x:hidden}');
    expect(css).toContain('.table,.topVideoTable,.competitorComparison,.analyticsTopVideos{max-width:100%;overflow-x:auto}');
  });

  it('floating upload/task badges are anchored away from the topbar',()=>{
    expect(css).toContain('.globalUploadIndicator,.globalTaskIndicator{');
    expect(css).toContain('top:auto!important');
    expect(css).toContain('.globalUploadIndicator{bottom:20px!important}');
    expect(css).toContain('.globalTaskIndicator{bottom:76px!important}');
  });
});
