# VYRON BASELINE QA DEBT — 6.1.9

SAFE_BASE: `588e2070877512daa637077223c678af6a216831`
CURRENT_HEAD: `2d865d0f0de635668d89ed25d7a6f91ff335f861`

- SAFE_BASE_FAILURES: 68
- CURRENT_FAILURES: 57
- NEW_6_1_10_FAILURE_KEYS: 0
- RESOLVED_BASELINE_FAILURE_KEYS: 11
- CURRENT_6_1_10_REGRESSION: 0
- UNKNOWN: 0

> Every record below is an exact file + test-name key that also failed on SAFE_BASE. It is historical debt, not a new 6.1.10 regression.

## QA-001

- ID: QA-001
- TEST FILE: `src/futureChannelSemantics.test.ts`
- TEST NAME: `future channel semantics > keeps YouTube Autopilot hard-gated by OAuth`
- SAFE BASE RESULT: FAIL
- CURRENT RESULT: FAIL
- CATEGORY: PREEXISTING_PRODUCT_DEFECT
- ROOT CAUSE: AssertionError: expected 'import {api} from \'./api\';import {u…' to contain 'if(!s.autoUploadYoutube||!s.youtubePu…'     at /Users/runner/work/scaleup-dashboards/scaleup-dashboards/src/futureChannelSemantics.test.ts:6:170     at file:///Users/runner/work/scaleup-dashboards/scaleup-dashboards/node_modules/@vitest/runner/dist/chunk-hooks.js:155:11     at file:///Users/runner/work/scaleup-dashboards/scaleup-dashboards/node_modules/@vitest/runner/dist/chunk-hooks.js:752:26     at file:///Users/runn
- FEATURE AREA: futureChannelSemantics
- 6.1.10 INTRODUCED?: NO
- BLOCKS 6.1.10?: NO
- RATIONALE: Exact failure key exists on immutable SAFE_BASE and current HEAD; no new 6.1.10 failure key was introduced. Critical contracts are gated separately.

## QA-002

- ID: QA-002
- TEST FILE: `src/googleProjectDiagnostics.test.ts`
- TEST NAME: `Google Cloud project diagnostics > keeps different project ledgers isolated and reads configured limit from existing quota storage`
- SAFE BASE RESULT: FAIL
- CURRENT RESULT: FAIL
- CATEGORY: PREEXISTING_PRODUCT_DEFECT
- ROOT CAUSE: AssertionError: expected 'unknown' to be 'default' // Object.is equality     at /Users/runner/work/scaleup-dashboards/scaleup-dashboards/src/googleProjectDiagnostics.test.ts:15:411     at file:///Users/runner/work/scaleup-dashboards/scaleup-dashboards/node_modules/@vitest/runner/dist/chunk-hooks.js:155:11     at file:///Users/runner/work/scaleup-dashboards/scaleup-dashboards/node_modules/@vitest/runner/dist/chunk-hooks.js:752:26     at file:///Users/runner/work/scaleup-dashboards/scaleup-dashboa
- FEATURE AREA: googleProjectDiagnostics
- 6.1.10 INTRODUCED?: NO
- BLOCKS 6.1.10?: NO
- RATIONALE: Exact failure key exists on immutable SAFE_BASE and current HEAD; no new 6.1.10 failure key was introduced. Critical contracts are gated separately.

## QA-003

- ID: QA-003
- TEST FILE: `src/storageLifecycle.test.ts`
- TEST NAME: `Storage Lifecycle + Duplicate Upload Guard > UI defaults to New and current fingerprint candidates are selectable without YouTube-ID verification`
- SAFE BASE RESULT: FAIL
- CURRENT RESULT: FAIL
- CATEGORY: PREEXISTING_PRODUCT_DEFECT
- ROOT CAUSE: AssertionError: expected 'import React,{useEffect,useMemo,useRe…' to contain 'const currentCandidates=rows.filter(r…'     at /Users/runner/work/scaleup-dashboards/scaleup-dashboards/src/storageLifecycle.test.ts:77:533     at file:///Users/runner/work/scaleup-dashboards/scaleup-dashboards/node_modules/@vitest/runner/dist/chunk-hooks.js:155:11     at file:///Users/runner/work/scaleup-dashboards/scaleup-dashboards/node_modules/@vitest/runner/dist/chunk-hooks.js:752:26     at file:///Users/runner/wo
- FEATURE AREA: storageLifecycle
- 6.1.10 INTRODUCED?: NO
- BLOCKS 6.1.10?: NO
- RATIONALE: Exact failure key exists on immutable SAFE_BASE and current HEAD; no new 6.1.10 failure key was introduced. Critical contracts are gated separately.

## QA-004

- ID: QA-004
- TEST FILE: `src/storageLifecycle.test.ts`
- TEST NAME: `Storage Lifecycle + Duplicate Upload Guard > production cleanup uses system Trash, render proof and guarded roots without upload gate`
- SAFE BASE RESULT: FAIL
- CURRENT RESULT: FAIL
- CATEGORY: PREEXISTING_PRODUCT_DEFECT
- ROOT CAUSE: AssertionError: expected 'pub fn delete_production_job_folder(\…' to contain 'verified_uploaded_job_ids'     at /Users/runner/work/scaleup-dashboards/scaleup-dashboards/src/storageLifecycle.test.ts:76:703     at file:///Users/runner/work/scaleup-dashboards/scaleup-dashboards/node_modules/@vitest/runner/dist/chunk-hooks.js:155:11     at file:///Users/runner/work/scaleup-dashboards/scaleup-dashboards/node_modules/@vitest/runner/dist/chunk-hooks.js:752:26     at file:///Users/runner/work/scaleup-da
- FEATURE AREA: storageLifecycle
- 6.1.10 INTRODUCED?: NO
- BLOCKS 6.1.10?: NO
- RATIONALE: Exact failure key exists on immutable SAFE_BASE and current HEAD; no new 6.1.10 failure key was introduced. Critical contracts are gated separately.

## QA-005

- ID: QA-005
- TEST FILE: `src/uiHotfix.test.tsx`
- TEST NAME: `VYRON 2.1.6 UI hotfix > renders the compact operational dashboard with the six required KPI labels`
- SAFE BASE RESULT: FAIL
- CURRENT RESULT: FAIL
- CATEGORY: PREEXISTING_PRODUCT_DEFECT
- ROOT CAUSE: AssertionError: expected '<section class="opsCard networkStatsC…' to contain 'ГОТОВО ВИДЕО'     at /Users/runner/work/scaleup-dashboards/scaleup-dashboards/src/uiHotfix.test.tsx:26:112     at file:///Users/runner/work/scaleup-dashboards/scaleup-dashboards/node_modules/@vitest/runner/dist/chunk-hooks.js:155:11     at file:///Users/runner/work/scaleup-dashboards/scaleup-dashboards/node_modules/@vitest/runner/dist/chunk-hooks.js:752:26     at file:///Users/runner/work/scaleup-dashboards/scaleup-das
- FEATURE AREA: uiHotfixx
- 6.1.10 INTRODUCED?: NO
- BLOCKS 6.1.10?: NO
- RATIONALE: Exact failure key exists on immutable SAFE_BASE and current HEAD; no new 6.1.10 failure key was introduced. Critical contracts are gated separately.

## QA-006

- ID: QA-006
- TEST FILE: `src/v2100ErrorCenterSemantics.test.ts`
- TEST NAME: `VYRON 2.1 Error Center semantics > queue runtime persists every generic failure and PublisherOS emits one aggregate batch toast without duplicating history`
- SAFE BASE RESULT: FAIL
- CURRENT RESULT: FAIL
- CATEGORY: PREEXISTING_PRODUCT_DEFECT
- ROOT CAUSE: AssertionError: expected 'import React,{useEffect,useMemo,useRe…' to contain 'entries.filter(x=>x.state===\'FAILED\…'     at /Users/runner/work/scaleup-dashboards/scaleup-dashboards/src/v2100ErrorCenterSemantics.test.ts:40:15     at file:///Users/runner/work/scaleup-dashboards/scaleup-dashboards/node_modules/@vitest/runner/dist/chunk-hooks.js:155:11     at file:///Users/runner/work/scaleup-dashboards/scaleup-dashboards/node_modules/@vitest/runner/dist/chunk-hooks.js:752:26     at file:///Users/r
- FEATURE AREA: v2100ErrorCenterSemantics
- 6.1.10 INTRODUCED?: NO
- BLOCKS 6.1.10?: NO
- RATIONALE: Exact failure key exists on immutable SAFE_BASE and current HEAD; no new 6.1.10 failure key was introduced. Critical contracts are gated separately.

## QA-007

- ID: QA-007
- TEST FILE: `src/v2111PublisherWiring.test.ts`
- TEST NAME: `PublisherOS storage/upload wiring > uses canonical selectable jobs`
- SAFE BASE RESULT: FAIL
- CURRENT RESULT: FAIL
- CATEGORY: PREEXISTING_PRODUCT_DEFECT
- ROOT CAUSE: AssertionError: expected 'import React,{useEffect,useMemo,useRe…' to contain 'canonicalSelectedJobs(selectableJobs,…'     at /Users/runner/work/scaleup-dashboards/scaleup-dashboards/src/v2111PublisherWiring.test.ts:7:54     at file:///Users/runner/work/scaleup-dashboards/scaleup-dashboards/node_modules/@vitest/runner/dist/chunk-hooks.js:155:11     at file:///Users/runner/work/scaleup-dashboards/scaleup-dashboards/node_modules/@vitest/runner/dist/chunk-hooks.js:752:26     at file:///Users/runner/
- FEATURE AREA: v2111PublisherWiring
- 6.1.10 INTRODUCED?: NO
- BLOCKS 6.1.10?: NO
- RATIONALE: Exact failure key exists on immutable SAFE_BASE and current HEAD; no new 6.1.10 failure key was introduced. Critical contracts are gated separately.

