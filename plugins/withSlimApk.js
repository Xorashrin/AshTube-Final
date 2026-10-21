// Shrinks the release APK: English-only resources and R8 full mode. Runs during `expo prebuild`.
// One APK carries both ARM ABIs (32-bit and 64-bit), so a single file installs on every Android phone and tablet.
const { withAppBuildGradle, withGradleProperties } = require('expo/config-plugins');

module.exports = function withSlimApk(config) {
  config = withGradleProperties(config, (cfg) => {
    const set = (key, value) => {
      const existing = cfg.modResults.find((p) => p.type === 'property' && p.key === key);
      if (existing) existing.value = value;
      else cfg.modResults.push({ type: 'property', key, value });
    };
    set('android.enableR8.fullMode', 'true');
    set('android.enableResourceOptimizations', 'true');
    return cfg;
  });
  return withAppBuildGradle(config, (cfg) => {
    let gradle = cfg.modResults.contents;
    if (!gradle.includes('localeFilters')) {
      gradle = /androidResources\s*\{/.test(gradle)
        ? gradle.replace(/androidResources\s*\{/, 'androidResources {\n        localeFilters.addAll(["en"])')
        : gradle.replace(/android\s*\{/, 'android {\n    androidResources {\n        localeFilters.addAll(["en"])\n    }');
    }
    cfg.modResults.contents = gradle;
    return cfg;
  });
};
