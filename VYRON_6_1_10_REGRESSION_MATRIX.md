# VYRON 6.1.10 — SAFE BASE ↔ DEV REGRESSION MATRIX

| Metric | Safe base | Dev without finalizer |
|---|---:|---:|
| Total | 1072 | 1083 |
| Passed | 1004 | 1015 |
| Failed | 68 | 68 |
| Pending | 0 | 0 |

- SAFE_BASE: `588e2070877512daa637077223c678af6a216831`
- DEV_HEAD: `fb5a74b26deab7201206ebd3754f9fc73a0392ad`
- CURRENT_DEV_FAILURES_ALREADY_FAILING_AT_SAFE_BASE: 68
- CURRENT_DEV_FAILURES_NOT_FAILING_AT_SAFE_BASE: 0
- AUTO_CLASSIFIED_D_PREEXISTING: 68
- REMAINING_E_UNKNOWN: 0
- FINALIZER_APPLIED: NO
- PRODUCT_MUTATION: NO
- CANDIDATE_BUILD: NO

A failure is classified D only when the exact test file + test name also fails at the immutable proven 6.1.9 safe base. All newly failing dev tests remain E.UNKNOWN until source-level root cause establishes A, B, or C.