## QA-008

- ID: QA-008
- TEST FILE: `src/v2114ChannelStatistics.test.ts`
- TEST NAME: `VYRON 2.1.14 RC2 channel statistics contract > statistics are persisted in Channel state and survive restart hydration`
- SAFE BASE RESULT: FAIL
- CURRENT RESULT: FAIL
- CATEGORY: PREEXISTING_PRODUCT_DEFECT
- ROOT CAUSE: AssertionError: expected 'import { create } from \'zustand\';\n…' to contain 'channels:(s.channels||[]).filter(Bool…'     at /Users/runner/work/scaleup-dashboards/scaleup-dashboards/src/v2114ChannelStatistics.test.ts:37:17     at file:///Users/runner/work/scaleup-dashboards/scaleup-dashboards/node_modules/@vitest/runner/dist/chunk-hooks.js:155:11     at file:///Users/runner/work/scaleup-dashboards/scaleup-dashboards/node_modules/@vitest/runner/dist/chunk-hooks.js:752:26     at file:///Users/runn
- FEATURE AREA: v2114ChannelStatistics
- 6.1.10 INTRODUCED?: NO
- BLOCKS 6.1.10?: NO
- RATIONALE: Exact failure key exists on immutable SAFE_BASE and current HEAD; no new 6.1.10 failure key was introduced. Critical contracts are gated separately.

## QA-009

- ID: QA-009
- TEST FILE: `src/v2115AddChannelStats.test.ts`
- TEST NAME: `VYRON 2.1.15 RC1 Add Channel and channel statistics regression > keeps active stats at ten minutes while background network refresh is controlled at 45 minutes`
- SAFE BASE RESULT: FAIL
- CURRENT RESULT: FAIL
- CATEGORY: PREEXISTING_PRODUCT_DEFECT
- ROOT CAUSE: AssertionError: expected 'import React from \'react\';\n\n// VY…' to contain 'setInterval(run,BACKGROUND_CHANNEL_ST…'     at /Users/runner/work/scaleup-dashboards/scaleup-dashboards/src/v2115AddChannelStats.test.ts:105:23     at file:///Users/runner/work/scaleup-dashboards/scaleup-dashboards/node_modules/@vitest/runner/dist/chunk-hooks.js:155:11     at file:///Users/runner/work/scaleup-dashboards/scaleup-dashboards/node_modules/@vitest/runner/dist/chunk-hooks.js:752:26     at file:///Users/runne
- FEATURE AREA: v2115AddChannelStats
- 6.1.10 INTRODUCED?: NO
- BLOCKS 6.1.10?: NO
- RATIONALE: Exact failure key exists on immutable SAFE_BASE and current HEAD; no new 6.1.10 failure key was introduced. Critical contracts are gated separately.

## QA-010

- ID: QA-010
- TEST FILE: `src/v2115Rc4ActivityWiring.test.ts`
- TEST NAME: `VYRON 2.1.15 RC4 activity history wiring > adds a durable History tab without replacing existing YouTube screens`
- SAFE BASE RESULT: FAIL
- CURRENT RESULT: FAIL
- CATEGORY: PREEXISTING_PRODUCT_DEFECT
- ROOT CAUSE: AssertionError: expected 'import React,{useEffect,useRef,useSta…' to contain '<ActivityHistory/>'     at /Users/runner/work/scaleup-dashboards/scaleup-dashboards/src/v2115Rc4ActivityWiring.test.ts:10:18     at file:///Users/runner/work/scaleup-dashboards/scaleup-dashboards/node_modules/@vitest/runner/dist/chunk-hooks.js:155:11     at file:///Users/runner/work/scaleup-dashboards/scaleup-dashboards/node_modules/@vitest/runner/dist/chunk-hooks.js:752:26     at file:///Users/runner/work/scaleup-dash
- FEATURE AREA: v2115Rc4ActivityWiring
- 6.1.10 INTRODUCED?: NO
- BLOCKS 6.1.10?: NO
- RATIONALE: Exact failure key exists on immutable SAFE_BASE and current HEAD; no new 6.1.10 failure key was introduced. Critical contracts are gated separately.

## QA-011

- ID: QA-011
- TEST FILE: `src/v2115Rc4ActivityWiring.test.ts`
- TEST NAME: `VYRON 2.1.15 RC4 activity history wiring > publisher keeps historical remote state separate while current unmatched fingerprints become normal NEW jobs`
- SAFE BASE RESULT: FAIL
- CURRENT RESULT: FAIL
- CATEGORY: PREEXISTING_PRODUCT_DEFECT
- ROOT CAUSE: AssertionError: expected 'import React,{useEffect,useMemo,useRe…' to contain 'const currentCandidates=rows.filter(r…'     at /Users/runner/work/scaleup-dashboards/scaleup-dashboards/src/v2115Rc4ActivityWiring.test.ts:71:21     at file:///Users/runner/work/scaleup-dashboards/scaleup-dashboards/node_modules/@vitest/runner/dist/chunk-hooks.js:155:11     at file:///Users/runner/work/scaleup-dashboards/scaleup-dashboards/node_modules/@vitest/runner/dist/chunk-hooks.js:752:26     at file:///Users/runn
- FEATURE AREA: v2115Rc4ActivityWiring
- 6.1.10 INTRODUCED?: NO
- BLOCKS 6.1.10?: NO
- RATIONALE: Exact failure key exists on immutable SAFE_BASE and current HEAD; no new 6.1.10 failure key was introduced. Critical contracts are gated separately.

## QA-012

- ID: QA-012
- TEST FILE: `src/v2115Rc4StatisticsCenter.test.ts`
- TEST NAME: `VYRON 2.1.15 RC4 multi-channel statistics center > background statistics cadence is controlled and linked-only runtime performs targeting`
- SAFE BASE RESULT: FAIL
- CURRENT RESULT: FAIL
- CATEGORY: PREEXISTING_PRODUCT_DEFECT
- ROOT CAUSE: AssertionError: expected 'import React from \'react\';\n\n// VY…' to contain 'BACKGROUND_CHANNEL_STATS_TTL_MS'     at /Users/runner/work/scaleup-dashboards/scaleup-dashboards/src/v2115Rc4StatisticsCenter.test.ts:142:21     at file:///Users/runner/work/scaleup-dashboards/scaleup-dashboards/node_modules/@vitest/runner/dist/chunk-hooks.js:155:11     at file:///Users/runner/work/scaleup-dashboards/scaleup-dashboards/node_modules/@vitest/runner/dist/chunk-hooks.js:752:26     at file:///Users/runner/w
- FEATURE AREA: v2115Rc4StatisticsCenter
- 6.1.10 INTRODUCED?: NO
- BLOCKS 6.1.10?: NO
- RATIONALE: Exact failure key exists on immutable SAFE_BASE and current HEAD; no new 6.1.10 failure key was introduced. Critical contracts are gated separately.

## QA-013

- ID: QA-013
- TEST FILE: `src/v2115Rc5UpdaterReliability.test.ts`
- TEST NAME: `VYRON 2.1.15 RC5 updater reliability wiring > keeps automatic checks disabled when autoCheckUpdates=false while manual force remains available`
- SAFE BASE RESULT: FAIL
- CURRENT RESULT: FAIL
- CATEGORY: PREEXISTING_PRODUCT_DEFECT
- ROOT CAUSE: AssertionError: expected 'import React,{useEffect,useState} fro…' to contain 'checkUpdate({force:true})'     at /Users/runner/work/scaleup-dashboards/scaleup-dashboards/src/v2115Rc5UpdaterReliability.test.ts:21:22     at file:///Users/runner/work/scaleup-dashboards/scaleup-dashboards/node_modules/@vitest/runner/dist/chunk-hooks.js:155:11     at file:///Users/runner/work/scaleup-dashboards/scaleup-dashboards/node_modules/@vitest/runner/dist/chunk-hooks.js:752:26     at file:///Users/runner/work/s
- FEATURE AREA: v2115Rc5UpdaterReliability
- 6.1.10 INTRODUCED?: NO
- BLOCKS 6.1.10?: NO
- RATIONALE: Exact failure key exists on immutable SAFE_BASE and current HEAD; no new 6.1.10 failure key was introduced. Critical contracts are gated separately.

## QA-014

- ID: QA-014
- TEST FILE: `src/v211FeatureContracts.test.ts`
- TEST NAME: `VYRON 2.0.11 requested feature contracts > Topbar errors are clickable and updates contain dated canonical history`
- SAFE BASE RESULT: FAIL
- CURRENT RESULT: FAIL
- CATEGORY: PREEXISTING_PRODUCT_DEFECT
- ROOT CAUSE: AssertionError: expected 'import React,{useEffect,useState} fro…' to contain '<ReleaseHistoryTimeline/>'     at /Users/runner/work/scaleup-dashboards/scaleup-dashboards/src/v211FeatureContracts.test.ts:30:36     at file:///Users/runner/work/scaleup-dashboards/scaleup-dashboards/node_modules/@vitest/runner/dist/chunk-hooks.js:155:11     at file:///Users/runner/work/scaleup-dashboards/scaleup-dashboards/node_modules/@vitest/runner/dist/chunk-hooks.js:752:26     at file:///Users/runner/work/scaleup
- FEATURE AREA: v211FeatureContracts
- 6.1.10 INTRODUCED?: NO
- BLOCKS 6.1.10?: NO
- RATIONALE: Exact failure key exists on immutable SAFE_BASE and current HEAD; no new 6.1.10 failure key was introduced. Critical contracts are gated separately.

