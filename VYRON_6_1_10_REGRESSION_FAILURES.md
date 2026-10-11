# VYRON 6.1.10 — REGRESSION FAILURES

Current development tree was tested WITHOUT the version/changelog finalizer.

- SAFE_BASE: 588e2070877512daa637077223c678af6a216831
- DEV_HEAD: fb5a74b26deab7201206ebd3754f9fc73a0392ad
- TOTAL_TESTS: 1083
- FAILED_TESTS: 68
- PASSED_TESTS: 1015
- PENDING_TESTS: 0

## FAILURE_ID: F001

- TEST_FILE: src/futureChannelSemantics.test.ts
- TEST_NAME: future channel semantics keeps YouTube Autopilot hard-gated by OAuth
- EXPECTED: SEE_ASSERTION_MESSAGE
- ACTUAL: SEE_ASSERTION_MESSAGE
- SOURCE_PATH: ROOT_CAUSE_PENDING
- RELATED_6_1_10_CHANGE: NONE_PROVEN — IDENTICAL TEST ALREADY FAILED AT SAFE_BASE
- CLASSIFICATION: D. UNRELATED_PREEXISTING_FAILURE
- ACTION: DO_NOT_MISLABEL_AS_6_1_10_REGRESSION; ROOT_CAUSE_REQUIRED_BEFORE_ANY_FIX
- ASSERTION_MESSAGE:

```text
AssertionError: expected 'import {api} from \'./api\';import {u…' to contain 'if(!s.autoUploadYoutube||!s.youtubePu…'
    at src/futureChannelSemantics.test.ts:6:170
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:155:11
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:752:26
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:1897:20
    at new Promise (<anonymous>)
    at runWithTimeout (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1863:10)
    at runTest (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1574:12)
    at processTicksAndRejections (node:internal/process/task_queues:103:5)
    at runSuite (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
    at runSuite (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
```

## FAILURE_ID: F002

- TEST_FILE: src/googleProjectDiagnostics.test.ts
- TEST_NAME: Google Cloud project diagnostics keeps different project ledgers isolated and reads configured limit from existing quota storage
- EXPECTED: SEE_ASSERTION_MESSAGE
- ACTUAL: SEE_ASSERTION_MESSAGE
- SOURCE_PATH: ROOT_CAUSE_PENDING
- RELATED_6_1_10_CHANGE: NONE_PROVEN — IDENTICAL TEST ALREADY FAILED AT SAFE_BASE
- CLASSIFICATION: D. UNRELATED_PREEXISTING_FAILURE
- ACTION: DO_NOT_MISLABEL_AS_6_1_10_REGRESSION; ROOT_CAUSE_REQUIRED_BEFORE_ANY_FIX
- ASSERTION_MESSAGE:

```text
AssertionError: expected 'unknown' to be 'default' // Object.is equality
    at src/googleProjectDiagnostics.test.ts:15:411
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:155:11
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:752:26
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:1897:20
    at new Promise (<anonymous>)
    at runWithTimeout (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1863:10)
    at runTest (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1574:12)
    at processTicksAndRejections (node:internal/process/task_queues:103:5)
    at runSuite (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
    at runSuite (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
```

## FAILURE_ID: F003

- TEST_FILE: src/keychainPassiveArchitecture.test.ts
- TEST_NAME: VYRON passive Keychain architecture startup load_state never hydrates/migrates secrets
- EXPECTED: SEE_ASSERTION_MESSAGE
- ACTUAL: SEE_ASSERTION_MESSAGE
- SOURCE_PATH: ROOT_CAUSE_PENDING
- RELATED_6_1_10_CHANGE: NONE_PROVEN — IDENTICAL TEST ALREADY FAILED AT SAFE_BASE
- CLASSIFICATION: D. UNRELATED_PREEXISTING_FAILURE
- ACTION: DO_NOT_MISLABEL_AS_6_1_10_REGRESSION; ROOT_CAUSE_REQUIRED_BEFORE_ANY_FIX
- ASSERTION_MESSAGE:

```text
AssertionError: expected 'pub fn load_state(app: AppHandle) -> …' not to match /get_secret|set_secret|hydrate_state|s…/
    at src/keychainPassiveArchitecture.test.ts:12:139
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:155:11
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:752:26
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:1897:20
    at new Promise (<anonymous>)
    at runWithTimeout (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1863:10)
    at runTest (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1574:12)
    at processTicksAndRejections (node:internal/process/task_queues:103:5)
    at runSuite (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
    at runSuite (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
```

## FAILURE_ID: F004

- TEST_FILE: src/schedulePhysicalRegression.test.ts
- TEST_NAME: physical schedule truth regression keeps schedule cache isolated by channel id
- EXPECTED: SEE_ASSERTION_MESSAGE
- ACTUAL: SEE_ASSERTION_MESSAGE
- SOURCE_PATH: ROOT_CAUSE_PENDING
- RELATED_6_1_10_CHANGE: NONE_PROVEN — IDENTICAL TEST ALREADY FAILED AT SAFE_BASE
- CLASSIFICATION: D. UNRELATED_PREEXISTING_FAILURE
- ACTION: DO_NOT_MISLABEL_AS_6_1_10_REGRESSION; ROOT_CAUSE_REQUIRED_BEFORE_ANY_FIX
- ASSERTION_MESSAGE:

```text
AssertionError: expected undefined to be '2026-10-01T21:00:00.000Z' // Object.is equality
    at src/schedulePhysicalRegression.test.ts:56:66
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:155:11
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:752:26
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:1897:20
    at new Promise (<anonymous>)
    at runWithTimeout (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1863:10)
    at runTest (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1574:12)
    at processTicksAndRejections (node:internal/process/task_queues:103:5)
    at runSuite (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
    at runSuite (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
```

## FAILURE_ID: F005

- TEST_FILE: src/schedulePhysicalRegression.test.ts
- TEST_NAME: physical schedule truth regression selects the latest factual future publishAt
- EXPECTED: SEE_ASSERTION_MESSAGE
- ACTUAL: SEE_ASSERTION_MESSAGE
- SOURCE_PATH: ROOT_CAUSE_PENDING
- RELATED_6_1_10_CHANGE: NONE_PROVEN — IDENTICAL TEST ALREADY FAILED AT SAFE_BASE
- CLASSIFICATION: D. UNRELATED_PREEXISTING_FAILURE
- ACTION: DO_NOT_MISLABEL_AS_6_1_10_REGRESSION; ROOT_CAUSE_REQUIRED_BEFORE_ANY_FIX
- ASSERTION_MESSAGE:

```text
AssertionError: expected undefined to be '2026-11-09T21:00:00.000Z' // Object.is equality
    at src/schedulePhysicalRegression.test.ts:29:33
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:155:11
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:752:26
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:1897:20
    at new Promise (<anonymous>)
    at runWithTimeout (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1863:10)
    at runTest (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1574:12)
    at processTicksAndRejections (node:internal/process/task_queues:103:5)
    at runSuite (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
    at runSuite (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
```

## FAILURE_ID: F006

- TEST_FILE: src/schedulePhysicalRegression.test.ts
- TEST_NAME: physical schedule truth regression uses the complete 152-video baseline rather than six selected/edit rows
- EXPECTED: SEE_ASSERTION_MESSAGE
- ACTUAL: SEE_ASSERTION_MESSAGE
- SOURCE_PATH: ROOT_CAUSE_PENDING
- RELATED_6_1_10_CHANGE: NONE_PROVEN — IDENTICAL TEST ALREADY FAILED AT SAFE_BASE
- CLASSIFICATION: D. UNRELATED_PREEXISTING_FAILURE
- ACTION: DO_NOT_MISLABEL_AS_6_1_10_REGRESSION; ROOT_CAUSE_REQUIRED_BEFORE_ANY_FIX
- ASSERTION_MESSAGE:

```text
TypeError: Cannot read properties of null (reading 'baseline')
    at src/schedulePhysicalRegression.test.ts:38:87
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:155:11
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:752:26
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:1897:20
    at new Promise (<anonymous>)
    at runWithTimeout (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1863:10)
    at runTest (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1574:12)
    at processTicksAndRejections (node:internal/process/task_queues:103:5)
    at runSuite (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
    at runSuite (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
```

## FAILURE_ID: F007

- TEST_FILE: src/storageLifecycle.test.ts
- TEST_NAME: Storage Lifecycle + Duplicate Upload Guard production cleanup uses system Trash, render proof and guarded roots without upload gate
- EXPECTED: SEE_ASSERTION_MESSAGE
- ACTUAL: SEE_ASSERTION_MESSAGE
- SOURCE_PATH: ROOT_CAUSE_PENDING
- RELATED_6_1_10_CHANGE: NONE_PROVEN — IDENTICAL TEST ALREADY FAILED AT SAFE_BASE
- CLASSIFICATION: D. UNRELATED_PREEXISTING_FAILURE
- ACTION: DO_NOT_MISLABEL_AS_6_1_10_REGRESSION; ROOT_CAUSE_REQUIRED_BEFORE_ANY_FIX
- ASSERTION_MESSAGE:

```text
AssertionError: expected 'pub fn delete_production_job_folder(\…' to contain 'verified_uploaded_job_ids'
    at src/storageLifecycle.test.ts:76:703
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:155:11
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:752:26
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:1897:20
    at new Promise (<anonymous>)
    at runWithTimeout (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1863:10)
    at runTest (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1574:12)
    at processTicksAndRejections (node:internal/process/task_queues:103:5)
    at runSuite (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
    at runSuite (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
```

## FAILURE_ID: F008

- TEST_FILE: src/storageLifecycle.test.ts
- TEST_NAME: Storage Lifecycle + Duplicate Upload Guard UI defaults to New and current fingerprint candidates are selectable without YouTube-ID verification
- EXPECTED: SEE_ASSERTION_MESSAGE
- ACTUAL: SEE_ASSERTION_MESSAGE
- SOURCE_PATH: ROOT_CAUSE_PENDING
- RELATED_6_1_10_CHANGE: NONE_PROVEN — IDENTICAL TEST ALREADY FAILED AT SAFE_BASE
- CLASSIFICATION: D. UNRELATED_PREEXISTING_FAILURE
- ACTION: DO_NOT_MISLABEL_AS_6_1_10_REGRESSION; ROOT_CAUSE_REQUIRED_BEFORE_ANY_FIX
- ASSERTION_MESSAGE:

```text
AssertionError: expected 'import React,{useEffect,useMemo,useRe…' to contain 'const currentCandidates=rows.filter(r…'
    at src/storageLifecycle.test.ts:77:533
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:155:11
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:752:26
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:1897:20
    at new Promise (<anonymous>)
    at runWithTimeout (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1863:10)
    at runTest (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1574:12)
    at processTicksAndRejections (node:internal/process/task_queues:103:5)
    at runSuite (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
    at runSuite (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
```

## FAILURE_ID: F009

- TEST_FILE: src/uiHotfix.test.tsx
- TEST_NAME: VYRON 2.1.6 UI hotfix renders the compact operational dashboard with the six required KPI labels
- EXPECTED: SEE_ASSERTION_MESSAGE
- ACTUAL: SEE_ASSERTION_MESSAGE
- SOURCE_PATH: ROOT_CAUSE_PENDING
- RELATED_6_1_10_CHANGE: NONE_PROVEN — IDENTICAL TEST ALREADY FAILED AT SAFE_BASE
- CLASSIFICATION: D. UNRELATED_PREEXISTING_FAILURE
- ACTION: DO_NOT_MISLABEL_AS_6_1_10_REGRESSION; ROOT_CAUSE_REQUIRED_BEFORE_ANY_FIX
- ASSERTION_MESSAGE:

