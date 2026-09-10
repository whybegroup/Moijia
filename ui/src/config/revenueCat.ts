import { Platform } from 'react-native';
import type { GroupSizeTier } from '../utils/groupTiers';

/** Test Store public SDK key (safe in the client). Override per store with env vars for production. */
const TEST_STORE_API_KEY = 'test_yZwTcJhfkgbkfOatxRovcSEgUdW';

export const GROUP_SUBSCRIPTIONS_OFFERING = 'offering_group_subscriptions';

/** One-time $0.99 extra owned-group slot. Create this Test Store product if it is missing. */
export const EXTRA_GROUP_PRODUCT_ID = 'product_extra_group';

export const SIZE_ADDONS = [
  {
    tier: 'medium' as const,
    gb: 10,
    packageId: 'package_medium_group',
    productId: 'subscription_medium_group',
    entitlementId: 'entitlement_medium_group',
    displayName: 'Medium Group',
  },
  {
    tier: 'large' as const,
    gb: 100,
    packageId: 'package_large_group',
    productId: 'subscription_large_group',
    entitlementId: 'entitlement_large_group',
    displayName: 'Large Group',
  },
] as const;

export type SizeAddon = (typeof SIZE_ADDONS)[number];
export type SizeAddonTier = SizeAddon['tier'];

export function sizeAddonByTier(tier: GroupSizeTier): SizeAddon | undefined {
  return SIZE_ADDONS.find((plan) => plan.tier === tier);
}

export function sizeAddonByProductId(productId: string | undefined): SizeAddon | undefined {
  if (!productId) return undefined;
  return SIZE_ADDONS.find((plan) => plan.productId === productId);
}

export function sizeAddonByPackageId(packageId: string | undefined): SizeAddon | undefined {
  if (!packageId) return undefined;
  return SIZE_ADDONS.find((plan) => plan.packageId === packageId);
}

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