## QA-015

- ID: QA-015
- TEST FILE: `src/v300FinalOwnerWorkflow.test.ts`
- TEST NAME: `VYRON 3.0.0 final owner workflow contracts > keeps normal Publisher human-readable while retaining engineering evidence under details`
- SAFE BASE RESULT: FAIL
- CURRENT RESULT: FAIL
- CATEGORY: PREEXISTING_PRODUCT_DEFECT
- ROOT CAUSE: AssertionError: expected 'import React,{useEffect,useMemo,useRe…' to contain 'Дата и время берутся из метаданных ка…'     at /Users/runner/work/scaleup-dashboards/scaleup-dashboards/src/v300FinalOwnerWorkflow.test.ts:46:21     at file:///Users/runner/work/scaleup-dashboards/scaleup-dashboards/node_modules/@vitest/runner/dist/chunk-hooks.js:155:11     at file:///Users/runner/work/scaleup-dashboards/scaleup-dashboards/node_modules/@vitest/runner/dist/chunk-hooks.js:752:26     at file:///Users/runn
- FEATURE AREA: v300FinalOwnerWorkflow
- 6.1.10 INTRODUCED?: NO
- BLOCKS 6.1.10?: NO
- RATIONALE: Exact failure key exists on immutable SAFE_BASE and current HEAD; no new 6.1.10 failure key was introduced. Critical contracts are gated separately.

## QA-016

- ID: QA-016
- TEST FILE: `src/v300FinalOwnerWorkflow.test.ts`
- TEST NAME: `VYRON 3.0.0 final owner workflow contracts > treats current physical scan as the Publisher source of truth`
- SAFE BASE RESULT: FAIL
- CURRENT RESULT: FAIL
- CATEGORY: PREEXISTING_PRODUCT_DEFECT
- ROOT CAUSE: AssertionError: expected 'import React,{useEffect,useMemo,useRe…' to contain 'currentPhysicalPaths.has(normalizeRen…'     at /Users/runner/work/scaleup-dashboards/scaleup-dashboards/src/v300FinalOwnerWorkflow.test.ts:21:21     at file:///Users/runner/work/scaleup-dashboards/scaleup-dashboards/node_modules/@vitest/runner/dist/chunk-hooks.js:155:11     at file:///Users/runner/work/scaleup-dashboards/scaleup-dashboards/node_modules/@vitest/runner/dist/chunk-hooks.js:752:26     at file:///Users/runn
- FEATURE AREA: v300FinalOwnerWorkflow
- 6.1.10 INTRODUCED?: NO
- BLOCKS 6.1.10?: NO
- RATIONALE: Exact failure key exists on immutable SAFE_BASE and current HEAD; no new 6.1.10 failure key was introduced. Critical contracts are gated separately.

## QA-017

- ID: QA-017
- TEST FILE: `src/v300FinalPhysicalStabilization.test.ts`
- TEST NAME: `VYRON 3.0.0 final physical stabilization contracts > updater rejects DMG execution and proves product version plus build revision after relaunch`
- SAFE BASE RESULT: FAIL
- CURRENT RESULT: FAIL
- CATEGORY: PREEXISTING_PRODUCT_DEFECT
- ROOT CAUSE: AssertionError: expected 'import React,{useEffect,useLayoutEffe…' to contain 'POST_UPDATE_BUILD_MISMATCH'     at /Users/runner/work/scaleup-dashboards/scaleup-dashboards/src/v300FinalPhysicalStabilization.test.ts:90:15     at file:///Users/runner/work/scaleup-dashboards/scaleup-dashboards/node_modules/@vitest/runner/dist/chunk-hooks.js:155:11     at file:///Users/runner/work/scaleup-dashboards/scaleup-dashboards/node_modules/@vitest/runner/dist/chunk-hooks.js:752:26     at file:///Users/runner/w
- FEATURE AREA: v300FinalPhysicalStabilization
- 6.1.10 INTRODUCED?: NO
- BLOCKS 6.1.10?: NO
- RATIONALE: Exact failure key exists on immutable SAFE_BASE and current HEAD; no new 6.1.10 failure key was introduced. Critical contracts are gated separately.

## QA-018

- ID: QA-018
- TEST FILE: `src/v300OauthPersistence.test.ts`
- TEST NAME: `VYRON 3.0.0 OAuth persistence physical-blocker regression > app version change is credential-neutral while launch recovery uses saved profiles without browser reconnect`
- SAFE BASE RESULT: FAIL
- CURRENT RESULT: FAIL
- CATEGORY: PREEXISTING_PRODUCT_DEFECT
- ROOT CAUSE: AssertionError: expected 'import React,{useEffect,useLayoutEffe…' to contain 'oauthBootRecoveryStarted'     at /Users/runner/work/scaleup-dashboards/scaleup-dashboards/src/v300OauthPersistence.test.ts:33:15     at file:///Users/runner/work/scaleup-dashboards/scaleup-dashboards/node_modules/@vitest/runner/dist/chunk-hooks.js:155:11     at file:///Users/runner/work/scaleup-dashboards/scaleup-dashboards/node_modules/@vitest/runner/dist/chunk-hooks.js:752:26     at file:///Users/runner/work/scaleup-
- FEATURE AREA: v300OauthPersistence
- 6.1.10 INTRODUCED?: NO
- BLOCKS 6.1.10?: NO
- RATIONALE: Exact failure key exists on immutable SAFE_BASE and current HEAD; no new 6.1.10 failure key was introduced. Critical contracts are gated separately.

## QA-019

- ID: QA-019
- TEST FILE: `src/v300OauthPersistence.test.ts`
- TEST NAME: `VYRON 3.0.0 OAuth persistence physical-blocker regression > post-update health restores saved profiles before reporting OAuth state and never opens browser`
- SAFE BASE RESULT: FAIL
- CURRENT RESULT: FAIL
- CATEGORY: PREEXISTING_PRODUCT_DEFECT
- ROOT CAUSE: AssertionError: expected ';\n      if(!raw&&!legacy)return;\n  …' to contain 'api.youtubeGoogleConfig()'     at /Users/runner/work/scaleup-dashboards/scaleup-dashboards/src/v300OauthPersistence.test.ts:53:18     at file:///Users/runner/work/scaleup-dashboards/scaleup-dashboards/node_modules/@vitest/runner/dist/chunk-hooks.js:155:11     at file:///Users/runner/work/scaleup-dashboards/scaleup-dashboards/node_modules/@vitest/runner/dist/chunk-hooks.js:752:26     at file:///Users/runner/work/scaleup
- FEATURE AREA: v300OauthPersistence
- 6.1.10 INTRODUCED?: NO
- BLOCKS 6.1.10?: NO
- RATIONALE: Exact failure key exists on immutable SAFE_BASE and current HEAD; no new 6.1.10 failure key was introduced. Critical contracts are gated separately.

## QA-020

- ID: QA-020
- TEST FILE: `src/v300PublisherUiContracts.test.ts`
- TEST NAME: `VYRON 3.0.0 Publisher/UI contracts > Select All includes only canonical eligible NEW rows and Select None clears selection`
- SAFE BASE RESULT: FAIL
- CURRENT RESULT: FAIL
- CATEGORY: PREEXISTING_PRODUCT_DEFECT
- ROOT CAUSE: AssertionError: expected 'import React,{useEffect,useMemo,useRe…' to contain 'const selectableJobs=useMemo(()=>sour…'     at /Users/runner/work/scaleup-dashboards/scaleup-dashboards/src/v300PublisherUiContracts.test.ts:10:13     at file:///Users/runner/work/scaleup-dashboards/scaleup-dashboards/node_modules/@vitest/runner/dist/chunk-hooks.js:155:11     at file:///Users/runner/work/scaleup-dashboards/scaleup-dashboards/node_modules/@vitest/runner/dist/chunk-hooks.js:752:26     at file:///Users/ru
- FEATURE AREA: v300PublisherUiContracts
- 6.1.10 INTRODUCED?: NO
- BLOCKS 6.1.10?: NO
- RATIONALE: Exact failure key exists on immutable SAFE_BASE and current HEAD; no new 6.1.10 failure key was introduced. Critical contracts are gated separately.

## QA-021

- ID: QA-021
- TEST FILE: `src/v300PublisherUiContracts.test.ts`
- TEST NAME: `VYRON 3.0.0 Publisher/UI contracts > normal Publisher auto-materializes unmatched current fingerprints without YouTube-ID gate`
- SAFE BASE RESULT: FAIL
- CURRENT RESULT: FAIL
- CATEGORY: PREEXISTING_PRODUCT_DEFECT
- ROOT CAUSE: AssertionError: expected 'import React,{useEffect,useMemo,useRe…' to contain 'const currentCandidates=rows.filter(r…'     at /Users/runner/work/scaleup-dashboards/scaleup-dashboards/src/v300PublisherUiContracts.test.ts:26:13     at file:///Users/runner/work/scaleup-dashboards/scaleup-dashboards/node_modules/@vitest/runner/dist/chunk-hooks.js:155:11     at file:///Users/runner/work/scaleup-dashboards/scaleup-dashboards/node_modules/@vitest/runner/dist/chunk-hooks.js:752:26     at file:///Users/ru
- FEATURE AREA: v300PublisherUiContracts
- 6.1.10 INTRODUCED?: NO
- BLOCKS 6.1.10?: NO
- RATIONALE: Exact failure key exists on immutable SAFE_BASE and current HEAD; no new 6.1.10 failure key was introduced. Critical contracts are gated separately.

