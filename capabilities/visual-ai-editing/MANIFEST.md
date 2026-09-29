# Visual AI Editing Capability

## Purpose
Reusable editor interaction model for selecting rendered UI, inspecting properties, applying visual edits, annotating designs and coordinating changes with AI.

## Immutable source
- `doable-source/apps/web/src/modules/editor/visual-edit/`
- `doable-source/apps/web/src/modules/editor/runtime-render/`
- `doable-source/apps/web/src/modules/editor/context-files/`
- `doable-source/apps/web/src/modules/editor/build/`

## Behavior
- Preview iframe bridge.
- Element selection and inspection.
- Property panels.
- Visual edit toolbar.
- Sticky notes/design annotations.
- Runtime project module graph collection.
- Isolated runtime sandbox preview.
- Context-file editing/selection.
- Build progress/log/step UI.

These are source and interaction references, not a mandate to copy Doable's application shell or visual theme.

## Host boundaries
Project/files API, preview/runtime hosting, authentication/tenant, editor routing/state and theme/design system.
