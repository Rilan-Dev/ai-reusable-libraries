# Remote Extraction Audit — 2026-09-29

Repository: `Rilan-Dev/Doable`  
Branch: `ai-platform-core-extraction`  
Captured source commit: `a6036d1fd6dca83c08ee5affa141e5c85e45f5af`

## Findings

- The branch contains the complete captured `ai-platform-core/` tree.
- The provenance manifest contains 799 file records, 121 directory trees and 92 captured root trees.
- The 799 provenance blob SHAs match the extraction tree when the three `destinationPath`-only records are normalized.
- One stale directory fingerprint was found: `doable-source/mcp-servers/presentation-builder` was recorded as `0bc2bcdc6b75cfba6c102e7bd3d2c1d3db1210f6`, while the source commit and extraction tree both resolve to `c51d5e561faf0b86f15f849c86c24848b28b1e2e`.
- The verifier's full-root “extra file” inventory compared a partial provenance file list with every captured file, so it could flag valid captured files as false positives.
- The hardening/completeness reports lagged the second-pass extension extraction.
- The provenance audit also exposed one missing extracted blob: `doable-source/services/api/src/visual-edit-bridge-inline.ts`; it has now been restored from the captured source commit with the expected SHA `020f97a976d086f354af81cdf9e9c585c9ad58e8`.

## Hardening performed

- Normalize `destinationPath`-only provenance records.
- Correct the presentation-builder tree fingerprint.
- Synchronize provenance/hardening/completeness counts.
- Make captured tree SHA checks authoritative for complete scopes.
- Remove the false-positive full-root inventory rule.
- Validate the full current capability set, including MCP tool servers, visual AI editing, visual editing, platform extensions and AI media builders.
- Record the RAG architecture and root-cause findings.
- Restore the missing visual-edit bridge blob and re-check the 799-file provenance set.

## Verification boundary

This is a GitHub API/source audit, not a local Node runtime/build execution. The fixed verifier must still run locally, followed by target-project import/build/integration smoke tests.
