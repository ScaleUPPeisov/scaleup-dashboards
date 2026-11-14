#!/usr/bin/env python3
"""VYRON Mac release preflight. Offline COPY ONLY, no Google/Keychain/network calls.

Usage:
  python3 scripts/vyron_macos_offline_preflight.py \
    --snapshot /path/to/offline-copy --report /path/to/report.json \
    [--ai-zip /path/to/VYRON_AI_ALL_CHANNELS_*.zip]

The operator must create /path/to/offline-copy/.vyron-offline-snapshot.
Never pass the installed Application Support directory or live VYRON cache.
Report includes ONLY allowlisted counts, Channel IDs and hashes, not tokens,
emails, client IDs, channel titles, video titles or raw analytic values.
"""
from __future__ import annotations
import argparse
import csv
import hashlib
import io
import json
import os
import re
import sqlite3
import zipfile
from collections import Counter
from pathlib import Path

CHANNEL_ID = re.compile(r"UC[A-Za-z0-9_-]{22}\Z")
VIDEO_ID = re.compile(r"[A-Za-z0-9_-]{11}\Z")
SCHEMA = 2
DB_NAME = "analytics-v1.sqlite3"
CORE = ("overview.json", "video-catalog.json", "channel-daily.json", "reach-daily.json")
GEN_FOLDERS = ("video-details", "video-days", "retention")
REQUIRED_ZIP = {
    "ALL_CHANNELS_SUMMARY.json", "DATA_COVERAGE.json", "ALL_VIDEOS.csv",
    "CHANNELS_DAILY.csv", "VIDEOS_DAILY.csv", "VIDEO_LIFECYCLE.csv",
    "REACH_DAILY.csv", "RETENTION.json", "CHANNEL_EVENTS.json",
    "GROWTH_AND_DECLINE.json", "WINNER_ENGINE.json", "AI_README.md",
    "AI_PROMPT.md", "MANIFEST_SHA256.json",
}


class PreflightError(ValueError):
    pass


def json_file(path: Path):
    with path.open("rb") as stream:
        return json.load(stream)


def digest_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def require_copy(root: Path) -> Path:
    root = root.expanduser().resolve(strict=True)
    if not root.is_dir() or not (root / ".vyron-offline-snapshot").is_file():
        raise PreflightError("OFFLINE_COPY_MARKER_REQUIRED")
    # Refuse even a user-marked live Application Support directory.
    parts = tuple(p.casefold() for p in root.parts)
    if ("library" in parts and "application support" in parts) or (
        "documents" in parts and "vyron" in parts):
        raise PreflightError("LIVE_APP_DATA_PATH_REFUSED")
    return root


