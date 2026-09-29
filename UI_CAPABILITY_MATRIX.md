# AI Platform Core — UI/UX Capability Matrix

Source of truth: the verified Doable UI reference tree at the captured source commit plus the explicitly captured editor/chat reference files. The reference implementation remains immutable and is not production UI.

## Coverage rule

The reusable core must preserve both **headless runtime behavior** and the **interaction model used to operate that runtime**. This includes agent conversations, streaming, thinking/tool events, tool results, blocking user-input requests, provider setup, integrations/OAuth, MCP management, skills/rules, knowledge/context, project/workspace settings, and recovery/confirmation states.

## State vocabulary

Every reusable screen should model these states where applicable: initial/loading, populated, empty, validation, saving/submitting, success, recoverable error, permission denied/restricted, disconnected/expired, destructive confirmation, retry/reconnect, and disabled/read-only.

| Area | Screen / surface | Verified Doable reference | Primary capability | Interaction/state coverage |
|---|---|---|---|---|
| Agent/chat | Editor chat panel | `apps/web/src/modules/editor/chat/chat-panel.tsx` | agents/chat | conversation; streaming; tool events; attachments; stop/retry; context |
| Agent/chat | Chat message renderer | `apps/web/src/modules/editor/chat/chat-message.tsx` | chat/streaming | text streaming; thinking; tool results; artifacts; copy; retry |
| Tools | Tool call card | `apps/web/src/modules/editor/chat/tool-call-card.tsx` | tools | call arguments; execution status; result; success/error; retry; expansion |
| Agent runtime | User-input card | `apps/web/src/modules/editor/chat/user-input-card.tsx` | agent/user-input | blocking question; choices; submit; resume same turn |
| Agent/chat | Editor state store | `apps/web/src/modules/editor/hooks/use-editor-store.ts` | chat/editor-state | active session; stream state; tool state; preview state |
| Chat | Dashboard chat input | `apps/web/src/app/(dashboard)/dashboard/dashboard-chat-input.tsx` | chat/voice-input | microphone; speech input; permission error; disabled state; send |
| AI settings | AI Settings shell | `apps/web/src/modules/ai-settings/components/ai-settings-page.tsx` | providers | workspace selection; tabs; loading; access restricted; role-gated tab |
| AI settings | Connections | `.../connections-tab.tsx` | providers/secrets | personal vs workspace scope; add; OAuth; token form; validate; remove; loading; empty; error; success |
| AI settings | Model configuration | `.../model-config-tab.tsx` | providers | source selection; model selection; workspace defaults; user overrides; save; saved feedback; loading |
| AI settings | Access Control | `.../access-control-tab.tsx` | providers/identity | enforce AI; enforced source/model; visibility control; save; saved feedback; loading |
| AI settings | Doable AI | `.../doable-ai-tab.tsx` | agents/providers | AI feature configuration; admin gating; persistence states |
| AI settings | Provider wizard | `.../provider-wizard.tsx` | providers/secrets | modal; choose/configure/validate/models; search/filter; scope; credential entry; validation; save; close/reset |
| AI settings | Provider card | `.../provider-card.tsx` | providers | connected/invalid state; test; actions; health feedback |
| Integrations | Catalog | `apps/web/src/modules/integrations/integration-catalog.tsx` | integrations | search; category filter; pagination; loading skeleton; error; connected/available sections; detail; connect |
| Integrations | Integration card | `.../integration-card.tsx` | integrations | connection status; connect/disconnect; action affordances |
| Integrations | Connect flow | `.../connect-flow.tsx` | integrations/secrets | OAuth; manual credentials; enhanced auth; permissions; validation; saving; success/error |
| Integrations | Connect dialog | `.../integration-connect-dialog.tsx` | integrations | in-editor connect; credential fields; validation; resume agent request |
| Integrations | Detail sheet | `.../integration-detail-sheet.tsx` | integrations | drawer; metadata; connection state; actions; close |
| MCP | MCP panel | `apps/web/src/modules/settings/components/mcp-panel.tsx` | mcp | list; refresh; active/inactive; reconnect; test; delete; loading; empty; error |
| MCP | Add server form | `.../mcp-add-server-form.tsx` | mcp/secrets | HTTP/stdio; auth; discovery; OAuth popup; validation; save; cancellation |
| Skills | Skills & Rules panel | `apps/web/src/modules/skills/skills-panel.tsx` | skills | scoped sections; expand/collapse; create; edit; delete; loading; empty; error |
| Skills | Skill picker popover | `.../skill-picker.tsx` | skills | portal popover; search; manual/auto invocation; no match; no configured skills; outside-click close |
| Skills | Skills rules settings | `.../skills-rules-panel.tsx` | skills | rule configuration; scope; edit/delete; persistence states |
| Workspace | Knowledge | `apps/web/src/app/(dashboard)/workspace-settings/workspace-knowledge.tsx` | context/rag | knowledge list; editor; create/update/delete; empty; save/error feedback |
| Project | Project settings | `apps/web/src/modules/settings/components/project-settings.tsx` | workspace/sandbox | configuration tabs; status; danger zone; destructive confirmation |
| Setup | AI provider setup | `apps/web/src/app/setup/steps/Step2AIProvider.tsx` | providers | setup wizard; provider selection; OAuth; credentials; model selection; saving; success/error; skip |
| Setup | Integrations/billing setup | `apps/web/src/app/setup/steps/Step4Integrations.tsx` | integrations | collapsible configuration; secrets visibility; save status; success/error; plan defaults |
| Dashboard | Project dialogs | `apps/web/src/app/(dashboard)/dashboard/dashboard-dialogs.tsx` | workspace | delete/bulk-delete; rename; move-folder; template preview/remix; GitHub import |

