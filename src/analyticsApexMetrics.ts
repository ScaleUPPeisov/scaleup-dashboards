/** Keep an unreported revenue distinct from a confirmed zero. */
export function formatAnalyticsRevenue(authorized:boolean,revenue:number|null|undefined):string{
 if(!authorized)return 'Нет доступа';
 if(revenue==null||!Number.isFinite(revenue))return '—';
 return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(revenue);
}