## QA-022

- ID: QA-022
- TEST FILE: `src/v300PublisherUiContracts.test.ts`
- TEST NAME: `VYRON 3.0.0 Publisher/UI contracts > shows fingerprint generation evidence and never fixes selection by forcing checkboxes`
- SAFE BASE RESULT: FAIL
- CURRENT RESULT: FAIL
- CATEGORY: PREEXISTING_PRODUCT_DEFECT
- ROOT CAUSE: AssertionError: expected 'import React,{useEffect,useMemo,useRe…' to contain 'disabled={!fresh||busy}'     at /Users/runner/work/scaleup-dashboards/scaleup-dashboards/src/v300PublisherUiContracts.test.ts:21:13     at file:///Users/runner/work/scaleup-dashboards/scaleup-dashboards/node_modules/@vitest/runner/dist/chunk-hooks.js:155:11     at file:///Users/runner/work/scaleup-dashboards/scaleup-dashboards/node_modules/@vitest/runner/dist/chunk-hooks.js:752:26     at file:///Users/runner/work/scale
- FEATURE AREA: v300PublisherUiContracts
- 6.1.10 INTRODUCED?: NO
- BLOCKS 6.1.10?: NO
- RATIONALE: Exact failure key exists on immutable SAFE_BASE and current HEAD; no new 6.1.10 failure key was introduced. Critical contracts are gated separately.

## QA-023

- ID: QA-023
- TEST FILE: `src/v300PublisherUiContracts.test.ts`
- TEST NAME: `VYRON 3.0.0 Publisher/UI contracts > uses one canonical structured changelog source with factual 3.0.0 entry`
- SAFE BASE RESULT: FAIL
- CURRENT RESULT: FAIL
- CATEGORY: PREEXISTING_PRODUCT_DEFECT
- ROOT CAUSE: AssertionError: expected 'import React,{useEffect,useState} fro…' to contain '<ReleaseHistoryTimeline/>'     at /Users/runner/work/scaleup-dashboards/scaleup-dashboards/src/v300PublisherUiContracts.test.ts:54:20     at file:///Users/runner/work/scaleup-dashboards/scaleup-dashboards/node_modules/@vitest/runner/dist/chunk-hooks.js:155:11     at file:///Users/runner/work/scaleup-dashboards/scaleup-dashboards/node_modules/@vitest/runner/dist/chunk-hooks.js:752:26     at file:///Users/runner/work/sca
- FEATURE AREA: v300PublisherUiContracts
- 6.1.10 INTRODUCED?: NO
- BLOCKS 6.1.10?: NO
- RATIONALE: Exact failure key exists on immutable SAFE_BASE and current HEAD; no new 6.1.10 failure key was introduced. Critical contracts are gated separately.

## QA-024

- ID: QA-024
- TEST FILE: `src/v310ProductConsolidation.test.ts`
- TEST NAME: `VYRON 3.1 product consolidation contracts > keeps Shorts removed and one shared channel context`
- SAFE BASE RESULT: FAIL
- CURRENT RESULT: FAIL
- CATEGORY: PREEXISTING_PRODUCT_DEFECT
- ROOT CAUSE: AssertionError: expected 'import React,{useEffect,useRef,useSta…' to contain '<YouTubeChannelBar/>'     at /Users/runner/work/scaleup-dashboards/scaleup-dashboards/src/v310ProductConsolidation.test.ts:10:144     at file:///Users/runner/work/scaleup-dashboards/scaleup-dashboards/node_modules/@vitest/runner/dist/chunk-hooks.js:155:11     at file:///Users/runner/work/scaleup-dashboards/scaleup-dashboards/node_modules/@vitest/runner/dist/chunk-hooks.js:752:26     at file:///Users/runner/work/scaleup
- FEATURE AREA: v310ProductConsolidation
- 6.1.10 INTRODUCED?: NO
- BLOCKS 6.1.10?: NO
- RATIONALE: Exact failure key exists on immutable SAFE_BASE and current HEAD; no new 6.1.10 failure key was introduced. Critical contracts are gated separately.

## QA-025

- ID: QA-025
- TEST FILE: `src/v310ProductConsolidation.test.ts`
- TEST NAME: `VYRON 3.1 product consolidation contracts > removes static sidebar updater card and provides branded update UI`
- SAFE BASE RESULT: FAIL
- CURRENT RESULT: FAIL
- CATEGORY: PREEXISTING_PRODUCT_DEFECT
- ROOT CAUSE: AssertionError: expected 'import React,{useMemo,useState} from …' to contain '../src-tauri/icons/icon.png'     at /Users/runner/work/scaleup-dashboards/scaleup-dashboards/src/v310ProductConsolidation.test.ts:11:241     at file:///Users/runner/work/scaleup-dashboards/scaleup-dashboards/node_modules/@vitest/runner/dist/chunk-hooks.js:155:11     at file:///Users/runner/work/scaleup-dashboards/scaleup-dashboards/node_modules/@vitest/runner/dist/chunk-hooks.js:752:26     at file:///Users/runner/work/
- FEATURE AREA: v310ProductConsolidation
- 6.1.10 INTRODUCED?: NO
- BLOCKS 6.1.10?: NO
- RATIONALE: Exact failure key exists on immutable SAFE_BASE and current HEAD; no new 6.1.10 failure key was introduced. Critical contracts are gated separately.

## QA-026

- ID: QA-026
- TEST FILE: `src/v320HistoryUx.test.ts`
- TEST NAME: `VYRON 3.2 history and navigation UX > backfills the complete public VYRON journey from 0.5.0`
- SAFE BASE RESULT: FAIL
- CURRENT RESULT: FAIL
- CATEGORY: LEGACY_VERSION_LITERAL
- ROOT CAUSE: AssertionError: expected '6.1.0' to be '6.0.1' // Object.is equality     at /Users/runner/work/scaleup-dashboards/scaleup-dashboards/src/v320HistoryUx.test.ts:10:42     at file:///Users/runner/work/scaleup-dashboards/scaleup-dashboards/node_modules/@vitest/runner/dist/chunk-hooks.js:155:11     at file:///Users/runner/work/scaleup-dashboards/scaleup-dashboards/node_modules/@vitest/runner/dist/chunk-hooks.js:752:26     at file:///Users/runner/work/scaleup-dashboards/scaleup-dashboards/node_modules
- FEATURE AREA: v320HistoryUx
- 6.1.10 INTRODUCED?: NO
- BLOCKS 6.1.10?: NO
- RATIONALE: Exact failure key exists on immutable SAFE_BASE and current HEAD; no new 6.1.10 failure key was introduced. Critical contracts are gated separately.

## QA-027

- ID: QA-027
- TEST FILE: `src/v321PhysicalPatch.test.ts`
- TEST NAME: `VYRON 3.2.1 physical regression patch > forces full readable sidebar labels and defeats legacy 17px span width`
- SAFE BASE RESULT: FAIL
- CURRENT RESULT: FAIL
- CATEGORY: PREEXISTING_PRODUCT_DEFECT
- ROOT CAUSE: AssertionError: expected '/* VYRON 3.1.1 — FINAL GLOBAL UI LAYO…' to contain 'width:228px!important'     at /Users/runner/work/scaleup-dashboards/scaleup-dashboards/src/v321PhysicalPatch.test.ts:34:15     at file:///Users/runner/work/scaleup-dashboards/scaleup-dashboards/node_modules/@vitest/runner/dist/chunk-hooks.js:155:11     at file:///Users/runner/work/scaleup-dashboards/scaleup-dashboards/node_modules/@vitest/runner/dist/chunk-hooks.js:752:26     at file:///Users/runner/work/scaleup-dashbo
- FEATURE AREA: v321PhysicalPatch
- 6.1.10 INTRODUCED?: NO
- BLOCKS 6.1.10?: NO
- RATIONALE: Exact failure key exists on immutable SAFE_BASE and current HEAD; no new 6.1.10 failure key was introduced. Critical contracts are gated separately.

## QA-028

- ID: QA-028
- TEST FILE: `src/v333DocxScheduleTimeSource.test.ts`
- TEST NAME: `VYRON 3.3.3 real DOCX schedule/time-source acceptance > Publisher UI exposes minimal file/common time source controls and keeps dry-run error separation`
- SAFE BASE RESULT: FAIL
- CURRENT RESULT: FAIL
- CATEGORY: PREEXISTING_PRODUCT_DEFECT
- ROOT CAUSE: AssertionError: expected 'import React,{useEffect,useMemo,useRe…' to contain 'Время берётся отдельно из метаданных …'     at /Users/runner/work/scaleup-dashboards/scaleup-dashboards/src/v333DocxScheduleTimeSource.test.ts:120:14     at file:///Users/runner/work/scaleup-dashboards/scaleup-dashboards/node_modules/@vitest/runner/dist/chunk-hooks.js:155:11     at file:///Users/runner/work/scaleup-dashboards/scaleup-dashboards/node_modules/@vitest/runner/dist/chunk-hooks.js:752:26     at file:///Users
- FEATURE AREA: v333DocxScheduleTimeSource
- 6.1.10 INTRODUCED?: NO
- BLOCKS 6.1.10?: NO
- RATIONALE: Exact failure key exists on immutable SAFE_BASE and current HEAD; no new 6.1.10 failure key was introduced. Critical contracts are gated separately.

## QA-029

