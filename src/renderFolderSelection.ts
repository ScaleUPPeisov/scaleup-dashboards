export type RenderFolderSelectionValidation=
  |{ok:true;path:string}
  |{ok:false;reason:'EMPTY'|'PROJECTS_PATH'|'PROJECTS_BINDING'|'RENDER_ROOT'|'CHANNEL_NAME_MISMATCH';message:string};

export function normalizeFolderSelectionPath(value:string){
  let s=String(value||'').trim().replace(/\\/g,'/');
  while(s.length>1&&s.endsWith('/'))s=s.slice(0,-1);
  if(/^[A-Z]:\//.test(s))s=s[0].toLowerCase()+s.slice(1);
  return s
}

function normalizedName(value:string){
  return String(value||'').trim().replace(/\s+/g,' ').toLocaleLowerCase()
}

function segments(value:string){
  return normalizeFolderSelectionPath(value).split('/').filter(Boolean)
}

export function validateRenderFolderSelection(selected:string,channelName:string,projectsFolderPath?:string):RenderFolderSelectionValidation{
  const path=normalizeFolderSelectionPath(selected);
  if(!path)return{ok:false,reason:'EMPTY',message:'Папка не выбрана.'};

  const parts=segments(path),leaf=parts.at(-1)||'',normalizedLeaf=normalizedName(leaf);
  if(parts.some(x=>normalizedName(x)==='projects')){
    return{ok:false,reason:'PROJECTS_PATH',message:'Выбрана папка Projects. Для запаса видео нужна папка конкретного канала внутри Render.'}
  }

  const projects=normalizeFolderSelectionPath(projectsFolderPath||'');
  if(projects&&(path===projects||path.startsWith(projects+'/'))){
    return{ok:false,reason:'PROJECTS_BINDING',message:'Эта папка относится к Projects. projectsFolderPath не может использоваться как Render.'}
  }

  if(normalizedLeaf==='render'){
    return{ok:false,reason:'RENDER_ROOT',message:'Нельзя выбрать общую папку Render — выберите внутри неё папку именно этого канала.'}
  }

  if(normalizedLeaf!==normalizedName(channelName)){
    return{ok:false,reason:'CHANNEL_NAME_MISMATCH',message:`Выберите папку именно канала «${channelName}». Сейчас выбрана «${leaf||path}».`}
  }

  return{ok:true,path}
}
