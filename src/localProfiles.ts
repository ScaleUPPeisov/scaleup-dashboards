export type LocalProfileRole='OWNER'|'USER';

export type LocalUserProfile={
  id:string;
  displayName:string;
  role:LocalProfileRole;
  avatarDataUrl?:string;
  createdAt:string;
  updatedAt:string;
};

const PROFILES_KEY='vyron:local-user-profiles:v1';
const ACTIVE_KEY='vyron:active-local-user-profile:v1';
const EVENT='vyron:local-user-profiles-changed';
const MAX_AVATAR_PX=512;

const now=()=>new Date().toISOString();
const defaultOwner=():LocalUserProfile=>{
  const at=now();
  return{id:'owner',displayName:'Владелец',role:'OWNER',createdAt:at,updatedAt:at}
};

function normalize(value:unknown):LocalUserProfile[]{
  if(!Array.isArray(value))return[];
  return value.filter(Boolean).map((row:any)=>({
    id:String(row.id||crypto.randomUUID()),
    displayName:String(row.displayName||'Пользователь').trim()||'Пользователь',
    role:row.role==='OWNER'?'OWNER':'USER',
    avatarDataUrl:typeof row.avatarDataUrl==='string'&&row.avatarDataUrl.startsWith('data:image/')?row.avatarDataUrl:undefined,
    createdAt:String(row.createdAt||now()),
    updatedAt:String(row.updatedAt||now())
  }))
}

export function loadLocalProfiles(){
  try{
    const rows=normalize(JSON.parse(localStorage.getItem(PROFILES_KEY)||'[]'));
    if(rows.length){
      if(!rows.some(x=>x.role==='OWNER'))rows.unshift(defaultOwner());
      return rows
    }
  }catch{}
  const rows=[defaultOwner()];
  try{localStorage.setItem(PROFILES_KEY,JSON.stringify(rows))}catch{}
  return rows
}

export function activeLocalProfileId(){
  const rows=loadLocalProfiles();
  try{
    const id=localStorage.getItem(ACTIVE_KEY);
    if(id&&rows.some(x=>x.id===id))return id
  }catch{}
  return rows.find(x=>x.role==='OWNER')?.id||rows[0].id
}

export function activeLocalProfile(){
  const rows=loadLocalProfiles(),id=activeLocalProfileId();
  return rows.find(x=>x.id===id)||rows[0]
}

function emit(){window.dispatchEvent(new Event(EVENT))}
function persist(rows:LocalUserProfile[],activeId?:string){
  localStorage.setItem(PROFILES_KEY,JSON.stringify(rows));
  if(activeId)localStorage.setItem(ACTIVE_KEY,activeId);
  emit()
}

export function subscribeLocalProfiles(cb:()=>void){
  window.addEventListener(EVENT,cb);
  return()=>window.removeEventListener(EVENT,cb)
}

export function saveLocalProfile(profile:LocalUserProfile){
  const rows=loadLocalProfiles(),index=rows.findIndex(x=>x.id===profile.id),next={...profile,updatedAt:now()};
  if(index>=0)rows[index]=next;else rows.push(next);
  persist(rows,activeLocalProfileId());
  return next
}

export function createLocalProfile(displayName='Пользователь'){
  const at=now();
  const row:LocalUserProfile={id:crypto.randomUUID(),displayName:displayName.trim()||'Пользователь',role:'USER',createdAt:at,updatedAt:at};
  const rows=loadLocalProfiles();
  rows.push(row);
  persist(rows,row.id);
  return row
}

export function setActiveLocalProfile(id:string){
  const rows=loadLocalProfiles();
  if(rows.some(x=>x.id===id))persist(rows,id)
}

export function deleteLocalProfile(id:string){
  const rows=loadLocalProfiles(),target=rows.find(x=>x.id===id);
  if(!target||target.role==='OWNER')return false;
  const next=rows.filter(x=>x.id!==id);
  const active=activeLocalProfileId()===id?(next.find(x=>x.role==='OWNER')?.id||next[0]?.id):activeLocalProfileId();
  persist(next,active);
  return true
}

export function localProfileInitial(name:string){
  return Array.from((name||'V').trim())[0]?.toUpperCase()||'V'
}

const readFile=(file:File)=>new Promise<string>((resolve,reject)=>{
  const reader=new FileReader();
  reader.onerror=()=>reject(reader.error||new Error('AVATAR_READ_FAILED'));
  reader.onload=()=>resolve(String(reader.result||''));
  reader.readAsDataURL(file)
});

const loadImage=(src:string)=>new Promise<HTMLImageElement>((resolve,reject)=>{
  const img=new Image();
  img.onload=()=>resolve(img);
  img.onerror=()=>reject(new Error('AVATAR_DECODE_FAILED'));
  img.src=src
});

export async function avatarFileToManagedDataUrl(file:File){
  if(!/^image\/(png|jpeg|webp)$/i.test(file.type))throw new Error('AVATAR_UNSUPPORTED_FORMAT');
  if(file.size>30*1024*1024)throw new Error('AVATAR_TOO_LARGE');
  const source=await readFile(file),img=await loadImage(source);
  const side=Math.max(1,Math.min(img.naturalWidth,img.naturalHeight));
  const sx=Math.max(0,(img.naturalWidth-side)/2),sy=Math.max(0,(img.naturalHeight-side)/2);
  const out=Math.min(MAX_AVATAR_PX,side);
  const canvas=document.createElement('canvas');canvas.width=out;canvas.height=out;
  const ctx=canvas.getContext('2d');if(!ctx)throw new Error('AVATAR_CANVAS_UNAVAILABLE');
  ctx.drawImage(img,sx,sy,side,side,0,0,out,out);
  return canvas.toDataURL('image/webp',0.88)
}
