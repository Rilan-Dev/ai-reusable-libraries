# Prompt 05 — UI and interaction discovery

Inventory all UI surfaces that expose or support each capability: routes, navigation, pages, drawers, dialogs, forms, settings, status views, empty/loading/error/success states, validation, disabled states, permission-denied states, confirmations, destructive actions and recovery flows.

Trace UI action -> client state/query -> API/action -> domain service -> persistence/external side effect -> returned status -> UI state. Include shared design components and localization/accessibility dependencies. Record screenshot/evidence references where available; do not fabricate visual evidence. UI reference copies remain immutable and separate from re-themed host UI.
