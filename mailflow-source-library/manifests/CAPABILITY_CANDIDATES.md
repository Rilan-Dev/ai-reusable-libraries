# Preliminary Capability and Path Candidates

Source commit: e7a53760a7e4b15e0ee631533655d99dde657599
Source tree: 27059315bc16155f0064dc136aae94cd5097cb02

This is an initial navigation map from file paths and names, not proof of capability closure. Area counts overlap. The per-file register contains 1319 source files and explicitly marks each UNCLASSIFIED, license UNREVIEWED and closure UNMAPPED.

## Backend and API

Matched files: 280

Representative paths:
- backend/src/index.js
- backend/src/middleware/auth.js
- backend/src/middleware/auth.test.js
- backend/src/middleware/bodyParsers.js
- backend/src/middleware/bodyParsers.test.js
- backend/src/middleware/corsExceptDav.js
- backend/src/middleware/corsExceptDav.test.js
- backend/src/plugins/README.md
- backend/src/plugins/accountConfig.js
- backend/src/plugins/activation.js
- backend/src/plugins/activation.test.js
- backend/src/plugins/api.js
- backend/src/plugins/gtd/gtdConfig.js
- backend/src/plugins/gtd/gtdConfig.test.js
- backend/src/plugins/gtd/gtdGist.js

## Database schema and migrations

Matched files: 66

Representative paths:
- backend/migrations/0001_baseline.sql
- backend/migrations/0002_subject_threading.sql
- backend/migrations/0003_sender_name.sql
- backend/migrations/0004_internal_auth_setting.sql
- backend/migrations/0005_auth_events.sql
- backend/migrations/0006_threaded_query_indexes.sql
- backend/migrations/0007_thread_paging_index.sql
- backend/migrations/0008_search_indexes.sql
- backend/migrations/0009_thread_key_column.sql
- backend/migrations/0010_inbox_rules.sql
- backend/migrations/0011_message_id_dedup_index.sql
- backend/migrations/0012_oidc_allow_insecure.sql
- backend/migrations/0013_block_list.sql
- backend/migrations/0014_account_allow_private_host.sql
- backend/migrations/0015_contacts.sql

## Frontend web application

Matched files: 312

Representative paths:
- frontend/src/App.jsx
- frontend/src/App.render.test.js
- frontend/src/aiActions.js
- frontend/src/aiActions.test.js
- frontend/src/aiResults.js
- frontend/src/aiResults.test.js
- frontend/src/components/AccountMark.jsx
- frontend/src/components/AccountMark.render.test.js
- frontend/src/components/AdminPanel.cleanup.render.test.js
- frontend/src/components/AdminPanel.jsx
- frontend/src/components/AdminPanel.render.test.js
- frontend/src/components/AdminUserEditor.jsx
- frontend/src/components/AdminUserEditor.render.test.js
- frontend/src/components/AiResultBox.jsx
- frontend/src/components/AttachmentViewer.jsx

## Plugin system

Matched files: 54

Representative paths:
- backend/eslint.plugins-boundary.js
- backend/migrations/0041_plugin_data.sql
- backend/migrations/0042_grandfather_gtd_plugin.sql
- backend/migrations/0044_message_plugin_annotations.sql
- backend/migrations/0045_plugin_account_config.sql
- backend/src/plugins/README.md
- backend/src/plugins/accountConfig.js
- backend/src/plugins/activation.js
- backend/src/plugins/activation.test.js
- backend/src/plugins/api.js
- backend/src/plugins/gtd/gtdConfig.js
- backend/src/plugins/gtd/gtdConfig.test.js
- backend/src/plugins/gtd/gtdGist.js
- backend/src/plugins/gtd/gtdGist.test.js
- backend/src/plugins/gtd/gtdPet.js

## Electron desktop

Matched files: 23

Representative paths:
- frontend/packages/electron/icons/128x128.png
- frontend/packages/electron/icons/144x144.png
- frontend/packages/electron/icons/152x152.png
- frontend/packages/electron/icons/192x192.png
- frontend/packages/electron/icons/32x32.png
- frontend/packages/electron/icons/384x384.png
- frontend/packages/electron/icons/512x512.png
- frontend/packages/electron/icons/72x72.png
- frontend/packages/electron/icons/96x96.png
- frontend/packages/electron/icons/icon.icns
- frontend/packages/electron/icons/icon.ico
- frontend/packages/electron/icons/icon.png
- frontend/packages/electron/installer.nsh
- frontend/packages/electron/mailApi.cjs
- frontend/packages/electron/mailApi.test.cjs

## Android mobile

Matched files: 68

