# Capability: AI Platform UI/UX

Use the captured UI source as the implementation/reference inventory.

Primary trees:

- `ui-reference/apps/web/src/modules/ai-settings/`
- `ui-reference/apps/web/src/modules/integrations/`
- `ui-reference/apps/web/src/modules/skills/`
- `ui-reference/apps/web/src/modules/settings/`
- `ui-reference/apps/web/src/app/(dashboard)/workspace-settings/`
- `ui-reference/apps/web/src/app/(dashboard)/ai-settings/`

Agent/chat surfaces:

- `ui-reference/apps/web/src/modules/editor/chat/chat-panel.tsx`
- `ui-reference/apps/web/src/modules/editor/chat/chat-message.tsx`
- `ui-reference/apps/web/src/modules/editor/chat/tool-call-card.tsx`
- `ui-reference/apps/web/src/modules/editor/chat/user-input-card.tsx`
- `ui-reference/apps/web/src/modules/editor/hooks/use-editor-store.ts`
- `ui-reference/apps/web/src/app/(dashboard)/dashboard/dashboard-chat-input.tsx`

Use `UI_CAPABILITY_MATRIX.md` as the state/interaction checklist.

Do not reproduce Doable styling blindly. Reuse the interaction model and adapt to the target project's design system/navigation.

## Additional AI-enabling UI references

The immutable UI reference set now also includes:
- `ui-reference/apps/web/src/modules/collaboration/`
- `ui-reference/apps/web/src/modules/editor/visual-edit/`

These preserve collaborative AI chat synchronization, presence, Yjs/CRDT editor behavior, remote cursors, preview synchronization, visual-edit property panels, iframe bridging, and design-comment/sticky-note interactions. Host projects should preserve the interaction/state model while adapting styling and application identity.

