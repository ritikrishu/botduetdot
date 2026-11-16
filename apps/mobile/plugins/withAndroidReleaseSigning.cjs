"use strict";
const { withAppBuildGradle } = require("expo/config-plugins");
const marker = "// BotDuetDot upload signing";
const signing = `
${marker}
def standaloneUploadValue = { name ->
    def value = System.getenv(name) ?: project.findProperty(name)
    if (!value) throw new GradleException("Missing " + name + " for standalone upload signing")
    return value
}
android {
    signingConfigs {
        release {
            storeFile file(standaloneUploadValue("STANDALONE_UPLOAD_STORE_FILE"))
            storePassword standaloneUploadValue("STANDALONE_UPLOAD_STORE_PASSWORD")
            keyAlias standaloneUploadValue("STANDALONE_UPLOAD_KEY_ALIAS")
            keyPassword standaloneUploadValue("STANDALONE_UPLOAD_KEY_PASSWORD")
        }
    }
    buildTypes.release.signingConfig = signingConfigs.release
}
`;
function applyReleaseSigning(contents) {
  if (contents.includes(marker)) return contents;
  if (!/buildTypes\s*\{/.test(contents))
    throw new Error("Android buildTypes block missing; review release signing plugin.");
  // Override after the generated android block so release can never inherit Expo's debug key.
  return contents + signing;
}
module.exports = function withAndroidReleaseSigning(config) {
  return withAppBuildGradle(config, (mod) => {
    if (mod.modResults.language !== "groovy")
      throw new Error("Standalone signing requires Groovy build.gradle.");
    mod.modResults.contents = applyReleaseSigning(mod.modResults.contents);
    return mod;
  });
};
module.exports.applyReleaseSigning = applyReleaseSigning;
