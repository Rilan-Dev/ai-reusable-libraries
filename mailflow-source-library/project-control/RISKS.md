# Risks

- License risk: AGPL-3.0 and a commercial license are both declared; reuse requires a deliberate license decision.
- Closure risk: capabilities may depend on migrations, callers, UI, tests, configs, plugins or platform packages outside obvious directories.
- Staleness risk: main can advance during discovery; reconfirm the pin at every phase.
- Integrity risk: summaries are not byte-level proof; use Git object SHAs and verifier output.
- Update risk: overwriting snapshots destroys auditability; version snapshots and append worklogs.
- Security risk: mail parsing, auth, SSRF/image proxy, cookies/CSRF, OAuth, IMAP/SMTP and notifications need explicit boundary review.
- Automation risk: polling can be delayed; manual dispatch is available. Do not promise instant alerts without source-side dispatch.
