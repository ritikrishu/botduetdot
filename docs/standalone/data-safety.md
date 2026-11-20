# Play Data safety evidence

Draft for `com.ritikrishu.botduetdot`, reviewed 2026-11-16. Recheck the exact release AAB and SDKs
before submitting. Nothing is sent to the BotDuetDot developer by default, but content leaves the
phone for the paired server. Do not answer “no data collected” solely because that server is self-hosted.
Google's [Data safety guidance](https://support.google.com/googleplay/android-developer/answer/10787469?hl=en)
defines collection as off-device transfer and allows “optional” when users can decline a data type.

## Proposed answers

All collected types below serve **App functionality**, with no advertising purpose. Do not claim
ephemeral processing for persisted conversations or files. “Not shared” assumes user-directed
transfers to the paired server/chosen providers meet Google's user-initiated transfer exception;
the owner must confirm that interpretation and any demo-server handling before submission.

| Console question/type                              | Answer and scope                                                                                                                                                                                               | Code evidence                                                                                                                                                                                                 |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Collect user data?                                 | Yes: remote control sends content and connection metadata to the paired server.                                                                                                                                | [Connection resolver](../../packages/client-runtime/src/connection/resolver.ts), [attachment upload](../../apps/mobile/src/lib/attachmentUpload.ts)                                                           |
| Messages / Other in-app messages                   | Collected; required for sending prompts/conversations; not ephemeral.                                                                                                                                          | [Message delivery](../../apps/mobile/src/state/threadOutboxDelivery.ts), [server persistence](../../apps/server/src/persistence/Migrations/007_ProjectionThreadMessageAttachments.ts)                         |
| Photos and videos; Files and docs                  | Collected when attached; optional because text-only use works.                                                                                                                                                 | [Attachment selection](../../apps/mobile/src/lib/composerAttachmentFiles.ts), [upload](../../apps/mobile/src/lib/attachmentUpload.ts), [storage](../../apps/server/src/attachmentStore.ts)                    |
| Audio files / voice recordings                     | Collected when server transcription is selected; optional. Local Android transcription is also supported.                                                                                                      | [Server transcription upload](../../apps/mobile/src/features/voice-input/environmentTranscriber.ts), [Android local transcription](../../apps/mobile/src/native/voiceTranscription.android.ts)                |
| Device or other IDs; diagnostics metadata          | Collected for connection identity/presentation: device identifier, label/model, OS and app version. Required for connection; no Advertising ID use in this path.                                               | [Mobile identity](../../apps/mobile/src/connection/platform.ts), [metadata](../../apps/mobile/src/lib/authClientMetadata.ts), [connection resolver](../../packages/client-runtime/src/connection/resolver.ts) |
| Encrypted in transit?                              | No universal guarantee: HTTP/WS LAN connections are accepted. HTTPS/WSS or Tailscale protects configured connections, but is not mandatory.                                                                    | [Supported protocols](../../packages/shared/src/remote.ts)                                                                                                                                                    |
| Account creation?                                  | No BotDuetDot account; provider accounts are separate. Account-deletion flow is not applicable.                                                                                                                | [Standalone features](../../packages/contracts/src/brandStandalone.ts), [cloud config gates](../../apps/server/src/cloud/publicConfig.ts)                                                                     |
| Data deletion?                                     | User/server operator controls stored history, attachments and backups. Do not promise a developer-operated deletion service or verified complete erasure. Uninstalling Android does not delete server history. | [Attachment store](../../apps/server/src/attachmentStore.ts), [server home](../../apps/server/src/os-jank.ts), [desktop paths](../../apps/desktop/src/app/DesktopStatePaths.ts)                               |
| Ads, default analytics, crash reporting, push?     | No ads integration in the standalone configuration; analytics off; no relay-backed crash delivery or push. Confirm merged manifest/SDK behavior before release.                                                | [Brand defaults](../../packages/contracts/src/brandStandalone.ts), [mobile overlay](../../apps/mobile/brand.config.ts), [crash delivery gate](../../apps/mobile/src/features/observability/observe.ts)        |
| Location, contacts, health, financial information? | No dedicated collection in reviewed standalone connection/upload paths. User-supplied text/files can contain sensitive information; do not describe uploaded content as anonymous.                             | [Metadata fields](../../apps/mobile/src/lib/authClientMetadata.ts), [upload](../../apps/mobile/src/lib/attachmentUpload.ts)                                                                                   |

An earlier conservative draft marked every content type required. Photos/files/audio are optional
in this draft because users can choose not to attach/record them; validate the final Console choices.
Camera access for QR scanning is not a claim that camera footage is uploaded. The merged manifest
of the first release AAB was reviewed on 2026-11-16. Runtime prompts are camera (QR pairing),
microphone (voice input) and notifications. The remaining permissions are install-time ones from
Expo and React Native libraries: network state, biometric unlock, scheduled and promoted
notifications, launcher badges. Overlay, external storage, FCM push and the Play install referrer
are blocked. `scripts/standalone/brand-leak-rules.ts` pins this set, so a new library permission
fails the release check until reviewed.

## Opt-in analytics and telemetry exports

[BRAND.analytics](../../packages/contracts/src/brandStandalone.ts) sets `enabledByDefault: false`,
with empty PostHog host/key. [AnalyticsService](../../apps/server/src/telemetry/AnalyticsService.ts)
allows server operators to enable delivery with **all three** `T3CODE_TELEMETRY_ENABLED=true`,
`T3CODE_POSTHOG_HOST` and `T3CODE_POSTHOG_KEY`. A telemetry-denying managed policy still prevents it.
Enabling only the boolean does not create an endpoint or send events.

If configured, batches go to the operator's host at `/batch/`. They include timestamps, event names,
installation/distinct identifiers, OS/architecture, app version and server mode. Events can include
feature usage, provider/model, token usage, duration/status, delegated task statistics and hashed
provider-account/device owner identifiers. They are pseudonymous, not guaranteed anonymous.
See [identity derivation](../../apps/server/src/telemetry/Identify.ts),
[feature events](../../apps/server/src/telemetry/FeatureUsage.ts),
[provider usage](../../apps/server/src/telemetry/ProviderUsageAnalytics.ts) and
[delegation events](../../apps/server/src/telemetry/DelegatedTaskAnalytics.ts).
Do not promise that the generic event-property API can never carry content after future changes.

Account for optional **App activity / App interactions**, **App info and performance / Diagnostics**,
**Device or other IDs**, and **Personal info / User IDs** (hashed account identifiers), purpose
**Analytics**, if declaring this configurable server path. The server operator's opt-in is not a
per-phone consent control; connected phones can contribute device information. Review the destination,
retention and sharing classification whenever enabling it. The recipient controls deletion of received
analytics; disabling delivery does not erase past batches.

Separately, operators can configure OpenTelemetry export endpoints in
[TelemetryExportSettings](../../apps/web/src/components/settings/TelemetryExportSettings.tsx).
These exports can send logs, traces and metrics to the chosen collector. Review their payload and
retention before enabling them; the default “analytics off” statement is not a ban on configured exports.

Public policy: https://www.ritikrishu.com/projects/botduetdot/privacy-policy. Owner approval of declarations
is required before submission, including any new data handled by the review demo server.
