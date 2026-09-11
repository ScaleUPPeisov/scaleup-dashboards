#!/usr/bin/env python3
from pathlib import Path
import sys

root=Path(sys.argv[1] if len(sys.argv)>1 else '.')
p=root/'src-tauri/src/youtube.rs'
s=p.read_text()

s=s.replace('let mut audits=Vec::new(),matched=Vec::new();','let mut audits=Vec::new();let mut matched=Vec::new();')

def remove_module(text,module_name):
    marker=f'mod {module_name}'
    m=text.find(marker)
    if m<0:return text
    start=text.rfind('#[cfg(test)]',0,m)
    if start<0:start=m
    brace=text.find('{',m)
    if brace<0:raise SystemExit(f'no opening brace for {module_name}')
    depth=0;end=None
    for i in range(brace,len(text)):
        c=text[i]
        if c=='{':depth+=1
        elif c=='}':
            depth-=1
            if depth==0:end=i+1;break
    if end is None:raise SystemExit(f'unbalanced module {module_name}')
    while end<len(text) and text[end] in '\r\n':end+=1
    return text[:start]+text[end:]

# Native state tests supersede the old FakeSecrets orphan fixture module.
s=remove_module(s,'v2111_orphan_recovery_tests')
s=remove_module(s,'native_keychain_recovery_state_tests')

