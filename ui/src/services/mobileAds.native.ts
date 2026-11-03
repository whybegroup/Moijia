import mobileAds, { AdsConsent } from 'react-native-google-mobile-ads';

let started = false;

export function initMobileAds() {
  if (started) return;
  started = true;
  void (async () => {
    try {
      await AdsConsent.gatherConsent();
    } catch {
      // Banners can still load where a consent form is not required.
    }
    try {
      await mobileAds().initialize();
    } catch {
      // Each banner reports its own load failure.
    }
  })();
}
