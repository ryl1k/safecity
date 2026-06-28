// babel-preset-expo handles Reanimated/Worklets and expo-router automatically
// for SDK 52 — no extra plugins needed for this scaffold.
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
  };
};
