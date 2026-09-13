#!/usr/bin/env python3
import pathlib,sys,shutil
root=pathlib.Path(sys.argv[1]).resolve()
assets=pathlib.Path(sys.argv[2]).resolve()

def read(rel): return (root/rel).read_text()
def write(rel,s):
    p=root/rel;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(s)
def replace_once(rel,old,new):
    s=read(rel);n=s.count(old)
    if n!=1: raise SystemExit(f'{rel}: anchor count={n}: {old[:160]!r}')
    write(rel,s.replace(old,new,1))

# Backend DTO reads metadata only. It never hydrates Keychain client_secret/access_token/refresh_token.
y='src-tauri/src/youtube.rs'
anchor='''fn google_config_status_value(c: &GoogleConfig) -> Value {
    json!({"configured":!c.client_id.trim().is_empty(),"projectId":if c.project_id.is_empty(){Value::Null}else{json!(c.project_id)},"clientIdMasked":if c.client_id.is_empty(){Value::Null}else{json!(masked_client_id(&c.client_id))},"hasSecret":!c.client_secret.is_empty(),"hasApiKey":!c.api_key.is_empty()})
}
'''
insert=anchor+'''#[derive(Debug, Clone, Deserialize, Default)]
struct SafeGoogleMetadata {
    #[serde(default)] client_id: String,
    #[serde(default)] project_id: String,
}
#[derive(Debug, Clone, Deserialize, Default)]
struct SafeOAuthMetadataStore {
    #[serde(default)] profiles: Vec<SafeOAuthMetadataProfile>,
}
#[derive(Debug, Clone, Deserialize, Default)]
struct SafeOAuthMetadataProfile {
    #[serde(default)] id: String,
    #[serde(default)] client_id: String,
    #[serde(default)] channel_id: Option<String>,
    #[serde(default)] channel_title: Option<String>,
}
fn load_google_metadata_only(app: &AppHandle) -> Result<SafeGoogleMetadata, String> {
    let p=google_config_path(app)?;
    if !p.exists(){return Ok(SafeGoogleMetadata::default())}
    let b=fs::read(&p).map_err(|e|format!("Google metadata read: {e}"))?;
    serde_json::from_slice(&b).map_err(|e|format!("Google metadata parse: {e}"))
}
fn load_oauth_metadata_only(app: &AppHandle) -> Result<SafeOAuthMetadataStore, String> {
    let p=store_path(app)?;
    if !p.exists(){return Ok(SafeOAuthMetadataStore::default())}
    let b=fs::read(&p).map_err(|e|format!("OAUTH_METADATA_READ_ERROR: {e}"))?;
    serde_json::from_slice(&b).map_err(|e|format!("OAUTH_METADATA_PARSE_ERROR: {e}"))
}
fn google_project_diagnostic_value(store:&SafeOAuthMetadataStore,google:&SafeGoogleMetadata,profile_id:&str)->Result<Value,String>{
    let profile=store.profiles.iter().find(|p|p.id==profile_id).ok_or_else(||"GOOGLE_PROJECT_PROFILE_NOT_FOUND".to_string())?;
    let client_id=profile.client_id.trim();
    if client_id.is_empty(){return Err("GOOGLE_PROJECT_CLIENT_ID_NOT_FOUND".into())}
    let exact_global_client_match=!google.client_id.trim().is_empty()&&google.client_id.trim()==client_id;
    let project_id=if exact_global_client_match&&!google.project_id.trim().is_empty(){Some(google.project_id.trim())}else{None};
    Ok(json!({"oauthProfileId":profile.id,"channelId":profile.channel_id,"channelTitle":profile.channel_title,"clientId":client_id,"projectId":project_id,"projectIdSource":if project_id.is_some(){"google-config-exact-client-match"}else{"not-locally-known"},"youtubeApiRequests":0,"keychainSecretsRead":false}))
}
#[tauri::command]
pub fn youtube_google_project_diagnostic(app:AppHandle,profile_id:String)->Result<Value,String>{
    let store=load_oauth_metadata_only(&app)?;
    let google=load_google_metadata_only(&app)?;
    google_project_diagnostic_value(&store,&google,profile_id.trim())
}
'''
replace_once(y,anchor,insert)

