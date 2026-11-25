import type {CompetitorSnapshot} from './types';

/** Missing or invalid source values must not become measured zeroes. */
export function competitorVelocity(history:CompetitorSnapshot[]|undefined,key:'subscribers'|'views'|'recentAverageViews'){
 if(!history||history.length<2)return undefined;
 const a=history[history.length-2],b=history[history.length-1];
 const elapsed=(Date.parse(b.at)-Date.parse(a.at))/86400000;
 const av=a[key],bv=b[key];
 if(av==null||bv==null||!Number.isFinite(Number(av))||!Number.isFinite(Number(bv))||!Number.isFinite(elapsed))return undefined;
 return (Number(bv)-Number(av))/Math.max(1,elapsed);
}
export function viewsPerSubscriber(views:number|undefined,subscribers:number|undefined){
 return views!=null&&Number.isFinite(views)&&subscribers!=null&&Number.isFinite(subscribers)&&subscribers>0?views/subscribers:undefined;
}
