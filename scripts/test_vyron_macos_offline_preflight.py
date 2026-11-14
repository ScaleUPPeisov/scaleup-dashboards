"""Pure synthetic tests for the VYRON Mac offline release preflight."""
import hashlib
import json
import sqlite3
import tempfile
import unittest
import uuid
import zipfile
from pathlib import Path
from scripts.vyron_macos_offline_preflight import (
    DB_NAME, REQUIRED_ZIP, PreflightError, check_ai_zip, check_one_sqlite,
    digest_file, require_copy, run, source_digest,
)


CHANNEL="UC1234567890123456789012"


def make_offline(tmp: Path) -> Path:
    root=tmp/"snapshot"
    root.mkdir()
    (root/".vyron-offline-snapshot").write_text("operator-approved synthetic copy")
    return root


def json_write(path: Path, data):
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(data,ensure_ascii=False),encoding="utf-8")


def make_db(root: Path):
    cache=root/"AIAnalytics"/"cache"/CHANNEL
    generation=str(uuid.uuid4())
    folder=cache/"ui-generations"/generation
    for part in ["video-details","video-days","retention"]:
        (folder/part).mkdir(parents=True,exist_ok=True)
    overview={
        "channelId":CHANNEL,"generation":generation,
        "summary":{"name":"no sensitive value needed"},
        "coverage":{"status":"PARTIAL"},
        "traffic":[],"audienceBreakdowns":[],"events":[]
    }
    daily=[{"date":"2026-01-01","views":12,"subscribersGained":3,"subscribersLost":1}]
    for name,obj in [
        ("overview.json",overview),("video-catalog.json",[]),
        ("channel-daily.json",daily),("reach-daily.json",[])
    ]:
        json_write(folder/name,obj)
    json_write(cache/"ui-current.json",{"channelId":CHANNEL,"generation":generation})
    digest=source_digest(folder,[])
    con=sqlite3.connect(cache/DB_NAME)
    con.execute("PRAGMA user_version=2")
    tables_with_gen=["analytics_overviews","metadata_history","data_coverage",
        "traffic_sources","audience_demographics","devices"]
    tables_without_gen=["channel_daily","video_daily","video_reach_daily","channel_events"]
    for table in tables_with_gen:
        con.execute(f"CREATE TABLE {table}(channel_id TEXT, generation TEXT, payload_json TEXT)")
    for table in tables_without_gen:
        con.execute(f"CREATE TABLE {table}(channel_id TEXT, video_id TEXT, payload_json TEXT)")
    con.execute("CREATE TABLE retention_points(channel_id TEXT,video_id TEXT,point_index INTEGER,payload_json TEXT)")
    con.execute("CREATE TABLE analytics_migrations(channel_id TEXT,generation TEXT,source_digest TEXT)")
    con.execute("CREATE TABLE sync_jobs(channel_id TEXT,generation TEXT,source_digest TEXT)")
    con.execute("INSERT INTO analytics_migrations VALUES(?,?,?)",(CHANNEL,generation,digest))
    con.execute("INSERT INTO sync_jobs VALUES(?,?,?)",(CHANNEL,generation,digest))
    for table,source in [("analytics_overviews",overview),("data_coverage",overview["coverage"])]:
        con.execute(f"INSERT INTO {table} VALUES(?,?,?)",(CHANNEL,generation,json.dumps(source)))
    con.execute("INSERT INTO channel_daily VALUES(?,?,?)",(CHANNEL,None,json.dumps(daily[0])))
    con.commit()
    con.close()
    return cache,generation


def make_zip(path: Path, valid=True, secret=False):
    members={}
    for name in REQUIRED_ZIP-{"MANIFEST_SHA256.json"}:
        members[name]=b"[]"
    members["ALL_CHANNELS_SUMMARY.json"]=json.dumps([{"channelId":CHANNEL}]).encode()
    if secret:
        members["ALL_CHANNELS_SUMMARY.json"]=json.dumps([{"refresh_token":"FAKE_NO_REAL_SECRETS"}]).encode()
    members["DATA_COVERAGE.json"]=json.dumps([{"channelId":CHANNEL,
        "archivedHistoricalVideoRecords":1,"status":"success"}]).encode()
    members["ALL_VIDEOS.csv"]=(
        "channel_id,video_id,views_public\n"+CHANNEL+",aBc1234-X_y,123\n").encode()
    manifest={name:hashlib.sha256(value).hexdigest() for name,value in members.items()}
    if not valid:
        manifest["ALL_VIDEOS.csv"]="0"*64
    members["MANIFEST_SHA256.json"]=json.dumps(manifest).encode()
    with zipfile.ZipFile(path,"w",compression=zipfile.ZIP_DEFLATED) as zipf:
        for name,data in members.items():
            zipf.writestr(name,data)