- ID: QA-029
- TEST FILE: `src/v334LiveInventorySafety.test.ts`
- TEST NAME: `VYRON 3.3.4 live inventory safety contracts > sidebar keeps Запас видео before YouTube, exposes History, and shows the inventory badge`
- SAFE BASE RESULT: FAIL
- CURRENT RESULT: FAIL
- CATEGORY: PREEXISTING_PRODUCT_DEFECT
- ROOT CAUSE: AssertionError: expected -1 to be greater than 6413     at /Users/runner/work/scaleup-dashboards/scaleup-dashboards/src/v334LiveInventorySafety.test.ts:40:19     at file:///Users/runner/work/scaleup-dashboards/scaleup-dashboards/node_modules/@vitest/runner/dist/chunk-hooks.js:155:11     at file:///Users/runner/work/scaleup-dashboards/scaleup-dashboards/node_modules/@vitest/runner/dist/chunk-hooks.js:752:26     at file:///Users/runner/work/scaleup-dashboards/scaleup-dashboards/node_modules/@vites
- FEATURE AREA: v334LiveInventorySafety
- 6.1.10 INTRODUCED?: NO
- BLOCKS 6.1.10?: NO
- RATIONALE: Exact failure key exists on immutable SAFE_BASE and current HEAD; no new 6.1.10 failure key was introduced. Critical contracts are gated separately.

## QA-030

- ID: QA-030
- TEST FILE: `src/v400BlackScreenGuard.test.ts`
- TEST NAME: `VYRON 4.0.0 black-screen regression guard > makes runway background persistence failures non-fatal`
- SAFE BASE RESULT: FAIL
- CURRENT RESULT: FAIL
- CATEGORY: PREEXISTING_PRODUCT_DEFECT
- ROOT CAUSE: AssertionError: expected 'import type {Channel,YoutubeExistingV…' to contain 'try{if(storage)storage.setItem'     at /Users/runner/work/scaleup-dashboards/scaleup-dashboards/src/v400BlackScreenGuard.test.ts:36:19     at file:///Users/runner/work/scaleup-dashboards/scaleup-dashboards/node_modules/@vitest/runner/dist/chunk-hooks.js:155:11     at file:///Users/runner/work/scaleup-dashboards/scaleup-dashboards/node_modules/@vitest/runner/dist/chunk-hooks.js:752:26     at file:///Users/runner/work/sc
- FEATURE AREA: v400BlackScreenGuard
- 6.1.10 INTRODUCED?: NO
- BLOCKS 6.1.10?: NO
- RATIONALE: Exact failure key exists on immutable SAFE_BASE and current HEAD; no new 6.1.10 failure key was introduced. Critical contracts are gated separately.

## QA-031

- ID: QA-031
- TEST FILE: `src/v400DashboardTruth.test.ts`
- TEST NAME: `VYRON 4.0.0 dashboard truth separation > dashboard treats missing subscriber data as unavailable, not zero`
- SAFE BASE RESULT: FAIL
- CURRENT RESULT: FAIL
- CATEGORY: PREEXISTING_PRODUCT_DEFECT
- ROOT CAUSE: AssertionError: expected 'import React,{useEffect,useMemo,useSt…' to contain 'subscriberValues.length?fmt(subscribe…'     at /Users/runner/work/scaleup-dashboards/scaleup-dashboards/src/v400DashboardTruth.test.ts:45:22     at file:///Users/runner/work/scaleup-dashboards/scaleup-dashboards/node_modules/@vitest/runner/dist/chunk-hooks.js:155:11     at file:///Users/runner/work/scaleup-dashboards/scaleup-dashboards/node_modules/@vitest/runner/dist/chunk-hooks.js:752:26     at file:///Users/runner/w
- FEATURE AREA: v400DashboardTruth
- 6.1.10 INTRODUCED?: NO
- BLOCKS 6.1.10?: NO
- RATIONALE: Exact failure key exists on immutable SAFE_BASE and current HEAD; no new 6.1.10 failure key was introduced. Critical contracts are gated separately.

## QA-032

- ID: QA-032
- TEST FILE: `src/v400DashboardTruth.test.ts`
- TEST NAME: `VYRON 4.0.0 dashboard truth separation > does not use public channel videoCount as owner total`
- SAFE BASE RESULT: FAIL
- CURRENT RESULT: FAIL
- CATEGORY: PREEXISTING_PRODUCT_DEFECT
- ROOT CAUSE: AssertionError: expected 'import React,{useEffect,useMemo,useSt…' to contain 'OWNER-ВИДЕО'     at /Users/runner/work/scaleup-dashboards/scaleup-dashboards/src/v400DashboardTruth.test.ts:18:22     at file:///Users/runner/work/scaleup-dashboards/scaleup-dashboards/node_modules/@vitest/runner/dist/chunk-hooks.js:155:11     at file:///Users/runner/work/scaleup-dashboards/scaleup-dashboards/node_modules/@vitest/runner/dist/chunk-hooks.js:752:26     at file:///Users/runner/work/scaleup-dashboards/scal
- FEATURE AREA: v400DashboardTruth
- 6.1.10 INTRODUCED?: NO
- BLOCKS 6.1.10?: NO
- RATIONALE: Exact failure key exists on immutable SAFE_BASE and current HEAD; no new 6.1.10 failure key was introduced. Critical contracts are gated separately.

## QA-033

- ID: QA-033
- TEST FILE: `src/v400DashboardTruth.test.ts`
- TEST NAME: `VYRON 4.0.0 dashboard truth separation > smart scheduler reuses cache and does not refresh on every page transition`
- SAFE BASE RESULT: FAIL
- CURRENT RESULT: FAIL
- CATEGORY: PREEXISTING_PRODUCT_DEFECT
- ROOT CAUSE: AssertionError: expected 'import React from \'react\';\n\n// VY…' to contain 'setTimeout(run,2500)'     at /Users/runner/work/scaleup-dashboards/scaleup-dashboards/src/v400DashboardTruth.test.ts:33:22     at file:///Users/runner/work/scaleup-dashboards/scaleup-dashboards/node_modules/@vitest/runner/dist/chunk-hooks.js:155:11     at file:///Users/runner/work/scaleup-dashboards/scaleup-dashboards/node_modules/@vitest/runner/dist/chunk-hooks.js:752:26     at file:///Users/runner/work/scaleup-dashbo
- FEATURE AREA: v400DashboardTruth
- 6.1.10 INTRODUCED?: NO
- BLOCKS 6.1.10?: NO
- RATIONALE: Exact failure key exists on immutable SAFE_BASE and current HEAD; no new 6.1.10 failure key was introduced. Critical contracts are gated separately.

## QA-034

- ID: QA-034
- TEST FILE: `src/v401Hotfix.test.ts`
- TEST NAME: `VYRON 4.0.1 hotfix contract > has one consistent 4.0.1 runtime identity`
- SAFE BASE RESULT: FAIL
- CURRENT RESULT: FAIL
- CATEGORY: LEGACY_VERSION_LITERAL
- ROOT CAUSE: AssertionError: expected '6.1.9' to be '4.0.1' // Object.is equality     at /Users/runner/work/scaleup-dashboards/scaleup-dashboards/src/v401Hotfix.test.ts:8:54     at file:///Users/runner/work/scaleup-dashboards/scaleup-dashboards/node_modules/@vitest/runner/dist/chunk-hooks.js:155:11     at file:///Users/runner/work/scaleup-dashboards/scaleup-dashboards/node_modules/@vitest/runner/dist/chunk-hooks.js:752:26     at file:///Users/runner/work/scaleup-dashboards/scaleup-dashboards/node_modules/@vi
- FEATURE AREA: v401Hotfix
- 6.1.10 INTRODUCED?: NO
- BLOCKS 6.1.10?: NO
- RATIONALE: Exact failure key exists on immutable SAFE_BASE and current HEAD; no new 6.1.10 failure key was introduced. Critical contracts are gated separately.

## QA-035

- ID: QA-035
- TEST FILE: `src/v401Hotfix.test.ts`
- TEST NAME: `VYRON 4.0.1 hotfix contract > keeps global History as a real journal, not a second fake store`
- SAFE BASE RESULT: FAIL
- CURRENT RESULT: FAIL
- CATEGORY: PREEXISTING_PRODUCT_DEFECT
- ROOT CAUSE: AssertionError: expected 'import React,{useEffect,useLayoutEffe…' to contain 'label:\'История\''     at /Users/runner/work/scaleup-dashboards/scaleup-dashboards/src/v401Hotfix.test.ts:45:17     at file:///Users/runner/work/scaleup-dashboards/scaleup-dashboards/node_modules/@vitest/runner/dist/chunk-hooks.js:155:11     at file:///Users/runner/work/scaleup-dashboards/scaleup-dashboards/node_modules/@vitest/runner/dist/chunk-hooks.js:752:26     at file:///Users/runner/work/scaleup-dashboards/scaleu
- FEATURE AREA: v401Hotfix
- 6.1.10 INTRODUCED?: NO
- BLOCKS 6.1.10?: NO
- RATIONALE: Exact failure key exists on immutable SAFE_BASE and current HEAD; no new 6.1.10 failure key was introduced. Critical contracts are gated separately.

## QA-036

