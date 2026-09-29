import React,{useEffect,useMemo,useState} from 'react';
import {api} from './api';
import {useApp} from './store';
import {ModalPortal} from './ModalPortal';

const DEFAULT_NAME='Кирилл';
const DEFAULT_ROLE='Owner';
const LEGACY_OWNER_ROLE='Owner / YouTube Manager';
const DEFAULT_COMPANY='VYRON / ScaleUP';

function initials(value:string){
  const parts=value.trim().split(/\s+/).filter(Boolean);
  return (parts.slice(0,2).map(x=>x[0]).join('')||'К').toUpperCase();
}

export function OwnerProfile(){
  const settings=useApp(s=>s.settings),patchSettings=useApp(s=>s.patchSettings);
  const mode=settings.localProfileMode||'OWNER';
  const name=settings.localProfileName?.trim()||DEFAULT_NAME;
  const storedRole=settings.localProfileRole?.trim();
  const role=!storedRole||storedRole===LEGACY_OWNER_ROLE?(mode==='MANAGER'?'Manager':DEFAULT_ROLE):storedRole;
  const company=settings.localProfileCompany?.trim()||DEFAULT_COMPANY;
  const [open,setOpen]=useState(false),[avatar,setAvatar]=useState(''),[busy,setBusy]=useState(false);
  const [draft,setDraft]=useState(()=>({mode,name,role,company}));
  const avatarPath=settings.localProfileAvatarPath||'';

  useEffect(()=>{setDraft({mode,name,role,company})},[mode,name,role,company]);
  useEffect(()=>{
    let live=true;
    if(!avatarPath){setAvatar('');return}
    void api.profileAvatarData(avatarPath).then(x=>{if(live)setAvatar(x.dataUrl)}).catch(()=>{if(live)setAvatar('')});
    return()=>{live=false}
  },[avatarPath]);

  const avatarNode=useMemo(()=>avatar?<img src={avatar} alt=""/>:<span>{initials(name)}</span>,[avatar,name]);
  async function chooseAvatar(){
    if(busy)return;
    const path=await api.chooseOwnerProfileAvatar();if(!path)return;
    setBusy(true);
    try{
      const x=await api.profileImportAvatar(path);
      setAvatar(x.dataUrl);
      patchSettings({localProfileAvatarPath:x.path})
    }finally{setBusy(false)}
  }
  function save(){
    const fallbackRole=draft.mode==='MANAGER'?'Manager':DEFAULT_ROLE;
    patchSettings({localProfileMode:draft.mode,localProfileName:draft.name.trim()||DEFAULT_NAME,localProfileRole:draft.role.trim()||fallbackRole,localProfileCompany:draft.company.trim()||DEFAULT_COMPANY});
    setOpen(false)
  }

  return <>
    <button className="ownerProfileCompact" onClick={()=>setOpen(true)} title="Профиль владельца">
      <span className="ownerProfileAvatar">{avatarNode}</span>
      <span><b>{name}</b><small>{role}</small></span>
    </button>
    {open&&<ModalPortal onClose={()=>setOpen(false)}><section className="confirmModal ownerProfileModal" onMouseDown={e=>e.stopPropagation()}>
      <div className="panelHead"><div><small>ЛОКАЛЬНЫЙ ПРОФИЛЬ</small><h2>Профиль владельца</h2><p>Хранится локально в VYRON. Паролей и секретов здесь нет.</p></div><button onClick={()=>setOpen(false)}>×</button></div>
      <div className="ownerProfileEditor">
        <button className="ownerProfilePhotoPicker" onClick={()=>void chooseAvatar()} disabled={busy}><span className="ownerProfileAvatar ownerProfileAvatarLarge">{avatarNode}</span><b>{busy?'Импорт…':'Выбрать фото'}</b><small>Finder / Проводник • PNG/JPG/WebP</small></button>
        <label><span>Режим локального профиля</span><select value={draft.mode} onChange={e=>{const next=e.target.value as 'OWNER'|'MANAGER';setDraft(x=>({...x,mode:next,role:x.role===DEFAULT_ROLE||x.role==='Manager'?next==='OWNER'?DEFAULT_ROLE:'Manager':x.role}))}}><option value="OWNER">OWNER</option><option value="MANAGER">MANAGER</option></select><small>Только локальный режим интерфейса. Google/OAuth и привязки каналов не меняются.</small></label>
        <label><span>Имя</span><input value={draft.name} onChange={e=>setDraft(x=>({...x,name:e.target.value}))}/></label>
        <label><span>Роль</span><input value={draft.role} onChange={e=>setDraft(x=>({...x,role:e.target.value}))}/></label>
        <label><span>Компания / проект</span><input value={draft.company} onChange={e=>setDraft(x=>({...x,company:e.target.value}))}/></label>
      </div>
      <footer><button onClick={()=>setOpen(false)}>Отмена</button><button className="primary" onClick={save}>Сохранить</button></footer>
    </section></ModalPortal>}
  </>
}