class OfflinePreflightTests(unittest.TestCase):
    def test_explicit_marker_required_and_live_paths_refused(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d)/"unknown"
            root.mkdir()
            with self.assertRaisesRegex(PreflightError,"MARKER"):
                require_copy(root)
            (root/".vyron-offline-snapshot").write_text("yes")
            self.assertEqual(require_copy(root),root.resolve())

    def test_profile_inventory_is_metadata_only_even_with_legacy_inline_secrets(self):
        with tempfile.TemporaryDirectory() as d:
            root=make_offline(Path(d))
            json_write(root/"state.json",{"version":10,"channels":[
                {"youtubeProfileId":"profile-secret-1","youtubeChannelId":CHANNEL,
                 "name":"PRIVATE_CHANNEL_TITLE"}]})
            json_write(root/"youtube-oauth.json",{"profiles":[{
                "id":"profile-secret-1","channel_id":CHANNEL,
                "refresh_token":"DO_NOT_OUTPUT_REFRESH_TOKEN_abc123",
                "client_secret":"DO_NOT_OUTPUT_CLIENT_SECRET_abc123",
                "access_token":"DO_NOT_OUTPUT_ACCESS_TOKEN_abc123",
                "google_email":"DO_NOT_OUTPUT_REAL_EMAIL@example.com",
                "identity_validated_channel_id":CHANNEL
            }]})
            report=run(root)
            raw=json.dumps(report)
            for sensitive in ["DO_NOT_OUTPUT","profile-secret-1","PRIVATE_CHANNEL_TITLE",
                              "google_email","client_secret","refresh_token"]:
                self.assertNotIn(sensitive,raw)
            self.assertEqual(report["state"]["googleProfileCount"],1)
            self.assertEqual(report["state"]["uniqueStateChannelIds"],[CHANNEL])
            self.assertEqual(report["networkRequests"],0)
            self.assertEqual(report["keychainReads"],0)

    def test_sqlite_value_parity_and_digest_tamper_are_detected_on_copy(self):
        with tempfile.TemporaryDirectory() as d:
            root=make_offline(Path(d))
            cache,generation=make_db(root)
            audit=check_one_sqlite(cache,CHANNEL)
            self.assertEqual(audit["valueParity"],"PASS")
            self.assertTrue(audit["sourceDigestMatchesSql"])
            self.assertEqual(audit["schemaVersion"],2)
            self.assertEqual(audit["checkedVideoDayRows"],0)
            original=cache/"ui-generations"/generation/"channel-daily.json"
            json_write(original,[{"date":"2026-01-01","views":999}])
            changed=check_one_sqlite(cache,CHANNEL)
            self.assertEqual(changed["valueParity"],"NOT_TESTED")
            self.assertIn("UNVERIFIED_OR_MISMATCHED_GENERATION",changed["parityErrors"])

    def test_ai_zip_manifest_and_csv_counts_with_no_network(self):
        with tempfile.TemporaryDirectory() as d:
            target=Path(d)/"complete.zip"
            make_zip(target,True)
            report=check_ai_zip(target)
            self.assertEqual(report["integrity"],"PASS")
            self.assertTrue(report["sha256ManifestVerified"])
            self.assertEqual(report["archiveVideoRows"],1)
            self.assertEqual(report["declaredVideoRows"],1)
            bad=Path(d)/"bad.zip"
            make_zip(bad,False)
            with self.assertRaisesRegex(PreflightError,"ZIP_SHA256_MISMATCH"):
                check_ai_zip(bad)
            sensitive=Path(d)/"secret.zip"
            make_zip(sensitive,True,secret=True)
            with self.assertRaisesRegex(PreflightError,"ZIP_POSSIBLE_SECRET_FIELD_FOUND"):
                check_ai_zip(sensitive)

if __name__=="__main__":
    unittest.main()