- ID: QA-036
- TEST FILE: `src/v401Hotfix.test.ts`
- TEST NAME: `VYRON 4.0.1 hotfix contract > removes render scan state-write storms and blocking state saves`
- SAFE BASE RESULT: FAIL
- CURRENT RESULT: FAIL
- CATEGORY: PREEXISTING_PRODUCT_DEFECT
- ROOT CAUSE: AssertionError: expected 'import { create } from \'zustand\';\n…' to contain 'SAVE_DEBOUNCE_MS=550'     at /Users/runner/work/scaleup-dashboards/scaleup-dashboards/src/v401Hotfix.test.ts:26:19     at file:///Users/runner/work/scaleup-dashboards/scaleup-dashboards/node_modules/@vitest/runner/dist/chunk-hooks.js:155:11     at file:///Users/runner/work/scaleup-dashboards/scaleup-dashboards/node_modules/@vitest/runner/dist/chunk-hooks.js:752:26     at file:///Users/runner/work/scaleup-dashboards/sca
- FEATURE AREA: v401Hotfix
- 6.1.10 INTRODUCED?: NO
- BLOCKS 6.1.10?: NO
- RATIONALE: Exact failure key exists on immutable SAFE_BASE and current HEAD; no new 6.1.10 failure key was introduced. Critical contracts are gated separately.

## QA-037

- ID: QA-037
- TEST FILE: `src/v401HotfixContract.test.ts`
- TEST NAME: `VYRON 4.0.1 hotfix contract > keeps the new History shortcut global and separate from OAuth state`
- SAFE BASE RESULT: FAIL
- CURRENT RESULT: FAIL
- CATEGORY: PREEXISTING_PRODUCT_DEFECT
- ROOT CAUSE: AssertionError: expected 'import React,{useEffect,useLayoutEffe…' to contain 'label:\'История\''     at /Users/runner/work/scaleup-dashboards/scaleup-dashboards/src/v401HotfixContract.test.ts:18:17     at file:///Users/runner/work/scaleup-dashboards/scaleup-dashboards/node_modules/@vitest/runner/dist/chunk-hooks.js:155:11     at file:///Users/runner/work/scaleup-dashboards/scaleup-dashboards/node_modules/@vitest/runner/dist/chunk-hooks.js:752:26     at file:///Users/runner/work/scaleup-dashboard
- FEATURE AREA: v401HotfixContract
- 6.1.10 INTRODUCED?: NO
- BLOCKS 6.1.10?: NO
- RATIONALE: Exact failure key exists on immutable SAFE_BASE and current HEAD; no new 6.1.10 failure key was introduced. Critical contracts are gated separately.

## QA-038

- ID: QA-038
- TEST FILE: `src/v401HotfixContract.test.ts`
- TEST NAME: `VYRON 4.0.1 hotfix contract > uses 4.0.1 as the hotfix runtime identity`
- SAFE BASE RESULT: FAIL
- CURRENT RESULT: FAIL
- CATEGORY: PREEXISTING_PRODUCT_DEFECT
- ROOT CAUSE: AssertionError: expected 'export const VYRON_MAJOR_VERSION=\'6.…' to contain 'VYRON_MAJOR_VERSION=\'4.0.1\''     at /Users/runner/work/scaleup-dashboards/scaleup-dashboards/src/v401HotfixContract.test.ts:47:19     at file:///Users/runner/work/scaleup-dashboards/scaleup-dashboards/node_modules/@vitest/runner/dist/chunk-hooks.js:155:11     at file:///Users/runner/work/scaleup-dashboards/scaleup-dashboards/node_modules/@vitest/runner/dist/chunk-hooks.js:752:26     at file:///Users/runner/work/scale
- FEATURE AREA: v401HotfixContract
- 6.1.10 INTRODUCED?: NO
- BLOCKS 6.1.10?: NO
- RATIONALE: Exact failure key exists on immutable SAFE_BASE and current HEAD; no new 6.1.10 failure key was introduced. Critical contracts are gated separately.

## QA-039

- ID: QA-039
- TEST FILE: `src/v500Contract.test.ts`
- TEST NAME: `VYRON 5.0.0 product contract > has a canonical 5.0 major candidate plus the real production chain`
- SAFE BASE RESULT: FAIL
- CURRENT RESULT: FAIL
- CATEGORY: LEGACY_VERSION_LITERAL
- ROOT CAUSE: AssertionError: expected '6.1.0' to be '5.0.0' // Object.is equality     at /Users/runner/work/scaleup-dashboards/scaleup-dashboards/src/v500Contract.test.ts:58:41     at file:///Users/runner/work/scaleup-dashboards/scaleup-dashboards/node_modules/@vitest/runner/dist/chunk-hooks.js:155:11     at file:///Users/runner/work/scaleup-dashboards/scaleup-dashboards/node_modules/@vitest/runner/dist/chunk-hooks.js:752:26     at file:///Users/runner/work/scaleup-dashboards/scaleup-dashboards/node_modules/
- FEATURE AREA: v500Contract
- 6.1.10 INTRODUCED?: NO
- BLOCKS 6.1.10?: NO
- RATIONALE: Exact failure key exists on immutable SAFE_BASE and current HEAD; no new 6.1.10 failure key was introduced. Critical contracts are gated separately.

## QA-040

- ID: QA-040
- TEST FILE: `src/v500Contract.test.ts`
- TEST NAME: `VYRON 5.0.0 product contract > protects the first two minutes from heavy owner inventory refresh`
- SAFE BASE RESULT: FAIL
- CURRENT RESULT: FAIL
- CATEGORY: PREEXISTING_PRODUCT_DEFECT
- ROOT CAUSE: AssertionError: expected 0 to be greater than or equal to 120000     at /Users/runner/work/scaleup-dashboards/scaleup-dashboards/src/v500Contract.test.ts:46:47     at file:///Users/runner/work/scaleup-dashboards/scaleup-dashboards/node_modules/@vitest/runner/dist/chunk-hooks.js:155:11     at file:///Users/runner/work/scaleup-dashboards/scaleup-dashboards/node_modules/@vitest/runner/dist/chunk-hooks.js:752:26     at file:///Users/runner/work/scaleup-dashboards/scaleup-dashboards/node_modules/@vit
- FEATURE AREA: v500Contract
- 6.1.10 INTRODUCED?: NO
- BLOCKS 6.1.10?: NO
- RATIONALE: Exact failure key exists on immutable SAFE_BASE and current HEAD; no new 6.1.10 failure key was introduced. Critical contracts are gated separately.

## QA-041

- ID: QA-041
- TEST FILE: `src/v500Contract.test.ts`
- TEST NAME: `VYRON 5.0.0 product contract > uses one 5.0.0 product identity without changing the bundle id`
- SAFE BASE RESULT: FAIL
- CURRENT RESULT: FAIL
- CATEGORY: PREEXISTING_PRODUCT_DEFECT
- ROOT CAUSE: AssertionError: expected '6.0.0' to be '5.0.0' // Object.is equality     at /Users/runner/work/scaleup-dashboards/scaleup-dashboards/src/v500Contract.test.ts:32:31     at file:///Users/runner/work/scaleup-dashboards/scaleup-dashboards/node_modules/@vitest/runner/dist/chunk-hooks.js:155:11     at file:///Users/runner/work/scaleup-dashboards/scaleup-dashboards/node_modules/@vitest/runner/dist/chunk-hooks.js:752:26     at file:///Users/runner/work/scaleup-dashboards/scaleup-dashboards/node_modules/
- FEATURE AREA: v500Contract
- 6.1.10 INTRODUCED?: NO
- BLOCKS 6.1.10?: NO
- RATIONALE: Exact failure key exists on immutable SAFE_BASE and current HEAD; no new 6.1.10 failure key was introduced. Critical contracts are gated separately.

## QA-042

- ID: QA-042
- TEST FILE: `src/v501OwnerHotfix.test.ts`
- TEST NAME: `VYRON 5.0.1 owner hotfix contract > pins owner profile and Local Core in one sidebar footer`
- SAFE BASE RESULT: FAIL
- CURRENT RESULT: FAIL
- CATEGORY: PREEXISTING_PRODUCT_DEFECT
- ROOT CAUSE: AssertionError: expected ':root{font-family:Inter,-apple-system…' to contain '.sidebarFooter{flex:0 0 auto;margin-t…'     at /Users/runner/work/scaleup-dashboards/scaleup-dashboards/src/v501OwnerHotfix.test.ts:92:18     at file:///Users/runner/work/scaleup-dashboards/scaleup-dashboards/node_modules/@vitest/runner/dist/chunk-hooks.js:155:11     at file:///Users/runner/work/scaleup-dashboards/scaleup-dashboards/node_modules/@vitest/runner/dist/chunk-hooks.js:752:26     at file:///Users/runner/work
- FEATURE AREA: v501OwnerHotfix
- 6.1.10 INTRODUCED?: NO
- BLOCKS 6.1.10?: NO
- RATIONALE: Exact failure key exists on immutable SAFE_BASE and current HEAD; no new 6.1.10 failure key was introduced. Critical contracts are gated separately.

## QA-043

- ID: QA-043
- TEST FILE: `src/v501OwnerHotfix.test.ts`
- TEST NAME: `VYRON 5.0.1 owner hotfix contract > removes automatic statistics inventory and processing polling`
- SAFE BASE RESULT: FAIL
- CURRENT RESULT: FAIL
- CATEGORY: PREEXISTING_PRODUCT_DEFECT
- ROOT CAUSE: AssertionError: expected 'import React,{useEffect} from \'react…' not to contain 'setInterval'     at /Users/runner/work/scaleup-dashboards/scaleup-dashboards/src/v501OwnerHotfix.test.ts:40:33     at file:///Users/runner/work/scaleup-dashboards/scaleup-dashboards/node_modules/@vitest/runner/dist/chunk-hooks.js:155:11     at file:///Users/runner/work/scaleup-dashboards/scaleup-dashboards/node_modules/@vitest/runner/dist/chunk-hooks.js:752:26     at file:///Users/runner/work/scaleup-dashboards/sca
- FEATURE AREA: v501OwnerHotfix
- 6.1.10 INTRODUCED?: NO
- BLOCKS 6.1.10?: NO
- RATIONALE: Exact failure key exists on immutable SAFE_BASE and current HEAD; no new 6.1.10 failure key was introduced. Critical contracts are gated separately.

