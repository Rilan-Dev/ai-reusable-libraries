# Source Closure Evidence Protocol

This protocol defines the next evidence layer for agents consuming Doable Source.

## Purpose

A capability manifest names important source/reference paths, but path presence is not proof of a complete runtime closure. Agents should progressively establish evidence from:

1. manifest-addressable seed paths;
2. relative source imports;
3. package/external imports;
4. database queries and migrations;
5. runtime services and environment variables;
6. authentication, tenant and security boundaries;
7. UI/state/event dependencies;
8. host adapters and infrastructure.

## Evidence levels

- manifest-addressable-files — concrete paths named by the authoritative manifest were found.
- local-import-closure — relative imports from the scanned source were resolved.
- partial-local-closure — at least one local import could not be resolved.
- runtime-closure-reviewed — runtime, persistence, security and host dependencies were explicitly reviewed.
- target-verified — the target project's tests/build/runtime/browser checks establish integration.

An agent must not treat an earlier level as proof of a later level.

## Immutable rule

Evidence collection must never modify:

- doable-source/**
- dependency-closure/**
- ui-reference/**

Evidence reports belong under verification/reports/.

## Current helper

agent-init/trace.mjs is the entry point reserved for this evidence workflow. Its current implementation is intentionally conservative and does not claim automatic source-level closure analysis.

Until the tracer is expanded and executed locally, agents must continue to perform explicit source/import/dependency tracing from the authoritative manifests.

## Required report fields

When a closure report is produced, record at minimum:

- capability ID;
- authoritative manifest path;
- concrete seed paths;
- scanned source files;
- resolved local imports;
- unresolved local imports;
- external/package imports;
- evidence level;
- limitations.

This protocol is evidence guidance, not a replacement for capability manifests or the extraction verifier.
