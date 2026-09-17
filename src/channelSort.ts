export function sortChannelsAlphabetically<T extends {name:string}>(channels:readonly T[]):T[]{
  return [...channels].sort((a,b)=>a.name.localeCompare(b.name,'en',{sensitivity:'base',numeric:true}));
}
