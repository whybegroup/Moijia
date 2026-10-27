import { Platform } from 'react-native';

/** Test Store public SDK key (safe in the client). Override per store with env vars for production. */
const TEST_STORE_API_KEY = 'test_yZwTcJhfkgbkfOatxRovcSEgUdW';

/** Offering that contains the Pro auto-renewable subscription. */
export const PRO_OFFERING_ID = 'offering_group_subscriptions';

export const PRO_PRODUCT_ID = 'pro_subscription';
export const PRO_ENTITLEMENT_ID = 'entitlement_subscription_pro';
export const PRO_PACKAGE_ID = 'offering_subscription_pro';
export const PRO_PRICE_LABEL = '$19.99/month';

export function getRevenueCatApiKey(): string {
  const shared = process.env.EXPO_PUBLIC_REVENUECAT_API_KEY?.trim();
  if (Platform.OS === 'ios') {
    return process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY?.trim() || shared || TEST_STORE_API_KEY;
  }
  if (Platform.OS === 'android') {
    return process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY?.trim() || shared || TEST_STORE_API_KEY;
  }
  return process.env.EXPO_PUBLIC_REVENUECAT_WEB_API_KEY?.trim() || shared || TEST_STORE_API_KEY;
}
