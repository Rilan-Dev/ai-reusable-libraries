# Extraction tools

## Package structure check
From this directory, run:

```sh
npm run check
```

This validates required agent files, parses JSON schema documents, and checks relative Markdown links. It does not verify any upstream source extraction.

## Immutable source verifier
Run with Node.js 20+ and a local checkout of the exact upstream repository:

```sh
node tools/verify-extraction.mjs \
  --source /path/to/upstream-checkout \
  --package /path/to/extraction-package \
  --manifest /path/to/immutable-source-manifest.json
```

The manifest must pin `source_commit`, `source_root_tree`, and `target_root`. Each entry in `files` must provide `path` (relative to target_root), `source_path` (relative to the upstream checkout at the pinned commit), `blob_sha`, `mode`, and `type`. Optional `trees` entries assert tree object hashes.

The verifier checks pinned commit/root tree, source blob and mode, extracted byte hashes, symlinks, optional tree hashes, and missing/extra paths under the immutable root. It does not prove functional equivalence, capability completeness, dependency closure, license compliance, or host integration correctness; those need their own evidence and gates.

## Tests
Run:

```sh
npm test
```

Fixture tests create a temporary Git repository and cover exact file/symlink copies, extra files, and modified bytes.
