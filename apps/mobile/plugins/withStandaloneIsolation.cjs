const { AndroidConfig, withSettingsGradle, withStringsXml } = require("expo/config-plugins");
const { STANDALONE_BRAND } = require("../../../packages/contracts/src/brandProfiles.ts");

const marker = "// BotDuetDot excludes native crash reporting";
const useExpoModules = "expoAutolinking.useExpoModules()";

function excludeObserve(contents) {
  if (contents.includes(marker)) return contents;
  if (!contents.includes(useExpoModules)) {
    throw new Error("Expo autolinking call missing; review standalone native exclusion.");
  }
  return contents.replace(
    useExpoModules,
    `${marker}\nexpoAutolinking.exclude = (expoAutolinking.exclude ?: []) + ["expo-observe"]\n${useExpoModules}`,
  );
}

// Native modules read these from resources (their own defaults are the upstream values); the app's
// resources override them, so Kotlin never ships the upstream name or hosted thread links.
function nativeBrandStrings(brand = STANDALONE_BRAND) {
  return {
    t3_pictures_album: brand.name,
    t3_clipboard_label: brand.name,
    t3_hosted_thread_link_prefix: `${brand.hostedApp.url}/threads/`,
  };
}

function overrideNativeBrandStrings(strings, values = nativeBrandStrings()) {
  return AndroidConfig.Strings.setStringItem(
    Object.entries(values).map(([name, value]) => ({
      $: { name, translatable: "false" },
      _: value,
    })),
    strings,
  );
}

module.exports = function withStandaloneIsolation(config) {
  // Sharing and widgets recreate EAS metadata during plugin evaluation; this plugin must run last.
  if (config.extra) delete config.extra.eas;
  config = withStringsXml(config, (mod) => {
    mod.modResults = overrideNativeBrandStrings(mod.modResults);
    return mod;
  });
  return withSettingsGradle(config, (mod) => {
    if (mod.modResults.language !== "groovy") {
      throw new Error("Standalone autolinking exclusion requires Groovy settings.gradle.");
    }
    mod.modResults.contents = excludeObserve(mod.modResults.contents);
    return mod;
  });
};
module.exports.excludeObserve = excludeObserve;
module.exports.nativeBrandStrings = nativeBrandStrings;
module.exports.overrideNativeBrandStrings = overrideNativeBrandStrings;
