export type BrowserOption={id:string;label:string;available:boolean};
export function availableReconnectBrowsers(rows:BrowserOption[]){const a=rows.filter(x=>x.available);return a.length?a:[{id:'default',label:'Браузер по умолчанию',available:true}]}
export function resolveReconnectBrowser(rows:BrowserOption[],preferred?:string,remembered?:string){const a=availableReconnectBrowsers(rows);for(const id of [preferred,remembered,'default'])if(id&&a.some(x=>x.id===id))return id;return a[0]?.id||'default'}