```text
AssertionError: expected '<section class="opsCard networkStatsC…' to contain 'ГОТОВО ВИДЕО'
    at src/uiHotfix.test.tsx:26:112
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:155:11
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:752:26
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:1897:20
    at new Promise (<anonymous>)
    at runWithTimeout (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1863:10)
    at runTest (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1574:12)
    at processTicksAndRejections (node:internal/process/task_queues:103:5)
    at runSuite (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
    at runSuite (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
```

## FAILURE_ID: F010

- TEST_FILE: src/v2100ErrorCenterSemantics.test.ts
- TEST_NAME: VYRON 2.1 Error Center semantics queue runtime persists every generic failure and PublisherOS emits one aggregate batch toast without duplicating history
- EXPECTED: SEE_ASSERTION_MESSAGE
- ACTUAL: SEE_ASSERTION_MESSAGE
- SOURCE_PATH: ROOT_CAUSE_PENDING
- RELATED_6_1_10_CHANGE: NONE_PROVEN — IDENTICAL TEST ALREADY FAILED AT SAFE_BASE
- CLASSIFICATION: D. UNRELATED_PREEXISTING_FAILURE
- ACTION: DO_NOT_MISLABEL_AS_6_1_10_REGRESSION; ROOT_CAUSE_REQUIRED_BEFORE_ANY_FIX
- ASSERTION_MESSAGE:

```text
AssertionError: expected 'import React,{useEffect,useMemo,useRe…' to contain 'entries.filter(x=>x.state===\'FAILED\…'
    at src/v2100ErrorCenterSemantics.test.ts:40:15
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:155:11
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:752:26
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:1897:20
    at new Promise (<anonymous>)
    at runWithTimeout (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1863:10)
    at runTest (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1574:12)
    at processTicksAndRejections (node:internal/process/task_queues:103:5)
    at runSuite (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
    at runSuite (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
```

## FAILURE_ID: F011

- TEST_FILE: src/v2111PublisherWiring.test.ts
- TEST_NAME: PublisherOS storage/upload wiring uses canonical selectable jobs
- EXPECTED: SEE_ASSERTION_MESSAGE
- ACTUAL: SEE_ASSERTION_MESSAGE
- SOURCE_PATH: ROOT_CAUSE_PENDING
- RELATED_6_1_10_CHANGE: NONE_PROVEN — IDENTICAL TEST ALREADY FAILED AT SAFE_BASE
- CLASSIFICATION: D. UNRELATED_PREEXISTING_FAILURE
- ACTION: DO_NOT_MISLABEL_AS_6_1_10_REGRESSION; ROOT_CAUSE_REQUIRED_BEFORE_ANY_FIX
- ASSERTION_MESSAGE:

```text
AssertionError: expected 'import React,{useEffect,useMemo,useRe…' to contain 'canonicalSelectedJobs(selectableJobs,…'
    at src/v2111PublisherWiring.test.ts:7:54
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:155:11
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:752:26
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:1897:20
    at new Promise (<anonymous>)
    at runWithTimeout (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1863:10)
    at runTest (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1574:12)
    at processTicksAndRejections (node:internal/process/task_queues:103:5)
    at runSuite (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
    at runSuite (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
```

## FAILURE_ID: F012

- TEST_FILE: src/v2114ChannelStatistics.test.ts
- TEST_NAME: VYRON 2.1.14 RC2 channel statistics contract statistics are persisted in Channel state and survive restart hydration
- EXPECTED: SEE_ASSERTION_MESSAGE
- ACTUAL: SEE_ASSERTION_MESSAGE
- SOURCE_PATH: ROOT_CAUSE_PENDING
- RELATED_6_1_10_CHANGE: NONE_PROVEN — IDENTICAL TEST ALREADY FAILED AT SAFE_BASE
- CLASSIFICATION: D. UNRELATED_PREEXISTING_FAILURE
- ACTION: DO_NOT_MISLABEL_AS_6_1_10_REGRESSION; ROOT_CAUSE_REQUIRED_BEFORE_ANY_FIX
- ASSERTION_MESSAGE:

```text
AssertionError: expected 'import { create } from \'zustand\';\n…' to contain 'channels:(s.channels||[]).filter(Bool…'
    at src/v2114ChannelStatistics.test.ts:37:17
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:155:11
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:752:26
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:1897:20
    at new Promise (<anonymous>)
    at runWithTimeout (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1863:10)
    at runTest (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1574:12)
    at processTicksAndRejections (node:internal/process/task_queues:103:5)
    at runSuite (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
    at runSuite (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
```

## FAILURE_ID: F013

- TEST_FILE: src/v2115AddChannelStats.test.ts
- TEST_NAME: VYRON 2.1.15 RC1 Add Channel and channel statistics regression keeps active stats at ten minutes while background network refresh is controlled at 45 minutes
- EXPECTED: SEE_ASSERTION_MESSAGE
- ACTUAL: SEE_ASSERTION_MESSAGE
- SOURCE_PATH: ROOT_CAUSE_PENDING
- RELATED_6_1_10_CHANGE: NONE_PROVEN — IDENTICAL TEST ALREADY FAILED AT SAFE_BASE
- CLASSIFICATION: D. UNRELATED_PREEXISTING_FAILURE
- ACTION: DO_NOT_MISLABEL_AS_6_1_10_REGRESSION; ROOT_CAUSE_REQUIRED_BEFORE_ANY_FIX
- ASSERTION_MESSAGE:

```text
AssertionError: expected 'import React from \'react\';\n\n// VY…' to contain 'setInterval(run,BACKGROUND_CHANNEL_ST…'
    at src/v2115AddChannelStats.test.ts:105:23
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:155:11
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:752:26
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:1897:20
    at new Promise (<anonymous>)
    at runWithTimeout (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1863:10)
    at runTest (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1574:12)
    at processTicksAndRejections (node:internal/process/task_queues:103:5)
    at runSuite (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
    at runSuite (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
```

## FAILURE_ID: F014

- TEST_FILE: src/v2115Rc4ActivityWiring.test.ts
- TEST_NAME: VYRON 2.1.15 RC4 activity history wiring adds a durable History tab without replacing existing YouTube screens
- EXPECTED: SEE_ASSERTION_MESSAGE
- ACTUAL: SEE_ASSERTION_MESSAGE
- SOURCE_PATH: ROOT_CAUSE_PENDING
- RELATED_6_1_10_CHANGE: NONE_PROVEN — IDENTICAL TEST ALREADY FAILED AT SAFE_BASE
- CLASSIFICATION: D. UNRELATED_PREEXISTING_FAILURE
- ACTION: DO_NOT_MISLABEL_AS_6_1_10_REGRESSION; ROOT_CAUSE_REQUIRED_BEFORE_ANY_FIX
- ASSERTION_MESSAGE:

```text
AssertionError: expected 'import React,{useEffect,useRef,useSta…' to contain '<ActivityHistory/>'
    at src/v2115Rc4ActivityWiring.test.ts:10:18
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:155:11
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:752:26
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:1897:20
    at new Promise (<anonymous>)
    at runWithTimeout (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1863:10)
    at runTest (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1574:12)
    at processTicksAndRejections (node:internal/process/task_queues:103:5)
    at runSuite (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
    at runSuite (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
```

## FAILURE_ID: F015

- TEST_FILE: src/v2115Rc4ActivityWiring.test.ts
- TEST_NAME: VYRON 2.1.15 RC4 activity history wiring publisher keeps historical remote state separate while current unmatched fingerprints become normal NEW jobs
- EXPECTED: SEE_ASSERTION_MESSAGE
- ACTUAL: SEE_ASSERTION_MESSAGE
- SOURCE_PATH: ROOT_CAUSE_PENDING
- RELATED_6_1_10_CHANGE: NONE_PROVEN — IDENTICAL TEST ALREADY FAILED AT SAFE_BASE
- CLASSIFICATION: D. UNRELATED_PREEXISTING_FAILURE
- ACTION: DO_NOT_MISLABEL_AS_6_1_10_REGRESSION; ROOT_CAUSE_REQUIRED_BEFORE_ANY_FIX
- ASSERTION_MESSAGE:

```text
AssertionError: expected 'import React,{useEffect,useMemo,useRe…' to contain 'const currentCandidates=rows.filter(r…'
    at src/v2115Rc4ActivityWiring.test.ts:71:21
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:155:11
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:752:26
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:1897:20
    at new Promise (<anonymous>)
    at runWithTimeout (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1863:10)
    at runTest (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1574:12)
    at processTicksAndRejections (node:internal/process/task_queues:103:5)
    at runSuite (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
    at runSuite (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
```

## FAILURE_ID: F016

- TEST_FILE: src/v2115Rc4StatisticsCenter.test.ts
- TEST_NAME: VYRON 2.1.15 RC4 multi-channel statistics center background statistics cadence is controlled and linked-only runtime performs targeting
- EXPECTED: SEE_ASSERTION_MESSAGE
- ACTUAL: SEE_ASSERTION_MESSAGE
- SOURCE_PATH: ROOT_CAUSE_PENDING
- RELATED_6_1_10_CHANGE: NONE_PROVEN — IDENTICAL TEST ALREADY FAILED AT SAFE_BASE
- CLASSIFICATION: D. UNRELATED_PREEXISTING_FAILURE
- ACTION: DO_NOT_MISLABEL_AS_6_1_10_REGRESSION; ROOT_CAUSE_REQUIRED_BEFORE_ANY_FIX
- ASSERTION_MESSAGE:

```text
AssertionError: expected 'import React from \'react\';\n\n// VY…' to contain 'BACKGROUND_CHANNEL_STATS_TTL_MS'
    at src/v2115Rc4StatisticsCenter.test.ts:142:21
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:155:11
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:752:26
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:1897:20
    at new Promise (<anonymous>)
    at runWithTimeout (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1863:10)
    at runTest (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1574:12)
    at processTicksAndRejections (node:internal/process/task_queues:103:5)
    at runSuite (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
    at runSuite (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
```

## FAILURE_ID: F017

- TEST_FILE: src/v2115Rc5UpdaterReliability.test.ts
- TEST_NAME: VYRON 2.1.15 RC5 updater reliability wiring keeps automatic checks disabled when autoCheckUpdates=false while manual force remains available
- EXPECTED: SEE_ASSERTION_MESSAGE
- ACTUAL: SEE_ASSERTION_MESSAGE
- SOURCE_PATH: ROOT_CAUSE_PENDING
- RELATED_6_1_10_CHANGE: NONE_PROVEN — IDENTICAL TEST ALREADY FAILED AT SAFE_BASE
- CLASSIFICATION: D. UNRELATED_PREEXISTING_FAILURE
- ACTION: DO_NOT_MISLABEL_AS_6_1_10_REGRESSION; ROOT_CAUSE_REQUIRED_BEFORE_ANY_FIX
- ASSERTION_MESSAGE:

```text
AssertionError: expected 'import React,{useEffect,useState} fro…' to contain 'checkUpdate({force:true})'
    at src/v2115Rc5UpdaterReliability.test.ts:21:22
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:155:11
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:752:26
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:1897:20
    at new Promise (<anonymous>)
    at runWithTimeout (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1863:10)
    at runTest (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1574:12)
    at processTicksAndRejections (node:internal/process/task_queues:103:5)
    at runSuite (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
    at runSuite (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
```

## FAILURE_ID: F018

- TEST_FILE: src/v2115ScheduleSyncHotfix.test.ts
- TEST_NAME: VYRON 2.1.15 RC2 schedule sync hotfix partial 202/203 refresh preserves prior 203 cached rows and exposes exact retry id
- EXPECTED: SEE_ASSERTION_MESSAGE
- ACTUAL: SEE_ASSERTION_MESSAGE
- SOURCE_PATH: ROOT_CAUSE_PENDING
- RELATED_6_1_10_CHANGE: NONE_PROVEN — IDENTICAL TEST ALREADY FAILED AT SAFE_BASE
- CLASSIFICATION: D. UNRELATED_PREEXISTING_FAILURE
- ACTION: DO_NOT_MISLABEL_AS_6_1_10_REGRESSION; ROOT_CAUSE_REQUIRED_BEFORE_ANY_FIX
- ASSERTION_MESSAGE:

```text
AssertionError: Target cannot be null or undefined.
    at Proxy.<anonymous> (file://node_modules/@vitest/expect/dist/index.js:1257:20)
    at Proxy.<anonymous> (file://node_modules/@vitest/expect/dist/index.js:1029:14)
    at Proxy.methodWrapper (file://node_modules/chai/index.js:1686:25)
    at src/v2115ScheduleSyncHotfix.test.ts:45:42
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:155:11
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:752:26
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:1897:20
    at new Promise (<anonymous>)
    at runWithTimeout (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1863:10)
    at runTest (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1574:12)
```

## FAILURE_ID: F019

- TEST_FILE: src/v2115ScheduleSyncHotfix.test.ts
- TEST_NAME: VYRON 2.1.15 RC2 schedule sync hotfix treats factual 203/203 snapshot as complete and keeps all rows
- EXPECTED: SEE_ASSERTION_MESSAGE
- ACTUAL: SEE_ASSERTION_MESSAGE
- SOURCE_PATH: ROOT_CAUSE_PENDING
- RELATED_6_1_10_CHANGE: NONE_PROVEN — IDENTICAL TEST ALREADY FAILED AT SAFE_BASE
- CLASSIFICATION: D. UNRELATED_PREEXISTING_FAILURE
- ACTION: DO_NOT_MISLABEL_AS_6_1_10_REGRESSION; ROOT_CAUSE_REQUIRED_BEFORE_ANY_FIX
- ASSERTION_MESSAGE:

```text
TypeError: Cannot read properties of undefined (reading 'videos')
    at src/v2115ScheduleSyncHotfix.test.ts:33:16
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:155:11
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:752:26
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:1897:20
    at new Promise (<anonymous>)
    at runWithTimeout (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1863:10)
    at runTest (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1574:12)
    at processTicksAndRejections (node:internal/process/task_queues:103:5)
    at runSuite (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
    at runSuite (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
```

## FAILURE_ID: F020

- TEST_FILE: src/v211FeatureContracts.test.ts
- TEST_NAME: VYRON 2.0.11 requested feature contracts Topbar errors are clickable and updates contain dated canonical history
- EXPECTED: SEE_ASSERTION_MESSAGE
- ACTUAL: SEE_ASSERTION_MESSAGE
- SOURCE_PATH: ROOT_CAUSE_PENDING
- RELATED_6_1_10_CHANGE: NONE_PROVEN — IDENTICAL TEST ALREADY FAILED AT SAFE_BASE
- CLASSIFICATION: D. UNRELATED_PREEXISTING_FAILURE
- ACTION: DO_NOT_MISLABEL_AS_6_1_10_REGRESSION; ROOT_CAUSE_REQUIRED_BEFORE_ANY_FIX
- ASSERTION_MESSAGE:

```text
AssertionError: expected 'import React,{useEffect,useState} fro…' to contain '<ReleaseHistoryTimeline/>'
    at src/v211FeatureContracts.test.ts:30:36
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:155:11
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:752:26
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:1897:20
    at new Promise (<anonymous>)
    at runWithTimeout (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1863:10)
    at runTest (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1574:12)
    at processTicksAndRejections (node:internal/process/task_queues:103:5)
    at runSuite (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
    at runSuite (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
```

## FAILURE_ID: F021

- TEST_FILE: src/v300FinalOwnerWorkflow.test.ts
- TEST_NAME: VYRON 3.0.0 final owner workflow contracts keeps normal Publisher human-readable while retaining engineering evidence under details
- EXPECTED: SEE_ASSERTION_MESSAGE
- ACTUAL: SEE_ASSERTION_MESSAGE
- SOURCE_PATH: ROOT_CAUSE_PENDING
- RELATED_6_1_10_CHANGE: NONE_PROVEN — IDENTICAL TEST ALREADY FAILED AT SAFE_BASE
- CLASSIFICATION: D. UNRELATED_PREEXISTING_FAILURE
- ACTION: DO_NOT_MISLABEL_AS_6_1_10_REGRESSION; ROOT_CAUSE_REQUIRED_BEFORE_ANY_FIX
- ASSERTION_MESSAGE:

```text
AssertionError: expected 'import React,{useEffect,useMemo,useRe…' to contain 'Дата и время берутся из метаданных ка…'
    at src/v300FinalOwnerWorkflow.test.ts:46:21
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:155:11
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:752:26
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:1897:20
    at new Promise (<anonymous>)
    at runWithTimeout (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1863:10)
    at runTest (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1574:12)
    at processTicksAndRejections (node:internal/process/task_queues:103:5)
    at runSuite (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
    at runSuite (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
```

## FAILURE_ID: F022

- TEST_FILE: src/v300FinalOwnerWorkflow.test.ts
- TEST_NAME: VYRON 3.0.0 final owner workflow contracts treats current physical scan as the Publisher source of truth
- EXPECTED: SEE_ASSERTION_MESSAGE
- ACTUAL: SEE_ASSERTION_MESSAGE
- SOURCE_PATH: ROOT_CAUSE_PENDING
- RELATED_6_1_10_CHANGE: NONE_PROVEN — IDENTICAL TEST ALREADY FAILED AT SAFE_BASE
- CLASSIFICATION: D. UNRELATED_PREEXISTING_FAILURE
- ACTION: DO_NOT_MISLABEL_AS_6_1_10_REGRESSION; ROOT_CAUSE_REQUIRED_BEFORE_ANY_FIX
- ASSERTION_MESSAGE:

```text
AssertionError: expected 'import React,{useEffect,useMemo,useRe…' to contain 'currentPhysicalPaths.has(normalizeRen…'
    at src/v300FinalOwnerWorkflow.test.ts:21:21
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:155:11
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:752:26
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:1897:20
    at new Promise (<anonymous>)
    at runWithTimeout (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1863:10)
    at runTest (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1574:12)
    at processTicksAndRejections (node:internal/process/task_queues:103:5)
    at runSuite (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
    at runSuite (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
```

## FAILURE_ID: F023

- TEST_FILE: src/v300FinalPhysicalStabilization.test.ts
- TEST_NAME: VYRON 3.0.0 final physical stabilization contracts updater rejects DMG execution and proves product version plus build revision after relaunch
- EXPECTED: SEE_ASSERTION_MESSAGE
- ACTUAL: SEE_ASSERTION_MESSAGE
- SOURCE_PATH: ROOT_CAUSE_PENDING
- RELATED_6_1_10_CHANGE: NONE_PROVEN — IDENTICAL TEST ALREADY FAILED AT SAFE_BASE
- CLASSIFICATION: D. UNRELATED_PREEXISTING_FAILURE
- ACTION: DO_NOT_MISLABEL_AS_6_1_10_REGRESSION; ROOT_CAUSE_REQUIRED_BEFORE_ANY_FIX
- ASSERTION_MESSAGE:

```text
AssertionError: expected 'import React,{useEffect,useLayoutEffe…' to contain 'POST_UPDATE_BUILD_MISMATCH'
    at src/v300FinalPhysicalStabilization.test.ts:90:15
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:155:11
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:752:26
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:1897:20
    at new Promise (<anonymous>)
    at runWithTimeout (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1863:10)
    at runTest (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1574:12)
    at processTicksAndRejections (node:internal/process/task_queues:103:5)
    at runSuite (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
    at runSuite (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
```

## FAILURE_ID: F024

- TEST_FILE: src/v300OauthPersistence.test.ts
- TEST_NAME: VYRON 3.0.0 OAuth persistence physical-blocker regression app version change is credential-neutral while launch recovery uses saved profiles without browser reconnect
- EXPECTED: SEE_ASSERTION_MESSAGE
- ACTUAL: SEE_ASSERTION_MESSAGE
- SOURCE_PATH: ROOT_CAUSE_PENDING
- RELATED_6_1_10_CHANGE: NONE_PROVEN — IDENTICAL TEST ALREADY FAILED AT SAFE_BASE
- CLASSIFICATION: D. UNRELATED_PREEXISTING_FAILURE
- ACTION: DO_NOT_MISLABEL_AS_6_1_10_REGRESSION; ROOT_CAUSE_REQUIRED_BEFORE_ANY_FIX
- ASSERTION_MESSAGE:

```text
AssertionError: expected 'import React,{useEffect,useLayoutEffe…' to contain 'oauthBootRecoveryStarted'
    at src/v300OauthPersistence.test.ts:33:15
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:155:11
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:752:26
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:1897:20
    at new Promise (<anonymous>)
    at runWithTimeout (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1863:10)
    at runTest (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1574:12)
    at processTicksAndRejections (node:internal/process/task_queues:103:5)
    at runSuite (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
    at runSuite (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
```

## FAILURE_ID: F025

- TEST_FILE: src/v300OauthPersistence.test.ts
- TEST_NAME: VYRON 3.0.0 OAuth persistence physical-blocker regression post-update health restores saved profiles before reporting OAuth state and never opens browser
- EXPECTED: SEE_ASSERTION_MESSAGE
- ACTUAL: SEE_ASSERTION_MESSAGE
- SOURCE_PATH: ROOT_CAUSE_PENDING
- RELATED_6_1_10_CHANGE: NONE_PROVEN — IDENTICAL TEST ALREADY FAILED AT SAFE_BASE
- CLASSIFICATION: D. UNRELATED_PREEXISTING_FAILURE
- ACTION: DO_NOT_MISLABEL_AS_6_1_10_REGRESSION; ROOT_CAUSE_REQUIRED_BEFORE_ANY_FIX
- ASSERTION_MESSAGE:

```text
AssertionError: expected ';\n      if(!raw&&!legacy)return;\n  …' to contain 'api.youtubeGoogleConfig()'
    at src/v300OauthPersistence.test.ts:53:18
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:155:11
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:752:26
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:1897:20
    at new Promise (<anonymous>)
    at runWithTimeout (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1863:10)
    at runTest (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1574:12)
    at processTicksAndRejections (node:internal/process/task_queues:103:5)
    at runSuite (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
    at runSuite (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
```

## FAILURE_ID: F026