## QA-044

- ID: QA-044
- TEST FILE: `src/v502FullRefresh.test.ts`
- TEST NAME: `VYRON 5.0.2 full refresh hotfix > complete owner sync immediately updates the runway store instead of leaving stale plan data`
- SAFE BASE RESULT: FAIL
- CURRENT RESULT: FAIL
- CATEGORY: PREEXISTING_PRODUCT_DEFECT
- ROOT CAUSE: AssertionError: expected 'import {api} from \'./api\';\nimport …' to contain 'upsertChannelRunwayFromYoutube(channe…'     at /Users/runner/work/scaleup-dashboards/scaleup-dashboards/src/v502FullRefresh.test.ts:50:19     at file:///Users/runner/work/scaleup-dashboards/scaleup-dashboards/node_modules/@vitest/runner/dist/chunk-hooks.js:155:11     at file:///Users/runner/work/scaleup-dashboards/scaleup-dashboards/node_modules/@vitest/runner/dist/chunk-hooks.js:752:26     at file:///Users/runner/work
- FEATURE AREA: v502FullRefresh
- 6.1.10 INTRODUCED?: NO
- BLOCKS 6.1.10?: NO
- RATIONALE: Exact failure key exists on immutable SAFE_BASE and current HEAD; no new 6.1.10 failure key was introduced. Critical contracts are gated separately.

## QA-045

- ID: QA-045
- TEST FILE: `src/v502FullRefresh.test.ts`
- TEST NAME: `VYRON 5.0.2 full refresh hotfix > keeps 9 scheduled and 30 local ready separate`
- SAFE BASE RESULT: FAIL
- CURRENT RESULT: FAIL
- CATEGORY: PREEXISTING_PRODUCT_DEFECT
- ROOT CAUSE: AssertionError: expected 30 to be 9 // Object.is equality     at /Users/runner/work/scaleup-dashboards/scaleup-dashboards/src/v502FullRefresh.test.ts:67:36     at file:///Users/runner/work/scaleup-dashboards/scaleup-dashboards/node_modules/@vitest/runner/dist/chunk-hooks.js:155:11     at file:///Users/runner/work/scaleup-dashboards/scaleup-dashboards/node_modules/@vitest/runner/dist/chunk-hooks.js:752:26     at file:///Users/runner/work/scaleup-dashboards/scaleup-dashboards/node_modules/@vitest/
- FEATURE AREA: v502FullRefresh
- 6.1.10 INTRODUCED?: NO
- BLOCKS 6.1.10?: NO
- RATIONALE: Exact failure key exists on immutable SAFE_BASE and current HEAD; no new 6.1.10 failure key was introduced. Critical contracts are gated separately.

## QA-046

- ID: QA-046
- TEST FILE: `src/v502FullRefresh.test.ts`
- TEST NAME: `VYRON 5.0.2 full refresh hotfix > refresh-all uses one pipeline for stats, owner schedule and zero-quota local render scan`
- SAFE BASE RESULT: FAIL
- CURRENT RESULT: FAIL
- CATEGORY: PREEXISTING_PRODUCT_DEFECT
- ROOT CAUSE: AssertionError: expected 'import {useApp} from \'./store\';\nim…' to contain 'refreshStaleOwnerInventories(enabled,…'     at /Users/runner/work/scaleup-dashboards/scaleup-dashboards/src/v502FullRefresh.test.ts:44:22     at file:///Users/runner/work/scaleup-dashboards/scaleup-dashboards/node_modules/@vitest/runner/dist/chunk-hooks.js:155:11     at file:///Users/runner/work/scaleup-dashboards/scaleup-dashboards/node_modules/@vitest/runner/dist/chunk-hooks.js:752:26     at file:///Users/runner/work
- FEATURE AREA: v502FullRefresh
- 6.1.10 INTRODUCED?: NO
- BLOCKS 6.1.10?: NO
- RATIONALE: Exact failure key exists on immutable SAFE_BASE and current HEAD; no new 6.1.10 failure key was introduced. Critical contracts are gated separately.

## QA-047

- ID: QA-047
- TEST FILE: `src/v502FullRefresh.test.ts`
- TEST NAME: `VYRON 5.0.2 full refresh hotfix > uses 5.0.2 build identity without changing release feeds`
- SAFE BASE RESULT: FAIL
- CURRENT RESULT: FAIL
- CATEGORY: LEGACY_VERSION_LITERAL
- ROOT CAUSE: AssertionError: expected '6.1.9' to be '5.0.2' // Object.is equality     at /Users/runner/work/scaleup-dashboards/scaleup-dashboards/src/v502FullRefresh.test.ts:31:33     at file:///Users/runner/work/scaleup-dashboards/scaleup-dashboards/node_modules/@vitest/runner/dist/chunk-hooks.js:155:11     at file:///Users/runner/work/scaleup-dashboards/scaleup-dashboards/node_modules/@vitest/runner/dist/chunk-hooks.js:752:26     at file:///Users/runner/work/scaleup-dashboards/scaleup-dashboards/node_modul
- FEATURE AREA: v502FullRefresh
- 6.1.10 INTRODUCED?: NO
- BLOCKS 6.1.10?: NO
- RATIONALE: Exact failure key exists on immutable SAFE_BASE and current HEAD; no new 6.1.10 failure key was introduced. Critical contracts are gated separately.

## QA-048

- ID: QA-048
- TEST FILE: `src/v510MaterialsManager.test.ts`
- TEST NAME: `VYRON 6.0.1 Materials Manager contract > preserves legacy imports as fallback without migrating or deleting existing projects`
- SAFE BASE RESULT: FAIL
- CURRENT RESULT: FAIL
- CATEGORY: PREEXISTING_PRODUCT_DEFECT
- ROOT CAUSE: AssertionError: expected 'use chrono::Utc;\nuse crate::{materia…' to contain 'Legacy Import Session keeps its old a…'     at /Users/runner/work/scaleup-dashboards/scaleup-dashboards/src/v510MaterialsManager.test.ts:82:28     at file:///Users/runner/work/scaleup-dashboards/scaleup-dashboards/node_modules/@vitest/runner/dist/chunk-hooks.js:155:11     at file:///Users/runner/work/scaleup-dashboards/scaleup-dashboards/node_modules/@vitest/runner/dist/chunk-hooks.js:752:26     at file:///Users/runner
- FEATURE AREA: v510MaterialsManager
- 6.1.10 INTRODUCED?: NO
- BLOCKS 6.1.10?: NO
- RATIONALE: Exact failure key exists on immutable SAFE_BASE and current HEAD; no new 6.1.10 failure key was introduced. Critical contracts are gated separately.

## QA-049

- ID: QA-049
- TEST FILE: `src/v510MaterialsManager.test.ts`
- TEST NAME: `VYRON 6.0.1 Materials Manager contract > uses one 6.0.1 application identity without changing updater endpoints`
- SAFE BASE RESULT: FAIL
- CURRENT RESULT: FAIL
- CATEGORY: LEGACY_VERSION_LITERAL
- ROOT CAUSE: AssertionError: expected '6.1.9' to be '6.0.1' // Object.is equality     at /Users/runner/work/scaleup-dashboards/scaleup-dashboards/src/v510MaterialsManager.test.ts:16:25     at file:///Users/runner/work/scaleup-dashboards/scaleup-dashboards/node_modules/@vitest/runner/dist/chunk-hooks.js:155:11     at file:///Users/runner/work/scaleup-dashboards/scaleup-dashboards/node_modules/@vitest/runner/dist/chunk-hooks.js:752:26     at file:///Users/runner/work/scaleup-dashboards/scaleup-dashboards/node_
- FEATURE AREA: v510MaterialsManager
- 6.1.10 INTRODUCED?: NO
- BLOCKS 6.1.10?: NO
- RATIONALE: Exact failure key exists on immutable SAFE_BASE and current HEAD; no new 6.1.10 failure key was introduced. Critical contracts are gated separately.

## QA-050

- ID: QA-050
- TEST FILE: `src/v512ManualAssembly.test.ts`
- TEST NAME: `VYRON 6.0.1 manual assembly additive contract > keeps 6.0.1 identity and existing updater endpoints`
- SAFE BASE RESULT: FAIL
- CURRENT RESULT: FAIL
- CATEGORY: LEGACY_VERSION_LITERAL
- ROOT CAUSE: AssertionError: expected '6.1.9' to be '6.0.1' // Object.is equality     at /Users/runner/work/scaleup-dashboards/scaleup-dashboards/src/v512ManualAssembly.test.ts:14:25     at file:///Users/runner/work/scaleup-dashboards/scaleup-dashboards/node_modules/@vitest/runner/dist/chunk-hooks.js:155:11     at file:///Users/runner/work/scaleup-dashboards/scaleup-dashboards/node_modules/@vitest/runner/dist/chunk-hooks.js:752:26     at file:///Users/runner/work/scaleup-dashboards/scaleup-dashboards/node_mo
- FEATURE AREA: v512ManualAssembly
- 6.1.10 INTRODUCED?: NO
- BLOCKS 6.1.10?: NO
- RATIONALE: Exact failure key exists on immutable SAFE_BASE and current HEAD; no new 6.1.10 failure key was introduced. Critical contracts are gated separately.