## Reusable UX state contract

1. **Loading:** preserve the user's context; show skeleton/spinner without replacing the entire navigation shell.
2. **Empty:** explain what the capability does and provide the primary creation/connect action.
3. **Validation:** keep entered values; identify the failing field or external connection; allow retry.
4. **Saving:** disable duplicate submission and show progress on the initiating control.
5. **Success:** provide immediate confirmation and refresh dependent lists/models.
6. **Error:** keep the surface open, preserve input, show a concise actionable message, and offer retry.
7. **Permission denied:** explain whether the capability is unavailable, feature-disabled, or role-restricted.
8. **Disconnected/expired:** distinguish recoverable reconnect from permanent removal.
9. **Destructive confirmation:** identify the exact target and state whether the operation is reversible.
10. **Read-only/disabled:** explain why the control is disabled rather than silently hiding the capability.
11. **Streaming:** preserve partial assistant output and tool status while the turn is active; do not replace a live conversation with a loading screen.
12. **Tool execution:** expose tool name/status/result/error distinctly from assistant prose.
13. **Agent blocking input:** when a tool requires a human choice, keep the same turn paused and resume it after the user responds.

## Host adaptation rules

- Keep capability and information architecture stable across hosts.
- Do not copy Doable's visual theme blindly.
- Map these surfaces into the host's existing navigation shell; do not create a competing sidebar.
- Preserve scope, permissions, status, and recovery interactions even when visual components are replaced.
- Keep backend adapters independent from UI components.

## Second-pass platform UX coverage

| Surface | Immutable source | Capability |
|---|---|---|
| Realtime collaboration | `doable-source-extensions/realtime-collaboration/` | collaboration/Yjs/presence/team chat/AI sync |
| Visual AI editing | `doable-source/apps/web/src/modules/editor/visual-edit/` + extension editor sources | visual editing/direct-save/design comments |
| Planning/clarification | `doable-source-extensions/editor/plan-ui/` | plan/clarification/user-input UX |
| Audit/trace | `doable-source-extensions/ui-platform/admin/`, audit/trace UI | audit/observability |
| Billing/usage | `doable-source-extensions/ui-platform/billing-page/`, usage page/module | billing/credits/usage/quotas |
| Marketplace | `doable-source-extensions/ui-platform/marketplace-*` | discovery/listing/install/report/moderation |
| Identity/settings | `doable-source-extensions/identity-rbac/web-auth/`, settings/workspace settings | auth/MFA/RBAC/configuration |
| GitHub/version/deploy | `doable-source-extensions/github/`, editor components/toolbar | import/sync/version/deploy |
| Analytics/security | `doable-source-extensions/editor/analytics-panels/`, security extension | product analytics/security controls |

The extension sources preserve the actual Doable interaction/state implementation; visual styling and host navigation remain adapter concerns.
