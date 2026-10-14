# Initial Architecture Map — MailFlow

Pinned source: e7a53760a7e4b15e0ee631533655d99dde657599
Root tree: 27059315bc16155f0064dc136aae94cd5097cb02

This is a starting map based on the repository tree and initial inspection of selected entry points. It is not a complete dependency closure. Every capability remains CANDIDATE_NOT_CLOSED and requires call-chain, data, config, runtime, UI, test and license/provenance review.

## mail-transport-sync: IMAP/SMTP transport and account synchronization

- Status: CANDIDATE_NOT_CLOSED
- Source candidates: backend/src/services/imapManager.js, backend/src/services/imapError.js, backend/src/routes/accounts.js, backend/src/routes/send.js, backend/src/routes/draft.js, backend/package.json
- Test candidates: backend/src/services/imapManager.test.js, backend/src/services/imapMoveFallback.test.js
- Next: inspect imports/callers, schema/migrations, config/secrets, runtime/platform boundaries, tests and path-level license/provenance.

## message-ingestion-rendering: Message parsing, sanitization, body storage and rendering

- Status: CANDIDATE_NOT_CLOSED
- Source candidates: backend/src/services/messageParser.js, backend/src/services/emailSanitizer.js, backend/src/services/messageBodyStore.js, backend/src/routes/mail.js, frontend/src/components/MessagePane.jsx
- Test candidates: backend/src/services/messageParser.headers.test.js, backend/src/services/emailSanitizer.test.js, backend/src/services/emailSanitizer.trackers.test.js
- Next: inspect imports/callers, schema/migrations, config/secrets, runtime/platform boundaries, tests and path-level license/provenance.

## image-proxy-privacy: Remote image proxy and tracking protection

- Status: CANDIDATE_NOT_CLOSED
- Source candidates: backend/src/services/imageProxy.js, backend/src/services/safeFetch.js, backend/src/routes/mail.js, frontend/src/utils/imageProxy.js
- Test candidates: backend/src/services/imageProxy.test.js, frontend/src/utils/imageProxy.test.js
- Next: inspect imports/callers, schema/migrations, config/secrets, runtime/platform boundaries, tests and path-level license/provenance.

## auth-and-identity: Session auth, OAuth/OIDC, MFA and account recovery

- Status: CANDIDATE_NOT_CLOSED
- Source candidates: backend/src/index.js, backend/src/middleware/auth.js, backend/src/routes/auth.js, backend/src/routes/oauth.js, backend/src/routes/oidc.js
- Test candidates: backend/src/middleware/auth.test.js, backend/src/routes/oauth.refresh.test.js
- Next: inspect imports/callers, schema/migrations, config/secrets, runtime/platform boundaries, tests and path-level license/provenance.

## database-schema: PostgreSQL persistence and ordered migrations

- Status: CANDIDATE_NOT_CLOSED
- Source candidates: backend/src/services/db.js, backend/migrations/0001_baseline.sql, backend/migrations/0066_email_accounts_icon.sql
- Test candidates: Not yet mapped
- Next: inspect imports/callers, schema/migrations, config/secrets, runtime/platform boundaries, tests and path-level license/provenance.

## plugin-boundary: Plugin API, activation, registry and storage boundary

- Status: CANDIDATE_NOT_CLOSED
- Source candidates: backend/src/plugins/README.md, backend/src/plugins/api.js, backend/src/plugins/registry.js, backend/src/plugins/activation.js, backend/eslint.plugins-boundary.js
- Test candidates: backend/src/plugins/activation.test.js, backend/src/plugins/registry.test.js
- Next: inspect imports/callers, schema/migrations, config/secrets, runtime/platform boundaries, tests and path-level license/provenance.

## frontend-app: Web application shell, state and routing

- Status: CANDIDATE_NOT_CLOSED
- Source candidates: frontend/src/App.jsx, frontend/src/store/index.js, frontend/src/components/MailApp.jsx, frontend/package.json
- Test candidates: frontend/src/App.render.test.js
- Next: inspect imports/callers, schema/migrations, config/secrets, runtime/platform boundaries, tests and path-level license/provenance.

## compose-and-send: Compose, reply, forward, drafts, attachments and SMTP routing

- Status: CANDIDATE_NOT_CLOSED
- Source candidates: frontend/src/components/ComposeModal.jsx, frontend/src/utils/composeFromMessage.js, backend/src/routes/send.js, backend/src/routes/draft.js
- Test candidates: frontend/src/components/ComposeModal.render.test.js, frontend/src/components/ComposeModal.replyDraft.test.js
- Next: inspect imports/callers, schema/migrations, config/secrets, runtime/platform boundaries, tests and path-level license/provenance.

