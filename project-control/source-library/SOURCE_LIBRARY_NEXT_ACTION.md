# Source Library Next Action

1. Review and merge the MailFlow workspace migration PR only when explicitly authorized: https://github.com/Rilan-Dev/mailflow/pull/2.
2. Keep `source-extraction-agent/` as the canonical shared framework; MailFlow-specific state belongs in [MailFlow `extraction/`](https://github.com/Rilan-Dev/mailflow/tree/main/extraction/).
3. Run `node extraction/tools/verify-inventory.mjs` from a real MailFlow checkout after PR #2 is merged and record the exact output. Structural API checks are not a substitute for running the verifier.
4. Continue MailFlow architecture/capability tracing, licensing/provenance classification and dependency closure; all 1,319 file dispositions remain unclassified. Do not copy upstream application source or promote the pin until the required gates and explicit authorization pass.
5. Keep MailFlow external watching disabled until the generic watcher supports reading source pins from other repositories without relying on local `library_path` files.
6. Confirm canonical source pins for Doable and Clara before enabling monitoring for them.
