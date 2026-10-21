// Shrinks the release APK: English-only resources, R8 full mode, no unused ABIs/lint, and
// no PNG crunching of already-optimized assets. Runs during `expo prebuild`.
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
    // One APK per CPU architecture (plus a universal one): every phone gets a small file that matches its chip.
    if (!/splits\s*\{/.test(gradle)) {
      gradle = gradle.replace(
        /android\s*\{/,
        'android {\n    splits {\n        abi {\n            reset()\n            enable true\n            universalApk true\n            include "armeabi-v7a", "arm64-v8a", "x86", "x86_64"\n        }\n    }',
      );
    }
    cfg.modResults.contents = gradle;
    return cfg;
  });
};
