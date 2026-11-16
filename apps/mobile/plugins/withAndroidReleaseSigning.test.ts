import * as NodeModule from "node:module";
import { expect, it } from "vite-plus/test";
const require = NodeModule.createRequire(import.meta.url);
const { applyReleaseSigning } = require("./withAndroidReleaseSigning.cjs") as {
  applyReleaseSigning: (contents: string) => string;
};
it("overrides release debug signing with build-time credentials idempotently", () => {
  const template = `android { buildTypes { debug { signingConfig signingConfigs.debug } release { signingConfig signingConfigs.debug } } }`;
  const result = applyReleaseSigning(template);
  expect(applyReleaseSigning(result)).toBe(result);
  expect(
    result.lastIndexOf("buildTypes.release.signingConfig = signingConfigs.release"),
  ).toBeGreaterThan(result.lastIndexOf("signingConfig signingConfigs.debug"));
  expect(result).toContain("System.getenv(name) ?: project.findProperty(name)");
  expect(result).toContain("gradle.startParameter.taskNames.any");
  expect(result.indexOf("if (standaloneReleaseRequested)")).toBeLessThan(
    result.indexOf("storeFile file(standaloneUploadValue("),
  );
  expect(result).toContain("android.buildTypes.release.signingConfig = null");
  expect(result).toContain('throw new GradleException("Missing "');
  for (const key of ["STORE_FILE", "STORE_PASSWORD", "KEY_ALIAS", "KEY_PASSWORD"])
    expect(result).toContain(`STANDALONE_UPLOAD_${key}`);
  expect(() => applyReleaseSigning("plugins {}")).toThrow(/buildTypes/);
});
