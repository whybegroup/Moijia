/** Build iOS reversed client scheme for Google Sign-In config plugin (from EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID). */
function iosGoogleUrlScheme() {
  const id = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  if (!id || typeof id !== 'string') return null;
  const host = id.replace(/\.apps\.googleusercontent\.com$/i, '');
  return `com.googleusercontent.apps.${host}`;
}

const iosUrlScheme = iosGoogleUrlScheme();

/** Google's sample Android app id until EXPO_PUBLIC_ADMOB_ANDROID_APP_ID is set. Ads stay off on Android until then. */
const ADMOB_ANDROID_APP_ID =
  process.env.EXPO_PUBLIC_ADMOB_ANDROID_APP_ID || 'ca-app-pub-3940256099942544~3347511713';
const ADMOB_IOS_APP_ID = 'ca-app-pub-3281928944395448~1634603061';
const ADMOB_SK_AD_NETWORK_ITEMS = [
  'cstr6suwn9.skadnetwork',
  '4fzdc2evr5.skadnetwork',
  '2fnua5tdw4.skadnetwork',
  'ydx93a7ass.skadnetwork',
  'p78axxw29g.skadnetwork',
  'v72qych5uu.skadnetwork',
  'ludvb6z3bs.skadnetwork',
  'cp8zw746q7.skadnetwork',
  '3sh42y64q3.skadnetwork',
  'c6k4g5qg8m.skadnetwork',
  's39g8k73mm.skadnetwork',
  'wg4vff78zm.skadnetwork',
  '3qy4746246.skadnetwork',
  'f38h382jlk.skadnetwork',
  'hs6bdukanm.skadnetwork',
  'mlmmfzh3r3.skadnetwork',
  'v4nxqhlyqp.skadnetwork',
  'wzmmz9fp6w.skadnetwork',
  'su67r6k2v3.skadnetwork',
  'yclnxrl5pm.skadnetwork',
  't38b2kh725.skadnetwork',
  '7ug5zh24hu.skadnetwork',
  'gta9lk7p23.skadnetwork',
  'vutu7akeur.skadnetwork',
  'y5ghdn5j9k.skadnetwork',
  'v9wttpbfk9.skadnetwork',
  'n38lu8286q.skadnetwork',
  '47vhws6wlr.skadnetwork',
  'kbd757ywx3.skadnetwork',
  '9t245vhmpl.skadnetwork',
  'a2p9lx4jpn.skadnetwork',
  '22mmun2rn5.skadnetwork',
  '44jx6755aq.skadnetwork',
  'k674qkevps.skadnetwork',
  '4468km3ulz.skadnetwork',
  '2u9pt9hc89.skadnetwork',
  '8s468mfl3y.skadnetwork',
  'klf5c3l5u5.skadnetwork',
  'ppxm28t8ap.skadnetwork',
  'kbmxgpxpgc.skadnetwork',
  'uw77j35x4d.skadnetwork',
  '578prtvx9j.skadnetwork',
  '4dzt52r2t5.skadnetwork',
  'tl55sbb4fm.skadnetwork',
  'c3frkrj4fj.skadnetwork',
  'e5fvkxwrpn.skadnetwork',
  '8c4e2ghe7u.skadnetwork',
  '3rd42ekr43.skadnetwork',
  '97r2b46745.skadnetwork',
  '3qcr597p9d.skadnetwork',
];

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
        image: './assets/splash.jpg',
        enableFullScreenImage_legacy: true,
      },
      android: {
        image: './assets/favicon.png',
        imageWidth: 200,
      },
    },
  ],
  'expo-web-browser',
  ['expo-audio', { microphonePermission: 'Moijia can record video with sound.', recordAudioAndroid: true }],
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
      photosPermission: 'Moijia needs access to your photos and videos to upload them.',
      cameraPermission: 'Moijia can use the camera to add photos and videos.',
      microphonePermission: 'Moijia can record video with sound.',
    },
  ],
  [
    'expo-location',
    {
      locationWhenInUsePermission:
        'Moijia uses your location to suggest nearby places when setting an event location.',
    },
  ],
  [
    'expo-calendar',
    {
      calendarPermission: 'Moijia can add this event to Apple Calendar.',
      remindersPermission: 'Moijia can add this event to Apple Calendar.',
    },
  ],
  [
    'react-native-google-mobile-ads',
    {
      androidAppId: ADMOB_ANDROID_APP_ID,
      iosAppId: ADMOB_IOS_APP_ID,
      delayAppMeasurementInit: true,
      skAdNetworkItems: ADMOB_SK_AD_NETWORK_ITEMS,
    },
  ],
];
if (iosUrlScheme) {
  plugins.push(['@react-native-google-signin/google-signin', { iosUrlScheme }]);
}

module.exports = {
  expo: {
    name: 'Moijia',
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
        NSCalendarsUsageDescription: 'Moijia can add this event to Apple Calendar.',
        NSCalendarsFullAccessUsageDescription: 'Moijia can add this event to Apple Calendar.',
        NSCalendarsWriteOnlyAccessUsageDescription:
          'Moijia can add this event to Apple Calendar.',
        NSRemindersUsageDescription: 'Moijia can add this event to Apple Calendar.',
        NSRemindersFullAccessUsageDescription: 'Moijia can add this event to Apple Calendar.',
        ITSAppUsesNonExemptEncryption: false,
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