## search-and-unified-inbox: Cross-account search and unified inbox scope

- Status: CANDIDATE_NOT_CLOSED
- Source candidates: backend/src/routes/search.js, backend/src/services/unifiedInbox.js, backend/src/services/messageService.js
- Test candidates: backend/src/services/messageService.test.js
- Next: inspect imports/callers, schema/migrations, config/secrets, runtime/platform boundaries, tests and path-level license/provenance.

## contacts-carddav: Contacts, CardDAV and vCard synchronization

- Status: CANDIDATE_NOT_CLOSED
- Source candidates: backend/src/routes/contacts.js, backend/src/routes/carddav.js, backend/src/services/carddavClient.js, backend/src/services/carddavSync.js, backend/src/utils/vcard.js, frontend/src/components/ContactsPage.jsx
- Test candidates: backend/src/services/carddavClient.test.js, backend/src/utils/vcard.test.js
- Next: inspect imports/callers, schema/migrations, config/secrets, runtime/platform boundaries, tests and path-level license/provenance.

## rules-categorization: Inbox rules, sender blocks, categories and spam training

- Status: CANDIDATE_NOT_CLOSED
- Source candidates: backend/src/routes/rules.js, backend/src/services/categorizer.js, backend/src/services/spamTraining.js
- Test candidates: Not yet mapped
- Next: inspect imports/callers, schema/migrations, config/secrets, runtime/platform boundaries, tests and path-level license/provenance.

## ai-assistant: AI provider configuration, thread summarization and draft assistance

- Status: CANDIDATE_NOT_CLOSED
- Source candidates: backend/src/routes/ai.js, backend/src/services/aiProvider.js, backend/src/services/openaiCodexAuth.js, frontend/src/aiActions.js, frontend/src/aiResults.js
- Test candidates: backend/src/routes/ai.test.js, frontend/src/aiActions.test.js
- Next: inspect imports/callers, schema/migrations, config/secrets, runtime/platform boundaries, tests and path-level license/provenance.

## notifications-realtime: WebSocket, push and notification actions

- Status: CANDIDATE_NOT_CLOSED
- Source candidates: backend/src/services/websocket.js, backend/src/services/pushNotifications.js, frontend/src/hooks/useWebSocket.js, frontend/src/hooks/usePushNotifications.js
- Test candidates: backend/src/services/websocket.test.js
- Next: inspect imports/callers, schema/migrations, config/secrets, runtime/platform boundaries, tests and path-level license/provenance.

## electron-desktop: Electron desktop shell, notifications and navigation security

- Status: CANDIDATE_NOT_CLOSED
- Source candidates: frontend/packages/electron/main.cjs, frontend/packages/electron/preload.cjs, frontend/packages/electron/security.cjs, frontend/packages/electron/mailApi.cjs
- Test candidates: frontend/packages/electron/security.test.cjs, frontend/packages/electron/mailApi.test.cjs
- Next: inspect imports/callers, schema/migrations, config/secrets, runtime/platform boundaries, tests and path-level license/provenance.

## android-mobile: Android background sync, native bridge and notification actions

- Status: CANDIDATE_NOT_CLOSED
- Source candidates: frontend/packages/android/app/src/main/java/sh/mailflow/app/MailFlowBackgroundSync.java, frontend/packages/android/app/src/main/java/sh/mailflow/app/MailFlowNativePlugin.java, frontend/packages/android/app/src/main/java/sh/mailflow/app/NativeSecurity.java, frontend/packages/android/app/src/main/java/sh/mailflow/app/MailFlowNotificationActionWorker.java
- Test candidates: frontend/packages/android/app/src/test/java/sh/mailflow/app/NativeSecurityTest.java, frontend/packages/android/app/src/test/java/sh/mailflow/app/MailFlowNotificationActionWorkerTest.java
- Next: inspect imports/callers, schema/migrations, config/secrets, runtime/platform boundaries, tests and path-level license/provenance.

## deployment-and-release: Docker deployment, CI and application release packaging

- Status: CANDIDATE_NOT_CLOSED
- Source candidates: docker-compose.yml, backend/Dockerfile, frontend/Dockerfile, .github/workflows/ci.yml, .github/workflows/publish-apps.yml, .github/workflows/publish.yml
- Test candidates: Not yet mapped
- Next: inspect imports/callers, schema/migrations, config/secrets, runtime/platform boundaries, tests and path-level license/provenance.

