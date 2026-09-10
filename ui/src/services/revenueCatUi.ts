import { Linking, Platform } from 'react-native';
import RevenueCatUI, { PAYWALL_RESULT } from 'react-native-purchases-ui';
import type { CustomerInfo, PurchasesOffering } from 'react-native-purchases';
import type { SizeAddon } from '../config/revenueCat';
import { getCustomerInfo, getStorageOffering } from './revenueCat';

export type ProPaywallOutcome = 'purchased' | 'restored' | 'already_pro' | 'cancelled' | 'unavailable';

function outcomeFromPaywallResult(result: PAYWALL_RESULT): ProPaywallOutcome {
  switch (result) {
    case PAYWALL_RESULT.NOT_PRESENTED:
      return 'already_pro';
    case PAYWALL_RESULT.PURCHASED:
      return 'purchased';
    case PAYWALL_RESULT.RESTORED:
      return 'restored';
    case PAYWALL_RESULT.CANCELLED:
      return 'cancelled';
    default:
      return 'unavailable';
  }
}

async function presentOfferingPaywall(offering?: PurchasesOffering): Promise<ProPaywallOutcome> {
  try {
    const result = await RevenueCatUI.presentPaywall({
      offering,
      displayCloseButton: true,
    });
    return outcomeFromPaywallResult(result);
  } catch {
    return 'unavailable';
  }
}

/** Dashboard paywall on `offering_group_subscriptions` (Medium + Large). */
export async function presentCurrentPaywall(): Promise<ProPaywallOutcome> {
  const offering = await getStorageOffering().catch(() => null);
  return presentOfferingPaywall(offering ?? undefined);
}

export async function presentStoragePaywall(_plan?: SizeAddon): Promise<ProPaywallOutcome> {
  return presentCurrentPaywall();
}

export async function presentMoijiaCustomerCenter(onCustomerInfo?: (info: CustomerInfo) => void): Promise<void> {
  if (Platform.OS === 'ios' || Platform.OS === 'android') {
    await RevenueCatUI.presentCustomerCenter({
      callbacks: {
        onRestoreCompleted: ({ customerInfo }) => {
          onCustomerInfo?.(customerInfo);
        },
      },
    });
    return;
  }

  const info = await getCustomerInfo();
  onCustomerInfo?.(info);
  if (info.managementURL) {
    await Linking.openURL(info.managementURL);
    return;
  }
  throw new Error('Manage this subscription from the store or device where it was purchased.');
}