# Secret-redaction + exact Project ID match test in existing Rust test module.
s=read(y);marker='''    fn profile(n: usize) -> OAuthProfile {
''';pos=s.find(marker)
if pos<0: raise SystemExit('youtube.rs test fixture anchor missing')
rust_test='''    #[test]
    fn google_project_diagnostic_is_metadata_only_and_secret_redacted() {
        let store: SafeOAuthMetadataStore=serde_json::from_str(r#"{"profiles":[{"id":"p99","client_id":"123456789012-abcdefghijklmnop.apps.googleusercontent.com","channel_id":"UC_SAFE_METADATA","channel_title":"Safe Test Channel","client_secret":"CLIENT_SECRET_MUST_NOT_LEAK","access_token":"ACCESS_TOKEN_MUST_NOT_LEAK","refresh_token":"REFRESH_TOKEN_MUST_NOT_LEAK"}]}"#).unwrap();
        let google: SafeGoogleMetadata=serde_json::from_str(r#"{"client_id":"123456789012-abcdefghijklmnop.apps.googleusercontent.com","project_id":"real-local-project-id","client_secret":"GLOBAL_SECRET_MUST_NOT_LEAK","api_key":"API_KEY_MUST_NOT_LEAK"}"#).unwrap();
        let value=google_project_diagnostic_value(&store,&google,"p99").unwrap();
        assert_eq!(value["clientId"],"123456789012-abcdefghijklmnop.apps.googleusercontent.com");
        assert_eq!(value["projectId"],"real-local-project-id");
        assert_eq!(value["youtubeApiRequests"],0);
        assert_eq!(value["keychainSecretsRead"],false);
        let other:SafeGoogleMetadata=serde_json::from_str(r#"{"client_id":"999999999999-other.apps.googleusercontent.com","project_id":"must-not-be-used"}"#).unwrap();
        let mismatch=google_project_diagnostic_value(&store,&other,"p99").unwrap();
        assert!(mismatch["projectId"].is_null());
        let out=value.to_string();
        for forbidden in ["client_secret","access_token","refresh_token","CLIENT_SECRET_MUST_NOT_LEAK","ACCESS_TOKEN_MUST_NOT_LEAK","REFRESH_TOKEN_MUST_NOT_LEAK","GLOBAL_SECRET_MUST_NOT_LEAK","API_KEY_MUST_NOT_LEAK"]{assert!(!out.contains(forbidden),"leaked {forbidden}")}
    }

'''
write(y,s[:pos]+rust_test+s[pos:])
replace_once('src-tauri/src/lib.rs','youtube::youtube_oauth_profiles,youtube::youtube_google_config_status,','youtube::youtube_oauth_profiles,youtube::youtube_google_project_diagnostic,youtube::youtube_google_config_status,')

# Frontend DTO/API: direct invoke, deliberately outside ytInvoke and request ledger.
replace_once('src/api.ts','export type GoogleConfigStatus={configured:boolean;projectId?:string;clientIdMasked?:string;hasSecret:boolean;hasApiKey:boolean};','export type GoogleConfigStatus={configured:boolean;projectId?:string;clientIdMasked?:string;hasSecret:boolean;hasApiKey:boolean};\nexport type GoogleProjectDiagnosticSafe={oauthProfileId:string;channelId?:string|null;channelTitle?:string|null;clientId:string;projectId?:string|null;projectIdSource:\'google-config-exact-client-match\'|\'not-locally-known\';youtubeApiRequests:0;keychainSecretsRead:false};')
replace_once('src/api.ts',"  youtubeProfiles:()=>invoke<YoutubeProfile[]>('youtube_oauth_profiles'),\n","  youtubeProfiles:()=>invoke<YoutubeProfile[]>('youtube_oauth_profiles'),\n  youtubeGoogleProjectDiagnostic:(profileId:string)=>invoke<GoogleProjectDiagnosticSafe>('youtube_google_project_diagnostic',{profileId}),\n")

# Copy pure helper/tests maintained as feature assets.
shutil.copy2(assets/'googleProjectDiagnostics.ts',root/'src/googleProjectDiagnostics.ts')
shutil.copy2(assets/'googleProjectDiagnostics.test.ts',root/'src/googleProjectDiagnostics.test.ts')

