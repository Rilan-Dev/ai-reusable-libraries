# Source Library — Next Action

1. Keep `source-extraction-agent/` as the canonical reusable framework for every source.
2. MailFlow-specific records are being moved into `Rilan-Dev/mailflow/extraction/`; see https://github.com/Rilan-Dev/mailflow/pull/3. Do not maintain duplicate MailFlow memories, sessions, manifests or project-control here.
3. After the MailFlow workspace PR merges, update the catalog to enable URL-backed monitoring of `maathimself/mailflow` using the pin URL in `SOURCE_LIBRARY_CATALOG.json`, then manually dispatch and verify the watcher.
4. Continue MailFlow capability/dependency closure and path-level license/provenance review in the MailFlow repository. All 1,319 blobs remain unclassified; no source copy is authorized.
5. Reconcile Doable and Clara source pins before enabling their monitoring.
6. Do not copy or promote any source snapshot until evidence-backed gates pass and the owner explicitly authorizes it.

The global library is a framework and catalog, not the home for source-specific work history.
