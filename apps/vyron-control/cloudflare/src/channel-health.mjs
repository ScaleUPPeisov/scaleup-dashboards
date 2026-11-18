// No raw Google OAuth error text is exposed to the browser.
export function analyticsSyncStatus(row,now=new Date()){
 if(!row?.analytics_authorized)return 'REQUIRES_AUTH';
 const reason=String(row?.oauth_last_error||'');
 if(reason&&!reason.startsWith('Some Analytics breakdowns unavailable:'))
   return 'ERROR';
 const captured=Date.parse(row?.analytics_captured_at);
 if(row.analytics_source!=='GOOGLE_ANALYTICS_API'||
    !Number.isFinite(captured)||captured>now.getTime()+10*60000||
    now.getTime()-captured>48*3600000)return 'STALE';
 return 'CONNECTED';
}
