export type ImportedMetadata={
  number?:number;
  channel?:string;
  title?:string;
  description?:string;
  tags?:string[];
  publishAt?:string;
  publishTime?:string;
  publishTimezone?:string;
  publishUtcOffsetMinutes?:number;
  source:string;
};

function numberFrom(value:unknown,source=''){
  const explicit=Number(value||0);
  if(Number.isFinite(explicit)&&explicit>0)return Math.trunc(explicit);
  const text=String(value??'')+' '+source;
  const m=text.match(/(?:video[_\s-]*|№\s*|^)(\d{1,6})/i)||text.match(/(\d{1,6})/);
  return m?Number(m[1]):undefined
}

function tagsFrom(value:unknown){
  if(Array.isArray(value))return value.map(String).map(x=>x.trim()).filter(Boolean);
  if(typeof value==='string')return value.split(/[,;\n]/).map(x=>x.trim().replace(/^#/,'')).filter(Boolean);
  return undefined
}

function dateFrom(value:unknown){
  if(!value)return undefined;
  const s=String(value).trim();
  if(/^\d{1,2}:\d{2}(?:\s|$)/.test(s))return undefined;
  const d=new Date(s);
  return Number.isNaN(d.getTime())?undefined:d.toISOString()
}

const ZONE_OFFSETS:Record<string,number>={UTC:0,GMT:0,MSK:180,KRAT:420};
function timeFrom(value:unknown){
  if(!value)return {} as Pick<ImportedMetadata,'publishTime'|'publishTimezone'|'publishUtcOffsetMinutes'>;
  const s=String(value).trim();
  const tm=s.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  if(!tm)return {} as Pick<ImportedMetadata,'publishTime'|'publishTimezone'|'publishUtcOffsetMinutes'>;
  const publishTime=`${tm[1].padStart(2,'0')}:${tm[2]}`;
  const zoneMatch=s.match(/\b(KRAT|MSK|UTC|GMT)\b/i);
  let publishTimezone=zoneMatch?.[1]?.toUpperCase();
  let publishUtcOffsetMinutes=publishTimezone?ZONE_OFFSETS[publishTimezone]:undefined;
  const offset=s.match(/\b(?:UTC|GMT)\s*([+-])\s*(\d{1,2})(?::?(\d{2}))?\b/i);
  if(offset){
    const mins=Number(offset[2])*60+Number(offset[3]||0);
    publishUtcOffsetMinutes=(offset[1]==='-'?-1:1)*mins;
    publishTimezone=`UTC${offset[1]}${offset[2].padStart(2,'0')}:${String(offset[3]||'00').padStart(2,'0')}`;
  }
  return {publishTime,publishTimezone,publishUtcOffsetMinutes}
}

function objectRow(raw:any,source:string,key=''):ImportedMetadata|null{
  if(raw==null)return null;
  if(typeof raw!=='object')raw={title:String(raw)};
  const ref=raw.video??raw.videoId??raw.file??raw.filename??raw.name??raw.id??key;
  const time=timeFrom(raw.publishTime??raw.publish_time??raw.time??raw['время публикации']);
  const row:ImportedMetadata={
    number:numberFrom(raw.number??raw.videoNumber??ref,source),
    channel:String(raw.channel??raw.channelName??raw.channel_id??'').trim()||undefined,
    title:String(raw.title??raw.nameTitle??raw.название??'').trim()||undefined,
    description:String(raw.description??raw.desc??raw.описание??'').trim()||undefined,
    tags:tagsFrom(raw.tags??raw.keywords??raw.теги),
    publishAt:dateFrom(raw.publishAt??raw.publish_date??raw.publishDate??raw.date??raw.дата),
    ...time,
    source
  };
  return row.title||row.description||row.tags?.length||row.number||row.publishTime?row:null
}

function parseCsv(text:string,source:string){
  const rows:string[][]=[];let row:string[]=[],cell='',quoted=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++}else quoted=!quoted}
    else if(c===','&&!quoted){row.push(cell);cell=''}
    else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(x=>x.trim()))rows.push(row);row=[];cell=''}
    else cell+=c
  }
  row.push(cell);if(row.some(x=>x.trim()))rows.push(row);if(rows.length<2)return [];
  const head=rows[0].map(x=>x.trim().toLowerCase());
  return rows.slice(1).map(r=>{const o:any={};head.forEach((h,i)=>o[h]=r[i]??'');return objectRow({
    number:o.number||o.video||o.video_number||o['номер'],channel:o.channel||o['канал'],title:o.title||o['название'],description:o.description||o['описание'],tags:o.tags||o['теги']||o.keywords,publishAt:o.publishat||o.publish_date||o.date||o['дата'],publishTime:o.publishtime||o.publish_time||o.time||o['время публикации']
  },source)}).filter(Boolean) as ImportedMetadata[]
}