- TEST_FILE: src/v300PublisherUiContracts.test.ts
- TEST_NAME: VYRON 3.0.0 Publisher/UI contracts normal Publisher auto-materializes unmatched current fingerprints without YouTube-ID gate
- EXPECTED: SEE_ASSERTION_MESSAGE
- ACTUAL: SEE_ASSERTION_MESSAGE
- SOURCE_PATH: ROOT_CAUSE_PENDING
- RELATED_6_1_10_CHANGE: NONE_PROVEN — IDENTICAL TEST ALREADY FAILED AT SAFE_BASE
- CLASSIFICATION: D. UNRELATED_PREEXISTING_FAILURE
- ACTION: DO_NOT_MISLABEL_AS_6_1_10_REGRESSION; ROOT_CAUSE_REQUIRED_BEFORE_ANY_FIX
- ASSERTION_MESSAGE:

```text
AssertionError: expected 'import React,{useEffect,useMemo,useRe…' to contain 'const currentCandidates=rows.filter(r…'
    at src/v300PublisherUiContracts.test.ts:26:13
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:155:11
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:752:26
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:1897:20
    at new Promise (<anonymous>)
    at runWithTimeout (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1863:10)
    at runTest (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1574:12)
    at processTicksAndRejections (node:internal/process/task_queues:103:5)
    at runSuite (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
    at runSuite (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
```

## FAILURE_ID: F027

- TEST_FILE: src/v300PublisherUiContracts.test.ts
- TEST_NAME: VYRON 3.0.0 Publisher/UI contracts Select All includes only canonical eligible NEW rows and Select None clears selection
- EXPECTED: SEE_ASSERTION_MESSAGE
- ACTUAL: SEE_ASSERTION_MESSAGE
- SOURCE_PATH: ROOT_CAUSE_PENDING
- RELATED_6_1_10_CHANGE: NONE_PROVEN — IDENTICAL TEST ALREADY FAILED AT SAFE_BASE
- CLASSIFICATION: D. UNRELATED_PREEXISTING_FAILURE
- ACTION: DO_NOT_MISLABEL_AS_6_1_10_REGRESSION; ROOT_CAUSE_REQUIRED_BEFORE_ANY_FIX
- ASSERTION_MESSAGE:

```text
AssertionError: expected 'import React,{useEffect,useMemo,useRe…' to contain 'const selectableJobs=useMemo(()=>sour…'
    at src/v300PublisherUiContracts.test.ts:10:13
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:155:11
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:752:26
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:1897:20
    at new Promise (<anonymous>)
    at runWithTimeout (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1863:10)
    at runTest (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1574:12)
    at processTicksAndRejections (node:internal/process/task_queues:103:5)
    at runSuite (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
    at runSuite (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
```

## FAILURE_ID: F028

- TEST_FILE: src/v300PublisherUiContracts.test.ts
- TEST_NAME: VYRON 3.0.0 Publisher/UI contracts shows fingerprint generation evidence and never fixes selection by forcing checkboxes
- EXPECTED: SEE_ASSERTION_MESSAGE
- ACTUAL: SEE_ASSERTION_MESSAGE
- SOURCE_PATH: ROOT_CAUSE_PENDING
- RELATED_6_1_10_CHANGE: NONE_PROVEN — IDENTICAL TEST ALREADY FAILED AT SAFE_BASE
- CLASSIFICATION: D. UNRELATED_PREEXISTING_FAILURE
- ACTION: DO_NOT_MISLABEL_AS_6_1_10_REGRESSION; ROOT_CAUSE_REQUIRED_BEFORE_ANY_FIX
- ASSERTION_MESSAGE:

```text
AssertionError: expected 'import React,{useEffect,useMemo,useRe…' to contain 'disabled={!fresh||busy}'
    at src/v300PublisherUiContracts.test.ts:21:13
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:155:11
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:752:26
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:1897:20
    at new Promise (<anonymous>)
    at runWithTimeout (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1863:10)
    at runTest (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1574:12)
    at processTicksAndRejections (node:internal/process/task_queues:103:5)
    at runSuite (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
    at runSuite (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
```

## FAILURE_ID: F029

- TEST_FILE: src/v300PublisherUiContracts.test.ts
- TEST_NAME: VYRON 3.0.0 Publisher/UI contracts uses one canonical structured changelog source with factual 3.0.0 entry
- EXPECTED: SEE_ASSERTION_MESSAGE
- ACTUAL: SEE_ASSERTION_MESSAGE
- SOURCE_PATH: ROOT_CAUSE_PENDING
- RELATED_6_1_10_CHANGE: NONE_PROVEN — IDENTICAL TEST ALREADY FAILED AT SAFE_BASE
- CLASSIFICATION: D. UNRELATED_PREEXISTING_FAILURE
- ACTION: DO_NOT_MISLABEL_AS_6_1_10_REGRESSION; ROOT_CAUSE_REQUIRED_BEFORE_ANY_FIX
- ASSERTION_MESSAGE:

```text
AssertionError: expected 'import React,{useEffect,useState} fro…' to contain '<ReleaseHistoryTimeline/>'
    at src/v300PublisherUiContracts.test.ts:54:20
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:155:11
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:752:26
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:1897:20
    at new Promise (<anonymous>)
    at runWithTimeout (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1863:10)
    at runTest (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1574:12)
    at processTicksAndRejections (node:internal/process/task_queues:103:5)
    at runSuite (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
    at runSuite (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
```

## FAILURE_ID: F030

- TEST_FILE: src/v310ProductConsolidation.test.ts
- TEST_NAME: VYRON 3.1 product consolidation contracts keeps Shorts removed and one shared channel context
- EXPECTED: SEE_ASSERTION_MESSAGE
- ACTUAL: SEE_ASSERTION_MESSAGE
- SOURCE_PATH: ROOT_CAUSE_PENDING
- RELATED_6_1_10_CHANGE: NONE_PROVEN — IDENTICAL TEST ALREADY FAILED AT SAFE_BASE
- CLASSIFICATION: D. UNRELATED_PREEXISTING_FAILURE
- ACTION: DO_NOT_MISLABEL_AS_6_1_10_REGRESSION; ROOT_CAUSE_REQUIRED_BEFORE_ANY_FIX
- ASSERTION_MESSAGE:

```text
AssertionError: expected 'import React,{useEffect,useRef,useSta…' to contain '<YouTubeChannelBar/>'
    at src/v310ProductConsolidation.test.ts:10:144
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:155:11
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:752:26
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:1897:20
    at new Promise (<anonymous>)
    at runWithTimeout (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1863:10)
    at runTest (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1574:12)
    at processTicksAndRejections (node:internal/process/task_queues:103:5)
    at runSuite (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
    at runSuite (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
```

## FAILURE_ID: F031

- TEST_FILE: src/v310ProductConsolidation.test.ts
- TEST_NAME: VYRON 3.1 product consolidation contracts removes static sidebar updater card and provides branded update UI
- EXPECTED: SEE_ASSERTION_MESSAGE
- ACTUAL: SEE_ASSERTION_MESSAGE
- SOURCE_PATH: ROOT_CAUSE_PENDING
- RELATED_6_1_10_CHANGE: NONE_PROVEN — IDENTICAL TEST ALREADY FAILED AT SAFE_BASE
- CLASSIFICATION: D. UNRELATED_PREEXISTING_FAILURE
- ACTION: DO_NOT_MISLABEL_AS_6_1_10_REGRESSION; ROOT_CAUSE_REQUIRED_BEFORE_ANY_FIX
- ASSERTION_MESSAGE:

```text
AssertionError: expected 'import React,{useMemo,useState} from …' to contain '../src-tauri/icons/icon.png'
    at src/v310ProductConsolidation.test.ts:11:241
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:155:11
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:752:26
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:1897:20
    at new Promise (<anonymous>)
    at runWithTimeout (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1863:10)
    at runTest (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1574:12)
    at processTicksAndRejections (node:internal/process/task_queues:103:5)
    at runSuite (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
    at runSuite (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
```

## FAILURE_ID: F032

- TEST_FILE: src/v320HistoryUx.test.ts
- TEST_NAME: VYRON 3.2 history and navigation UX backfills the complete public VYRON journey from 0.5.0
- EXPECTED: SEE_ASSERTION_MESSAGE
- ACTUAL: SEE_ASSERTION_MESSAGE
- SOURCE_PATH: ROOT_CAUSE_PENDING
- RELATED_6_1_10_CHANGE: NONE_PROVEN — IDENTICAL TEST ALREADY FAILED AT SAFE_BASE
- CLASSIFICATION: D. UNRELATED_PREEXISTING_FAILURE
- ACTION: DO_NOT_MISLABEL_AS_6_1_10_REGRESSION; ROOT_CAUSE_REQUIRED_BEFORE_ANY_FIX
- ASSERTION_MESSAGE:

```text
AssertionError: expected '6.1.0' to be '6.0.1' // Object.is equality
    at src/v320HistoryUx.test.ts:10:42
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:155:11
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:752:26
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:1897:20
    at new Promise (<anonymous>)
    at runWithTimeout (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1863:10)
    at runTest (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1574:12)
    at processTicksAndRejections (node:internal/process/task_queues:103:5)
    at runSuite (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
    at runSuite (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
```

## FAILURE_ID: F033

- TEST_FILE: src/v321PhysicalPatch.test.ts
- TEST_NAME: VYRON 3.2.1 physical regression patch forces full readable sidebar labels and defeats legacy 17px span width
- EXPECTED: SEE_ASSERTION_MESSAGE
- ACTUAL: SEE_ASSERTION_MESSAGE
- SOURCE_PATH: ROOT_CAUSE_PENDING
- RELATED_6_1_10_CHANGE: NONE_PROVEN — IDENTICAL TEST ALREADY FAILED AT SAFE_BASE
- CLASSIFICATION: D. UNRELATED_PREEXISTING_FAILURE
- ACTION: DO_NOT_MISLABEL_AS_6_1_10_REGRESSION; ROOT_CAUSE_REQUIRED_BEFORE_ANY_FIX
- ASSERTION_MESSAGE:

```text
AssertionError: expected '/* VYRON 3.1.1 — FINAL GLOBAL UI LAYO…' to contain 'width:228px!important'
    at src/v321PhysicalPatch.test.ts:34:15
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:155:11
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:752:26
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:1897:20
    at new Promise (<anonymous>)
    at runWithTimeout (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1863:10)
    at runTest (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1574:12)
    at processTicksAndRejections (node:internal/process/task_queues:103:5)
    at runSuite (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
    at runSuite (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
```

## FAILURE_ID: F034

- TEST_FILE: src/v333DocxScheduleTimeSource.test.ts
- TEST_NAME: VYRON 3.3.3 real DOCX schedule/time-source acceptance Publisher UI exposes minimal file/common time source controls and keeps dry-run error separation
- EXPECTED: SEE_ASSERTION_MESSAGE
- ACTUAL: SEE_ASSERTION_MESSAGE
- SOURCE_PATH: ROOT_CAUSE_PENDING
- RELATED_6_1_10_CHANGE: NONE_PROVEN — IDENTICAL TEST ALREADY FAILED AT SAFE_BASE
- CLASSIFICATION: D. UNRELATED_PREEXISTING_FAILURE
- ACTION: DO_NOT_MISLABEL_AS_6_1_10_REGRESSION; ROOT_CAUSE_REQUIRED_BEFORE_ANY_FIX
- ASSERTION_MESSAGE:

