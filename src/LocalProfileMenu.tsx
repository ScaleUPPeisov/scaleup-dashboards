import React,{useEffect,useMemo,useState} from 'react';
import {api} from './api';
import {ModalPortal} from './ModalPortal';
import {
  activeLocalProfile,
  createLocalProfile,
  deleteLocalProfile,
  loadLocalProfiles,
  localProfileInitial,
  saveLocalProfile,
  setActiveLocalProfile,
  subscribeLocalProfiles,
  type LocalUserProfile
} from './localProfiles';

function ProfileAvatar({profile,size='md'}:{profile:LocalUserProfile;size?:'sm'|'md'|'lg'}){
  if(profile.avatarDataUrl){
    return <img className={`localProfileAvatar localProfileAvatar-${size}`} src={profile.avatarDataUrl} alt="" decoding="async"/>;
  }
  return <span className={`localProfileAvatar localProfileAvatar-${size} localProfileAvatarFallback`} aria-hidden="true">{localProfileInitial(profile.displayName)}</span>
}

export function LocalProfileMenu(){
  const [tick,setTick]=useState(0),[open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  useEffect(()=>subscribeLocalProfiles(()=>setTick(x=>x+1)),[]);
  const profiles=useMemo(()=>loadLocalProfiles(),[tick]);
  const active=useMemo(()=>activeLocalProfile(),[tick]);
  const [name,setName]=useState(active.displayName);
  useEffect(()=>setName(active.displayName),[active.id,active.displayName]);

  const chooseAvatar=async()=>{
    if(busy)return;
    setBusy(true);setError('');
    try{
      const picked=await api.chooseProfileAvatar(active.id);
      if(!picked)return;
      saveLocalProfile({...active,avatarPath:picked.path,avatarDataUrl:picked.dataUrl});
    }catch(e){setError(String(e))}
    finally{setBusy(false)}
  };

  const saveName=()=>{
    const displayName=name.trim();
    if(!displayName)return;
    saveLocalProfile({...active,displayName});
  };

  const addUser=()=>{
    const row=createLocalProfile(`Пользователь ${profiles.filter(x=>x.role==='USER').length+1}`);
    setActiveLocalProfile(row.id);
  };

  const switchTo=(id:string)=>{setActiveLocalProfile(id);setError('')};

  return <>
    <button className="localProfileButton" onClick={()=>setOpen(true)} title="Профиль VYRON">
      <ProfileAvatar profile={active} size="sm"/>
      <span><b>{active.displayName}</b><small>{active.role}</small></span>
      <em>›</em>
    </button>
    {open&&<ModalPortal onClose={()=>setOpen(false)}>
      <section className="confirmModal localProfileModal" onMouseDown={e=>e.stopPropagation()}>
        <div className="panelHead">
          <div><small>LOCAL PROFILE • VYRON</small><h2>Профиль</h2><p>Локальные профили не меняют Google, OAuth, YouTube-каналы или credentials.</p></div>
          <button onClick={()=>setOpen(false)}>×</button>
        </div>

        <div className="localProfileEditor">
          <ProfileAvatar profile={active} size="lg"/>
          <div className="localProfileFields">
            <label><small>Имя</small><input value={name} onChange={e=>setName(e.target.value)} onBlur={saveName} onKeyDown={e=>{if(e.key==='Enter')saveName()}}/></label>
            <span className="localProfileRole">{active.role}</span>
            <div className="headerActions">
              <button disabled={busy} onClick={()=>void chooseAvatar()}>{busy?'Открываю…':'Выбрать фото'}</button>
              {active.avatarDataUrl&&<button className="ghost" onClick={()=>saveLocalProfile({...active,avatarDataUrl:undefined,avatarPath:undefined})}>Убрать фото</button>}
            </div>
            <small className="localProfileHint">macOS открывает системный Finder, Windows — системный Проводник. JPG, PNG и WEBP копируются во внутреннюю папку VYRON.</small>
            {error&&<div className="errorBox">{error}</div>}
          </div>
        </div>

        <div className="localProfilesList">
          <div className="panelHead"><div><small>ПОЛЬЗОВАТЕЛИ</small><h3>{profiles.length} профилей</h3></div><button onClick={addUser}>+ Добавить пользователя</button></div>
          {profiles.map(profile=><article key={profile.id} className={profile.id===active.id?'active':''}>
            <button className="localProfileSwitch" onClick={()=>switchTo(profile.id)}>
              <ProfileAvatar profile={profile} size="sm"/>
              <span><b>{profile.displayName}</b><small>{profile.role}</small></span>
              {profile.id===active.id&&<em>АКТИВЕН</em>}
            </button>
            {profile.role!=='OWNER'&&<button className="danger ghost" onClick={()=>{deleteLocalProfile(profile.id);setError('')}}>Удалить</button>}
          </article>)}
        </div>

        <footer><button className="primary" onClick={()=>{saveName();setOpen(false)}}>Готово</button></footer>
      </section>
    </ModalPortal>}
  </>
}
