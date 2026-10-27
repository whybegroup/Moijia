import { Linking, Platform } from 'react-native';
import RevenueCatUI, { PAYWALL_RESULT } from 'react-native-purchases-ui';
import type { CustomerInfo } from 'react-native-purchases';
import { getCustomerInfo, getProOffering } from './revenueCat';

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

/** Dashboard paywall for pro_subscription. */
export async function presentCurrentPaywall(): Promise<ProPaywallOutcome> {
  try {
    const offering = await getProOffering().catch(() => null);
    const result = await RevenueCatUI.presentPaywall({
      offering: offering ?? undefined,
      displayCloseButton: true,
    });
    return outcomeFromPaywallResult(result);
  } catch {
    return 'unavailable';
  }
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
