# Decisions

- Use a dedicated source-extraction-agent/ package rather than mixing extraction policy into application-specific source.
- Preserve the existing parent project-control folder; inspect and reuse its conventions rather than overwriting it.
- Treat source discovery, dependency closure, exact-copy integrity, and package readiness as separate gates.
- Keep immutable upstream source separate from generated contracts, adapters, manifests, reports and prompts.
- Keep upstream target-specific findings in per-extraction records, not in generic skills.