module=r'''
#[cfg(test)]
mod native_keychain_recovery_state_tests{
 use super::*;use std::{cell::RefCell,collections::HashMap};
 const CUR:&str="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";const A:&str="11111111-1111-4111-8111-111111111111";const B:&str="22222222-2222-4222-8222-222222222222";
 #[derive(Default)]struct Fake{values:RefCell<HashMap<String,Result<Option<String>,String>>>,accounts:RefCell<Vec<String>>}
 impl OAuthSecretStore for Fake{fn get(&self,a:&str)->Result<Option<String>,String>{self.values.borrow().get(a).cloned().unwrap_or(Ok(None))}fn set(&self,a:&str,v:&str)->Result<(),String>{self.values.borrow_mut().insert(a.into(),Ok(Some(v.into())));Ok(())}fn delete(&self,_:&str)->Result<(),String>{Ok(())}fn accounts(&self,_:&str)->Result<Vec<String>,String>{Ok(self.accounts.borrow().clone())}}
 fn current()->OAuthProfile{OAuthProfile{id:CUR.into(),client_id:"client".into(),client_secret:"secret".into(),channel_id:Some("UC_EXPECT".into()),channel_title:None,access_token:String::new(),refresh_token:String::new(),expires_at:0,connected_at:"2026-01-01".into(),scopes:vec![],preferred_browser:String::new(),identity_validated_at:None,identity_validated_channel_id:None,credential_error:None}}
 fn valid(c:OrphanCredentialCandidate,id:&str)->ValidatedOrphanCredential{ValidatedOrphanCredential{candidate:c,access_token:"access".into(),expires_in:3600,channel_id:id.into(),channel_title:Some("x".into())}}
 fn eval<F,Fut>(scans:Vec<ScannedCandidate>,expected:&str,validator:F)->RecoveryOutcome where F:Fn(OrphanCredentialCandidate)->Fut,Fut:std::future::Future<Output=Result<ValidatedOrphanCredential,CandidateValidationFailure>>{tauri::async_runtime::block_on(evaluate_scanned_candidates_with(scans,expected,validator))}
 #[test]fn a_orphan_account_recovers(){let f=Fake::default();f.accounts.borrow_mut().push(oauth_key(A,"refresh_token"));f.values.borrow_mut().insert(oauth_key(A,"refresh_token"),Ok(Some("r".into())));let scans=orphan_keychain_scan_with(&f,&current()).unwrap();let out=eval(scans,"UC_EXPECT",|c|async move{Ok(valid(c,"UC_EXPECT"))});assert!(out.recovered);assert_eq!(out.status,RecoveryFinalStatus::Recovered)}
 #[test]fn b_access_denied_is_honest(){let f=Fake::default();f.accounts.borrow_mut().push(oauth_key(A,"refresh_token"));f.values.borrow_mut().insert(oauth_key(A,"refresh_token"),Err("KEYCHAIN_ACCESS_DENIED: osstatus=-25308".into()));let out=eval(orphan_keychain_scan_with(&f,&current()).unwrap(),"UC_EXPECT",|c|async move{Ok(valid(c,"UC_EXPECT"))});assert_eq!(out.status,RecoveryFinalStatus::Denied);assert!(out.error.unwrap().starts_with("KEYCHAIN_ACCESS_DENIED"))}
 #[test]fn c_invalid_grant_is_revoked(){let f=Fake::default();f.accounts.borrow_mut().push(oauth_key(A,"refresh_token"));f.values.borrow_mut().insert(oauth_key(A,"refresh_token"),Ok(Some("r".into())));let out=eval(orphan_keychain_scan_with(&f,&current()).unwrap(),"UC_EXPECT",|_|async move{Err(CandidateValidationFailure::Revoked("invalid_grant".into()))});assert_eq!(out.status,RecoveryFinalStatus::Revoked);assert!(out.error.unwrap().starts_with("REFRESH_TOKEN_REVOKED"))}
 #[test]fn d_wrong_channel_is_mismatch(){let f=Fake::default();f.accounts.borrow_mut().push(oauth_key(A,"refresh_token"));f.values.borrow_mut().insert(oauth_key(A,"refresh_token"),Ok(Some("r".into())));let out=eval(orphan_keychain_scan_with(&f,&current()).unwrap(),"UC_EXPECT",|c|async move{Ok(valid(c,"UC_OTHER"))});assert_eq!(out.status,RecoveryFinalStatus::Mismatch)}
 #[test]fn e_only_true_absence_is_missing(){let f=Fake::default();let out=eval(orphan_keychain_scan_with(&f,&current()).unwrap(),"UC_EXPECT",|c|async move{Ok(valid(c,"UC_EXPECT"))});assert_eq!(out.status,RecoveryFinalStatus::Missing);assert!(out.error.unwrap().starts_with("REFRESH_TOKEN_MISSING"))}
 #[test]fn f_only_matching_candidate_selected(){let f=Fake::default();for (id,r) in [(A,"ra"),(B,"rb")]{f.accounts.borrow_mut().push(oauth_key(id,"refresh_token"));f.values.borrow_mut().insert(oauth_key(id,"refresh_token"),Ok(Some(r.into())));}let out=eval(orphan_keychain_scan_with(&f,&current()).unwrap(),"UC_EXPECT",|c|async move{let id=if c.profile_id==A{"UC_OTHER"}else{"UC_EXPECT"};Ok(valid(c,id))});assert!(out.recovered);assert_eq!(out.audits.iter().filter(|a|a.channel_id_match==ChannelMatchStatus::Yes).count(),1)}
 #[test]fn g_migration_idempotent(){let f=Fake::default();let c=OrphanCredentialCandidate{profile_id:A.into(),account:oauth_key(A,"refresh_token"),source:"KEYCHAIN".into(),refresh_token:"r".into(),client_secret:"s".into(),modified_rank:None};let v=valid(c,"UC_EXPECT");let mut p=current();migrate_validated_orphan_with(&f,&mut p,&v).unwrap();migrate_validated_orphan_with(&f,&mut p,&v).unwrap();assert_eq!(f.get(&oauth_key(CUR,"refresh_token")).unwrap().as_deref(),Some("r"))}
 #[test]fn h_thirty_one_channels_are_isolated(){for i in 0..31{let f=Fake::default();let mut p=current();p.id=format!("{:08x}-aaaa-4aaa-8aaa-aaaaaaaaaaaa",i+1);p.channel_id=Some(format!("UC_{i}"));if i%5==0{f.accounts.borrow_mut().push(oauth_key(A,"refresh_token"));f.values.borrow_mut().insert(oauth_key(A,"refresh_token"),Err("KEYCHAIN_ACCESS_DENIED: osstatus=-25308".into()));}let out=eval(orphan_keychain_scan_with(&f,&p).unwrap(),p.channel_id.as_deref().unwrap(),|c|async move{Ok(valid(c,"UC_NEVER"))});if i%5==0{assert_eq!(out.status,RecoveryFinalStatus::Denied)}else{assert_eq!(out.status,RecoveryFinalStatus::Missing)}}}
}
'''
s=s.rstrip()+"\n\n"+module+"\n"
p.write_text(s)
print('native compile fix applied')
