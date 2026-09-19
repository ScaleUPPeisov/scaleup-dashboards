let activeTenant='';

export function setFrontendTenant(userId?:string|null){
  activeTenant=String(userId||'').trim();
}
export function frontendTenantId(){return activeTenant}
export function tenantStorageKey(base:string){
  return activeTenant?base+':user:'+activeTenant:base;
}
