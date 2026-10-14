# Source Library Next Action

1. Confirm the MailFlow workspace migration PR is open and its source-specific records live in `Rilan-Dev/mailflow/extraction/`; do not recreate the MailFlow working inventory here.
2. Update the central catalog and remove the duplicate `mailflow-source-library/` workstream from this repository while retaining generic prompts and the cross-source catalog.
3. Keep MailFlow monitoring disabled until the watcher can safely fetch and validate the pin from the external MailFlow repository.
4. Continue MailFlow architecture/capability tracing, license/provenance classification and dependency closure in the MailFlow repository; all 1,319 file dispositions remain unclassified.
5. Confirm source pins for Doable and Clara from their manifests before enabling automated monitoring for those upstreams.
6. Run the MailFlow Node inventory verifier in a real checkout and record exact output; separately validate the central watcher by manual dispatch after external-pin support is implemented.
7. Do not copy MailFlow application source or promote its baseline until closure, license review, independent reconciliation and exact-copy verification gates pass.