```text
AssertionError: expected 'import React,{useEffect,useMemo,useRe…' to contain 'Время берётся отдельно из метаданных …'
    at src/v333DocxScheduleTimeSource.test.ts:120:14
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:155:11
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:752:26
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:1897:20
    at new Promise (<anonymous>)
    at runWithTimeout (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1863:10)
    at runTest (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1574:12)
    at processTicksAndRejections (node:internal/process/task_queues:103:5)
    at runSuite (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
    at runSuite (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
```

## FAILURE_ID: F035

- TEST_FILE: src/v334LiveInventorySafety.test.ts
- TEST_NAME: VYRON 3.3.4 live inventory safety contracts sidebar keeps Запас видео before YouTube, exposes History, and shows the inventory badge
- EXPECTED: SEE_ASSERTION_MESSAGE
- ACTUAL: SEE_ASSERTION_MESSAGE
- SOURCE_PATH: ROOT_CAUSE_PENDING
- RELATED_6_1_10_CHANGE: NONE_PROVEN — IDENTICAL TEST ALREADY FAILED AT SAFE_BASE
- CLASSIFICATION: D. UNRELATED_PREEXISTING_FAILURE
- ACTION: DO_NOT_MISLABEL_AS_6_1_10_REGRESSION; ROOT_CAUSE_REQUIRED_BEFORE_ANY_FIX
- ASSERTION_MESSAGE:

```text
AssertionError: expected -1 to be greater than 6413
    at src/v334LiveInventorySafety.test.ts:40:19
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:155:11
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:752:26
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:1897:20
    at new Promise (<anonymous>)
    at runWithTimeout (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1863:10)
    at runTest (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1574:12)
    at processTicksAndRejections (node:internal/process/task_queues:103:5)
    at runSuite (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
    at runSuite (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
```

## FAILURE_ID: F036

- TEST_FILE: src/v400BlackScreenGuard.test.ts
- TEST_NAME: VYRON 4.0.0 black-screen regression guard makes runway background persistence failures non-fatal
- EXPECTED: SEE_ASSERTION_MESSAGE
- ACTUAL: SEE_ASSERTION_MESSAGE
- SOURCE_PATH: ROOT_CAUSE_PENDING
- RELATED_6_1_10_CHANGE: NONE_PROVEN — IDENTICAL TEST ALREADY FAILED AT SAFE_BASE
- CLASSIFICATION: D. UNRELATED_PREEXISTING_FAILURE
- ACTION: DO_NOT_MISLABEL_AS_6_1_10_REGRESSION; ROOT_CAUSE_REQUIRED_BEFORE_ANY_FIX
- ASSERTION_MESSAGE:

```text
AssertionError: expected 'import type {Channel,YoutubeExistingV…' to contain 'try{if(storage)storage.setItem'
    at src/v400BlackScreenGuard.test.ts:36:19
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:155:11
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:752:26
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:1897:20
    at new Promise (<anonymous>)
    at runWithTimeout (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1863:10)
    at runTest (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1574:12)
    at processTicksAndRejections (node:internal/process/task_queues:103:5)
    at runSuite (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
    at runSuite (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
```

## FAILURE_ID: F037

- TEST_FILE: src/v400DashboardTruth.test.ts
- TEST_NAME: VYRON 4.0.0 dashboard truth separation dashboard treats missing subscriber data as unavailable, not zero
- EXPECTED: SEE_ASSERTION_MESSAGE
- ACTUAL: SEE_ASSERTION_MESSAGE
- SOURCE_PATH: ROOT_CAUSE_PENDING
- RELATED_6_1_10_CHANGE: NONE_PROVEN — IDENTICAL TEST ALREADY FAILED AT SAFE_BASE
- CLASSIFICATION: D. UNRELATED_PREEXISTING_FAILURE
- ACTION: DO_NOT_MISLABEL_AS_6_1_10_REGRESSION; ROOT_CAUSE_REQUIRED_BEFORE_ANY_FIX
- ASSERTION_MESSAGE:

```text
AssertionError: expected 'import React,{useEffect,useMemo,useSt…' to contain 'subscriberValues.length?fmt(subscribe…'
    at src/v400DashboardTruth.test.ts:45:22
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:155:11
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:752:26
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:1897:20
    at new Promise (<anonymous>)
    at runWithTimeout (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1863:10)
    at runTest (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1574:12)
    at processTicksAndRejections (node:internal/process/task_queues:103:5)
    at runSuite (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
    at runSuite (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
```

## FAILURE_ID: F038

- TEST_FILE: src/v400DashboardTruth.test.ts
- TEST_NAME: VYRON 4.0.0 dashboard truth separation does not use public channel videoCount as owner total
- EXPECTED: SEE_ASSERTION_MESSAGE
- ACTUAL: SEE_ASSERTION_MESSAGE
- SOURCE_PATH: ROOT_CAUSE_PENDING
- RELATED_6_1_10_CHANGE: NONE_PROVEN — IDENTICAL TEST ALREADY FAILED AT SAFE_BASE
- CLASSIFICATION: D. UNRELATED_PREEXISTING_FAILURE
- ACTION: DO_NOT_MISLABEL_AS_6_1_10_REGRESSION; ROOT_CAUSE_REQUIRED_BEFORE_ANY_FIX
- ASSERTION_MESSAGE:

```text
AssertionError: expected 'import React,{useEffect,useMemo,useSt…' to contain 'OWNER-ВИДЕО'
    at src/v400DashboardTruth.test.ts:18:22
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:155:11
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:752:26
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:1897:20
    at new Promise (<anonymous>)
    at runWithTimeout (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1863:10)
    at runTest (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1574:12)
    at processTicksAndRejections (node:internal/process/task_queues:103:5)
    at runSuite (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
    at runSuite (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
```

## FAILURE_ID: F039

- TEST_FILE: src/v400DashboardTruth.test.ts
- TEST_NAME: VYRON 4.0.0 dashboard truth separation smart scheduler reuses cache and does not refresh on every page transition
- EXPECTED: SEE_ASSERTION_MESSAGE
- ACTUAL: SEE_ASSERTION_MESSAGE
- SOURCE_PATH: ROOT_CAUSE_PENDING
- RELATED_6_1_10_CHANGE: NONE_PROVEN — IDENTICAL TEST ALREADY FAILED AT SAFE_BASE
- CLASSIFICATION: D. UNRELATED_PREEXISTING_FAILURE
- ACTION: DO_NOT_MISLABEL_AS_6_1_10_REGRESSION; ROOT_CAUSE_REQUIRED_BEFORE_ANY_FIX
- ASSERTION_MESSAGE:

```text
AssertionError: expected 'import React from \'react\';\n\n// VY…' to contain 'setTimeout(run,2500)'
    at src/v400DashboardTruth.test.ts:33:22
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:155:11
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:752:26
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:1897:20
    at new Promise (<anonymous>)
    at runWithTimeout (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1863:10)
    at runTest (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1574:12)
    at processTicksAndRejections (node:internal/process/task_queues:103:5)
    at runSuite (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
    at runSuite (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
```

## FAILURE_ID: F040

- TEST_FILE: src/v401Hotfix.test.ts
- TEST_NAME: VYRON 4.0.1 hotfix contract has one consistent 4.0.1 runtime identity
- EXPECTED: SEE_ASSERTION_MESSAGE
- ACTUAL: SEE_ASSERTION_MESSAGE
- SOURCE_PATH: ROOT_CAUSE_PENDING
- RELATED_6_1_10_CHANGE: NONE_PROVEN — IDENTICAL TEST ALREADY FAILED AT SAFE_BASE
- CLASSIFICATION: D. UNRELATED_PREEXISTING_FAILURE
- ACTION: DO_NOT_MISLABEL_AS_6_1_10_REGRESSION; ROOT_CAUSE_REQUIRED_BEFORE_ANY_FIX
- ASSERTION_MESSAGE:

```text
AssertionError: expected '6.1.9' to be '4.0.1' // Object.is equality
    at src/v401Hotfix.test.ts:8:54
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:155:11
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:752:26
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:1897:20
    at new Promise (<anonymous>)
    at runWithTimeout (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1863:10)
    at runTest (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1574:12)
    at processTicksAndRejections (node:internal/process/task_queues:103:5)
    at runSuite (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
    at runSuite (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
```

## FAILURE_ID: F041

- TEST_FILE: src/v401Hotfix.test.ts
- TEST_NAME: VYRON 4.0.1 hotfix contract keeps global History as a real journal, not a second fake store
- EXPECTED: SEE_ASSERTION_MESSAGE
- ACTUAL: SEE_ASSERTION_MESSAGE
- SOURCE_PATH: ROOT_CAUSE_PENDING
- RELATED_6_1_10_CHANGE: NONE_PROVEN — IDENTICAL TEST ALREADY FAILED AT SAFE_BASE
- CLASSIFICATION: D. UNRELATED_PREEXISTING_FAILURE
- ACTION: DO_NOT_MISLABEL_AS_6_1_10_REGRESSION; ROOT_CAUSE_REQUIRED_BEFORE_ANY_FIX
- ASSERTION_MESSAGE:

```text
AssertionError: expected 'import React,{useEffect,useLayoutEffe…' to contain 'label:\'История\''
    at src/v401Hotfix.test.ts:45:17
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:155:11
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:752:26
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:1897:20
    at new Promise (<anonymous>)
    at runWithTimeout (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1863:10)
    at runTest (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1574:12)
    at processTicksAndRejections (node:internal/process/task_queues:103:5)
    at runSuite (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
    at runSuite (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
```

## FAILURE_ID: F042

- TEST_FILE: src/v401Hotfix.test.ts
- TEST_NAME: VYRON 4.0.1 hotfix contract removes render scan state-write storms and blocking state saves
- EXPECTED: SEE_ASSERTION_MESSAGE
- ACTUAL: SEE_ASSERTION_MESSAGE
- SOURCE_PATH: ROOT_CAUSE_PENDING
- RELATED_6_1_10_CHANGE: NONE_PROVEN — IDENTICAL TEST ALREADY FAILED AT SAFE_BASE
- CLASSIFICATION: D. UNRELATED_PREEXISTING_FAILURE
- ACTION: DO_NOT_MISLABEL_AS_6_1_10_REGRESSION; ROOT_CAUSE_REQUIRED_BEFORE_ANY_FIX
- ASSERTION_MESSAGE:

```text
AssertionError: expected 'import { create } from \'zustand\';\n…' to contain 'SAVE_DEBOUNCE_MS=550'
    at src/v401Hotfix.test.ts:26:19
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:155:11
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:752:26
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:1897:20
    at new Promise (<anonymous>)
    at runWithTimeout (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1863:10)
    at runTest (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1574:12)
    at processTicksAndRejections (node:internal/process/task_queues:103:5)
    at runSuite (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
    at runSuite (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
```

## FAILURE_ID: F043

- TEST_FILE: src/v401HotfixContract.test.ts
- TEST_NAME: VYRON 4.0.1 hotfix contract keeps the new History shortcut global and separate from OAuth state
- EXPECTED: SEE_ASSERTION_MESSAGE
- ACTUAL: SEE_ASSERTION_MESSAGE
- SOURCE_PATH: ROOT_CAUSE_PENDING
- RELATED_6_1_10_CHANGE: NONE_PROVEN — IDENTICAL TEST ALREADY FAILED AT SAFE_BASE
- CLASSIFICATION: D. UNRELATED_PREEXISTING_FAILURE
- ACTION: DO_NOT_MISLABEL_AS_6_1_10_REGRESSION; ROOT_CAUSE_REQUIRED_BEFORE_ANY_FIX
- ASSERTION_MESSAGE:

