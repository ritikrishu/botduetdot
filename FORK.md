# Maintaining this fork

## What this fork adds

Sidebar Spaces are Arc-style named sets of projects, with icons and attention indicators.
Web and desktop provide a switcher strip, editing, command-palette actions and optional shortcuts; mobile provides a view-and-switch bar.
Definitions live in `ServerSettings.sidebarSpaces` in each environment's `userdata/settings.json`; the active selection is per device.
With no spaces, the sidebar keeps upstream behavior. Spaces add no database migrations. Standalone also changes server defaults and integrations.

## BotDuetDot standalone

BotDuetDot is a self-hosted command center for coding agents, including Claude Code and Codex,
using your own subscriptions. Arc-style Spaces separate always-on bot threads from dev work.
The macOS app runs the server on your Mac; Android is a remote control paired over LAN or Tailscale.
There is no BotDuetDot account, T3 Connect or push notification service. Analytics is off by default;
see [data safety](docs/standalone/data-safety.md) for operator-enabled analytics and other transfers.

Build with `T3CODE_BRAND=standalone`; Android also needs `EXPO_PUBLIC_T3CODE_BRAND=standalone`.
The profile is baked into release bundles. Omitting the selector builds the upstream identity.
Use the [release runbook](docs/standalone/release.md) for signed macOS and Play releases.

Standalone defaults to `~/.botduetdot`, Electron profile
`~/Library/Application Support/botduetdot`, app/package ID `com.ritikrishu.botduetdot`,
`botduetdot://` links and its own GitHub update feed. It coexists with the official app without
sharing its database or profile. **Never export `T3CODE_HOME` globally**: both apps honor it,
so pointing them at one home defeats isolation. Never run two servers against one home.
Use a disposable copied home for migration tests; never point standalone at live `~/.t3`.

The preview/iPhone instructions below describe the earlier Sidebar Spaces fork, not standalone
releases. Shared-home warnings apply only if you deliberately reuse an official home.

### Standalone decision log

The working contract that drove the standalone build is in git history
(`git show bea6b98ece:FORK-STANDALONE-CONTRACT.md`, seams S1–S57). Code comments cite these decisions:

- **r3:** the upstream scheme pattern stays `^t3code(?:-[a-z]+)?:$`; standalone accepts only its own schemes.
- **r4:** never widen an upstream allowlist; derive standalone sets from brand fields.
- **r5:** the T3 Code MIT notice ships in both brands (licence screens and About credits).
- **r6:** triage is off in standalone, gated in `TriageService.prepare` as well as the UI.
- **r7:** with `features.t3Connect` off, the T3 Connect runtime is inert and never reads, applies,
  writes or clears persisted relay or tunnel secrets.
- **r8:** the leak gate matches real key shapes, lets the MIT notice opt into a text exemption and
  treats the V8 compile cache as derived from scanned JS.
- **r9:** standalone bundles rewrite upstream copy at bundle time (`scripts/lib/brand-text.ts`);
  upstream builds are byte-identical.
- **r10:** Android ships only the standalone profile, and the release gate scans the same bundle as
  JavaScript beside the Hermes byte scan.
- **r11:** the MIT credit appears twice in Android (the preview WebView reads `BRAND`). Native strings
  come from resources the standalone plugin overrides, the gate scans `base/dex` and `base/lib`,
  `npx t3@` and "T3 home" are gated, and the managed-policy path comes from the brand.

## Design decisions and known limits

Server settings are the only existing store every client receives; client settings are local
and mobile never reads them. Generic settings patches make storage a schema-only addition.
Keep [persisted decoding](packages/contracts/src/sidebarSpaces.ts) in this order:
`ForwardCompatibleArray` → `withDecodingDefaultType` → `catchDecoding`. Bad entries must drop
individually; a missing or malformed field must become `[]`. A field decode failure would
reset all settings to in-memory defaults. Using `withDecodingDefault` instead rejects mixed
arrays before individual bad entries can drop, losing valid spaces too.

Identity is `${homeEnvironmentId}:${space.id}`. Each space has one home; clients show the union
of connected homes, without copying definitions between them or deduplicating across homes.
Store member refs `environmentId:projectId` plus the scratch sentinel `no-project`, never group
keys: grouping modes differ per device, and stale group keys can resurrect deselected projects.
The [shared membership rules](packages/client-runtime/src/state/sidebarSpaces.ts) preserve refs
for unavailable projects and keep a no-op save in a coarser mode from widening membership.
A matched group still displays whole; the scratch sentinel includes all scratch projects,
so it cannot separate bot scratch threads from ad-hoc chats.