type Mode='title'|'description'|'tags'|'date'|'publishTime'|'channel'|'ignore'|null;
function labelledLine(line:string):{mode:Mode;value?:string}|null{
  const t=line.trim();
  let m=t.match(/^(TITLE|НАЗВАНИЕ)\s*(?::|-)?\s*(.*)$/i);if(m)return {mode:'title',value:m[2]?.trim()||undefined};
  m=t.match(/^(DESCRIPTION|ОПИСАНИЕ)\s*(?::|-)?\s*(.*)$/i);if(m)return {mode:'description',value:m[2]?.trim()||undefined};
  m=t.match(/^(TAGS|ТЕГИ)(?:\s*[—–-]\s*\d+\s*(?:characters?|символ(?:ов|а)?))?\s*(?::)?\s*(.*)$/i);if(m)return {mode:'tags',value:m[2]?.trim()||undefined};
  m=t.match(/^(PUBLISH(?:[_\s-]*AT|\s+DATE)|DATE|ДАТА)\s*(?::|-)?\s*(.*)$/i);if(m)return {mode:'date',value:m[2]?.trim()||undefined};
  m=t.match(/^(PUBLISH(?:[_\s-]*TIME)|ВРЕМЯ\s+ПУБЛИКАЦИИ)\s*(?::|-)?\s*(.*)$/i);if(m)return {mode:'publishTime',value:m[2]?.trim()||undefined};
  m=t.match(/^(CHANNEL|КАНАЛ)\s*(?::|-)?\s*(.*)$/i);if(m)return {mode:'channel',value:m[2]?.trim()||undefined};
  if(/^SEO\s*FOCUS\s*:/i.test(t))return {mode:'ignore'};
  return null
}

function cleanMultiline(parts:string[]){return parts.join('\n').replace(/\n{3,}/g,'\n\n').trim()||undefined}

function parseBlock(block:string,source:string,forcedNumber?:number):ImportedMetadata|null{
  const lines=block.replace(/\r/g,'').split('\n');
  let mode:Mode=null;
  let title:string|undefined,channel:string|undefined,publishAt:string|undefined;
  let publishTime:string|undefined,publishTimezone:string|undefined,publishUtcOffsetMinutes:number|undefined;
  const descriptionParts:string[]=[],tagParts:string[]=[];
  const setValue=(m:Mode,value:string)=>{
    if(!value)return;
    if(m==='title'){title=value;mode=null}
    else if(m==='description')descriptionParts.push(value)
    else if(m==='tags')tagParts.push(value)
    else if(m==='date'){publishAt=dateFrom(value);mode=null}
    else if(m==='publishTime'){const t=timeFrom(value);publishTime=t.publishTime;publishTimezone=t.publishTimezone;publishUtcOffsetMinutes=t.publishUtcOffsetMinutes;mode=null}
    else if(m==='channel'){channel=value;mode=null}
  };
  for(const raw of lines){
    const label=labelledLine(raw);
    if(label){mode=label.mode;if(label.value)setValue(mode,label.value);continue}
    const value=raw.trim();
    if(!value){if(mode==='description'&&descriptionParts.length&&descriptionParts.at(-1)!=='')descriptionParts.push('');continue}
    if(mode)setValue(mode,value)
  }
  const tags=tagsFrom(tagParts.join('\n'));
  const number=forcedNumber??numberFrom(block,source);
  const row:ImportedMetadata={number,channel,title,description:cleanMultiline(descriptionParts),tags,publishAt,publishTime,publishTimezone,publishUtcOffsetMinutes,source};
  return row.title||row.description||row.tags?.length||row.number||row.publishTime?row:null
}