def check_state(root: Path) -> tuple[dict, dict]:
    state_path = root / "state.json"
    oauth_path = root / "youtube-oauth.json"
    report = {
        "statePresent": state_path.is_file(),
        "oauthMetadataPresent": oauth_path.is_file(),
        "stateSha256": digest_file(state_path) if state_path.is_file() else None,
        "connectedStateChannelCount": None,
        "uniqueStateChannelIds": [],
        "googleProfileCount": None,
        "profileMetadataOnly": [],
        "duplicateChannelIds": [],
        "orphanProfileMappings": 0,
        "channelIdMismatches": 0,
        "oauthVaultAccessed": False,
        "keychainAccessed": False,
        "signedUpgradeTested": False,
    }
    state = json_file(state_path) if state_path.is_file() else {}
    oauth = json_file(oauth_path) if oauth_path.is_file() else {}
    channels = state.get("channels", [])
    profiles = oauth.get("profiles", [])
    if not isinstance(channels, list) or not isinstance(profiles, list):
        raise PreflightError("STATE_OR_OAUTH_INVALID_COLLECTION")
    report["connectedStateChannelCount"] = len(channels) if state_path.is_file() else None
    report["googleProfileCount"] = len(profiles) if oauth_path.is_file() else None
    channel_ids = [x.get("youtubeChannelId") for x in channels if isinstance(x, dict)
                   and isinstance(x.get("youtubeChannelId"), str)
                   and CHANNEL_ID.fullmatch(x["youtubeChannelId"])]
    report["uniqueStateChannelIds"] = sorted(set(channel_ids))
    report["duplicateChannelIds"] = sorted(x for x,n in Counter(channel_ids).items() if n > 1)
    profile_lookup = {}
    for p in profiles:
        if not isinstance(p, dict):
            raise PreflightError("OAUTH_PROFILE_NOT_OBJECT")
        pid = p.get("id")
        if not isinstance(pid, str) or not pid:
            raise PreflightError("OAUTH_PROFILE_ID_INVALID")
        if pid in profile_lookup:
            raise PreflightError("DUPLICATED_OAUTH_PROFILE_ID")
        profile_lookup[pid] = p
        cid = p.get("channel_id")
        # Intentionally NEVER write raw profile UUID, google_email,
        # google_subject_id, client_id, refresh/access token or scopes.
        report["profileMetadataOnly"].append({
            "profileHash": hashlib.sha256(pid.encode()).hexdigest()[:16],
            "channelId": cid if isinstance(cid,str) and CHANNEL_ID.fullmatch(cid) else None,
            "identityValidated": p.get("identity_validated_channel_id") == cid
                and isinstance(cid,str) and bool(cid),
        })
    report["profileMetadataOnly"].sort(key=lambda x:x["profileHash"])
    for entry in channels:
        if not isinstance(entry,dict):
            raise PreflightError("STATE_CHANNEL_NOT_OBJECT")
        pid = entry.get("youtubeProfileId")
        cid = entry.get("youtubeChannelId")
        if not pid:
            continue
        profile = profile_lookup.get(pid)
        if profile is None:
            report["orphanProfileMappings"] += 1
        elif cid and profile.get("channel_id") and cid != profile.get("channel_id"):
            report["channelIdMismatches"] += 1
    return report, {"channels": channels, "profiles": profiles}


def source_digest(generation_root: Path, catalog: list) -> str:
    sha = hashlib.sha256()
    for name in CORE:
        path = generation_root / name
        sha.update(name.encode())
        sha.update(path.read_bytes())
    for row in catalog:
        video = row.get("videoId")
        if not isinstance(video,str) or not VIDEO_ID.fullmatch(video):
            raise PreflightError("INVALID_VIDEO_ID_IN_CATALOG")
        slug = hashlib.sha256(video.encode()).hexdigest()[:24] + ".json"
        for folder in GEN_FOLDERS:
            path = generation_root / folder / slug
            if path.exists():
                sha.update(folder.encode())
                sha.update(video.encode())
                sha.update(path.read_bytes())
            elif folder == "video-details":
                raise PreflightError("VIDEO_DETAILS_MISSING")
    return sha.hexdigest()


def canonical(value) -> str:
    return json.dumps(value,ensure_ascii=False,sort_keys=True,separators=(",",":"))


def sql_payloads(conn: sqlite3.Connection, table: str, channel: str,
                 generation: str | None = None, video: str | None = None) -> list:
    allowed = {
        "channel_daily","video_daily","video_reach_daily","analytics_overviews",
        "metadata_history","data_coverage","channel_events","traffic_sources",
        "audience_demographics","devices","retention_points",
    }
    if table not in allowed:
        raise PreflightError("SQL_TABLE_NOT_ALLOWED")
    predicate = "channel_id=?"
    params: list[str | int] = [channel]
    if generation is not None:
        predicate += " AND generation=?"
        params.append(generation)
    if video is not None:
        predicate += " AND video_id=?"
        params.append(video)
    if table == "retention_points":
        predicate += " AND point_index=-1"
    result = conn.execute("SELECT payload_json FROM "+table+" WHERE "+predicate,params)
    return [json.loads(row[0]) for row in result]


def same_bag(source: list, actual: list) -> bool:
    return Counter(map(canonical,source)) == Counter(map(canonical,actual))


