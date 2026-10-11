# VYRON 6.1.10 — SAFE BASE ↔ DEV REGRESSION MATRIX

| Metric | Safe base | Dev without finalizer |
|---|---:|---:|
| Total | 1072 | 1083 |
| Passed | 1006 | 1017 |
| Failed | 66 | 66 |
| Pending | 0 | 0 |

- SAFE_BASE: `588e2070877512daa637077223c678af6a216831`
- DEV_HEAD: `b26c6ae719aff3d81ad06e4adf83513eb5e9934f`
- CURRENT_DEV_FAILURES_ALREADY_FAILING_AT_SAFE_BASE: 66
- CURRENT_DEV_FAILURES_NOT_FAILING_AT_SAFE_BASE: 0
- AUTO_CLASSIFIED_D_PREEXISTING: 66
- REMAINING_E_UNKNOWN: 0
- OFFICIAL_CI_RENDER_HARNESS: INSTALLED
- FINALIZER_APPLIED: NO
- PRODUCT_MUTATION: NO
- CANDIDATE_BUILD: NO

A failure is classified D only when the exact test file + test name also fails at the immutable proven 6.1.9 safe base. All newly failing dev tests remain E.UNKNOWN until source-level root cause establishes A, B, or C.
