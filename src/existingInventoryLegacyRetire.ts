const PREFIX='vyron:existing-cache:v1:';

export function verifiedLegacyInventoryRetire(channelId:string){
  if(typeof localStorage==='undefined'||!channelId)return false;
  const key=PREFIX+channelId;
  if(!key.startsWith(PREFIX))return false;
  localStorage.removeItem(key);
  return localStorage.getItem(key)===null;
}
