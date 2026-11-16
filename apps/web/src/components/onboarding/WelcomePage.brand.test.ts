// @effect-diagnostics nodeBuiltinImport:off - checks branding seams without mounting the onboarding app.
import * as NodeFS from "node:fs";
import { expect, it } from "vite-plus/test";

it("keeps onboarding and legal telemetry copy behind the analytics policy", () => {
  const welcome = NodeFS.readFileSync(new URL("./WelcomePage.tsx", import.meta.url), "utf8");
  const settings = NodeFS.readFileSync(
    new URL("../settings/SettingsPanels.tsx", import.meta.url),
    "utf8",
  );
  expect(welcome).toContain("{`Welcome to ${BRAND.name}`}");
  expect(welcome).toMatch(
    /BRAND.analytics.enabledByDefault\s*\? \(telemetryOff \?\? `\$\{BRAND.name\} collects anonymous usage data to improve the app\.`\)\s*: `\$\{BRAND.name\} collects no usage data\.`/,
  );
  expect(welcome).toMatch(
    /BRAND.analytics.enabledByDefault && telemetryOff === undefined\s*\? "To opt out, see the"\s*: "See the"/,
  );
  expect(welcome).toContain("href={PRIVACY_POLICY_URL}");
  expect(settings).toMatch(
    /!BRAND.analytics.enabledByDefault\s*\? `\$\{BRAND.name\} collects no usage data\.`\s*: telemetryOff === undefined/,
  );
  expect(settings).toContain("href={PRIVACY_POLICY_URL}");
});
