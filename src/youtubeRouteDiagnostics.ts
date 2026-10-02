export type YoutubeRouteDiagnosticEvent={at:number;elapsed:number;source:string;reason:string;duration?:number};
export type YoutubeRouteDiagnosticWindow={id:number;startedAt:number;events:YoutubeRouteDiagnosticEvent[]};

let nextId=1;
let current:YoutubeRouteDiagnosticWindow|undefined;
const windows:YoutubeRouteDiagnosticWindow[]=[];

function now(){return typeof performance!=='undefined'?performance.now():Date.now()}

export function beginYoutubeRouteDiagnostics(){
 const startedAt=now();
 current={id:nextId++,startedAt,events:[]};
 windows.push(current);
 if(windows.length>60)windows.splice(0,windows.length-60);
 recordYoutubeRouteEvent('YouTubeCenter','route-enter');
 return current.id
}

export function recordYoutubeRouteEvent(source:string,reason:string,duration?:number){
 const row=current;if(!row)return;
 const at=now(),elapsed=at-row.startedAt;
 if(elapsed>150)return;
 row.events.push({at,elapsed,source,reason,...(duration!=null?{duration}:{})})
}

export function youtubeRouteDiagnosticsSnapshot(){
 return windows.map(x=>({id:x.id,startedAt:x.startedAt,events:x.events.slice()})).slice(-30)
}
