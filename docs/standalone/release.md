# Release BotDuetDot

Run from the repository root on an Apple-silicon Mac. Release repository:
`ritikrishu/botduetdot`; Android package: `com.ritikrishu.botduetdot` (permanent after first upload).
Do not use the older preview/debug-signed APK procedure in FORK.md for Play.

## One-time setup

1. Join the Apple Developer Program. Create a **Developer ID Application** certificate with its
   private key in the login keychain, or export a password-protected `.p12` for `CSC_LINK` and
   `CSC_KEY_PASSWORD`. Record the Team ID and back up the private key securely. Standalone does not
   require upstream passkey provisioning profiles. See [macOS signing](https://www.electron.build/docs/features/code-signing/code-signing-mac/).
2. Configure exactly one complete notarization credential set: `APPLE_API_KEY` (absolute `.p8` path),
   `APPLE_API_KEY_ID`, `APPLE_API_ISSUER`; or a stored notarytool profile via `APPLE_KEYCHAIN_PROFILE`;
   or `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`. Back up the once-downloadable `.p8`
   offline. Keep credentials out of the repository and command transcripts.
   See [notarization variables](https://www.electron.build/docs/environment-variables/).
3. Install the Android toolchain described in [FORK.md](../../FORK.md#install-on-android-galaxy-fold)
   and bundletool. Create a dedicated upload key outside the checkout:

   ```bash
   keytool -genkeypair -v -storetype PKCS12 -keystore "$HOME/keys/botduetdot-upload.p12" \
     -alias upload -keyalg RSA -keysize 2048 -validity 10000
   ```

   Create the private `keys` directory first. Back up the keystore, passwords, alias and certificate
   SHA-256 offline. Keep the password in the login keychain
   (`security add-generic-password -a "$USER" -s botduetdot-upload -w`) and print the certificate
   SHA-256 with `keytool -list -v -keystore "$HOME/keys/botduetdot-upload.p12"`.
   `release-android.ts` reads all five values from the environment of the release shell (not
   `gradle.properties`) and refuses a keystore inside the checkout:

   ```bash
   export STANDALONE_UPLOAD_STORE_FILE="$HOME/keys/botduetdot-upload.p12"
   export STANDALONE_UPLOAD_KEY_ALIAS=upload
   export STANDALONE_UPLOAD_CERT_SHA256="AB:CD:…"  # from keytool -list -v
   export STANDALONE_UPLOAD_STORE_PASSWORD="$(security find-generic-password -s botduetdot-upload -w)"
   export STANDALONE_UPLOAD_KEY_PASSWORD="$STANDALONE_UPLOAD_STORE_PASSWORD"
   ```

   The [signing plugin](../../apps/mobile/plugins/withAndroidReleaseSigning.cjs) requires release
   credentials. Enrol in Play App Signing: Google holds the app-signing key; this upload key signs
   submissions. Never substitute the Android debug key.

4. Keep the GitHub repository public for unauthenticated updates. Enable Issues and set the homepage
   to https://ritikrishu.github.io/botduetdot/. Set the checkout's GitHub default to
   `ritikrishu/botduetdot`; still pass `--repo ritikrishu/botduetdot` to release commands. Disable inherited
   upstream release workflows before enabling automation. Local release wrappers need no Actions.
5. Publish only [site/](site/) through GitHub Pages, not all of `/docs`. It contains plain HTML and
   directory indexes for extensionless routes, ready for a Pages artifact or the root of `gh-pages`.
   Select Actions deployment if the T7 Pages workflow is installed; otherwise arrange a `gh-pages`
   deployment. **The owner/orchestrator enables and deploys Pages.** Verify the homepage and all four
   linked legal routes publicly before Play submission.
6. Approve the app name/artwork, [store listing](store-listing.md), [Data safety](data-safety.md) and
   public policies. Supply the Play contact email, reviewer access and account type/creation date.
   The lifetime macOS runtime name is **BotDuetDot** (`desktop.stageInName: false`, decided
   2026-11-20). Never change it: a rename orphans the **BotDuetDot Safe Storage** Keychain item.

## Version policy

Use `X.Y.Z-botduetdot.N`: `X.Y.Z` is the upstream release base, `N` increases for every fork release
on that base (start at 1 for a new base). Tag `v<version>` and publish a full GitHub release, not a
prerelease: the feed uses `latest`. Android versionName matches desktop; versionCode is an increasing
`YYYYMMDDNN` integer across all tracks (maximum 2100000000). Never reuse a code for a rebuilt AAB.
Promoting the same AAB between tracks keeps its code.

Pass the release version to the wrappers; do not blanket-rewrite workspace package versions. Record
base tag, source commit, versionCode and artifact hashes with release notes. Never downgrade a migrated
home; test upgrades on a copy and retain a pre-upgrade backup.

## Build and verify each release

Start with a clean, reviewed release checkout after integration. Never copy `.env.example` into a
standalone build environment; upstream service keys/URLs fail the brand guard. Never export
`T3CODE_HOME` globally. Install dependencies using `vp i` when needed.

```bash
export PATH="$HOME/.local/share/vite-plus/bin:$PATH"
export T3CODE_BRAND=standalone
node scripts/standalone/check-brand-leaks.ts --source
node scripts/standalone/release-desktop-mac.ts --version 0.1.9-botduetdot.1 --dry-run
git push origin HEAD  # origin = ritikrishu/botduetdot; --target needs the commit there
node scripts/standalone/release-desktop-mac.ts --version 0.1.9-botduetdot.1 \
  --publish --notes-file ~/botduetdot-notes/0.1.9-botduetdot.1.md
```

Publishing is one run: it builds, verifies both containers, stages the checked bytes in
`release/mac/<version>/` and only then uploads exactly those files. There is no publish-only mode,
and the wrapper refuses a version whose `release/mac/<version>/` already exists. A run without
`--publish` is a local rehearsal that reserves that output directory: publish the next `.N`, or delete
the directory first. Keep the notes file outside the checkout; an untracked file fails the clean-tree
check. With `--publish`, the wrapper checks before building that the commit is on GitHub.

`--dry-run` lists missing prerequisites without credentials, building or network access. The build
needs a clean committed checkout, macOS arm64, Xcode tools, `gh` authentication and a Rust toolchain
that meets the locked `sysinfo` minimum (1.95.0 worked; set `RUSTUP_TOOLCHAIN` if your default is older).
Only `--publish` creates a GitHub release, and it requires `--notes-file`. Run `node
scripts/standalone/release-desktop-mac.ts --help` for the full list. After rebuilding, run
`node scripts/standalone/check-brand-leaks.ts --bundles` (no path argument). It scans
`apps/server/dist`, `apps/web/dist` and `apps/desktop/dist-electron`. The `--source` scan is advisory:
inspect its findings even when it exits successfully.

The desktop wrapper must build arm64 DMG, update ZIP, both blockmaps and `latest-mac.yml`; verify the
signed, stapled `.app` inside **both** containers, matching CDHashes, bundle identifier, Developer ID
and Team ID; assess each app with Gatekeeper; scan exact artifacts and record hashes. App verification
uses `codesign --verify --deep --strict`, `xcrun stapler validate` and `spctl -a -t exec`.
The DMG container itself is not separately notarized in v1. Do not run app stapling checks against the
DMG or alter an artifact after its update manifest/blockmap is generated.

For Android, use `scripts/standalone/release-android.ts` with this release environment:

```bash
export T3CODE_BRAND=standalone EXPO_PUBLIC_T3CODE_BRAND=standalone APP_VARIANT=production
export T3CODE_MOBILE_VERSION=0.1.9-botduetdot.1 T3CODE_ANDROID_VERSION_CODE=2026111601
export T3CODE_MOBILE_UPDATES_ENABLED=0 EXPO_NO_GIT_STATUS=1 NODE_ENV=production
```

```bash
node scripts/standalone/release-android.ts --version 0.1.9-botduetdot.1 \
  --version-code 2026111601 --previous-version-code 0 --dry-run
node scripts/standalone/release-android.ts --version 0.1.9-botduetdot.1 \
  --version-code 2026111601 --previous-version-code 0
```

`--previous-version-code` (or `STANDALONE_ANDROID_PREVIOUS_VERSION_CODE`) is the highest code already
used on **any** Play track; use `0` for the first upload. The wrapper sets the brand environment above
itself, needs a clean checkout, JDK 17, the Android SDK, `bundletool`, `keytool` and `jarsigner`, and
runs the full Gradle task `:app:bundleRelease` (signing is read only for release tasks, so abbreviated
task names skip it). If you run Metro yourself while testing, start it with the same `T3CODE_BRAND`
as the native build; a mismatched Metro serves the other brand's JavaScript. Do not bypass the wrapper
with a raw Gradle build for publication.
The wrapper prebuilds production Android, builds all ABIs, then exports the same Metro entry as
JavaScript with `expo export --platform android --no-bytecode` in a private temporary directory using
the same release environment. The JS scan checks forbidden patterns, constructed upstream schemes and
the exact count of internal `"t3code"` literals. Hermes still checks every forbidden pattern in ASCII
and UTF-16, with exact counted attribution and shared-schema exemptions. Hermes string-table adjacency
is not JavaScript syntax, so bare-token and constructed-scheme checks belong to the JS scan.
Both bundles must pass the same release gate, along with AAB manifest/config checks and signing
certificate verification against `STANDALONE_UPLOAD_CERT_SHA256` (not Android Debug). The wrapper emits
`release/android/BotDuetDot-<version>-<versionCode>.aab`, `.sha256` and `.build.json`; `androidJsSha256`
records the digest of the JS bytes that passed. The temporary export is removed on success or failure.

To inspect an existing AAB, export JS from its exact checkout with the release environment above:

```bash
android_js_dir=$(mktemp -d)
(cd apps/mobile && vp exec expo export --platform android --no-bytecode --output-dir "$android_js_dir")
node scripts/standalone/check-brand-leaks.ts --android-aab /path/to/release.aab \
  --android-js "$android_js_dir"/_expo/static/js/android/index-*.js \
  --version 0.1.9-botduetdot.1 --version-code 2026111601
```

`--android-aab` requires `--android-js`; the checker does not run Metro or verify that a separately
supplied export matches the AAB's build environment. Use the wrapper for release builds. For a quick
JS-only check, pass `--android-js BUNDLE` alone; it does not check the AAB. Remove the temporary export
after inspection. [Expo CLI options](https://docs.expo.dev/more/expo-cli/#exporting) describe the export.

Before first publication and after relevant upstream changes, run these integration checks:

- **A, explicit home:** with `T3CODE_HOME` set to a temporary folder, the app writes only there and
  never touches `~/.t3` or `~/.botduetdot`.
- **B, default home:** with a fake `HOME` holding a seeded `.t3`, the app creates `.botduetdot` and
  leaves `.t3` byte-identical.
- **C, coexistence:** BotDuetDot and the official app run together without opening each other's files.
- **D, links:** `botduetdot://new?prompt=hi` opens a draft and `t3code://` still opens the official app.
  Settings has no update-track row and the command palette no triage entry.
- **E, network:** no connections to `*.t3.codes`, Expo, npm or the upstream GitHub owner.
- **F, update:** a signed `.N` installed from the DMG updates to `.N+1` published by the wrapper.
- **G, Android:** the checked AAB installs beside the official app, opens `botduetdot://` links and pairs.
  The prerelease-shaped version's behavior in electron-updater remains a release gate: test with
  `--mock-updates` and `vp run start:mock-update-server` before promising updates. Bundled upstream-profile
  elimination is also unverified until scans pass. Windows, Linux, Intel Mac and standalone iOS are outside v1.

## Test a build on your Mac before publishing

Run the app against a throwaway home so your real data is never touched:
`T3CODE_HOME="$(mktemp -d)/home" /Applications/BotDuetDot.app/Contents/MacOS/BotDuetDot`. BotDuetDot
keeps its data in `~/.botduetdot` and `~/Library/Application Support/botduetdot`, separate from T3
Code's `~/.t3` and `t3code-v2`, so both apps can run side by side.

To test `botduetdot://` links, install the app into `/Applications` (or another normal folder) first.
macOS ignores URL handlers inside temporary folders and inside disk images mounted without a Finder
window, so links opened from there report that no application can open them.

On first launch the desktop server checks GitHub for BotDuetDot updates and reads the public release
channels of supported AI tools (for example `downloads.claude.ai` and `api.meta.ai`) to offer CLI
updates; Settings → Maintenance → Provider update checks turns the latter off. It never contacts
`*.t3.codes`, Expo, npm or the upstream GitHub owner.

## Publish and promote

The desktop wrapper's `--publish` run (above) verifies hashes and uploads the five checked files to
`ritikrishu/botduetdot` as a full release. Do not silently replace published artifacts; issue a new
version for a correction. Check the release download and update feed after publication.

Upload only the staged, verified AAB in Play Console:

1. **Internal:** test installation, paired-server access, permissions, voice/attachments and upgrades.
   Inspect Console's merged-manifest, target API and 16 KB page-alignment warnings. Current target/compile
   settings come from [mobile config](../../apps/mobile/app.config.ts); Console's current requirement wins.
2. **Closed:** complete listing, policies, Data safety, ads, audience, content rating, AI-content and
   App access declarations. For personal accounts created after **2023-11-13**, maintain at least
   **12 opted-in testers for 14 consecutive days**, then apply for production access with test evidence.
   Organization accounts are outside that specific new-personal-account rule.
   See [Google's testing requirements](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en).
3. **Production:** after access approval and review, promote the tested AAB and choose rollout scope.
   Keep reviewer access operational. Review feedback before expanding rollout; fix failures with a higher
   versionCode. Do not assume reaching day 14 automatically grants production access.
