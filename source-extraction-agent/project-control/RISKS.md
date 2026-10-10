# Risks

- R-001: Repository connector file access may be incomplete; never infer that an unavailable file is absent.
- R-002: Static import scanners miss dynamic/runtime-loaded code, data, subprocesses and external contracts.
- R-003: Product documentation can overstate implemented capability; source paths and tests are required.
- R-004: Git blob integrity does not prove behavioral completeness or legal redistribution rights.
- R-005: Generated contracts may accidentally leak host policy into immutable source; keep roots and imports separate.
- R-006: Concurrent agents may overwrite shared checkpoint files; serialize shared-state writes and append worklogs.