# Settings state + local-only diagnostic flow. Existing upload-quota editor/accounting is untouched.
st='src/SettingsOS.tsx'
replace_once(st,"import {api,type GoogleConfigStatus} from './api';","import {api,type GoogleConfigStatus,type GoogleProjectDiagnosticSafe} from './api';")
replace_once(st,"import {resetYoutubeUploadQuotaLimit,setYoutubeUploadQuotaLimit,subscribeYoutubeQuota,youtubeQuotaProjectIdentity,youtubeUploadQuotaState} from './youtubeQuota';","import {resetYoutubeUploadQuotaLimit,setYoutubeUploadQuotaLimit,subscribeYoutubeQuota,subscribeYoutubeQuotaClock,youtubeQuotaClockSnapshot,youtubeQuotaProjectIdentity,youtubeQuotaUsage,youtubeUploadQuotaState} from './youtubeQuota';\nimport {channelsSharingQuotaProject,googleCloudConsoleUrl,localGoogleProjectDiagnosticPass,maskOAuthClientId,oauthProjectNumber,secretFieldNames} from './googleProjectDiagnostics';")
replace_once(st,"[quotaLimitInput,setQuotaLimitInput]=useState('100'),[quotaRev,setQuotaRev]=useState(0);","[quotaLimitInput,setQuotaLimitInput]=useState('100'),[quotaRev,setQuotaRev]=useState(0),[googleProjectDiag,setGoogleProjectDiag]=useState<GoogleProjectDiagnosticSafe|undefined>(),[googleProjectLoading,setGoogleProjectLoading]=useState(false),[clientIdVisible,setClientIdVisible]=useState(false),[localProjectStatus,setLocalProjectStatus]=useState('NOT RUN'),[quotaClock,setQuotaClock]=useState(()=>youtubeQuotaClockSnapshot());")
replace_once(st," useEffect(()=>{const off=subscribeYoutubeQuota(()=>setQuotaRev(x=>x+1));return off},[]);"," useEffect(()=>{const off=subscribeYoutubeQuota(()=>setQuotaRev(x=>x+1)),offClock=subscribeYoutubeQuotaClock(setQuotaClock);return()=>{off();offClock()}},[]);")
anchor2=" useEffect(()=>{setQuotaLimitInput(uploadQuota.limit==null?'':String(uploadQuota.limit))},[quotaIdentity.projectKey,uploadQuota.limit]);\n"
insert2=anchor2+" useEffect(()=>{let live=true;setClientIdVisible(false);setLocalProjectStatus('NOT RUN');setGoogleProjectDiag(undefined);if(!quotaProfileId)return()=>{live=false};setGoogleProjectLoading(true);void api.youtubeGoogleProjectDiagnostic(quotaProfileId).then(x=>{if(live)setGoogleProjectDiag(x)}).catch(e=>{if(live){setGoogleProjectDiag(undefined);notifyWarning('Google project diagnostics',String(e))}}).finally(()=>{if(live)setGoogleProjectLoading(false)});return()=>{live=false}},[quotaProfileId]);\n const sharingChannels=channelsSharingQuotaProject(channels,quotaProfiles,quotaGoogleConfig,quotaIdentity.projectKey),generalQuota=youtubeQuotaUsage(),selectedChannel=channels.find(c=>c.youtubeProfileId===quotaProfileId),projectNumber=oauthProjectNumber(googleProjectDiag?.clientId||''),projectId=googleProjectDiag?.projectId||undefined,calculatedRemaining=uploadQuota.limitSource==='unknown'||uploadQuota.limit==null?null:Math.max(0,uploadQuota.limit-uploadQuota.used-uploadQuota.reserved),clientIdDisplay=googleProjectDiag?.clientId?(clientIdVisible?googleProjectDiag.clientId:maskOAuthClientId(googleProjectDiag.clientId)):'—';\n async function runLocalGoogleProjectDiagnostics(){if(!quotaProfileId){notifyWarning('Выберите OAuth профиль','Локальная диагностика требует выбранный профиль.');return}setGoogleProjectLoading(true);try{const safe=await api.youtubeGoogleProjectDiagnostic(quotaProfileId);setGoogleProjectDiag(safe);const leaks=secretFieldNames(safe);if(leaks.length)throw new Error(`SECRET_FIELD_LEAK: ${leaks.join(',')}`);const ok=localGoogleProjectDiagnosticPass(safe,quotaIdentity.projectKey,uploadQuota);setLocalProjectStatus(ok?'PASS':'CHECK');if(ok)notifySuccess('LOCAL DIAGNOSTICS: PASS','OAuth metadata, project identity и local quota ledger проверены. YouTube API requests: 0.');else notifyWarning('LOCAL DIAGNOSTICS: CHECK','Часть локальной metadata отсутствует. YouTube API requests: 0.')}catch(e){setLocalProjectStatus('ERROR');notifyError('Google project diagnostics',String(e))}finally{setGoogleProjectLoading(false)}}\n"
replace_once(st,anchor2,insert2)
needle="{tab==='youtube'&&<div className=\"settingsStack\"><AuthRecoveryCenter/><section className=\"settingsCard\"><small>YOUTUBE API · UPLOAD QUOTA</small>"
card=(assets/'settings-youtube-card.fragment.txt').read_text()
replace_once(st,needle,card)
print('VYRON Google Cloud Project diagnostics overlay applied')
