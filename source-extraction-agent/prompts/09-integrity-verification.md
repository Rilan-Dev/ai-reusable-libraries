# Prompt 09 — Integrity verification

Run the verifier on a real checkout with the pinned source snapshot available. Capture exact command, environment, exit code, output, and artifact path.

Verify:
- source commit and root tree identity;
- every captured blob SHA and tree SHA;
- file modes, symlinks and executable metadata;
- required roots and all capability manifest paths;
- no missing or unexpected files inside immutable roots;
- dependency inventory matches a fresh recomputation;
- all candidates reconciled and closure has no unexplained first-party edges;
- contracts do not import immutable source;
- source trees were not changed by extraction tooling;
- provenance/license notices preserved.

Report PASS/FAIL/BLOCKED separately for discovery, closure, copy integrity and packaging. A source hash match alone does not prove capability completeness. Never claim PASS without machine evidence.
