# AI Platform Core — UI/UX Reference Extraction

The UI/UX reference layer is intentionally separate from the immutable backend source snapshot.

## Rule

These are **reference implementations and information-architecture evidence**, not a mandate to copy Doable styling. Future hosts should adapt the interaction model to their own design system, branding, layout and navigation.

## Captured reference areas

- AI/provider settings: `apps/web/src/modules/ai-settings`
- Integrations: `apps/web/src/modules/integrations`
- Skills and skills/rules management: `apps/web/src/modules/skills`
- Settings, MCP, project settings and configuration dialogs: `apps/web/src/modules/settings`
- Workspace settings and knowledge UI: `apps/web/src/app/(dashboard)/workspace-settings`
- AI settings pages/setup flows: `apps/web/src/app/(dashboard)/ai-settings`

Original source tree objects are reused without modification.

## UX inventory

The reference layer covers provider cards/wizards, model configuration, connection testing, integration catalog/cards/detail sheets/connect dialogs/OAuth, MCP server forms/cards, skills picker/panel/slash autocomplete, rules management, workspace knowledge, project configuration, database panes, setup wizard steps, and related dialogs.

## Product extraction principle

For every capability, future hosts should preserve the user-facing state model:

- discovery
- configuration
- validation
- connected/active state
- permissions
- details
- editing
- retry/reconnect
- destructive confirmation
- loading
- empty
- error
- success
- audit/status feedback

Only the host's theme, navigation, spacing, typography, color, component library and layout should vary.

## Backlog

Before declaring the reusable platform complete, perform a screen-by-screen inventory of these reference areas and map each screen/dialog to its corresponding host-neutral capability contract. Do not modify these captured reference sources.
## Second-pass reusable product UI reference

Additional immutable UI source is preserved under `doable-source-extensions/ui-platform/` and related editor/collaboration trees. It covers:

- realtime collaboration: presence, cursors, activity, team chat, AI chat sync, preview/file sync and visual-edit collaboration;
- visual AI editing: selection, property panels, inline edits and design comments;
- planning/clarification cards and progress states;
- build/runtime/version/restore/diff editor surfaces;
- admin audit and trace investigation surfaces;
- billing, credits, usage and plan surfaces;
- marketplace discovery/listing/install/report/moderation surfaces;
- authentication/settings/workspace configuration;
- GitHub connect/import/sync/deployment toolbar flows;
- analytics, security and deployment-related editor panels.

These are source-level interaction references, not merely screenshots. Future projects should reuse the state transitions and workflow structure while adapting the visual theme and host navigation.
