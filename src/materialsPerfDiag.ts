type DiagIpc={command:string;startedAt:number;duration?:number;ok?:boolean};
type DiagClick={
  id:number;
  from:string;
  startedAt:number;
  appBase:number;
  productionBase:number;
  materialsBase:number;
  rowBase:number;
  ipcBase:number;
};
type MaterialsPerfDiagState={
  sequence:number;
  appRenders:number;
  productionRenders:number;
  materialsRenders:number;
  rowRenders:number;
  click?:DiagClick;
  ipc:DiagIpc[];
  lastReport?:string;
};

declare global{
  interface Window{__VYRON_MATERIALS_DIAG__?:MaterialsPerfDiagState}
}

function state():MaterialsPerfDiagState{
  if(!window.__VYRON_MATERIALS_DIAG__)window.__VYRON_MATERIALS_DIAG__={
    sequence:0,appRenders:0,productionRenders:0,materialsRenders:0,rowRenders:0,ipc:[]
  };
  return window.__VYRON_MATERIALS_DIAG__;
}

function mark(name:string){
  try{performance.mark(name)}catch{}
}

export function diagCount(kind:'app'|'production'|'materials'|'row'){
  const s=state();
  if(kind==='app')s.appRenders++;
  else if(kind==='production')s.productionRenders++;
  else if(kind==='materials')s.materialsRenders++;
  else s.rowRenders++;
}

export function beginMaterialsDiagClick(from:string){
  const s=state(),id=++s.sequence;
  s.click={
    id,from,startedAt:performance.now(),
    appBase:s.appRenders,
    productionBase:s.productionRenders,
    materialsBase:s.materialsRenders,
    rowBase:s.rowRenders,
    ipcBase:s.ipc.length
  };
  mark('materials-click-'+id);
  console.log('[MATERIALS PERF] click',{id,from});
}

export function completeMaterialsDiagOnNextPaint(){
  const active=state().click;
  if(!active)return;
  requestAnimationFrame(()=>{
    const firstRaf=performance.now();
    requestAnimationFrame(()=>{
      const s=state(),click=s.click;
      if(!click||click.id!==active.id)return;
      const now=performance.now();
      const ipc=s.ipc.slice(click.ipcBase);
      const report=[
        'MATERIALS TEST A — EMPTY ROUTE',
        'from: '+click.from,
        'click → first RAF: '+(firstRaf-click.startedAt).toFixed(1)+' ms',
        'click → next painted frame*: '+(now-click.startedAt).toFixed(1)+' ms',
        'App renders: '+(s.appRenders-click.appBase),
        'ProductionOS renders: '+(s.productionRenders-click.productionBase),
        'MaterialsManager renders: '+(s.materialsRenders-click.materialsBase),
        'Materials rows renders: '+(s.rowRenders-click.rowBase),
        'Production IPC calls: '+ipc.length,
        ...ipc.slice(0,20).map(x=>'IPC '+x.command+' '+(x.duration??0).toFixed(1)+' ms '+(x.ok===false?'ERR':'OK')),
        '',
        '* second requestAnimationFrame boundary; use visual freeze + Safari timeline as final truth'
      ].join('\n');
      s.lastReport=report;
      const el=document.getElementById('materials-diag-overlay');
      if(el)el.textContent=report;
      console.log('[MATERIALS PERF] report\n'+report);
      try{localStorage.setItem('vyron:materials-diag:last',report)}catch{}
      mark('materials-first-frame-'+click.id);
      try{performance.measure('materials-click-to-frame-'+click.id,'materials-click-'+click.id,'materials-first-frame-'+click.id)}catch{}
    });
  });
}

export function beginMaterialsIpc(command:string){
  const row:DiagIpc={command,startedAt:performance.now()};
  state().ipc.push(row);
  return row;
}
export function finishMaterialsIpc(row:DiagIpc,ok:boolean){
  row.duration=performance.now()-row.startedAt;
  row.ok=ok;
}

export function lastMaterialsDiagReport(){
  return state().lastReport||'MATERIALS TEST A — waiting for click';
}