Representative paths:
- frontend/packages/android/.gitignore
- frontend/packages/android/app/.gitignore
- frontend/packages/android/app/build.gradle
- frontend/packages/android/app/capacitor.build.gradle
- frontend/packages/android/app/proguard-rules.pro
- frontend/packages/android/app/src/androidTest/java/com/getcapacitor/myapp/ExampleInstrumentedTest.java
- frontend/packages/android/app/src/main/AndroidManifest.xml
- frontend/packages/android/app/src/main/java/sh/mailflow/app/MailFlowBackgroundSync.java
- frontend/packages/android/app/src/main/java/sh/mailflow/app/MailFlowBackgroundWorker.java
- frontend/packages/android/app/src/main/java/sh/mailflow/app/MailFlowNativeMessageBridge.java
- frontend/packages/android/app/src/main/java/sh/mailflow/app/MailFlowNativePlugin.java
- frontend/packages/android/app/src/main/java/sh/mailflow/app/MailFlowNotificationActionReceiver.java
- frontend/packages/android/app/src/main/java/sh/mailflow/app/MailFlowNotificationActionWorker.java
- frontend/packages/android/app/src/main/java/sh/mailflow/app/MailFlowWebViewClient.java
- frontend/packages/android/app/src/main/java/sh/mailflow/app/MainActivity.java

## Authentication and identity

Matched files: 43

Representative paths:
- backend/migrations/0004_internal_auth_setting.sql
- backend/migrations/0005_auth_events.sql
- backend/migrations/0012_oidc_allow_insecure.sql
- backend/migrations/0020_mfa_device_trust.sql
- backend/migrations/0022_password_reset_tokens.sql
- backend/migrations/0026_oidc_admin_group_claim.sql
- backend/migrations/0029_oauth_public_client.sql
- backend/migrations/0035_oidc_rp_initiated_logout.sql
- backend/migrations/0038_ai_codex_oauth.sql
- backend/migrations/0040_smtp_separate_auth.sql
- backend/migrations/0049_oidc_login_match_claim.sql
- backend/migrations/0056_email_accounts_trusted_authserv_id.sql
- backend/migrations/0064_auth_events_actor.sql
- backend/src/middleware/auth.js
- backend/src/middleware/auth.test.js

## Mail protocol, messages and sync

Matched files: 64

Representative paths:
- backend/migrations/0011_message_id_dedup_index.sql
- backend/migrations/0023_message_categories.sql
- backend/migrations/0037_message_delivery_addresses.sql
- backend/migrations/0040_smtp_separate_auth.sql
- backend/migrations/0044_message_plugin_annotations.sql
- backend/migrations/0050_message_sender.sql
- backend/migrations/0059_message_forwarded_from.sql
- backend/migrations/0061_message_bcc_addresses.sql
- backend/src/routes/send.forwardedMessages.test.js
- backend/src/services/carddavSync.js
- backend/src/services/imapAuthBackoff.test.js
- backend/src/services/imapError.js
- backend/src/services/imapError.test.js
- backend/src/services/imapManager.draftIngest.test.js
- backend/src/services/imapManager.js

## Contacts and CardDAV

Matched files: 16

Representative paths:
- backend/migrations/0015_contacts.sql
- backend/migrations/0017_contacts_v2.sql
- backend/migrations/0018_contacts_search_indexes.sql
- backend/migrations/0027_carddav_client.sql
- backend/src/routes/carddav.auth.test.js
- backend/src/routes/carddav.js
- backend/src/routes/carddavAccount.js
- backend/src/routes/contacts.js
- backend/src/routes/contacts.photo.test.js
- backend/src/services/carddavClient.js
- backend/src/services/carddavClient.multiget.test.js
- backend/src/services/carddavClient.test.js
- backend/src/services/carddavSync.js
- backend/src/utils/vcard.js
- backend/src/utils/vcard.test.js

## AI assistant and integrations

Matched files: 12

Representative paths:
- backend/migrations/0038_ai_codex_oauth.sql
- backend/src/routes/ai.js
- backend/src/routes/ai.test.js
- backend/src/services/openaiCodexAuth.js
- backend/src/services/openaiCodexAuth.test.js
- backend/src/services/openaiCodexResponses.js
- backend/src/services/openaiCodexResponses.test.js
- frontend/src/aiActions.js
- frontend/src/aiActions.test.js
- frontend/src/aiResults.js
- frontend/src/aiResults.test.js
- frontend/src/hooks/useAiActions.js

## Security, sanitization and privacy

Matched files: 16

Representative paths:
- backend/src/services/emailSanitizer.js
- backend/src/services/emailSanitizer.parse5Error.test.js
- backend/src/services/emailSanitizer.test.js
- backend/src/services/emailSanitizer.trackers.test.js
- backend/src/services/imageProxy.js
- backend/src/services/imageProxy.test.js
- frontend/packages/android/app/src/main/java/sh/mailflow/app/NativeSecurity.java
- frontend/packages/android/app/src/test/java/sh/mailflow/app/MailFlowNativePluginSecurityTest.java
- frontend/packages/android/app/src/test/java/sh/mailflow/app/NativeSecurityTest.java
- frontend/packages/electron/security.cjs
- frontend/packages/electron/security.test.cjs
- frontend/src/components/ComposeModal.imageProxy.render.test.js
- frontend/src/utils/imageProxy.js
- frontend/src/utils/imageProxy.test.js
- frontend/src/utils/nativeActionSecurity.js