def check_one_sqlite(cache: Path, channel: str) -> dict:
    pointer = json_file(cache / "ui-current.json")
    if pointer.get("channelId") != channel:
        raise PreflightError("POINTER_CHANNEL_MISMATCH")
    generation = pointer.get("generation")
    if not isinstance(generation,str) or not re.fullmatch(r"[0-9a-fA-F-]{36}",generation):
        raise PreflightError("POINTER_GENERATION_INVALID")
    root = cache / "ui-generations" / generation
    overview = json_file(root / "overview.json")
    catalog = json_file(root / "video-catalog.json")
    if overview.get("channelId") != channel or overview.get("generation") != generation:
        raise PreflightError("OVERVIEW_IDENTITY_MISMATCH")
    if not isinstance(catalog,list):
        raise PreflightError("CATALOG_NOT_ARRAY")
    calculated = source_digest(root,catalog)
    db = cache / DB_NAME
    report = {
        "channelId": channel,"databasePresent":db.is_file(),
        "jsonGeneration":generation,"sourceDigestMatchesSql":None,
        "schemaVersion":None,"integrity":"NOT_TESTED","foreignKeyViolations":None,
        "sqlGenerationVerified":False,"valueParity":"NOT_TESTED",
        "jsonVideos":len(catalog),"checkedVideoDayRows":0,
        "parityErrors":[], "walCheckpoint":"NOT_EXECUTED_ON_OFFLINE_SNAPSHOT",
    }
    if not db.is_file():
        report["parityErrors"].append("SQLITE_MISSING")
        return report
    # SQLite opened read-only on an explicit offline copy. No VACUUM, REINDEX,
    # migration, checkpoint, DELETE or any user-data write is permitted.
    con = sqlite3.connect(f"file:{db.as_posix()}?mode=ro",uri=True,timeout=5)
    try:
        con.execute("PRAGMA query_only=ON")
        report["schemaVersion"] = con.execute("PRAGMA user_version").fetchone()[0]
        report["integrity"] = con.execute("PRAGMA integrity_check").fetchone()[0]
        report["foreignKeyViolations"] = len(con.execute("PRAGMA foreign_key_check").fetchall())
        verified = con.execute(
            "SELECT source_digest FROM analytics_migrations WHERE channel_id=? AND generation=?",
            (channel,generation)).fetchone()
        receipt = con.execute(
            "SELECT source_digest FROM sync_jobs WHERE channel_id=? AND generation=?",
            (channel,generation)).fetchone()
        report["sourceDigestMatchesSql"] = bool(verified and receipt
            and verified[0]==calculated and receipt[0]==calculated)
        report["sqlGenerationVerified"] = report["sourceDigestMatchesSql"]
        if not report["sqlGenerationVerified"]:
            report["parityErrors"].append("UNVERIFIED_OR_MISMATCHED_GENERATION")
            return report
        def compare(label: str, expected: list, actual: list):
            if not same_bag(expected,actual):
                report["parityErrors"].append(label)
        compare("CHANNEL_DAILY",json_file(root/"channel-daily.json"),
                sql_payloads(con,"channel_daily",channel))
        compare("VIDEO_CATALOG",catalog,
                sql_payloads(con,"metadata_history",channel,generation))
        compare("CHANNEL_OVERVIEW",[overview],
                sql_payloads(con,"analytics_overviews",channel,generation))
        compare("DATA_COVERAGE",[overview.get("coverage")],
                sql_payloads(con,"data_coverage",channel,generation))
        compare("EVENTS",overview.get("events",[]),
                sql_payloads(con,"channel_events",channel))
        compare("TRAFFIC",overview.get("traffic",[]),
                sql_payloads(con,"traffic_sources",channel,generation))
        compare("AUDIENCE",overview.get("audienceBreakdowns",[]),
                sql_payloads(con,"devices",channel,generation)
                +sql_payloads(con,"audience_demographics",channel,generation))
        compare("REACH_RAW",json_file(root/"reach-daily.json"),
                sql_payloads(con,"video_reach_daily",channel))
        seen = set()
        for video in catalog:
            vid = video["videoId"]
            if vid in seen:
                report["parityErrors"].append("DUPLICATE_VIDEO_ID")
                continue
            seen.add(vid)
            slug=hashlib.sha256(vid.encode()).hexdigest()[:24]+".json"
            expected = json_file(root/"video-days"/slug) if (
                root/"video-days"/slug).exists() else []
            actual = sql_payloads(con,"video_daily",channel,video=vid)
            report["checkedVideoDayRows"] += len(expected)
            if not same_bag(expected,actual):
                report["parityErrors"].append("VIDEO_DAILY")
            retention=root/"retention"/slug
            expected_ret=[json_file(retention)] if retention.exists() else []
            actual_ret=sql_payloads(con,"retention_points",channel,video=vid)
            if not same_bag(expected_ret,actual_ret):
                report["parityErrors"].append("RETENTION")
        report["parityErrors"] = sorted(set(report["parityErrors"]))
        report["valueParity"] = "PASS" if not report["parityErrors"] else "FAIL"
    finally:
        con.close()
    return report


