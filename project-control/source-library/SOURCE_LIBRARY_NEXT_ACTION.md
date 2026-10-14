# Source Library Next Action

1. Review the global architecture PR and confirm the root catalog, source registry, and global-vs-source-specific boundary.
2. Verify that MailFlow's product records are present under `mailflow-source-library/` while generic extraction prompts remain canonical under `source-extraction-agent/`.
3. Run `node mailflow-source-library/tools/verify-inventory.mjs` in a real checkout and record exact output; test the generalized upstream watcher by manual dispatch.
4. Continue MailFlow architecture/capability tracing, license/provenance classification and dependency closure; all 1,319 file dispositions currently remain unclassified.
5. Confirm source pins for Doable and Clara from their manifests before enabling automated monitoring for those upstreams.
6. Do not copy MailFlow application source or promote its baseline until closure, license review, independent reconciliation and exact-copy verification gates pass.