```text
AssertionError: expected 'import React,{useEffect,useLayoutEffe…' to contain 'label:\'История\''
    at src/v401HotfixContract.test.ts:18:17
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:155:11
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:752:26
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:1897:20
    at new Promise (<anonymous>)
    at runWithTimeout (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1863:10)
    at runTest (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1574:12)
    at processTicksAndRejections (node:internal/process/task_queues:103:5)
    at runSuite (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
    at runSuite (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
```

## FAILURE_ID: F044

- TEST_FILE: src/v401HotfixContract.test.ts
- TEST_NAME: VYRON 4.0.1 hotfix contract uses 4.0.1 as the hotfix runtime identity
- EXPECTED: SEE_ASSERTION_MESSAGE
- ACTUAL: SEE_ASSERTION_MESSAGE
- SOURCE_PATH: ROOT_CAUSE_PENDING
- RELATED_6_1_10_CHANGE: NONE_PROVEN — IDENTICAL TEST ALREADY FAILED AT SAFE_BASE
- CLASSIFICATION: D. UNRELATED_PREEXISTING_FAILURE
- ACTION: DO_NOT_MISLABEL_AS_6_1_10_REGRESSION; ROOT_CAUSE_REQUIRED_BEFORE_ANY_FIX
- ASSERTION_MESSAGE:

```text
AssertionError: expected 'export const VYRON_MAJOR_VERSION=\'6.…' to contain 'VYRON_MAJOR_VERSION=\'4.0.1\''
    at src/v401HotfixContract.test.ts:47:19
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:155:11
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:752:26
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:1897:20
    at new Promise (<anonymous>)
    at runWithTimeout (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1863:10)
    at runTest (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1574:12)
    at processTicksAndRejections (node:internal/process/task_queues:103:5)
    at runSuite (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
    at runSuite (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
```

## FAILURE_ID: F045

- TEST_FILE: src/v500Contract.test.ts
- TEST_NAME: VYRON 5.0.0 product contract has a canonical 5.0 major candidate plus the real production chain
- EXPECTED: SEE_ASSERTION_MESSAGE
- ACTUAL: SEE_ASSERTION_MESSAGE
- SOURCE_PATH: ROOT_CAUSE_PENDING
- RELATED_6_1_10_CHANGE: NONE_PROVEN — IDENTICAL TEST ALREADY FAILED AT SAFE_BASE
- CLASSIFICATION: D. UNRELATED_PREEXISTING_FAILURE
- ACTION: DO_NOT_MISLABEL_AS_6_1_10_REGRESSION; ROOT_CAUSE_REQUIRED_BEFORE_ANY_FIX
- ASSERTION_MESSAGE:

```text
AssertionError: expected '6.1.0' to be '5.0.0' // Object.is equality
    at src/v500Contract.test.ts:58:41
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:155:11
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:752:26
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:1897:20
    at new Promise (<anonymous>)
    at runWithTimeout (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1863:10)
    at runTest (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1574:12)
    at processTicksAndRejections (node:internal/process/task_queues:103:5)
    at runSuite (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
    at runSuite (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
```

## FAILURE_ID: F046

- TEST_FILE: src/v500Contract.test.ts
- TEST_NAME: VYRON 5.0.0 product contract protects the first two minutes from heavy owner inventory refresh
- EXPECTED: SEE_ASSERTION_MESSAGE
- ACTUAL: SEE_ASSERTION_MESSAGE
- SOURCE_PATH: ROOT_CAUSE_PENDING
- RELATED_6_1_10_CHANGE: NONE_PROVEN — IDENTICAL TEST ALREADY FAILED AT SAFE_BASE
- CLASSIFICATION: D. UNRELATED_PREEXISTING_FAILURE
- ACTION: DO_NOT_MISLABEL_AS_6_1_10_REGRESSION; ROOT_CAUSE_REQUIRED_BEFORE_ANY_FIX
- ASSERTION_MESSAGE:

```text
AssertionError: expected 0 to be greater than or equal to 120000
    at src/v500Contract.test.ts:46:47
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:155:11
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:752:26
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:1897:20
    at new Promise (<anonymous>)
    at runWithTimeout (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1863:10)
    at runTest (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1574:12)
    at processTicksAndRejections (node:internal/process/task_queues:103:5)
    at runSuite (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
    at runSuite (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
```

## FAILURE_ID: F047

- TEST_FILE: src/v500Contract.test.ts
- TEST_NAME: VYRON 5.0.0 product contract uses one 5.0.0 product identity without changing the bundle id
- EXPECTED: SEE_ASSERTION_MESSAGE
- ACTUAL: SEE_ASSERTION_MESSAGE
- SOURCE_PATH: ROOT_CAUSE_PENDING
- RELATED_6_1_10_CHANGE: NONE_PROVEN — IDENTICAL TEST ALREADY FAILED AT SAFE_BASE
- CLASSIFICATION: D. UNRELATED_PREEXISTING_FAILURE
- ACTION: DO_NOT_MISLABEL_AS_6_1_10_REGRESSION; ROOT_CAUSE_REQUIRED_BEFORE_ANY_FIX
- ASSERTION_MESSAGE:

```text
AssertionError: expected '6.0.0' to be '5.0.0' // Object.is equality
    at src/v500Contract.test.ts:32:31
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:155:11
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:752:26
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:1897:20
    at new Promise (<anonymous>)
    at runWithTimeout (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1863:10)
    at runTest (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1574:12)
    at processTicksAndRejections (node:internal/process/task_queues:103:5)
    at runSuite (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
    at runSuite (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
```

## FAILURE_ID: F048

- TEST_FILE: src/v501OwnerHotfix.test.ts
- TEST_NAME: VYRON 5.0.1 owner hotfix contract pins owner profile and Local Core in one sidebar footer
- EXPECTED: SEE_ASSERTION_MESSAGE
- ACTUAL: SEE_ASSERTION_MESSAGE
- SOURCE_PATH: ROOT_CAUSE_PENDING
- RELATED_6_1_10_CHANGE: NONE_PROVEN — IDENTICAL TEST ALREADY FAILED AT SAFE_BASE
- CLASSIFICATION: D. UNRELATED_PREEXISTING_FAILURE
- ACTION: DO_NOT_MISLABEL_AS_6_1_10_REGRESSION; ROOT_CAUSE_REQUIRED_BEFORE_ANY_FIX
- ASSERTION_MESSAGE:

```text
AssertionError: expected ':root{font-family:Inter,-apple-system…' to contain '.sidebarFooter{flex:0 0 auto;margin-t…'
    at src/v501OwnerHotfix.test.ts:92:18
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:155:11
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:752:26
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:1897:20
    at new Promise (<anonymous>)
    at runWithTimeout (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1863:10)
    at runTest (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1574:12)
    at processTicksAndRejections (node:internal/process/task_queues:103:5)
    at runSuite (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
    at runSuite (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
```

## FAILURE_ID: F049

- TEST_FILE: src/v501OwnerHotfix.test.ts
- TEST_NAME: VYRON 5.0.1 owner hotfix contract removes automatic statistics inventory and processing polling
- EXPECTED: SEE_ASSERTION_MESSAGE
- ACTUAL: SEE_ASSERTION_MESSAGE
- SOURCE_PATH: ROOT_CAUSE_PENDING
- RELATED_6_1_10_CHANGE: NONE_PROVEN — IDENTICAL TEST ALREADY FAILED AT SAFE_BASE
- CLASSIFICATION: D. UNRELATED_PREEXISTING_FAILURE
- ACTION: DO_NOT_MISLABEL_AS_6_1_10_REGRESSION; ROOT_CAUSE_REQUIRED_BEFORE_ANY_FIX
- ASSERTION_MESSAGE:

```text
AssertionError: expected 'import React,{useEffect} from \'react…' not to contain 'setInterval'
    at src/v501OwnerHotfix.test.ts:40:33
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:155:11
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:752:26
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:1897:20
    at new Promise (<anonymous>)
    at runWithTimeout (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1863:10)
    at runTest (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1574:12)
    at processTicksAndRejections (node:internal/process/task_queues:103:5)
    at runSuite (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
    at runSuite (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
```

## FAILURE_ID: F050

- TEST_FILE: src/v502FullRefresh.test.ts
- TEST_NAME: VYRON 5.0.2 full refresh hotfix complete owner sync immediately updates the runway store instead of leaving stale plan data
- EXPECTED: SEE_ASSERTION_MESSAGE
- ACTUAL: SEE_ASSERTION_MESSAGE
- SOURCE_PATH: ROOT_CAUSE_PENDING
- RELATED_6_1_10_CHANGE: NONE_PROVEN — IDENTICAL TEST ALREADY FAILED AT SAFE_BASE
- CLASSIFICATION: D. UNRELATED_PREEXISTING_FAILURE
- ACTION: DO_NOT_MISLABEL_AS_6_1_10_REGRESSION; ROOT_CAUSE_REQUIRED_BEFORE_ANY_FIX
- ASSERTION_MESSAGE:

```text
AssertionError: expected 'import {api} from \'./api\';\nimport …' to contain 'upsertChannelRunwayFromYoutube(channe…'
    at src/v502FullRefresh.test.ts:50:19
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:155:11
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:752:26
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:1897:20
    at new Promise (<anonymous>)
    at runWithTimeout (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1863:10)
    at runTest (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1574:12)
    at processTicksAndRejections (node:internal/process/task_queues:103:5)
    at runSuite (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
    at runSuite (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
```

## FAILURE_ID: F051

- TEST_FILE: src/v502FullRefresh.test.ts
- TEST_NAME: VYRON 5.0.2 full refresh hotfix keeps 9 scheduled and 30 local ready separate
- EXPECTED: SEE_ASSERTION_MESSAGE
- ACTUAL: SEE_ASSERTION_MESSAGE
- SOURCE_PATH: ROOT_CAUSE_PENDING
- RELATED_6_1_10_CHANGE: NONE_PROVEN — IDENTICAL TEST ALREADY FAILED AT SAFE_BASE
- CLASSIFICATION: D. UNRELATED_PREEXISTING_FAILURE
- ACTION: DO_NOT_MISLABEL_AS_6_1_10_REGRESSION; ROOT_CAUSE_REQUIRED_BEFORE_ANY_FIX
- ASSERTION_MESSAGE:

```text
AssertionError: expected 30 to be 9 // Object.is equality
    at src/v502FullRefresh.test.ts:67:36
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:155:11
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:752:26
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:1897:20
    at new Promise (<anonymous>)
    at runWithTimeout (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1863:10)
    at runTest (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1574:12)
    at processTicksAndRejections (node:internal/process/task_queues:103:5)
    at runSuite (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
    at runSuite (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
```

## FAILURE_ID: F052

