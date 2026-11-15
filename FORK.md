# Maintaining this fork

## What this fork adds

Sidebar Spaces are Arc-style named sets of projects, with icons and attention indicators.
Web and desktop provide a switcher strip, editing, command-palette actions and optional shortcuts; mobile provides a view-and-switch bar.
Definitions live in `ServerSettings.sidebarSpaces` in each environment's `userdata/settings.json`; the active selection is per device.
With no spaces, the sidebar keeps upstream behavior. The fork changes no server code and adds no database migrations.

## Upstream seams

Base release: `v0.1.9`. These are all pre-existing files changed by the fork since that tag; review their diffs on each upgrade.

| Upstream file                                       | Fork edit to preserve                                                                                     |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `packages/contracts/src/settings.ts`                | Export space contracts and add lenient persisted settings plus validated settings patches.                |
| `packages/contracts/src/keybindings.ts`             | Register space command IDs without adding default shortcuts.                                              |
| `packages/client-runtime/package.json`              | Export the shared `state/sidebar-spaces` module.                                                          |
| `apps/web/src/components/Sidebar.tsx`               | Wrap project-scope reads/writes with the space hook and mount the strip above the footer.                 |
| `apps/web/src/components/CommandPalette.tsx`        | Add space actions to the palette.                                                                         |
| `apps/web/src/routes/__root.tsx`                    | Mount the global space shortcut/editor host.                                                              |
| `apps/mobile/src/features/home/HomeRouteScreen.tsx` | Detach the active space when the manual project filter changes.                                           |
| `apps/mobile/src/features/home/HomeScreen.tsx`      | Apply space scope to the list/search and retain the switcher in empty states.                             |
| `apps/mobile/app.config.ts`                         | Support Personal Team signing, matching keychain identity, no Associated Domains, and OTA off by default. |
| `apps/mobile/app.config.test.ts`                    | Cover variants, Personal Team signing, bundle identity, entitlements and OTA opt-in.                      |
| `apps/mobile/README.md`                             | Document Personal Team signing and a preview Release install beside the store app.                        |

New code is isolated under `packages/contracts/src/sidebarSpaces*`,
`packages/client-runtime/src/state/sidebarSpaces*`, `apps/web/src/sidebarSpaces/`,
and `apps/mobile/src/features/home/spaces/`, with tests beside it and
`packages/shared/src/serverSettings.sidebarSpaces.test.ts`.

## Stay in sync with upstream

Track upstream **release tags, not `main`**: daily packaged use shares data with the official app,
so the fork must follow its database version. Matching a release avoids deliberately taking
unreleased migrations; it does not make downgrades safe. Test each upgrade on a copied home first.
`origin` is `github.com/ritikrishu/t3code`; `upstream` is `github.com/pingdotgg/t3code`.

From a clean fork checkout, replace `vX.Y.Z` with the target release:

```bash
git fetch upstream --tags
git config rerere.enabled true
git switch -c sync/vX.Y.Z feat/sidebar-spaces
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
removed. No default space shortcuts ship for this reason.

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

## Daily desktop use: open follow-up

Packaged builds share the official app's identity, profile and data; they are not isolated like
**T3 Code (Dev)**. They auto-update to upstream unless `T3CODE_DISABLE_AUTO_UPDATE=1` is set
in the app's launch environment ([DesktopConfig.ts](apps/desktop/src/app/DesktopConfig.ts)).
An update to the official build would remove the fork feature and drop the spaces on its next
settings write. A verified daily packaging/install procedure, persistent updater configuration
and an independent app identity/update channel remain follow-up work. Until then, use the
isolated dev setup above to try the fork.