## QA-051

- ID: QA-051
- TEST FILE: `src/v601WindowsHotfix.test.ts`
- TEST NAME: `VYRON 6.0.1 Windows migration/UI hotfix contracts > anchors owner and LOCAL CORE as one sidebar footer group`
- SAFE BASE RESULT: FAIL
- CURRENT RESULT: FAIL
- CATEGORY: PREEXISTING_PRODUCT_DEFECT
- ROOT CAUSE: AssertionError: expected ':root{font-family:Inter,-apple-system…' to contain '.sidebar .sidebarFooter'     at /Users/runner/work/scaleup-dashboards/scaleup-dashboards/src/v601WindowsHotfix.test.ts:26:20     at file:///Users/runner/work/scaleup-dashboards/scaleup-dashboards/node_modules/@vitest/runner/dist/chunk-hooks.js:155:11     at file:///Users/runner/work/scaleup-dashboards/scaleup-dashboards/node_modules/@vitest/runner/dist/chunk-hooks.js:752:26     at file:///Users/runner/work/scaleup-dash
- FEATURE AREA: v601WindowsHotfix
- 6.1.10 INTRODUCED?: NO
- BLOCKS 6.1.10?: NO
- RATIONALE: Exact failure key exists on immutable SAFE_BASE and current HEAD; no new 6.1.10 failure key was introduced. Critical contracts are gated separately.

## QA-052

- ID: QA-052
- TEST FILE: `src/v601WindowsHotfix.test.ts`
- TEST NAME: `VYRON 6.0.1 Windows migration/UI hotfix contracts > shows actual runtime version in the history while retaining canonical history`
- SAFE BASE RESULT: FAIL
- CURRENT RESULT: FAIL
- CATEGORY: LEGACY_VERSION_LITERAL
- ROOT CAUSE: AssertionError: expected '6.1.0' to be '6.0.1' // Object.is equality     at /Users/runner/work/scaleup-dashboards/scaleup-dashboards/src/v601WindowsHotfix.test.ts:42:43     at file:///Users/runner/work/scaleup-dashboards/scaleup-dashboards/node_modules/@vitest/runner/dist/chunk-hooks.js:155:11     at file:///Users/runner/work/scaleup-dashboards/scaleup-dashboards/node_modules/@vitest/runner/dist/chunk-hooks.js:752:26     at file:///Users/runner/work/scaleup-dashboards/scaleup-dashboards/node_mod
- FEATURE AREA: v601WindowsHotfix
- 6.1.10 INTRODUCED?: NO
- BLOCKS 6.1.10?: NO
- RATIONALE: Exact failure key exists on immutable SAFE_BASE and current HEAD; no new 6.1.10 failure key was introduced. Critical contracts are gated separately.

## QA-053

- ID: QA-053
- TEST FILE: `src/v610M1RoutePerformance.test.ts`
- TEST NAME: `VYRON 6.1.0 M1 route pacing hotfix > YouTube has no hidden heavy keepalive or activation-timer commit train`
- SAFE BASE RESULT: FAIL
- CURRENT RESULT: FAIL
- CATEGORY: LEGACY_VERSION_LITERAL
- ROOT CAUSE: AssertionError: expected 'import React,{useEffect,useMemo,useRe…' to contain 'PublisherOSLightController'     at /Users/runner/work/scaleup-dashboards/scaleup-dashboards/src/v610M1RoutePerformance.test.ts:43:21     at file:///Users/runner/work/scaleup-dashboards/scaleup-dashboards/node_modules/@vitest/runner/dist/chunk-hooks.js:155:11     at file:///Users/runner/work/scaleup-dashboards/scaleup-dashboards/node_modules/@vitest/runner/dist/chunk-hooks.js:752:26     at file:///Users/runner/work/scal
- FEATURE AREA: v610M1RoutePerformance
- 6.1.10 INTRODUCED?: NO
- BLOCKS 6.1.10?: NO
- RATIONALE: Exact failure key exists on immutable SAFE_BASE and current HEAD; no new 6.1.10 failure key was introduced. Critical contracts are gated separately.

## QA-054

- ID: QA-054
- TEST FILE: `src/v612RealMacUpdaterHotfix.test.ts`
- TEST NAME: `VYRON 6.1.2 real mac updater hotfix > keeps updater identity and signing endpoints unchanged while version is 6.1.4`
- SAFE BASE RESULT: FAIL
- CURRENT RESULT: FAIL
- CATEGORY: LEGACY_VERSION_LITERAL
- ROOT CAUSE: AssertionError: expected '6.1.9' to be '6.1.4' // Object.is equality     at /Users/runner/work/scaleup-dashboards/scaleup-dashboards/src/v612RealMacUpdaterHotfix.test.ts:81:26     at file:///Users/runner/work/scaleup-dashboards/scaleup-dashboards/node_modules/@vitest/runner/dist/chunk-hooks.js:155:11     at file:///Users/runner/work/scaleup-dashboards/scaleup-dashboards/node_modules/@vitest/runner/dist/chunk-hooks.js:752:26     at file:///Users/runner/work/scaleup-dashboards/scaleup-dashboards/n
- FEATURE AREA: v612RealMacUpdaterHotfix
- 6.1.10 INTRODUCED?: NO
- BLOCKS 6.1.10?: NO
- RATIONALE: Exact failure key exists on immutable SAFE_BASE and current HEAD; no new 6.1.10 failure key was introduced. Critical contracts are gated separately.

## QA-055

- ID: QA-055
- TEST FILE: `src/vyron619PublisherAlwaysOpen.test.tsx`
- TEST NAME: `VYRON 6.1.9 Publisher core sections are always open > cold mount renders all six working sections with zero clicks, including empty Recovery`
- SAFE BASE RESULT: FAIL
- CURRENT RESULT: FAIL
- CATEGORY: LEGACY_VERSION_LITERAL
- ROOT CAUSE: Error: Cannot find package 'react-test-renderer' imported from '/Users/runner/work/scaleup-dashboards/scaleup-dashboards/src/vyron619PublisherAlwaysOpen.test.tsx'     at VitestExecutor._fetchModule (file:///Users/runner/work/scaleup-dashboards/scaleup-dashboards/node_modules/vite-node/dist/client.mjs:247:19)     at processTicksAndRejections (node:internal/process/task_queues:103:5)     at VitestExecutor.directRequest (file:///Users/runner/work/scaleup-dashboards/scaleup-dashboards/node_modules/v
- FEATURE AREA: vyron619PublisherAlwaysOpenx
- 6.1.10 INTRODUCED?: NO
- BLOCKS 6.1.10?: NO
- RATIONALE: Exact failure key exists on immutable SAFE_BASE and current HEAD; no new 6.1.10 failure key was introduced. Critical contracts are gated separately.

## QA-056

- ID: QA-056
- TEST FILE: `src/vyron619PublisherAlwaysOpen.test.tsx`
- TEST NAME: `VYRON 6.1.9 Publisher core sections are always open > top controls cannot hide any core section`
- SAFE BASE RESULT: FAIL
- CURRENT RESULT: FAIL
- CATEGORY: LEGACY_VERSION_LITERAL
- ROOT CAUSE: Error: Cannot find package 'react-test-renderer' imported from '/Users/runner/work/scaleup-dashboards/scaleup-dashboards/src/vyron619PublisherAlwaysOpen.test.tsx'     at VitestExecutor._fetchModule (file:///Users/runner/work/scaleup-dashboards/scaleup-dashboards/node_modules/vite-node/dist/client.mjs:247:19)     at processTicksAndRejections (node:internal/process/task_queues:103:5)     at VitestExecutor.directRequest (file:///Users/runner/work/scaleup-dashboards/scaleup-dashboards/node_modules/v
- FEATURE AREA: vyron619PublisherAlwaysOpenx
- 6.1.10 INTRODUCED?: NO
- BLOCKS 6.1.10?: NO
- RATIONALE: Exact failure key exists on immutable SAFE_BASE and current HEAD; no new 6.1.10 failure key was introduced. Critical contracts are gated separately.

## QA-057

- ID: QA-057
- TEST FILE: `tests/vyron-602-manual-production-sidebar.test.mjs`
- TEST NAME: `VYRON 6.0.2 manual Production restore > honors explicit image reuse for both legacy and Materials Library sources`
- SAFE BASE RESULT: FAIL
- CURRENT RESULT: FAIL
- CATEGORY: PREEXISTING_PRODUCT_DEFECT
- ROOT CAUSE: AssertionError: expected 'use chrono::Utc;\nuse crate::{materia…' to contain 'material_images[i % material_images.l…'     at /Users/runner/work/scaleup-dashboards/scaleup-dashboards/tests/vyron-602-manual-production-sidebar.test.mjs:40:21     at file:///Users/runner/work/scaleup-dashboards/scaleup-dashboards/node_modules/@vitest/runner/dist/chunk-hooks.js:155:11     at file:///Users/runner/work/scaleup-dashboards/scaleup-dashboards/node_modules/@vitest/runner/dist/chunk-hooks.js:752:26     at fi
- FEATURE AREA: vyron-602-manual-production-sidebar.test.mjs
- 6.1.10 INTRODUCED?: NO
- BLOCKS 6.1.10?: NO
- RATIONALE: Exact failure key exists on immutable SAFE_BASE and current HEAD; no new 6.1.10 failure key was introduced. Critical contracts are gated separately.

## Summary

- TOTAL: 57
- CURRENT_6_1_10_REGRESSION: 0
- UNKNOWN: 0
- BLOCKING_6_1_10: 0