- TEST_FILE: src/v502FullRefresh.test.ts
- TEST_NAME: VYRON 5.0.2 full refresh hotfix refresh-all uses one pipeline for stats, owner schedule and zero-quota local render scan
- EXPECTED: SEE_ASSERTION_MESSAGE
- ACTUAL: SEE_ASSERTION_MESSAGE
- SOURCE_PATH: ROOT_CAUSE_PENDING
- RELATED_6_1_10_CHANGE: NONE_PROVEN — IDENTICAL TEST ALREADY FAILED AT SAFE_BASE
- CLASSIFICATION: D. UNRELATED_PREEXISTING_FAILURE
- ACTION: DO_NOT_MISLABEL_AS_6_1_10_REGRESSION; ROOT_CAUSE_REQUIRED_BEFORE_ANY_FIX
- ASSERTION_MESSAGE:

```text
AssertionError: expected 'import {useApp} from \'./store\';\nim…' to contain 'refreshStaleOwnerInventories(enabled,…'
    at src/v502FullRefresh.test.ts:44:22
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:155:11
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:752:26
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:1897:20
    at new Promise (<anonymous>)
    at runWithTimeout (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1863:10)
    at runTest (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1574:12)
    at processTicksAndRejections (node:internal/process/task_queues:103:5)
    at runSuite (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
    at runSuite (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
```

## FAILURE_ID: F053

- TEST_FILE: src/v502FullRefresh.test.ts
- TEST_NAME: VYRON 5.0.2 full refresh hotfix uses 5.0.2 build identity without changing release feeds
- EXPECTED: SEE_ASSERTION_MESSAGE
- ACTUAL: SEE_ASSERTION_MESSAGE
- SOURCE_PATH: ROOT_CAUSE_PENDING
- RELATED_6_1_10_CHANGE: NONE_PROVEN — IDENTICAL TEST ALREADY FAILED AT SAFE_BASE
- CLASSIFICATION: D. UNRELATED_PREEXISTING_FAILURE
- ACTION: DO_NOT_MISLABEL_AS_6_1_10_REGRESSION; ROOT_CAUSE_REQUIRED_BEFORE_ANY_FIX
- ASSERTION_MESSAGE:

```text
AssertionError: expected '6.1.9' to be '5.0.2' // Object.is equality
    at src/v502FullRefresh.test.ts:31:33
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:155:11
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:752:26
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:1897:20
    at new Promise (<anonymous>)
    at runWithTimeout (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1863:10)
    at runTest (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1574:12)
    at processTicksAndRejections (node:internal/process/task_queues:103:5)
    at runSuite (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
    at runSuite (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
```

## FAILURE_ID: F054

- TEST_FILE: src/v510MaterialsManager.test.ts
- TEST_NAME: VYRON 6.0.1 Materials Manager contract preserves legacy imports as fallback without migrating or deleting existing projects
- EXPECTED: SEE_ASSERTION_MESSAGE
- ACTUAL: SEE_ASSERTION_MESSAGE
- SOURCE_PATH: ROOT_CAUSE_PENDING
- RELATED_6_1_10_CHANGE: NONE_PROVEN — IDENTICAL TEST ALREADY FAILED AT SAFE_BASE
- CLASSIFICATION: D. UNRELATED_PREEXISTING_FAILURE
- ACTION: DO_NOT_MISLABEL_AS_6_1_10_REGRESSION; ROOT_CAUSE_REQUIRED_BEFORE_ANY_FIX
- ASSERTION_MESSAGE:

```text
AssertionError: expected 'use chrono::Utc;\nuse crate::{materia…' to contain 'Legacy Import Session keeps its old a…'
    at src/v510MaterialsManager.test.ts:82:28
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:155:11
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:752:26
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:1897:20
    at new Promise (<anonymous>)
    at runWithTimeout (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1863:10)
    at runTest (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1574:12)
    at processTicksAndRejections (node:internal/process/task_queues:103:5)
    at runSuite (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
    at runSuite (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
```

## FAILURE_ID: F055

- TEST_FILE: src/v510MaterialsManager.test.ts
- TEST_NAME: VYRON 6.0.1 Materials Manager contract uses one 6.0.1 application identity without changing updater endpoints
- EXPECTED: SEE_ASSERTION_MESSAGE
- ACTUAL: SEE_ASSERTION_MESSAGE
- SOURCE_PATH: ROOT_CAUSE_PENDING
- RELATED_6_1_10_CHANGE: NONE_PROVEN — IDENTICAL TEST ALREADY FAILED AT SAFE_BASE
- CLASSIFICATION: D. UNRELATED_PREEXISTING_FAILURE
- ACTION: DO_NOT_MISLABEL_AS_6_1_10_REGRESSION; ROOT_CAUSE_REQUIRED_BEFORE_ANY_FIX
- ASSERTION_MESSAGE:

```text
AssertionError: expected '6.1.9' to be '6.0.1' // Object.is equality
    at src/v510MaterialsManager.test.ts:16:25
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:155:11
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:752:26
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:1897:20
    at new Promise (<anonymous>)
    at runWithTimeout (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1863:10)
    at runTest (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1574:12)
    at processTicksAndRejections (node:internal/process/task_queues:103:5)
    at runSuite (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
    at runSuite (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
```

## FAILURE_ID: F056

- TEST_FILE: src/v512ManualAssembly.test.ts
- TEST_NAME: VYRON 6.0.1 manual assembly additive contract keeps 6.0.1 identity and existing updater endpoints
- EXPECTED: SEE_ASSERTION_MESSAGE
- ACTUAL: SEE_ASSERTION_MESSAGE
- SOURCE_PATH: ROOT_CAUSE_PENDING
- RELATED_6_1_10_CHANGE: NONE_PROVEN — IDENTICAL TEST ALREADY FAILED AT SAFE_BASE
- CLASSIFICATION: D. UNRELATED_PREEXISTING_FAILURE
- ACTION: DO_NOT_MISLABEL_AS_6_1_10_REGRESSION; ROOT_CAUSE_REQUIRED_BEFORE_ANY_FIX
- ASSERTION_MESSAGE:

```text
AssertionError: expected '6.1.9' to be '6.0.1' // Object.is equality
    at src/v512ManualAssembly.test.ts:14:25
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:155:11
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:752:26
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:1897:20
    at new Promise (<anonymous>)
    at runWithTimeout (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1863:10)
    at runTest (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1574:12)
    at processTicksAndRejections (node:internal/process/task_queues:103:5)
    at runSuite (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
    at runSuite (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
```

## FAILURE_ID: F057

- TEST_FILE: src/v601WindowsHotfix.test.ts
- TEST_NAME: VYRON 6.0.1 Windows migration/UI hotfix contracts anchors owner and LOCAL CORE as one sidebar footer group
- EXPECTED: SEE_ASSERTION_MESSAGE
- ACTUAL: SEE_ASSERTION_MESSAGE
- SOURCE_PATH: ROOT_CAUSE_PENDING
- RELATED_6_1_10_CHANGE: NONE_PROVEN — IDENTICAL TEST ALREADY FAILED AT SAFE_BASE
- CLASSIFICATION: D. UNRELATED_PREEXISTING_FAILURE
- ACTION: DO_NOT_MISLABEL_AS_6_1_10_REGRESSION; ROOT_CAUSE_REQUIRED_BEFORE_ANY_FIX
- ASSERTION_MESSAGE:

```text
AssertionError: expected ':root{font-family:Inter,-apple-system…' to contain '.sidebar .sidebarFooter'
    at src/v601WindowsHotfix.test.ts:26:20
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:155:11
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:752:26
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:1897:20
    at new Promise (<anonymous>)
    at runWithTimeout (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1863:10)
    at runTest (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1574:12)
    at processTicksAndRejections (node:internal/process/task_queues:103:5)
    at runSuite (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
    at runSuite (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
```

## FAILURE_ID: F058

- TEST_FILE: src/v601WindowsHotfix.test.ts
- TEST_NAME: VYRON 6.0.1 Windows migration/UI hotfix contracts shows actual runtime version in the history while retaining canonical history
- EXPECTED: SEE_ASSERTION_MESSAGE
- ACTUAL: SEE_ASSERTION_MESSAGE
- SOURCE_PATH: ROOT_CAUSE_PENDING
- RELATED_6_1_10_CHANGE: NONE_PROVEN — IDENTICAL TEST ALREADY FAILED AT SAFE_BASE
- CLASSIFICATION: D. UNRELATED_PREEXISTING_FAILURE
- ACTION: DO_NOT_MISLABEL_AS_6_1_10_REGRESSION; ROOT_CAUSE_REQUIRED_BEFORE_ANY_FIX
- ASSERTION_MESSAGE:

```text
AssertionError: expected '6.1.0' to be '6.0.1' // Object.is equality
    at src/v601WindowsHotfix.test.ts:42:43
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:155:11
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:752:26
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:1897:20
    at new Promise (<anonymous>)
    at runWithTimeout (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1863:10)
    at runTest (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1574:12)
    at processTicksAndRejections (node:internal/process/task_queues:103:5)
    at runSuite (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
    at runSuite (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
```

## FAILURE_ID: F059

- TEST_FILE: src/v610M1RoutePerformance.test.ts
- TEST_NAME: VYRON 6.1.0 M1 route pacing hotfix YouTube has no hidden heavy keepalive or activation-timer commit train
- EXPECTED: SEE_ASSERTION_MESSAGE
- ACTUAL: SEE_ASSERTION_MESSAGE
- SOURCE_PATH: ROOT_CAUSE_PENDING
- RELATED_6_1_10_CHANGE: NONE_PROVEN — IDENTICAL TEST ALREADY FAILED AT SAFE_BASE
- CLASSIFICATION: D. UNRELATED_PREEXISTING_FAILURE
- ACTION: DO_NOT_MISLABEL_AS_6_1_10_REGRESSION; ROOT_CAUSE_REQUIRED_BEFORE_ANY_FIX
- ASSERTION_MESSAGE:

```text
AssertionError: expected 'import React,{useEffect,useMemo,useRe…' to contain 'PublisherOSLightController'
    at src/v610M1RoutePerformance.test.ts:43:21
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:155:11
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:752:26
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:1897:20
    at new Promise (<anonymous>)
    at runWithTimeout (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1863:10)
    at runTest (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1574:12)
    at processTicksAndRejections (node:internal/process/task_queues:103:5)
    at runSuite (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
    at runSuite (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
```

## FAILURE_ID: F060

- TEST_FILE: src/v611ChannelRunwayInventoryHotfix.test.ts
- TEST_NAME: VYRON 6.1.1 Channel Runway inventory hotfix Lumière real-shape fixture has 20 total, 15 scheduled and scheduled-through 2026-10-18
- EXPECTED: SEE_ASSERTION_MESSAGE
- ACTUAL: SEE_ASSERTION_MESSAGE
- SOURCE_PATH: ROOT_CAUSE_PENDING
- RELATED_6_1_10_CHANGE: NONE_PROVEN — IDENTICAL TEST ALREADY FAILED AT SAFE_BASE
- CLASSIFICATION: D. UNRELATED_PREEXISTING_FAILURE
- ACTION: DO_NOT_MISLABEL_AS_6_1_10_REGRESSION; ROOT_CAUSE_REQUIRED_BEFORE_ANY_FIX
- ASSERTION_MESSAGE:

```text
AssertionError: expected 7 to be 15 // Object.is equality
    at src/v611ChannelRunwayInventoryHotfix.test.ts:87:35
    at processTicksAndRejections (node:internal/process/task_queues:103:5)
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:752:20
```

## FAILURE_ID: F061

