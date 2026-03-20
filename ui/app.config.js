/** Build iOS reversed client scheme for Google Sign-In config plugin (from EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID). */
function iosGoogleUrlScheme() {
  const id = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  if (!id || typeof id !== 'string') return null;
  const host = id.replace(/\.apps\.googleusercontent\.com$/i, '');
  return `com.googleusercontent.apps.${host}`;
}

const iosUrlScheme = iosGoogleUrlScheme();

const plugins = ['expo-router', 'expo-font', 'expo-web-browser'];
if (iosUrlScheme) {
  plugins.push(['@react-native-google-signin/google-signin', { iosUrlScheme }]);
}

module.exports = {
  expo: {
    name: 'Popin',
    slug: 'popin',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/favicon.png',
    scheme: 'popin',
    userInterfaceStyle: 'light',
    splash: {
      image: './assets/favicon.png',
      backgroundColor: '#FAFAF9',
      resizeMode: 'contain',
    },
    ios: {
      supportsTablet: false,
      bundleIdentifier: 'com.popin.app',
    },
    android: {
      adaptiveIcon: {
        backgroundColor: '#FAFAF9',
      },
      package: 'com.popin.app',
    },
    web: {
      bundler: 'metro',
      favicon: './assets/favicon.png',
    },
    plugins,
    experiments: {
      typedRoutes: true,
      tsconfigPaths: true,
    },
  },
};
