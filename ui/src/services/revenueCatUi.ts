import { Linking, Platform } from 'react-native';
import RevenueCatUI, {
  CustomVariableValue,
  PAYWALL_RESULT,
  type CustomVariables,
} from 'react-native-purchases-ui';
import type { CustomerInfo, PurchasesOffering } from 'react-native-purchases';
import { sizeAddonByTier, type SizeAddon } from '../config/revenueCat';
import type { GroupSizeTier } from '../utils/groupTiers';
import { GROUP_TIERS } from '../utils/groupTiers';
import { getCustomerInfo, getStorageOffering } from './revenueCat';

export function paywallCustomVariables(currentTier?: GroupSizeTier): CustomVariables {
  const tier = currentTier ?? 'small';
  const spec = GROUP_TIERS[tier];
  const addon = sizeAddonByTier(tier);
  return {
    current_plan: CustomVariableValue.string(spec.label),
    current_plan_gb: CustomVariableValue.number(spec.gb),
    current_package_id: CustomVariableValue.string(addon?.packageId ?? ''),
    is_current_small: CustomVariableValue.boolean(tier === 'small'),
    is_current_medium: CustomVariableValue.boolean(tier === 'medium'),
    is_current_large: CustomVariableValue.boolean(tier === 'large'),
  };
}

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

async function presentOfferingPaywall(
  offering?: PurchasesOffering,
  currentTier?: GroupSizeTier
): Promise<ProPaywallOutcome> {
  try {
    const result = await RevenueCatUI.presentPaywall({
      offering,
      displayCloseButton: true,
      customVariables: paywallCustomVariables(currentTier),
    });
    return outcomeFromPaywallResult(result);
  } catch {
    return 'unavailable';
  }
}

/** Dashboard paywall on `offering_group_subscriptions` (Medium + Large). */
export async function presentCurrentPaywall(currentTier?: GroupSizeTier): Promise<ProPaywallOutcome> {
  const offering = await getStorageOffering().catch(() => null);
  return presentOfferingPaywall(offering ?? undefined, currentTier);
}

export async function presentStoragePaywall(
  _plan?: SizeAddon,
  currentTier?: GroupSizeTier
): Promise<ProPaywallOutcome> {
  return presentCurrentPaywall(currentTier);
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