- TEST_FILE: src/v612RealMacUpdaterHotfix.test.ts
- TEST_NAME: VYRON 6.1.2 real mac updater hotfix keeps updater identity and signing endpoints unchanged while version is 6.1.4
- EXPECTED: SEE_ASSERTION_MESSAGE
- ACTUAL: SEE_ASSERTION_MESSAGE
- SOURCE_PATH: ROOT_CAUSE_PENDING
- RELATED_6_1_10_CHANGE: NONE_PROVEN — IDENTICAL TEST ALREADY FAILED AT SAFE_BASE
- CLASSIFICATION: D. UNRELATED_PREEXISTING_FAILURE
- ACTION: DO_NOT_MISLABEL_AS_6_1_10_REGRESSION; ROOT_CAUSE_REQUIRED_BEFORE_ANY_FIX
- ASSERTION_MESSAGE:

```text
AssertionError: expected '6.1.9' to be '6.1.4' // Object.is equality
    at src/v612RealMacUpdaterHotfix.test.ts:81:26
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:155:11
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:752:26
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:1897:20
    at new Promise (<anonymous>)
    at runWithTimeout (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1863:10)
    at runTest (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1574:12)
    at processTicksAndRejections (node:internal/process/task_queues:103:5)
    at runSuite (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
    at runSuite (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
```

## FAILURE_ID: F062

- TEST_FILE: src/vyron619PublisherAlwaysOpen.test.tsx
- TEST_NAME: VYRON 6.1.9 Publisher core sections are always open cold mount renders all six working sections with zero clicks, including empty Recovery
- EXPECTED: SEE_ASSERTION_MESSAGE
- ACTUAL: SEE_ASSERTION_MESSAGE
- SOURCE_PATH: ROOT_CAUSE_PENDING
- RELATED_6_1_10_CHANGE: NONE_PROVEN — IDENTICAL TEST ALREADY FAILED AT SAFE_BASE
- CLASSIFICATION: D. UNRELATED_PREEXISTING_FAILURE
- ACTION: DO_NOT_MISLABEL_AS_6_1_10_REGRESSION; ROOT_CAUSE_REQUIRED_BEFORE_ANY_FIX
- ASSERTION_MESSAGE:

```text
Error: Cannot find package 'react-test-renderer' imported from 'src/vyron619PublisherAlwaysOpen.test.tsx'
    at VitestExecutor._fetchModule (file://node_modules/vite-node/dist/client.mjs:247:19)
    at processTicksAndRejections (node:internal/process/task_queues:103:5)
    at VitestExecutor.directRequest (file://node_modules/vite-node/dist/client.mjs:268:44)
    at VitestExecutor.cachedRequest (file://node_modules/vite-node/dist/client.mjs:189:11)
    at VitestExecutor.dependencyRequest (file://node_modules/vite-node/dist/client.mjs:239:10)
    at src/vyron619PublisherAlwaysOpen.test.tsx:49:22
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:752:20
```

## FAILURE_ID: F063

- TEST_FILE: src/vyron619PublisherAlwaysOpen.test.tsx
- TEST_NAME: VYRON 6.1.9 Publisher core sections are always open top controls cannot hide any core section
- EXPECTED: SEE_ASSERTION_MESSAGE
- ACTUAL: SEE_ASSERTION_MESSAGE
- SOURCE_PATH: ROOT_CAUSE_PENDING
- RELATED_6_1_10_CHANGE: NONE_PROVEN — IDENTICAL TEST ALREADY FAILED AT SAFE_BASE
- CLASSIFICATION: D. UNRELATED_PREEXISTING_FAILURE
- ACTION: DO_NOT_MISLABEL_AS_6_1_10_REGRESSION; ROOT_CAUSE_REQUIRED_BEFORE_ANY_FIX
- ASSERTION_MESSAGE:

```text
Error: Cannot find package 'react-test-renderer' imported from 'src/vyron619PublisherAlwaysOpen.test.tsx'
    at VitestExecutor._fetchModule (file://node_modules/vite-node/dist/client.mjs:247:19)
    at processTicksAndRejections (node:internal/process/task_queues:103:5)
    at VitestExecutor.directRequest (file://node_modules/vite-node/dist/client.mjs:268:44)
    at VitestExecutor.cachedRequest (file://node_modules/vite-node/dist/client.mjs:189:11)
    at VitestExecutor.dependencyRequest (file://node_modules/vite-node/dist/client.mjs:239:10)
    at src/vyron619PublisherAlwaysOpen.test.tsx:61:22
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:752:20
```

## FAILURE_ID: F064

- TEST_FILE: src/youtubeInventoryRc4.test.ts
- TEST_NAME: RC4 authoritative YouTube inventory keeps channel inventories isolated across restart-style cache reload
- EXPECTED: SEE_ASSERTION_MESSAGE
- ACTUAL: SEE_ASSERTION_MESSAGE
- SOURCE_PATH: ROOT_CAUSE_PENDING
- RELATED_6_1_10_CHANGE: NONE_PROVEN — IDENTICAL TEST ALREADY FAILED AT SAFE_BASE
- CLASSIFICATION: D. UNRELATED_PREEXISTING_FAILURE
- ACTION: DO_NOT_MISLABEL_AS_6_1_10_REGRESSION; ROOT_CAUSE_REQUIRED_BEFORE_ANY_FIX
- ASSERTION_MESSAGE:

```text
AssertionError: expected [] to have a length of 166 but got +0
    at Proxy.<anonymous> (file://node_modules/@vitest/expect/dist/index.js:1257:20)
    at Proxy.<anonymous> (file://node_modules/@vitest/expect/dist/index.js:1029:14)
    at Proxy.methodWrapper (file://node_modules/chai/index.js:1686:25)
    at src/youtubeInventoryRc4.test.ts:72:51
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:155:11
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:752:26
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:1897:20
    at new Promise (<anonymous>)
    at runWithTimeout (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1863:10)
    at runTest (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1574:12)
```

## FAILURE_ID: F065

- TEST_FILE: src/youtubeInventoryRc4.test.ts
- TEST_NAME: RC4 authoritative YouTube inventory partial 152/166 sync never overwrites the previous 166 authoritative baseline
- EXPECTED: SEE_ASSERTION_MESSAGE
- ACTUAL: SEE_ASSERTION_MESSAGE
- SOURCE_PATH: ROOT_CAUSE_PENDING
- RELATED_6_1_10_CHANGE: NONE_PROVEN — IDENTICAL TEST ALREADY FAILED AT SAFE_BASE
- CLASSIFICATION: D. UNRELATED_PREEXISTING_FAILURE
- ACTION: DO_NOT_MISLABEL_AS_6_1_10_REGRESSION; ROOT_CAUSE_REQUIRED_BEFORE_ANY_FIX
- ASSERTION_MESSAGE:

```text
AssertionError: expected [] to have a length of 166 but got +0
    at Proxy.<anonymous> (file://node_modules/@vitest/expect/dist/index.js:1257:20)
    at Proxy.<anonymous> (file://node_modules/@vitest/expect/dist/index.js:1029:14)
    at Proxy.methodWrapper (file://node_modules/chai/index.js:1686:25)
    at src/youtubeInventoryRc4.test.ts:47:51
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:155:11
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:752:26
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:1897:20
    at new Promise (<anonymous>)
    at runWithTimeout (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1863:10)
    at runTest (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1574:12)
```

## FAILURE_ID: F066

- TEST_FILE: src/youtubeInventoryRc4.test.ts
- TEST_NAME: RC4 authoritative YouTube inventory schedule derives latest future publishAt from full baseline, not current subset
- EXPECTED: SEE_ASSERTION_MESSAGE
- ACTUAL: SEE_ASSERTION_MESSAGE
- SOURCE_PATH: ROOT_CAUSE_PENDING
- RELATED_6_1_10_CHANGE: NONE_PROVEN — IDENTICAL TEST ALREADY FAILED AT SAFE_BASE
- CLASSIFICATION: D. UNRELATED_PREEXISTING_FAILURE
- ACTION: DO_NOT_MISLABEL_AS_6_1_10_REGRESSION; ROOT_CAUSE_REQUIRED_BEFORE_ANY_FIX
- ASSERTION_MESSAGE:

```text
AssertionError: expected +0 to be 5 // Object.is equality
    at src/youtubeInventoryRc4.test.ts:63:32
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:155:11
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:752:26
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:1897:20
    at new Promise (<anonymous>)
    at runWithTimeout (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1863:10)
    at runTest (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1574:12)
    at processTicksAndRejections (node:internal/process/task_queues:103:5)
    at runSuite (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
    at runSuite (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
```

## FAILURE_ID: F067

- TEST_FILE: tests/materials-freeze-regression.test.mjs
- TEST_NAME: VYRON 6.0.2 Materials freeze regression gates does not introduce Google, OAuth or YouTube calls into Materials UI
- EXPECTED: SEE_ASSERTION_MESSAGE
- ACTUAL: SEE_ASSERTION_MESSAGE
- SOURCE_PATH: ROOT_CAUSE_PENDING
- RELATED_6_1_10_CHANGE: NONE_PROVEN — IDENTICAL TEST ALREADY FAILED AT SAFE_BASE
- CLASSIFICATION: D. UNRELATED_PREEXISTING_FAILURE
- ACTION: DO_NOT_MISLABEL_AS_6_1_10_REGRESSION; ROOT_CAUSE_REQUIRED_BEFORE_ANY_FIX
- ASSERTION_MESSAGE:

```text
AssertionError: expected 'import React,{useEffect,useMemo,useRe…' not to match /oauth|client_secret|refresh_token|yo…/i
    at tests/materials-freeze-regression.test.mjs:42:27
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:155:11
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:752:26
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:1897:20
    at new Promise (<anonymous>)
    at runWithTimeout (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1863:10)
    at runTest (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1574:12)
    at processTicksAndRejections (node:internal/process/task_queues:103:5)
    at runSuite (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
    at runSuite (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
```

## FAILURE_ID: F068

- TEST_FILE: tests/vyron-602-manual-production-sidebar.test.mjs
- TEST_NAME: VYRON 6.0.2 manual Production restore honors explicit image reuse for both legacy and Materials Library sources
- EXPECTED: SEE_ASSERTION_MESSAGE
- ACTUAL: SEE_ASSERTION_MESSAGE
- SOURCE_PATH: ROOT_CAUSE_PENDING
- RELATED_6_1_10_CHANGE: NONE_PROVEN — IDENTICAL TEST ALREADY FAILED AT SAFE_BASE
- CLASSIFICATION: D. UNRELATED_PREEXISTING_FAILURE
- ACTION: DO_NOT_MISLABEL_AS_6_1_10_REGRESSION; ROOT_CAUSE_REQUIRED_BEFORE_ANY_FIX
- ASSERTION_MESSAGE:

```text
AssertionError: expected 'use chrono::Utc;\nuse crate::{materia…' to contain 'material_images[i % material_images.l…'
    at tests/vyron-602-manual-production-sidebar.test.mjs:40:21
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:155:11
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:752:26
    at file://node_modules/@vitest/runner/dist/chunk-hooks.js:1897:20
    at new Promise (<anonymous>)
    at runWithTimeout (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1863:10)
    at runTest (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1574:12)
    at processTicksAndRejections (node:internal/process/task_queues:103:5)
    at runSuite (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
    at runSuite (file://node_modules/@vitest/runner/dist/chunk-hooks.js:1729:8)
```
