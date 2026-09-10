/** Build iOS reversed client scheme for Google Sign-In config plugin (from EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID). */
function iosGoogleUrlScheme() {
  const id = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  if (!id || typeof id !== 'string') return null;
  const host = id.replace(/\.apps\.googleusercontent\.com$/i, '');
  return `com.googleusercontent.apps.${host}`;
}

const iosUrlScheme = iosGoogleUrlScheme();

const plugins = [
  'expo-router',
  'expo-font',
  [
    'expo-splash-screen',
    {
      backgroundColor: '#FAFAF9',
      image: './assets/favicon.png',
      imageWidth: 200,
      resizeMode: 'contain',
      ios: {
        image: './assets/splash.png',
        enableFullScreenImage_legacy: true,
      },
      android: {
        image: './assets/favicon.png',
        imageWidth: 200,
      },
    },
  ],
  'expo-web-browser',
  ['expo-audio', { microphonePermission: 'moijia can record video with sound.', recordAudioAndroid: true }],
  'expo-video',
  [
    'expo-build-properties',
    {
      ios: {
        extraPods: [
          { name: 'GoogleUtilities', modular_headers: true },
          { name: 'GoogleDataTransport', modular_headers: true },
          { name: 'nanopb', modular_headers: true },
          { name: 'PromisesObjC', modular_headers: true },
        ],
      },
    },
  ],
  './plugins/withIosModularHeaders',
  [
    'expo-notifications',
    {
      icon: './assets/favicon.png',
      color: '#FAFAF9',
    },
  ],
  [
    'expo-image-picker',
    {
      photosPermission: 'moijia needs access to your photos and videos to upload them.',
      cameraPermission: 'moijia can use the camera to add photos and videos.',
      microphonePermission: 'moijia can record video with sound.',
    },
  ],
  [
    'expo-location',
    {
      locationWhenInUsePermission:
        'moijia uses your location to suggest nearby places when setting an event location.',
    },
  ],
  [
    'expo-calendar',
    {
      calendarPermission: 'moijia can add this event to Apple Calendar.',
      remindersPermission: 'moijia can add this event to Apple Calendar.',
    },
  ],
];
if (iosUrlScheme) {
  plugins.push(['@react-native-google-signin/google-signin', { iosUrlScheme }]);
}

module.exports = {
  expo: {
    name: 'moijia',
    slug: 'moijia',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/favicon.png',
    scheme: 'moijia',
    userInterfaceStyle: 'dark',
    splash: {
      image: './assets/splash.png',
      backgroundColor: '#FAFAF9',
      resizeMode: 'contain',
    },
    ios: {
      supportsTablet: false,
      bundleIdentifier: 'com.moijia.moijia',
      appleTeamId: 'U25ANZD978',
      associatedDomains: ['applinks:moijia.com', 'applinks:moijia.com?mode=developer'],
      useFrameworks: 'static',
      infoPlist: {
        NSCalendarsUsageDescription: 'moijia can add this event to Apple Calendar.',
        NSCalendarsFullAccessUsageDescription: 'moijia can add this event to Apple Calendar.',
        NSCalendarsWriteOnlyAccessUsageDescription:
          'moijia can add this event to Apple Calendar.',
        NSRemindersUsageDescription: 'moijia can add this event to Apple Calendar.',
        NSRemindersFullAccessUsageDescription: 'moijia can add this event to Apple Calendar.',
      },
    },
    android: {
      permissions: ['com.android.vending.BILLING'],
      googleServicesFile: './google-services.json',
      adaptiveIcon: {
        backgroundColor: '#FAFAF9',
      },
      splash: {
        image: './assets/favicon.png',
        backgroundColor: '#FAFAF9',
        resizeMode: 'contain',
      },
      package: 'com.moijia.moijia',
      /** Lets bottom sheets / modals shrink above the keyboard instead of covering inputs */
      softwareKeyboardLayoutMode: 'resize',
      intentFilters: [
        {
          action: 'VIEW',
          autoVerify: true,
          data: [
            { scheme: 'https', host: 'moijia.com', pathPrefix: '/join/' },
            { scheme: 'https', host: 'moijia.com', pathPrefix: '/event/' },
            { scheme: 'https', host: 'moijia.com', pathPrefix: '/poll/' },
            { scheme: 'https', host: 'moijia.com', pathPrefix: '/groups/' },
          ],
          category: ['BROWSABLE', 'DEFAULT'],
        },
      ],
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
    extra: {
      eas: {
        projectId: "6d4b4dda-eff5-4a0f-80e2-3cc092089a5d",
      },
    },
    "owner": "whybe"
  },
};
