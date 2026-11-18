const PROGRESS_TYPES=new Set(['upload_progress','render_progress']);

function isProgressEvent(event) {
  const type=String(event?.type||'');
  return PROGRESS_TYPES.has(type)||
    (type==='agent_info'&&/^YOUTUBE PROCESSING\b/.test(String(event?.title||event?.name||'')));
}

export function compactProgressEvents(events) {
  const rows=[];
  const progressByKey=new Map();
  for(const event of Array.isArray(events)?events:[]) {
    const type=String(event?.type||'');
    const projectId=String(event?.projectId||'');
    if(!isProgressEvent(event)||!projectId) {
      rows.push({event,count:1});
      continue;
    }
    const title=type==='agent_info'?String(event?.title||event?.name||''):'';
    const key=JSON.stringify([type,projectId,title]);
    const existing=progressByKey.get(key);
    if(!existing) {
      const row={event,count:1};
      progressByKey.set(key,row);
      rows.push(row);
      continue;
    }
    existing.count++;
    const currentTime=Date.parse(existing.event?.detectedAt||'')||0;
    const incomingTime=Date.parse(event?.detectedAt||'')||0;
    if(incomingTime>currentTime)existing.event=event;
  }
  rows.sort((a,b)=>
    (Date.parse(b.event?.detectedAt||'')||0)-
    (Date.parse(a.event?.detectedAt||'')||0));
  return rows;
}
