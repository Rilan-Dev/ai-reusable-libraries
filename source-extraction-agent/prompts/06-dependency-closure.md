# Prompt 06 — Recursive dependency closure

For each capability, resolve static imports and exports, aliases, dynamic imports, lazy loaders, registries, plugin discovery, reflection, file-based conventions, templates, generated code, assets, schemas, migrations, fixtures and runtime-loaded files.

Trace package/workspace and lockfile closure; environment variables and secrets; database and cache services; filesystem paths; network APIs; subprocesses, native binaries and OS assumptions; queues, schedulers, workers and IPC; tests needed to validate behavior. Classify each dependency as first-party copy, external package inventory, host adapter, external service, generated artifact or unresolved.

Use a worklist/fixed-point approach until no new first-party dependency is discovered. Report unresolved edges; never suppress them to make the gate green.