function parseTxt(text:string,source:string){
  const clean=text.replace(/\r/g,'').trim();if(!clean)return [];
  const videoHeader=/(?:^|\n)\s*VIDEO[_\s-]*(\d+)\s*(?:\n|$)/i.test(clean);
  if(videoHeader){
    const matches=[...clean.matchAll(/(?:^|\n)\s*VIDEO[_\s-]*(\d+)\s*(?=\n|$)/gi)];
    const out:ImportedMetadata[]=[];
    for(let i=0;i<matches.length;i++){
      const start=(matches[i].index??0)+matches[i][0].length;
      const end=i+1<matches.length?(matches[i+1].index??clean.length):clean.length;
      const row=parseBlock(clean.slice(start,end),source,Number(matches[i][1]));
      if(row)out.push(row)
    }
    if(out.length)return out
  }
  const labelled=/(?:^|\n)\s*(?:TITLE|НАЗВАНИЕ|DESCRIPTION|ОПИСАНИЕ|TAGS|ТЕГИ|DATE|ДАТА|PUBLISH(?:[_\s-]*AT|[_\s-]*TIME)|CHANNEL|КАНАЛ)\b/i.test(clean);
  if(labelled){const row=parseBlock(clean,source);return row?[row]:[]}
  const lines=clean.split('\n').map(x=>x.trim()).filter(Boolean);
  return lines.length?[{number:numberFrom(undefined,source),title:lines[0],description:lines.slice(1).join('\n')||undefined,source}]:[]
}

export function validateSequentialMetadata(rows:ImportedMetadata[],expected:number){
  const need=Math.max(0,Math.floor(expected||0));
  const numbers=rows.map(x=>x.number).filter((x):x is number=>Number.isFinite(x));
  const missing=Array.from({length:need},(_,i)=>i+1).filter(n=>!numbers.includes(n));
  const relevant=numbers.filter(n=>n>=1&&n<=need);
  const duplicates=[...new Set(relevant.filter((n,i)=>relevant.indexOf(n)!==i))];
  return {ok:rows.length>=need&&relevant.length>=need&&!missing.length&&!duplicates.length,rows:rows.length,expected:need,missing,duplicates,surplus:Math.max(0,rows.length-need)}
}

export function parseMetadataFile(name:string,text:string):ImportedMetadata[]{
  const lower=name.toLowerCase(),trim=text.trim();
  if(lower.endsWith('.json')||trim.startsWith('{')||trim.startsWith('[')){
    try{
      const data=JSON.parse(trim);let list:any[]=[];
      if(Array.isArray(data))list=data;
      else if(Array.isArray(data.videos))list=data.videos;
      else if(Array.isArray(data.items))list=data.items;
      else if(data&&typeof data==='object'&&('title'in data||'description'in data||'tags'in data||'number'in data||'video'in data))list=[data];
      else if(data&&typeof data==='object')list=Object.entries(data).map(([key,value])=>typeof value==='object'&&value?{...(value as any),__key:key}:{__key:key,title:String(value)});
      const rows=list.map((r:any)=>objectRow(r,name,r.__key||'')).filter(Boolean) as ImportedMetadata[];if(rows.length)return rows
    }catch{}
  }
  if(lower.endsWith('.csv')){const rows=parseCsv(text,name);if(rows.length)return rows}
  return parseTxt(text,name)
}
