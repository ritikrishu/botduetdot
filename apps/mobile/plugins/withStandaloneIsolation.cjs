const { withSettingsGradle } = require("expo/config-plugins");

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

module.exports = function withStandaloneIsolation(config) {
  // Sharing and widgets recreate EAS metadata during plugin evaluation; this plugin must run last.
  if (config.extra) delete config.extra.eas;
  return withSettingsGradle(config, (mod) => {
    if (mod.modResults.language !== "groovy") {
      throw new Error("Standalone autolinking exclusion requires Groovy settings.gradle.");
    }
    mod.modResults.contents = excludeObserve(mod.modResults.contents);
    return mod;
  });
};
module.exports.excludeObserve = excludeObserve;