def check_ai_zip(path: Path) -> dict:
    report={"archivePresent":path.is_file(),"integrity":"NOT_TESTED",
            "sha256ManifestVerified":False,"missingRequiredFiles":[],
            "archivedChannels":None,"coverageEntries":None,"archiveVideoRows":None,
            "declaredVideoRows":None,"channelFailuresReported":None,
            "csvFieldsPresent":False,"secretScan":"NOT_PERFORMED"}
    if not path.is_file():
        return report
    with zipfile.ZipFile(path,"r") as zipf:
        names=zipf.namelist()
        if len(set(names))!=len(names) or any(
            name.startswith("/") or ".." in Path(name).parts for name in names):
            raise PreflightError("ZIP_DUPLICATE_OR_TRAVERSAL_ENTRY")
        report["missingRequiredFiles"]=sorted(REQUIRED_ZIP-set(names))
        if report["missingRequiredFiles"]:
            raise PreflightError("ZIP_REQUIRED_FILES_MISSING")
        first_bad=zipf.testzip()
        if first_bad is not None:
            raise PreflightError("ZIP_CRC_FAILURE")
        manifest=json.loads(zipf.read("MANIFEST_SHA256.json"))
        if not isinstance(manifest,dict):
            raise PreflightError("ZIP_MANIFEST_INVALID")
        if set(manifest)!=(set(names)-{"MANIFEST_SHA256.json"}):
            raise PreflightError("ZIP_MANIFEST_FILESET_MISMATCH")
        forbidden=(b'"refresh_token"',b'"access_token"',b'"client_secret"',
                   b'"youtubeapikey"',b'"openaiapikey"',b'"google_email"',
                   b'"authorization"')
        for name,expected in manifest.items():
            sha=hashlib.sha256()
            tail=b""
            with zipf.open(name) as stream:
                for block in iter(lambda:stream.read(1024*1024),b""):
                    sha.update(block)
                    scan=(tail+block).lower()
                    if any(needle in scan for needle in forbidden):
                        raise PreflightError("ZIP_POSSIBLE_SECRET_FIELD_FOUND")
                    tail=scan[-64:]
            if sha.hexdigest()!=expected:
                raise PreflightError("ZIP_SHA256_MISMATCH")
        report["integrity"]="PASS"
        report["sha256ManifestVerified"]=True
        report["secretScan"]="PASS"
        summaries=json.loads(zipf.read("ALL_CHANNELS_SUMMARY.json"))
        coverage=json.loads(zipf.read("DATA_COVERAGE.json"))
        report["archivedChannels"]=len(summaries)
        report["coverageEntries"]=len(coverage)
        report["channelFailuresReported"]=sum(1 for c in coverage if str(
            c.get("status","")).lower() in ("error","failed","partial"))
        with zipf.open("ALL_VIDEOS.csv") as file:
            reader=csv.DictReader(io.TextIOWrapper(file,encoding="utf-8-sig",newline=""))
            required={"channel_id","video_id","views_public"}
            report["csvFieldsPresent"]=required.issubset(reader.fieldnames or [])
            if not report["csvFieldsPresent"]:
                raise PreflightError("ZIP_ALL_VIDEOS_CSV_FIELDS_MISSING")
            report["archiveVideoRows"]=sum(1 for _ in reader)
        report["declaredVideoRows"]=sum(int(c.get("archivedHistoricalVideoRecords",0))
            for c in coverage if isinstance(c,dict))
        if report["declaredVideoRows"]!=report["archiveVideoRows"]:
            raise PreflightError("ZIP_VIDEO_ROW_COUNT_MISMATCH")
        # No raw content, titles, secret values, or descriptions appear in output.
        # The archive receives local validation ONLY; this is not Google Studio parity.
    return report


