//! Verified parser for YouTube Reporting API channel_reach_basic_a1 CSV.
//! Does not guess whether CTR is returned as fractional or percent units.
//! Uses the header and newest createTime for backfilled report replacements.
use chrono::NaiveDate;
use serde_json::{json,Value};
use std::{collections::{BTreeMap,HashMap},fs::{self,File},io::{BufRead,BufReader},path::Path};

const MAX_REPORT_BYTES:u64=100*1024*1024;
const MAX_REPORT_ROWS:usize=1_500_000;
fn valid_video(id:&str)->bool{
    id.len()==11&&id.bytes().all(|b|b.is_ascii_alphanumeric()||b==b'_'||b==b'-')
}
fn safe_filename(file:&str)->bool{
    file.starts_with("reach-")&&file.ends_with(".csv")
    && file.len()==6+24+4
    && file.as_bytes()[6..30].iter().all(u8::is_ascii_hexdigit)
}
fn csv_cells(line:&str)->Result<Vec<String>,String>{
    let mut result=Vec::new();let mut field=String::new();
    let mut quoted=false;let mut chars=line.chars().peekable();
    while let Some(ch)=chars.next(){
        if quoted{
            if ch=='"'{
                if chars.peek()==Some(&'"'){field.push('"');chars.next();}
                else{quoted=false;}
            }else{field.push(ch);}
        }else{
            match ch{
                ','=>{result.push(std::mem::take(&mut field));},
                '"' if field.is_empty()=>quoted=true,
                '"' =>return Err("REACH_CSV_INVALID_QUOTE".into()),
                _=>field.push(ch),
            }
        }
    }
    if quoted{return Err("REACH_CSV_UNTERMINATED_QUOTE".into())}
    result.push(field);
    Ok(result)
}
pub(crate) struct ReachLoad{
    pub rows:Vec<Value>,
    pub coverage:Value,
}
#[derive(Clone)]
struct ReachPoint{
    date:String,video_id:String,impressions:u64,ctr_raw:f64,
    create_time:String,report_id:String,
}
fn read_one(path:&Path,channel_id:&str,create_time:&str,report_id:&str,
    map:&mut BTreeMap<(String,String),ReachPoint>)->Result<usize,String>{
    let meta=fs::metadata(path).map_err(|e|format!("REACH_METADATA: {e}"))?;
    if !meta.is_file()||meta.len()>MAX_REPORT_BYTES{
        return Err("REACH_INVALID_OR_OVERSIZED_REPORT".into())
    }
    let file=File::open(path).map_err(|e|format!("REACH_OPEN: {e}"))?;
    let mut lines=BufReader::new(file).lines();
    let header=lines.next().ok_or("REACH_MISSING_HEADER")?
        .map_err(|e|format!("REACH_HEADER_READ: {e}"))?;
    let cols=csv_cells(header.trim_start_matches('\u{feff}'))?;
    let indexes=cols.iter().enumerate().map(|(i,c)|(c.as_str(),i)).collect::<HashMap<_,_>>();
    let required=["date","channel_id","video_id","video_thumbnail_impressions","video_thumbnail_impressions_ctr"];
    for col in required{if !indexes.contains_key(col){return Err(format!("REACH_UNSUPPORTED_SCHEMA: {col}"))}}
    let idx=|s:&str|*indexes.get(s).unwrap();
    let mut accepted=0usize;
    let mut seen_lines=0usize;
    // Commit only after parsing the ENTIRE report. A truncated late row
    // must not publish earlier rows from that same corrupted CSV.
    let mut provisional=BTreeMap::<(String,String),ReachPoint>::new();
    for line in lines{
        seen_lines+=1;
        if seen_lines>MAX_REPORT_ROWS{return Err("REACH_REPORT_ROW_LIMIT".into())}
        let line=line.map_err(|e|format!("REACH_ROW_READ: {e}"))?;
        if line.trim().is_empty(){continue}
        let cells=csv_cells(&line)?;
        let at=|s:&str|cells.get(idx(s)).map(String::as_str).unwrap_or("");
        if at("channel_id")!=channel_id{continue}
        let date=at("date");let video=at("video_id");
        if NaiveDate::parse_from_str(date,"%Y-%m-%d").is_err()||!valid_video(video){continue}
        let imps=match at("video_thumbnail_impressions").parse::<u64>(){Ok(x)=>x,Err(_)=>continue};
        let ctr=match at("video_thumbnail_impressions_ctr").parse::<f64>(){Ok(x) if x.is_finite()&&x>=0.0&&x<=100.0=>x,_=>continue};
        accepted+=1;
        let key=(date.to_string(),video.to_string());
        let fresh=ReachPoint{date:date.into(),video_id:video.into(),
            impressions:imps,ctr_raw:ctr,create_time:create_time.into(),report_id:report_id.into()};
        if provisional.get(&key).map(|old|old.create_time<=fresh.create_time).unwrap_or(true){
            provisional.insert(key,fresh);
        }
    }
    for (key,fresh) in provisional{
        if map.get(&key).map(|old|old.create_time<=fresh.create_time).unwrap_or(true){
            map.insert(key,fresh);
        }
    }
    Ok(accepted)
}
/// Reads only filenames emitted by our own Reporting downloader. API reports are
/// one-day CSV files; same-date replacement keeps the newest report createTime.
pub(crate) fn read_reach(cache:&Path,coverage:&Value,channel_id:&str)->ReachLoad{
    let mut by_date=BTreeMap::<(String,String),ReachPoint>::new();
    let reports=coverage.pointer("/reach/reports").and_then(Value::as_array);
    let mut scanned=0usize;let mut errors=Vec::<String>::new();
    if let Some(reports)=reports{
        for report in reports{
            let file=report.get("file").and_then(Value::as_str).unwrap_or("");
            if !safe_filename(file){errors.push("REACH_UNSAFE_FILENAME".into());continue}
            let report_id=report.get("reportId").and_then(Value::as_str).unwrap_or("");
            let create_time=report.get("createdTime").and_then(Value::as_str).unwrap_or("");
            let path=cache.join("reporting").join(file);
            match read_one(&path,channel_id,create_time,report_id,&mut by_date){
                Ok(_)=>scanned+=1,
                Err(e)=>errors.push(e),
            }
        }
    }
    let rows=by_date.into_values().map(|x|json!({
        "date":x.date,"channelId":channel_id,"videoId":x.video_id,
        "impressions":x.impressions,"ctrRaw":x.ctr_raw,
        "ctrScale":"UNVERIFIED","reportCreateTime":x.create_time,
        "reportId":x.report_id,"source":"youtube_reporting_api_channel_reach_basic_a1",
        "dateConvention":"YouTube Reporting day: UTC-08:00",
    })).collect::<Vec<_>>();
    let status=if scanned==0{"NOT_YET_COLLECTED"}else if errors.is_empty(){"AVAILABLE"}else{"PARTIAL"};
    ReachLoad{coverage:json!({"status":status,"reportsScanned":scanned,"rows":rows.len(),
        "ctrScale":"UNVERIFIED","errors":errors,"note":"CTR raw numerical scale requires validation against a real Google report before presenting as a percentage."}),rows}
}
#[cfg(test)]
mod tests{
    use super::*;
    use uuid::Uuid;
    #[test]fn report_parser_respects_reordered_headers_and_newest_backfill(){
        let root=std::env::temp_dir().join(format!("vyron-reach-test-{}",Uuid::new_v4()));
        fs::create_dir_all(root.join("reporting")).unwrap();
        let ch="UC1234567890123456789012";let video="aBc1234-X_y";
        let a="reach-aaaaaaaaaaaaaaaaaaaaaaaa.csv";let b="reach-bbbbbbbbbbbbbbbbbbbbbbbb.csv";
        fs::write(root.join("reporting").join(a),format!("video_id,video_thumbnail_impressions_ctr,channel_id,date,video_thumbnail_impressions\n{video},0.04,{ch},2026-11-02,400\n")).unwrap();
        fs::write(root.join("reporting").join(b),format!("date,channel_id,video_id,video_thumbnail_impressions,video_thumbnail_impressions_ctr\n2026-11-02,{ch},{video},520,0.05\n2026-11-02,UCnot-own,{video},900,0.8\n")).unwrap();
        let coverage=json!({"reach":{"reports":[{"file":a,"reportId":"old","createdTime":"2026-11-03T01:00:00Z"},
            {"file":b,"reportId":"new","createdTime":"2026-11-04T01:00:00Z"}]}});
        let r=read_reach(&root,&coverage,ch);
        assert_eq!(r.coverage["status"],"AVAILABLE");
        assert_eq!(r.rows.len(),1);
        assert_eq!(r.rows[0]["impressions"],520);
        assert_eq!(r.rows[0]["ctrRaw"],0.05);
        assert_eq!(r.rows[0]["ctrScale"],"UNVERIFIED");
        let _=fs::remove_dir_all(root);
    }
    #[test]fn corrupted_late_csv_row_must_not_contribute_partial_ctr_evidence(){
        let root=std::env::temp_dir().join(format!("vyron-reach-atomic-{}",Uuid::new_v4()));
        fs::create_dir_all(root.join("reporting")).unwrap();
        let ch="UC1234567890123456789012";let video="aBc1234-X_y";
        let good="reach-aaaaaaaaaaaaaaaaaaaaaaaa.csv";
        let damaged="reach-bbbbbbbbbbbbbbbbbbbbbbbb.csv";
        fs::write(root.join("reporting").join(good),format!(
            "date,channel_id,video_id,video_thumbnail_impressions,video_thumbnail_impressions_ctr\n2026-11-02,{ch},{video},400,0.04\n"
        )).unwrap();
        // A later report must not overwrite the good row if ANY row is broken.
        fs::write(root.join("reporting").join(damaged),format!(
            "date,channel_id,video_id,video_thumbnail_impressions,video_thumbnail_impressions_ctr\n2026-11-02,{ch},{video},900,0.99\n\"unterminated"
        )).unwrap();
        let coverage=json!({"reach":{"reports":[
            {"file":good,"reportId":"good","createdTime":"2026-11-03T01:00:00Z"},
            {"file":damaged,"reportId":"damaged","createdTime":"2026-11-04T01:00:00Z"}]}});
        let output=read_reach(&root,&coverage,ch);
        assert_eq!(output.coverage["status"],"PARTIAL");
        assert_eq!(output.rows.len(),1);
        assert_eq!(output.rows[0]["impressions"],400);
        assert_eq!(output.rows[0]["ctrRaw"],0.04);
        assert_eq!(output.rows[0]["reportId"],"good");
        let _=fs::remove_dir_all(root);
    }
    #[test]fn rejects_directory_traversal_and_fake_schema(){
        assert!(!safe_filename("../../../../reach.csv"));
        assert!(csv_cells("hello,\"a,b\",c").unwrap().contains(&"a,b".to_string()));
        assert!(csv_cells("\"unclosed").is_err());
    }
}