A space saves the existing project filter. Manual filter changes detach it; opening a thread
outside it reveals All. An active space matching nothing is effective All with a dimmed chip,
including while projects load. Keep its key so it reapplies when projects return, unless the
user changes the filter. In boring sidebar mode, spaces are inert and manual filtering leaves
the remembered key intact, avoiding invisible changes before spaces are enabled again.
Mobile v1 only views and switches spaces; editing would duplicate the web form for a rare action.
Shortcuts remain unassigned for [official-app compatibility](#compatibility-with-the-official-app).

Known limits and follow-ups:

- Cross-device concurrent edits are last-write-wins for the home environment's whole list.
- An offline home hides its spaces until reconnect; the stored active key survives meanwhile.
- Copying `~/.t3` also copies `userdata/environment-id`. Two servers with that id are
  indistinguishable to space identity; composite keys cannot solve a cloned environment id.
- The 24-space cap is enforced only by the patch schema, per home. Persisted decoding has no
  cap, and the UI does not disable creation at the cap; saving a 25th space fails validation.
- [Packaged daily-use desktop builds](#daily-desktop-use-open-follow-up) still need a verified
  install/update procedure and independent app identity.

## Upstream seams

Base release: `v0.1.9`. These are all pre-existing files changed by the fork since that tag; review their diffs on each upgrade.

| Upstream file                                                  | Fork edit to preserve                                                                                     |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `packages/contracts/src/settings.ts`                           | Export space contracts and add lenient persisted settings plus validated settings patches.                |
| `packages/contracts/src/keybindings.ts`                        | Register space command IDs without adding default shortcuts.                                              |
| `packages/client-runtime/package.json`                         | Export the shared `state/sidebar-spaces` module.                                                          |
| `apps/web/src/components/Sidebar.tsx`                          | Wrap project-scope reads/writes with the space hook and mount the strip above the footer.                 |
| `apps/web/src/components/CommandPalette.tsx`                   | Add space actions to the palette.                                                                         |
| `apps/web/src/routes/__root.tsx`                               | Mount the global space shortcut/editor host.                                                              |
| `apps/mobile/src/features/home/HomeRouteScreen.tsx`            | Detach the active space when the manual project filter changes.                                           |
| `apps/mobile/src/features/home/HomeScreen.tsx`                 | Apply space scope to the list/search and retain the switcher in empty states.                             |
| `apps/mobile/src/features/threads/ThreadNavigationSidebar.tsx` | Same space scope, detaching setter and switcher for the split view (unfolded foldables, tablets).         |
| `apps/mobile/app.config.ts`                                    | Support Personal Team signing, matching keychain identity, no Associated Domains, and OTA off by default. |
| `apps/mobile/app.config.test.ts`                               | Cover variants, Personal Team signing, bundle identity, entitlements and OTA opt-in.                      |
| `apps/mobile/README.md`                                        | Document Personal Team signing and a preview Release install beside the store app.                        |

Spaces code is isolated under `packages/contracts/src/sidebarSpaces*`,
`packages/client-runtime/src/state/sidebarSpaces*`, `apps/web/src/sidebarSpaces/`,
and `apps/mobile/src/features/home/spaces/`, with tests beside it and
`packages/shared/src/serverSettings.sidebarSpaces.test.ts`.

### Standalone seams

Derived from `git diff --stat v0.1.9..HEAD`, excluding new files; unabridged names come from
`git diff --name-only --diff-filter=MDRT v0.1.9..HEAD`. Cross-checked against the working contract's seams S1–S57 and the decision log below (r3–r11).
Standalone builds also rewrite "T3 Code" and quoted `t3` CLI copy at bundle time
(`scripts/lib/brand-text.ts`), so most upstream copy needs no seam. The Spaces table above remains
part of this inventory. Refresh both tables after integration and each upgrade.

| Upstream file                                                                                                          | Fork edit to preserve                                                                                                                                                   |
| ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/desktop/src/app/DesktopAppIdentity.ts`                                                                           | S36: About `credits`                                                                                                                                                    |
| `apps/desktop/src/app/DesktopCliCommand.ts`                                                                            | S23: `const CLI_NAME = BRAND.cliName`                                                                                                                                   |
| `apps/desktop/src/app/DesktopCliShim.ts`                                                                               | S22: `BRAND.cliName`                                                                                                                                                    |
| `apps/desktop/src/app/DesktopEnvironment.ts`                                                                           | S15: `BRAND.name`, AUMID                                                                                                                                                |
| `apps/desktop/src/app/DesktopLegacyLocalStorage.ts`                                                                    | S16: `BRAND.desktop.legacyLocalStorageProfileNames`                                                                                                                     |
| `apps/desktop/src/app/DesktopStartupRecovery.ts`                                                                       | S35: brand releases                                                                                                                                                     |
| `apps/desktop/src/app/DesktopStatePaths.ts`                                                                            | S12: `BRAND.homeDirName`                                                                                                                                                |
| `apps/desktop/src/app/DesktopUserData.ts`                                                                              | S13: brand dir names                                                                                                                                                    |
| `apps/desktop/src/electron/ElectronProtocol.ts`                                                                        | S14: `BRAND.schemes`                                                                                                                                                    |
| `apps/desktop/vite.config.ts`                                                                                          | S3: spread into `publicConfigDefine`                                                                                                                                    |
| `apps/mobile/app.config.ts`                                                                                            | S18: import + `export default applyMobileBrand(config, …)` (2 lines)                                                                                                    |
| `apps/mobile/metro.config.js`                                                                                          | T5b: wrap the config in `withMobileBrandResolver` (standalone Observe stub, brand assets, standalone-only profile module, brand-text transformer)                       |
| `apps/mobile/modules/t3-composer-editor/android/src/main/java/expo/modules/t3composereditor/T3ComposerEditorModule.kt` | Clipboard label and hosted thread-link prefix come from string resources (module defaults keep upstream values; standalone overrides them in `withStandaloneIsolation`) |
| `apps/mobile/modules/t3-composer-editor/android/src/main/java/expo/modules/t3composereditor/T3ComposerEditorView.kt`   | Pass `context` to `hasThreadLink`                                                                                                                                       |
| `apps/mobile/modules/t3-native-controls/android/src/main/java/expo/modules/t3nativecontrols/T3NativeControlsModule.kt` | Pictures album name from the `t3_pictures_album` resource                                                                                                               |
| `apps/mobile/scripts/generate-device-stream.mts`                                                                       | r10: standalone WebView stream scripts build with `brandBuildDefine` and `brandTextPlugins`                                                                             |
| `apps/mobile/src/App.tsx`                                                                                              | S56: prefixes from `brandAppSchemes(BRAND)`                                                                                                                             |
| `apps/mobile/src/components/BrandMark.tsx`                                                                             | S33: Use standalone mobile name and assets.                                                                                                                             |
| `apps/mobile/src/components/CompactBrandTitle.tsx`                                                                     | Render the standalone mobile header title.                                                                                                                              |
| `apps/mobile/src/components/brandAssets.ts`                                                                            | S33: Use standalone mobile name and assets.                                                                                                                             |
| `apps/mobile/src/features/agent-awareness/androidNotifications.ts`                                                     | Notification link scheme falls back to `BRAND.schemes.production`                                                                                                       |
| `apps/mobile/src/features/connection/pairing.ts`                                                                       | S32: `isBrandAppProtocol` (brand only)                                                                                                                                  |
| `apps/mobile/src/features/diagnostics/SettingsDiagnosticsRouteScreen.tsx`                                              | Crash-log header names `BRAND_NAME`                                                                                                                                     |
| `apps/mobile/src/features/diagnostics/crash-log-model.ts`                                                              | Optional `app.name` for the crash-log header                                                                                                                            |
| `apps/mobile/src/features/layout/workspace/PullRequestToolbar.android.tsx`                                             | S33: Use standalone mobile name and assets.                                                                                                                             |
| `apps/mobile/src/features/layout/workspace/WorkspaceListHeader.android.tsx`                                            | S33: Use standalone mobile name and assets.                                                                                                                             |
| `apps/mobile/src/features/layout/workspace/WorkspaceRootScreen.tsx`                                                    | T5b: accessibility label uses `BRAND_NAME`                                                                                                                              |
| `apps/mobile/src/features/settings/lib/legal-document-url.ts`                                                          | S31: `BRAND.links.marketingSite`                                                                                                                                        |
| `apps/mobile/src/features/threads/thread-work-log.tsx`                                                                 | T5b: standalone work-log icon uses the brand mark                                                                                                                       |
| `apps/mobile/src/lib/appLinking.ts`                                                                                    | Bare-scheme launch filter matches `brandAppSchemes(BRAND)` in standalone                                                                                                |
| `apps/server/src/auth/McpOAuth.ts`                                                                                     | S49: `resource_name: BRAND.name`                                                                                                                                        |
| `apps/server/src/cli/browser.ts`                                                                                       | S40: `BRAND.homeDirName`                                                                                                                                                |
| `apps/server/src/cli/install.ts`                                                                                       | S54: installer hints from `BRAND.links.installSh/installPs1`; null → desktop-Settings hint                                                                              |
| `apps/server/src/cli/invocation.ts`                                                                                    | S24: `BRAND.cliName`                                                                                                                                                    |
| `apps/server/src/cli/pair.ts`                                                                                          | Pair hint omits T3 Connect when `BRAND.features.t3Connect` is off                                                                                                       |
| `apps/server/src/cli/triage.ts`                                                                                        | S53: handler fails with a clear message when `!BRAND.features.triage`                                                                                                   |
| `apps/server/src/cli/update.ts`                                                                                        | r7: boot-service cgroup check uses `BOOT_SERVICE_UNIT_FILE`                                                                                                             |
| `apps/server/src/cloud/CloudLink.ts`                                                                                   | r7: inert, non-destructive service when `BRAND.features.t3Connect` is off; `CloudLinkDisabledError`                                                                     |
| `apps/server/src/cloud/ConnectReachability.ts`                                                                         | r7: skip persisted tunnel probes without T3 Connect                                                                                                                     |
| `apps/server/src/cloud/bootService.ts`                                                                                 | S8: `BRAND.service`                                                                                                                                                     |
| `apps/server/src/cloud/config.ts`                                                                                      | r7: relay connection and activity readers return `null`/`false` without T3 Connect                                                                                      |
| `apps/server/src/cloud/http.ts`                                                                                        | r7: map `CloudLinkDisabledError` to 403                                                                                                                                 |
| `apps/server/src/cloud/npmRelease.ts`                                                                                  | S45: package from `BRAND.npmPackage`; null → `ServerNpmReleaseError("Release lookups are not available in BotDuetDot.")` before any network or `npm` call               |
| `apps/server/src/cloud/publicConfig.ts`                                                                                | S42: Ignore upstream cloud/Clerk/relay telemetry overrides; derive nightly URL from profile                                                                             |
| `apps/server/src/cloud/servicePreflight.ts`                                                                            | S54: installer hints from `BRAND.links.installSh/installPs1`; null → desktop-Settings hint                                                                              |
| `apps/server/src/device/SshDeviceHost.ts`                                                                              | S52: `BRAND.homeDirName` (JSON-quoted into the script)                                                                                                                  |
| `apps/server/src/device/sshDeviceScript.ts`                                                                            | S52: `BRAND.homeDirName` (JSON-quoted into the script)                                                                                                                  |
| `apps/server/src/environment/ServerEnvironment.ts`                                                                     | S44: `triage`, `npmReleaseLookup`, `desktopAppChannelSwitch` only when the matching `BRAND.features` flag is true (omit the key otherwise)                              |
| `apps/server/src/httpCors.ts`                                                                                          | S9: `desktopRendererOrigins(BRAND)` ∪ upstream origins                                                                                                                  |
| `apps/server/src/os-jank.ts`                                                                                           | S6: `BRAND.homeDirName`                                                                                                                                                 |
| `apps/server/src/policy/policyTemplates.ts`                                                                            | S51: `PayloadType`/`PayloadIdentifier` from `BRAND.managedPolicy.macDomain`, display names from `BRAND.name`                                                            |
| `apps/server/src/project/ManagedProjectFolders.ts`                                                                     | S55: brand name + site                                                                                                                                                  |
| `apps/server/src/provider/CodexChatGptAuth.ts`                                                                         | S48: `agent_name_hint: BRAND.name`                                                                                                                                      |
| `apps/server/src/provider/ModelManifest.ts`                                                                            | S7: `BRAND.modelManifestUrl`                                                                                                                                            |
| `apps/server/src/relay/AgentAwarenessRelay.ts`                                                                         | r7: relay config reads and publishing return early without T3 Connect                                                                                                   |
| `apps/server/src/server.ts`                                                                                            | r7: no relay webhook origin and a `None` delivery proof without T3 Connect                                                                                              |
| `apps/server/src/telemetry/AnalyticsService.ts`                                                                        | S5: key/host/enabled defaults from `BRAND.analytics`                                                                                                                    |
| `apps/server/src/triage/TriageService.ts`                                                                              | S25: Disable triage; brand repository and hosted host in bundled prompts.                                                                                               |
| `apps/server/src/triage/triagePrompt.ts`                                                                               | S25: Disable triage; brand repository and hosted host in bundled prompts.                                                                                               |
| `apps/server/vite.config.ts`                                                                                           | S2: spread `brandBuildDefine()` (+import)                                                                                                                               |
| `apps/web/src/branding.ts`                                                                                             | S27: brand name/links                                                                                                                                                   |
| `apps/web/src/components/GitHubStarPrompt.tsx`                                                                         | S37: Use fork recovery, repository and installer links.                                                                                                                 |
| `apps/web/src/components/InstallT3Commands.tsx`                                                                        | S37: Use fork recovery, repository and installer links.                                                                                                                 |
| `apps/web/src/components/ServerUpdateAction.tsx`                                                                       | Without `BRAND.npmPackage`, a manual update points to the desktop app instead of `npx t3@…`                                                                             |
| `apps/web/src/components/T3Wordmark.tsx`                                                                               | Standalone draws `BrandGlyph` instead of the T3 mark                                                                                                                    |
| `apps/web/src/components/chat/QueuedRunsControl.tsx`                                                                   | Brand queued-message attribution.                                                                                                                                       |
| `apps/web/src/components/chat/TimelineAssistantRows.tsx`                                                               | Brand assistant message headings.                                                                                                                                       |
| `apps/web/src/components/chat/TimelineUserMessageRow.tsx`                                                              | Brand sent-by attribution without changing wire values.                                                                                                                 |
| `apps/web/src/components/chat/turnDetailAnnouncement.ts`                                                               | Brand screen-reader message author announcements.                                                                                                                       |
| `apps/web/src/components/desktopUpdate.logic.ts`                                                                       | S30: `BRAND.repository`                                                                                                                                                 |
| `apps/web/src/components/onboarding/WelcomePage.tsx`                                                                   | Brand welcome and default telemetry copy.                                                                                                                               |
| `apps/web/src/components/settings/CliCommandSettingsRow.tsx`                                                           | Use the standalone CLI command and path hints.                                                                                                                          |
| `apps/web/src/components/settings/MobileAppSettingsRow.tsx`                                                            | S29: brand store links                                                                                                                                                  |
| `apps/web/src/components/settings/MultipleAccountsNote.tsx`                                                            | S57: `brandRepositoryUrl("blob/main/docs/user/faq.md#…")`                                                                                                               |
| `apps/web/src/components/settings/SettingsPanels.tsx`                                                                  | S46: render the update-track row and `UpdateTrackSwitchDialog` only when `BRAND.features.updateTrackSwitch`                                                             |
| `apps/web/src/components/settings/pairingUrls.ts`                                                                      | S26: `if (!BRAND.hostedApp.pairingLinks) return null`                                                                                                                   |
| `apps/web/src/components/settings/settingsSearch.ts`                                                                   | Match standalone command and update settings availability.                                                                                                              |
| `apps/web/src/components/sidebar/SidebarChrome.tsx`                                                                    | Standalone sidebar title is `BRAND.name`                                                                                                                                |
| `apps/web/src/components/sidebar/updateEverything.logic.ts`                                                            | Use the standalone CLI name in manual update hints.                                                                                                                     |
| `apps/web/src/components/ui/standalone-page.tsx`                                                                       | Standalone page header is `BRAND.name`                                                                                                                                  |
| `apps/web/src/hostedPairing.ts`                                                                                        | S43: ignore `VITE_HOSTED_APP_URL`/`_CHANNEL` in standalone                                                                                                              |
| `apps/web/src/legalLinks.ts`                                                                                           | S28: `BRAND.links.privacyPolicy`                                                                                                                                        |
| `apps/web/src/lib/bootError.ts`                                                                                        | S37: Use fork recovery, repository and installer links.                                                                                                                 |
| `apps/web/tsconfig.json`                                                                                               | Include shared brand build helpers in TypeScript resolution.                                                                                                            |
| `apps/web/vite.config.ts`                                                                                              | S4: spread into `define`                                                                                                                                                |
| `knip.jsonc`                                                                                                           | Entries for `scripts/standalone/*.ts` and Metro's `apps/mobile/brand/*.standalone.ts`                                                                                   |
| `packages/client-runtime/src/preview/serverBrowserStream.ts`                                                           | Browser sandbox setup fallback uses `BRAND.cliName` when there is no npm package                                                                                        |
| `packages/contracts/package.json`                                                                                      | S1: add `"./brand"` and `"./brandProfiles"` exports (contracts has 3 explicit exports)                                                                                  |
| `packages/contracts/src/environmentHttp.ts`                                                                            | S50: `brandRepositoryUrl("blob/main/docs/user/t3-connect-troubleshooting.md#…")`                                                                                        |
| `packages/shared/src/cliRelease.ts`                                                                                    | S10: `BRAND.repository`                                                                                                                                                 |
| `packages/shared/src/codexAuthHandoff.ts`                                                                              | S20: brand scheme                                                                                                                                                       |
| `packages/shared/src/connectAuth.ts`                                                                                   | S11: `DEFAULT_HOSTED_APP_URL = BRAND.hostedApp.url`                                                                                                                     |
| `packages/shared/src/managedPolicyFile.ts`                                                                             | S38: policy file path from `BRAND.managedPolicy.fileDirName`/`linuxDirName` (standalone never reads the official app's policy)                                          |
| `packages/shared/src/promptLinks.ts`                                                                                   | S47: parse with `brandAppSchemePattern(BRAND)`; `promptLinkDeepLink` default scheme `BRAND.schemes.production`                                                          |
| `packages/shared/src/providerAuthReturnUrl.ts`                                                                         | S19: `isBrandAppProtocol` + `BRAND.hostedApp.url` origin                                                                                                                |
| `packages/shared/src/remote.ts`                                                                                        | S21: emit `BRAND.schemes.production`, parse brand schemes only                                                                                                          |
| `packages/source-control-github/src/server/githubStackRebase.ts`                                                       | S41: `BRAND.git`                                                                                                                                                        |
| `packages/ssh/src/tunnel.ts`                                                                                           | S39: `BRAND.homeDirName`                                                                                                                                                |
| `scripts/build-desktop-artifact.ts`                                                                                    | S17: Preserve branded packaging, update feed, assets, entitlements and stage metadata.                                                                                  |
| `third-party-licenses.config.json`                                                                                     | S34: Include the unchanged MIT notice in desktop, web and mobile license screens.                                                                                       |

## Stay in sync with upstream

Track upstream **release tags, not `main`**, to use a known database version. Matching a release avoids deliberately taking
unreleased migrations; it does not make downgrades safe. Test each upgrade on a copied home first.
Releases belong to `github.com/ritikrishu/botduetdot`; upstream is `github.com/pingdotgg/t3code`.
Check `git remote -v`: older checkouts may still name the fork `ritikrishu/t3code`.

From a clean fork checkout, replace `vX.Y.Z` with the target release:

```bash
git fetch upstream --tags
git config rerere.enabled true
git switch -c sync/vX.Y.Z feat/standalone-app
git merge vX.Y.Z
```

Prefer merge: it preserves the fork's history and lets `rerere` reuse conflict resolutions.
Review reused resolutions too. Rebasing with `git rebase vX.Y.Z` is an alternative only for an
unshared upgrade branch; it rewrites commits. After checks and review, advance the fork branch
to the tested upgrade and record the new base release here.

The seam's behavior is the contract, not its line number. If upstream moves sidebar project-scope
selectors, reapply the hook at the new read **and write** sites. Preserve manual-filter detachment,
route reveal, search scope, empty-state escape through All, and the global palette/shortcut host.
Keep settings decoding tolerant, patches validated, mobile signing opt-in, and space shortcuts
unassigned. Refresh the table if an upstream file moves or a seam changes.

Install [vp](README.md#install-vp) first; it supplies the repository's pinned Node version.
After resolving the merge, run from the repository root:

```bash
vp i
vp run check:changed vX.Y.Z

# Settings, compatibility and shared behavior
vp test run packages/contracts/src/sidebarSpaces.test.ts packages/shared/src/serverSettings.sidebarSpaces.test.ts packages/client-runtime/src/state/sidebarSpaces.test.ts
vp test run packages/contracts/src/settings.test.ts packages/contracts/src/keybindings.test.ts packages/shared/src/serverSettings.test.ts

# Web state and existing sidebar/palette/shortcut behavior
vp test run apps/web/src/sidebarSpaces/state.test.ts
vp test run apps/web/src/components/Sidebar.browser.test.tsx apps/web/src/components/Sidebar.shortcuts.browser.test.tsx apps/web/src/components/sidebar/routeReveal.browser.test.tsx
vp test run apps/web/src/components/CommandPalette.logic.test.ts apps/web/src/components/CommandPalette.browser.test.tsx apps/web/src/shortcuts/dispatcher.browser.test.ts

# Mobile persistence, filtering and signing
vp test run apps/mobile/src/features/home/spaces/activeSpaceKeyStore.test.ts apps/mobile/src/features/home/spaces/useActiveSpaceHomeScope.test.ts apps/mobile/src/features/home/homeThreadList.test.ts apps/mobile/src/features/home/home-list-options.test.tsx apps/mobile/app.config.test.ts
```

After each standalone upgrade, check for new upstream domains, home/profile names, schemes and
environment overrides. Keep internal `@t3tools/*`, `T3CODE_*`, `t3.json` and wire identifiers.

```bash
export PATH="$HOME/.local/share/vite-plus/bin:$PATH"
export T3CODE_BRAND=standalone
node scripts/standalone/check-brand-leaks.ts --source
```

After rebuilding, run `node scripts/standalone/check-brand-leaks.ts --bundles`. It scans
`apps/server/dist`, `apps/web/dist` and `apps/desktop/dist-electron`; it takes no path argument.
The `--source` scan is advisory and can exit successfully with findings: review its output.
The [release wrappers](docs/standalone/release.md) also check the exact DMG/ZIP/AAB. Review counted
exemptions rather than increasing them to silence failures. Verify isolated homes, coexistence,
pairing/deep links, no upstream startup traffic, and updates between two fork versions.
Copied hosted thread links use `.invalid` and do not work in an external browser.

At the `v0.1.9` base, `check:changed`'s **unused patches** step currently fails on an unrelated
upstream peer-dependency issue involving `unenv` in `infra/relay`. It is not caused by Sidebar
Spaces. Record that failure separately; do not dismiss other failures as the same issue.

On the isolated desktop below, verify creation/editing/reordering/deletion, All, shortcuts,
search and all thread sections, manual-filter detachment, restart persistence, and attention dots.
Compare the sidebar before creation and after deleting all spaces. Check that unavailable projects
dim the space and show All, then reapply on return; changing project grouping must not restore
removed members. Boring sidebar mode should retain upstream filtering. On mobile, verify the bar
remains usable with no matching threads and with all threads archived.

## Compatibility with the official app

The official app can still read the same `~/.t3`, but **its next settings write drops
`sidebarSpaces`**. Copy that array out of `~/.t3/userdata/settings.json` before switching back.
This also applies if an official server writes settings while both clients are connected.

Space keybindings you add to `userdata/keybindings.json` are unknown to the official app:
it shows a config warning and stops backfilling new default shortcuts until those entries are
removed. No default space shortcuts ship: startup would backfill them into the user's file,
creating those compatibility issues automatically.

## Try desktop beside the official app

Use a seeded copy, never the live home. From the repository root, with dependencies installed:

```bash
# Read-only snapshot of live data into a disposable home; allow time and disk space.
vp run migrate-dev-db --base-dir "$HOME/t3-spaces-test" --projects 20 --threads-per-project 25
vp run dev:desktop --home-dir "$HOME/t3-spaces-test" --dry-run
# Confirm baseDir is the expanded $HOME/t3-spaces-test before launching:
vp run dev:desktop --home-dir "$HOME/t3-spaces-test"
```

Always pass `--home-dir`, including in this main checkout. The official app can keep running.
The dev app is **T3 Code (Dev)**, with its own port and Electron profile
(`~/Library/Application Support/t3code-dev` on macOS); its settings, keybindings and database
are under `~/t3-spaces-test/userdata`. Seeding removes scheduled tasks, pending work, auth sessions
and peer links. Copied threads still reference real repositories: avoid repository/worktree
mutations from the test app. Never run two servers against this test home simultaneously.

Create the first space from the command palette: **Create space…**. In **Settings → Keybindings**,
optionally add:

- `ctrl+1` through `ctrl+9` → **Sidebar: Space: 1** through **Sidebar: Space: 9**, with `when: !terminalFocus`.
- `ctrl+0` → **Sidebar: Space: All**.
- `mod+alt+]` / `mod+alt+[` → **Sidebar: Space: Next** / **Sidebar: Space: Previous**.

For free attention-dot testing, stop desktop, then run
`vp run dev --home-dir "$HOME/t3-spaces-test" --browser` and use a **Replay (dev)** scenario
that requests input or permission. Desktop dev does not register Replay.

Cleanup: stop the dev process with Ctrl+C, then delete only `~/t3-spaces-test`.
Optionally remove `~/Library/Application Support/t3code-dev` if no other dev instance uses it.
Never copy this test home back over `~/.t3`.

## Install on an iPhone with a personal Apple ID

On a Mac, install Xcode and its iOS platform support, sign into Xcode with your Apple ID,
connect the unlocked iPhone and trust the Mac. Install dependencies at the repository root
with `vp i`. Then use the [Personal Team setup](apps/mobile/README.md#development):

```bash
cd apps/mobile
(
  export APP_VARIANT=preview T3CODE_IOS_PERSONAL_TEAM=1
  export T3CODE_IOS_PERSONAL_TEAM_BUNDLE_ID="com.<you>.t3code.preview" EXPO_NO_GIT_STATUS=1
  vp exec expo prebuild --clean --platform ios &&
    vp exec expo run:ios --configuration Release --device "<udid>" --no-bundler
)
```

Replace `<you>` with your reverse-DNS identifier and `<udid>` with your phone's UDID.
Choose your Personal Team when prompted, or set `T3CODE_IOS_PERSONAL_TEAM_ID` to your team ID
inside the subshell. Prebuild regenerates the native iOS project; preserve any local native
edits first. The [Expo Release build](https://docs.expo.dev/more/expo-cli/#compiling) runs without
Metro as **T3 Code Preview**, beside the App Store app. Avoid `production` and `ios:release`
for this setup: their name and URL scheme clash with the official app.

On the phone, enable **Settings → Privacy & Security → Developer Mode**, restart and confirm
when prompted ([Apple's instructions](https://developer.apple.com/documentation/xcode/enabling-developer-mode-on-a-device)).
Trust your developer certificate under **Settings → General → VPN & Device Management** if
prompted. A free account requires rebuilding/reinstalling every seven days because its
[provisioning profiles expire](https://developer.apple.com/help/account/basics/about-your-developer-account).

Personal Team builds leave OTA updates off by default. Keep them off; opting in requires your
own update project to avoid loading upstream JavaScript. These builds omit widgets, share
extensions, push, native Sign in with Apple and Associated Domains.
**T3 Connect and push notifications do not work in the fork app. Keep the App Store app for those.**

Pair directly with your own fork server over the same LAN or Tailscale network:

- Desktop host: **Settings → Sharing & access → Network access**, then create a pairing link
  with an address reachable from the phone. Enabling network access restarts desktop.
- Headless host: run `t3 up --lan`, then `t3 pair` to generate a link; use a LAN or tailnet
  address, not `127.0.0.1`. Use the CLI belonging to your intended server installation.
- Scan the QR **inside the fork app**, or paste the URL into **Add environment**. The iPhone
  Camera app opens the official app instead. Allow Local Network access when iOS asks.

Create/edit spaces on desktop or web connected to that fork server. Mobile v1 is view-and-switch
only; installing the fork mobile client alone does not add spaces to an official server.

## Install on Android (Galaxy Fold)

Build **T3 Code Preview** (`com.t3tools.t3code.preview`) beside the official Play Store app
(`com.t3tools.t3code`). On an Apple silicon Mac with Homebrew and repository dependencies
installed (`vp i`), set up JDK 17 and the Android SDK once. No shell profile edits are needed:

```bash
export PATH="$HOME/.local/share/vite-plus/bin:/opt/homebrew/bin:$PATH"
brew install openjdk@17
brew install --cask android-commandlinetools
export JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home
export ANDROID_HOME="$HOME/Library/Android/sdk"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"
mkdir -p "$ANDROID_HOME/cmdline-tools"
# Skip this link if it already exists.
ln -s /opt/homebrew/share/android-commandlinetools/cmdline-tools/latest "$ANDROID_HOME/cmdline-tools/latest"
yes | sdkmanager --sdk_root="$ANDROID_HOME" --licenses
sdkmanager --sdk_root="$ANDROID_HOME" 'platform-tools' 'platforms;android-37.0' \
  'build-tools;37.0.0' 'build-tools;36.0.0' 'ndk;27.1.12297006' 'cmake;3.22.1' 'cmake;3.30.5'
```

These versions match the current Expo 58 / React Native 0.88 native project (Gradle 9.4.1,
AGP 9.2.1). SDK 37 is published as `platforms;android-37.0`. Allow several GB for downloads
and build caches. The repository's mobile Brewfile installs linters, not this toolchain.

From the repository root, build a self-contained Release APK for the Fold's ARM64 processor:

```bash
(
  set -e
  export PATH="$HOME/.local/share/vite-plus/bin:/opt/homebrew/bin:$PATH"
  export JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home
  export ANDROID_HOME="$HOME/Library/Android/sdk"
  export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"
  export APP_VARIANT=preview T3CODE_MOBILE_UPDATES_ENABLED=0 EXPO_NO_GIT_STATUS=1
  export NODE_ENV=production
  cd apps/mobile
  vp exec expo prebuild --clean --platform android --no-install
  mkdir -p "$HOME/.android"
  if [ ! -f "$HOME/.android/debug.keystore" ]; then
    keytool -genkeypair -keystore "$HOME/.android/debug.keystore" \
      -storepass android -alias androiddebugkey -keypass android \
      -dname "CN=Android Debug,O=Android,C=US" -keyalg RSA -keysize 2048 -validity 10000
  fi
  cp "$HOME/.android/debug.keystore" android/app/debug.keystore
  cd android
  vp exec ./gradlew :app:assembleRelease -PreactNativeArchitectures=arm64-v8a \
    --max-workers=4 --console=plain
  mkdir -p "$HOME/t3-fork-apk"
  cp app/build/outputs/apk/release/app-release.apk "$HOME/t3-fork-apk/t3code-preview.apk"
)
```

**Always set `T3CODE_MOBILE_UPDATES_ENABLED=0` for Android fork builds.** The Personal Team
OTA default-off applies to the iOS setup only; Android otherwise enables upstream updates.
Keep T3 Connect configuration unset in the root environment files. No `google-services.json`
is needed for this build. Prebuild replaces the generated `android/` directory; preserve any
local native edits first. The APK runs without Metro or a development server.

The template signs Release with `android/app/debug.keystore`. The command above copies the
persistent `~/.android/debug.keystore` there after every prebuild. Back up that key: reinstalling
with `-r` preserves app data only when the package and signing key match. A different key requires
uninstalling first, which removes local app data. For private sideloading this debug signature
works; for distribution, create a dedicated release keystore and configure Gradle release signing,
then consistently use that key for all subsequent builds.

On Galaxy phones released with One UI 6.1.1 or later (including recent Folds), **Auto Blocker** is on by default and
blocks both install routes below: turn it off under **Settings → Security and privacy → Auto
Blocker** before each install or reinstall, and back on afterwards if you want it. Unlock
**Developer options** by tapping **Settings → About phone → Software information → Build number**
seven times.

Enable **Developer options → USB debugging** on the phone, connect USB and accept the Mac's
RSA authorization prompt. Install with:

```bash
"$HOME/Library/Android/sdk/platform-tools/adb" install -r "$HOME/t3-fork-apk/t3code-preview.apk"
```

Alternatively, copy the APK to the phone, open it in Files and allow **Install unknown apps**
for the app opening it. Keep the official Play Store app for **T3 Connect and push notifications**;
neither works in the fork app.

Pair with your own fork server over LAN or Tailscale. On the desktop host, open **Settings →
Sharing & access → Network access**, enable access and create a pairing link with an address
reachable from the phone (enabling access restarts desktop). Scan the QR **inside the fork app**,
not with the phone's camera app, or paste the link into **Add environment**. Create/edit spaces
on desktop or web connected to that server. The spaces bar appears on both the folded cover
screen and the unfolded inner screen's split view; mobile only views and switches spaces.

## Daily desktop use and releases

Install the signed Apple-silicon build from
[BotDuetDot Releases](https://github.com/ritikrishu/botduetdot/releases/latest).
Use the [release runbook](docs/standalone/release.md) for signing, verification, updates and Play
promotion, and the [store listing](docs/standalone/store-listing.md) and
[data-safety answers](docs/standalone/data-safety.md) for Play Console.
