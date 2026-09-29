#!/usr/bin/env python3
import json, pathlib, sys

def channel(i, root):
    name=f"Fixture Channel {i:02d}"
    projects=root/"Projects"/name
    render=root/"Render"/name
    projects.mkdir(parents=True,exist_ok=True)
    render.mkdir(parents=True,exist_ok=True)
    (render/f"{i:03d}.mp4").write_bytes(b"vyron-fixture-media")
    return {
      "id":f"fixture-{i:02d}","name":name,"slug":f"fixture-{i:02d}","enabled":True,
      "youtubeProfileId":f"PROFILE_{i:02d}","youtubeChannelId":"UC"+f"{i:022d}",
      "renderFolderPath":str(render),"projectsFolderPath":str(projects),
      "safeDailyUploadLimit":10,"cadenceDays":1,"scheduleMode":"interval","publishIntervalDays":1,
      "publishHour":18,"publishMinute":0,"targetBufferDays":30,"language":"EN","genre":"Music",
      "country":"US","minTracks":10,"targetDurationMin":120,
      "stats":{"subscriberCount":1000+i,"viewCount":100000+i*100,"videoCount":30+i,
               "statisticsUpdatedAt":"2026-09-28T20:00:00Z","source":"LIVE_REFRESH"},
      "seo":{"titlePatterns":["{topic} • Session {number}"],"descriptionTemplate":"{title}","tags":["music"],"banned":[]}
    }

def seed(state_path, root_path):
    root=pathlib.Path(root_path); root.mkdir(parents=True,exist_ok=True)
    channels=[channel(i,root) for i in range(1,33)]
    state={
      "version":10,
      "channels":channels,
      "jobs":[{"id":"fixture-job","channelId":"fixture-01","number":1,"folder":str(root/"Projects"/"Fixture Channel 01"/"VIDEO_001"),
               "status":"READY_UPLOAD","createdAt":"2026-09-28T00:00:00Z","tracksCount":10,"minTracks":10,
               "finalPath":str(root/"Render"/"Fixture Channel 01"/"001.mp4"),"title":"Fixture","description":"fixture","tags":["music"],
               "storageLifecycle":"NEW"}],
      "competitors":[],
      "settings":{"workspace":str(root/"Workspace"),"vyronRootPath":str(root),"projectsRootPath":str(root/"Projects"),
                  "renderRootPath":str(root/"Render"),"endlumePath":"","youtubeApiKey":"","openaiApiKey":"",
                  "autoCheckUpdates":False,"reduceMotion":False,"fpsMonitor":False,"localProfileName":"Кирилл",
                  "localProfileRole":"Owner / YouTube Manager","localProfileCompany":"VYRON / ScaleUP",
                  "localProfileAvatarPath":"","estimatedRpmUsd":2.5,"autopilotEnabled":False,"autopilotMode":"off",
                  "autoUploadYoutube":False,"youtubePublishSafeMode":True},
      "logs":[],
      "uploadHistory":[{"id":"fixture-history","jobId":"fixture-job","channelId":"fixture-01","youtubeVideoId":"fixture-video",
                        "localFilePath":str(root/"Render"/"Fixture Channel 01"/"001.mp4"),"originalFilename":"001.mp4",
                        "uploadedAt":"2026-09-27T00:00:00Z","fileSize":19,"sha256":"a"*64,"status":"UPLOADED"}],
      "activityJournal":[{"eventId":"fixture-event","timestamp":"2026-09-27T00:00:00Z","eventType":"UPLOAD_ACCEPTED",
                           "status":"SUCCESS","source":"LIVE_OPERATION","channelId":"fixture-01"}],
      "statisticsHistory":{"fixture-01":[{"channelId":"fixture-01","capturedAt":"2026-09-28T20:00:00Z",
                                         "source":"LIVE_REFRESH","subscriberCount":1001,"viewCount":100100,"videoCount":31}]},
      "fingerprintCache":{"fixture-fp":{"path":str(root/"Render"/"Fixture Channel 01"/"001.mp4"),"size":19,
                                           "mtimeMs":1,"sha256":"a"*64,"computedAt":"2026-09-27T00:00:00Z"}},
      "projectLifecycle":{"fixture-project":{"projectId":"fixture-project","projectPath":str(root/"Projects"/"Fixture Channel 01"/"VIDEO_001"),
                                               "status":"RENDERED","renderExists":True,"updatedAt":"2026-09-27T00:00:00Z"}}
    }
    pathlib.Path(state_path).parent.mkdir(parents=True,exist_ok=True)
    pathlib.Path(state_path).write_text(json.dumps(state,ensure_ascii=False,indent=2),encoding="utf-8")
    print("V501_FIXTURE_SEEDED=32")

def verify(state_path, root_path):
    d=json.loads(pathlib.Path(state_path).read_text(encoding="utf-8-sig"))
    root=pathlib.Path(root_path)
    assert len(d.get("channels",[]))==32, len(d.get("channels",[]))
    ids={c["id"] for c in d["channels"]}
    assert len(ids)==32
    c=d["channels"][0]
    assert c.get("youtubeProfileId")=="PROFILE_01" and c.get("youtubeChannelId")=="UC"+"1".zfill(22)
    assert c.get("stats",{}).get("subscriberCount")==1001
    assert c.get("stats",{}).get("viewCount")==100100
    assert c.get("stats",{}).get("videoCount")==31
    assert d.get("uploadHistory",[{}])[0].get("youtubeVideoId")=="fixture-video"
    assert d.get("settings",{}).get("estimatedRpmUsd")==2.5
    assert d.get("settings",{}).get("vyronRootPath")==str(root)
    assert d.get("fingerprintCache",{}).get("fixture-fp",{}).get("size")==19
    assert d.get("projectLifecycle",{}).get("fixture-project",{}).get("status")=="RENDERED"
    for c in d["channels"]:
        assert pathlib.Path(c["projectsFolderPath"]).is_dir()
        assert pathlib.Path(c["renderFolderPath"]).is_dir()
    print("V501_FIXTURE_CONTINUITY=PASS channels=32 cached_stats=PASS history=PASS folders=PASS")

if __name__=="__main__":
    if len(sys.argv)!=4 or sys.argv[1] not in {"seed","verify"}:
        raise SystemExit("usage: v501_candidate_fixture.py seed|verify STATE_PATH VYRON_ROOT")
    (seed if sys.argv[1]=="seed" else verify)(sys.argv[2],sys.argv[3])
