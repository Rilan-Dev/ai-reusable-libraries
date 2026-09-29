# Capability: Workspace, Processes and Sandbox

Inspect recursively:

- `doable-source/services/api/src/sandbox/`
- `dependency-closure/services/api/src/projects/`
- `dependency-closure/services/api/src/runtime/`
- `dependency-closure/services/api/src/frameworks/`
- `dependency-closure/services/api/src/git/`
- `dependency-closure/services/api/src/db/`
- `dependency-closure/packages/db/`
- `doable-source/packages/docore/`
- `doable-source/packages/dovault/`

Treat Linux/Windows isolation primitives, process execution, filesystem paths, Git, DB and credentials as host infrastructure boundaries. Do not weaken sandboxing merely to make a host integration compile.
