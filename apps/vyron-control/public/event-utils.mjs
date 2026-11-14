const PROGRESS_TYPES=new Set(['upload_progress','render_progress']);

export function compactProgressEvents(events) {
  const rows=[];
  const progressByKey=new Map();
  for(const event of Array.isArray(events)?events:[]) {
    const type=String(event?.type||'');
    const projectId=String(event?.projectId||'');
    if(!PROGRESS_TYPES.has(type)||!projectId) {
      rows.push({event,count:1});
      continue;
    }
    const key=type+'\\u0000'+projectId;
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
