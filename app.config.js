// Every CI build gets a higher versionCode than the last, so a new APK always installs over the old one.
module.exports = ({ config }) => {
  const run = Number(process.env.GITHUB_RUN_NUMBER);
  return {
    ...config,
    android: { ...config.android, versionCode: Number.isFinite(run) && run > 0 ? 1000 + run : config.android?.versionCode ?? 1 },
  };
};
