let opened=false;
const listeners=new Set<(open:boolean)=>void>();
function emit(){for(const cb of listeners)cb(opened)}
export function openUploadCenter(){if(!opened){opened=true;emit()}}
export function closeUploadCenter(){if(opened){opened=false;emit()}}
export function uploadCenterOpen(){return opened}
export function subscribeUploadCenterUi(cb:(open:boolean)=>void){listeners.add(cb);cb(opened);return()=>{listeners.delete(cb)}}