## Notifications and realtime

Matched files: 15

Representative paths:
- backend/src/services/pushNotifications.js
- backend/src/services/websocket.js
- backend/src/services/websocket.test.js
- frontend/packages/android/app/src/main/java/sh/mailflow/app/MailFlowNotificationActionReceiver.java
- frontend/packages/android/app/src/main/java/sh/mailflow/app/MailFlowNotificationActionWorker.java
- frontend/packages/android/app/src/test/java/sh/mailflow/app/MailFlowNotificationActionWorkerTest.java
- frontend/packages/electron/notificationRetainer.cjs
- frontend/packages/electron/notificationRetainer.test.cjs
- frontend/src/components/ElectronNotificationBridge.jsx
- frontend/src/components/NotificationToasts.jsx
- frontend/src/hooks/usePushNotifications.js
- frontend/src/hooks/useWebSocket.counts.test.js
- frontend/src/hooks/useWebSocket.js
- frontend/src/hooks/useWebSocket.notify.test.js
- frontend/src/utils/notificationSounds.js

## Tests

Matched files: 301

Representative paths:
- backend/src/middleware/auth.test.js
- backend/src/middleware/bodyParsers.test.js
- backend/src/middleware/corsExceptDav.test.js
- backend/src/plugins/activation.test.js
- backend/src/plugins/gtd/gtdConfig.test.js
- backend/src/plugins/gtd/gtdGist.test.js
- backend/src/plugins/gtd/gtdPet.test.js
- backend/src/plugins/gtd/gtdSections.test.js
- backend/src/plugins/gtd/gtdTransitions.test.js
- backend/src/plugins/gtd/hooks.test.js
- backend/src/plugins/gtd/routes.classify.test.js
- backend/src/plugins/gtd/routes.done.test.js
- backend/src/plugins/gtd/routes.ensure.test.js
- backend/src/plugins/gtd/routes.mount.test.js
- backend/src/plugins/gtd/routes.pet.test.js

## Build, CI and release

Matched files: 39

Representative paths:
- .dockerignore
- .github/workflows/ci.yml
- .github/workflows/publish-apps.yml
- .github/workflows/publish.yml
- .github/workflows/sponsors.yml
- backend/Dockerfile
- backend/eslint.config.js
- backend/eslint.plugins-boundary.js
- backend/eslint.redos.config.mjs
- backend/package-lock.json
- backend/package.json
- backend/src/routes/admin.invites.test.js
- docker-compose.ghcr.yml
- docker-compose.https.yml
- docker-compose.yml

## Documentation and licensing

Matched files: 18

Representative paths:
- .github/ISSUE_TEMPLATE/bug_report.md
- .github/ISSUE_TEMPLATE/custom.md
- .github/ISSUE_TEMPLATE/feature_request.md
- .github/PULL_REQUEST_TEMPLATE.md
- CLA.md
- CLAUDE.md
- CONTRIBUTING.md
- LICENSE
- LICENSE-COMMERCIAL
- README.md
- ROADMAP.md
- backend/migrations/0026_oidc_admin_group_claim.sql
- backend/migrations/0049_oidc_login_match_claim.sql
- backend/src/plugins/README.md
- backend/src/plugins/gtd/routes.classify.test.js

## Assets, fonts and icons

Matched files: 552

Representative paths:
- .github/assets/star-history.svg
- backend/migrations/0066_email_accounts_icon.sql
- backend/src/routes/accounts.icon.test.js
- backend/src/routes/senderFavicons.js
- backend/src/routes/senderFavicons.test.js
- backend/src/services/senderFavicon.js
- backend/src/services/senderFavicon.test.js
- frontend/packages/android/app/src/main/res/drawable-land-hdpi/splash.png
- frontend/packages/android/app/src/main/res/drawable-land-mdpi/splash.png
- frontend/packages/android/app/src/main/res/drawable-land-xhdpi/splash.png
- frontend/packages/android/app/src/main/res/drawable-land-xxhdpi/splash.png
- frontend/packages/android/app/src/main/res/drawable-land-xxxhdpi/splash.png
- frontend/packages/android/app/src/main/res/drawable-port-hdpi/splash.png
- frontend/packages/android/app/src/main/res/drawable-port-mdpi/splash.png
- frontend/packages/android/app/src/main/res/drawable-port-xhdpi/splash.png

## Required next work

Read source content and call chains; trace database migrations, configuration, callers, tests, permissions, runtime, platform packaging and external dependencies. Replace preliminary classifications only with evidence and preserve an audit trail. Do not copy until every path has a disposition and required closure gates pass.