def run(snapshot: Path, ai_zip: Path | None = None) -> dict:
    root=require_copy(snapshot)
    inventory,_=check_state(root)
    cache_root=root/"AIAnalytics"/"cache"
    analytics=[]
    if cache_root.is_dir():
        for cache in sorted(cache_root.iterdir()):
            if cache.is_dir() and CHANNEL_ID.fullmatch(cache.name):
                try:
                    analytics.append(check_one_sqlite(cache,cache.name))
                except (ValueError,OSError,sqlite3.DatabaseError,KeyError,TypeError) as error:
                    # Never log user data, original exception SQL or file paths.
                    analytics.append({"channelId":cache.name,"valueParity":"FAIL",
                        "diagnosticErrorType":type(error).__name__})
    report={
        "schema":"VYRON_MAC_OFFLINE_PREFLIGHT_V1",
        "scope":"EXPLICIT_OFFLINE_COPY_ONLY",
        "networkRequests":0,"googleOauthRequests":0,"keychainReads":0,
        "state":inventory,
        "sqlite":analytics,
        "aiZip":check_ai_zip(ai_zip) if ai_zip else {"status":"NOT_SUPPLIED"},
        "physicalM1Fps":"NOT_TESTED",
        "physicalKeychainUpgrade":"NOT_TESTED",
        "youtubeStudioParity":"NOT_TESTED",
        "signedDmgUpgrade":"NOT_TESTED",
    }
    return report


def main() -> int:
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--snapshot",type=Path,required=True,
                        help="explicit local OFFLINE copy with .vyron-offline-snapshot marker")
    parser.add_argument("--report",type=Path,required=True)
    parser.add_argument("--ai-zip",type=Path)
    args=parser.parse_args()
    try:
        report=run(args.snapshot,args.ai_zip)
        target=args.report.expanduser().resolve()
        source=args.snapshot.expanduser().resolve()
        if target==source or source in target.parents:
            raise PreflightError("REPORT_MUST_BE_OUTSIDE_OFFLINE_COPY")
        target.parent.mkdir(parents=True,exist_ok=True)
        descriptor=os.open(target,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
        with os.fdopen(descriptor,"w",encoding="utf-8") as stream:
            json.dump(report,stream,ensure_ascii=False,indent=2)
        failures=sum(item.get("valueParity")=="FAIL" for item in report["sqlite"])
        missing_zip=bool(args.ai_zip and not report["aiZip"]["archivePresent"])
        print(f"VYRON_OFFLINE_PREFLIGHT: channels={len(report['sqlite'])} "
              f"failed_parity={failures} report_written=YES")
        return 2 if failures or missing_zip else 0
    except (PreflightError,OSError,ValueError,sqlite3.DatabaseError) as error:
        # No personal paths, SQL payloads, token values or OAuth metadata in stderr.
        print("VYRON_OFFLINE_PREFLIGHT_FAILED: "+type(error).__name__)
        return 3


if __name__=="__main__":
    raise SystemExit(main())
