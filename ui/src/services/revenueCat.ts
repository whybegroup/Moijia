import Purchases, {
  LOG_LEVEL,
  PURCHASES_ERROR_CODE,
  type CustomerInfo,
  type PurchasesError,
  type PurchasesOffering,
  type PurchasesOfferings,
  type PurchasesPackage,
} from 'react-native-purchases';
import { Platform } from 'react-native';
import {
  EXTRA_GROUP_PRODUCT_ID,
  GROUP_SUBSCRIPTIONS_OFFERING,
  SIZE_ADDONS,
  getRevenueCatApiKey,
  type SizeAddon,
} from '../config/revenueCat';

let configureLock: Promise<void> | null = null;

function isPurchasesError(error: unknown): error is PurchasesError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    'message' in error
  );
}

export function isPurchaseCancelled(error: unknown): boolean {
  if (isPurchasesError(error)) {
    return (
      error.code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR ||
      error.userCancelled === true
    );
  }
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'object' && error !== null && 'message' in error
        ? String((error as { message: unknown }).message)
        : '';
  return /purchase(s)? cancelled|user cancelled|canceled/i.test(message);
}

export function purchasesErrorMessage(error: unknown, fallback = 'Something went wrong with your subscription.'): string {
  if (isPurchaseCancelled(error)) return '';
  if (isPurchasesError(error) && error.message) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

export function entitlementActive(customerInfo: CustomerInfo | null | undefined, id: string): boolean {
  return !!customerInfo?.entitlements.active[id]?.isActive;
}

export function getActiveSizeAddon(customerInfo: CustomerInfo | null | undefined): SizeAddon | null {
  if (!customerInfo) return null;
  for (let i = SIZE_ADDONS.length - 1; i >= 0; i -= 1) {
    const plan = SIZE_ADDONS[i];
    if (entitlementActive(customerInfo, plan.entitlementId)) return plan;
    if (customerInfo.activeSubscriptions.includes(plan.productId)) return plan;
  }
  return null;
}

export function billingSnapshot(customerInfo: CustomerInfo | null | undefined): {
  mediumActive: boolean;
  largeActive: boolean;
} {
  return {
    mediumActive: entitlementActive(customerInfo, 'entitlement_medium_group'),
    largeActive: entitlementActive(customerInfo, 'entitlement_large_group'),
  };
}

export async function configureRevenueCat(appUserID: string): Promise<void> {
  if (configureLock) {
    await configureLock;
  } else {
    configureLock = (async () => {
      await Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.DEBUG : LOG_LEVEL.ERROR);
      if (await Purchases.isConfigured()) return;
      Purchases.configure({
        apiKey: getRevenueCatApiKey(),
        appUserID,
      });
    })();
    try {
      await configureLock;
    } catch (e) {
      configureLock = null;
      throw e;
    }
  }

  if (!(await Purchases.isConfigured())) {
    throw new Error('RevenueCat is not configured.');
  }
}

export async function identifyRevenueCatUser(input: {
  appUserID: string;
  email?: string | null;
  displayName?: string | null;
}): Promise<CustomerInfo> {
  await configureRevenueCat(input.appUserID);
  const { customerInfo } = await Purchases.logIn(input.appUserID);
  try {
    await Purchases.setEmail(input.email?.trim() || null);
    await Purchases.setDisplayName(input.displayName?.trim() || null);
  } catch {
    // Attributes are best-effort; purchases still work without them.
  }
  if (Platform.OS === 'ios' || Platform.OS === 'android') {
    try {
      await Purchases.showInAppMessages();
    } catch {
      // Billing issue sheets are optional.
    }
  }
  return customerInfo;
}

export async function logOutRevenueCat(): Promise<void> {
  if (!(await Purchases.isConfigured())) return;
  try {
    await Purchases.logOut();
  } catch (error) {
    if (purchasesErrorMessage(error, '').toLowerCase().includes('anonymous')) return;
    throw error;
  }
}

export async function getCustomerInfo(): Promise<CustomerInfo> {
  return Purchases.getCustomerInfo();
}

export function addCustomerInfoListener(listener: (info: CustomerInfo) => void): () => void {
  Purchases.addCustomerInfoUpdateListener(listener);
  return () => {
    Purchases.removeCustomerInfoUpdateListener(listener);
  };
}

export async function getOfferings(): Promise<PurchasesOfferings> {
  return Purchases.getOfferings();
}

export async function getStorageOffering(): Promise<PurchasesOffering | null> {
  const offerings = await getOfferings();
  return offerings.all[GROUP_SUBSCRIPTIONS_OFFERING] ?? offerings.current ?? null;
}

function packageForAddon(offering: PurchasesOffering, plan: SizeAddon): PurchasesPackage | null {
  return (
    offering.availablePackages.find(
      (pkg) => pkg.identifier === plan.packageId || pkg.product.identifier === plan.productId
    ) ?? null
  );
}

export type StoragePlanOption = {
  plan: SizeAddon;
  offering: PurchasesOffering;
  pkg: PurchasesPackage;
};

export async function listStoragePlanOptions(): Promise<StoragePlanOption[]> {
  const offering = await getStorageOffering();
  if (!offering) return [];
  const options: StoragePlanOption[] = [];
  for (const plan of SIZE_ADDONS) {
    const pkg = packageForAddon(offering, plan);
    if (!pkg) continue;
    options.push({ plan, offering, pkg });
  }
  return options;
}

export async function purchaseProPackage(pkg: PurchasesPackage): Promise<CustomerInfo> {
  const { customerInfo } = await Purchases.purchasePackage(pkg);
  return customerInfo;
}

export async function purchaseExtraGroupSlot(): Promise<CustomerInfo> {
  const offerings = await getOfferings();
  for (const offering of Object.values(offerings.all)) {
    const pkg = offering.availablePackages.find(
      (p) => p.product.identifier === EXTRA_GROUP_PRODUCT_ID
    );
    if (pkg) {
      const { customerInfo } = await Purchases.purchasePackage(pkg);
      return customerInfo;
    }
  }
  const products = await Purchases.getProducts([EXTRA_GROUP_PRODUCT_ID]);
  const product = products[0];
  if (!product) {
    throw new Error(
      'Extra group slots are not in the store yet. Add product_extra_group ($0.99) in RevenueCat.'
    );
  }
  const { customerInfo } = await Purchases.purchaseStoreProduct(product);
  return customerInfo;
}

export async function restorePurchases(): Promise<CustomerInfo> {
  return Purchases.restorePurchases();
}

export function planLabelForStorage(plan: SizeAddon | null | undefined): string {
  if (!plan) return 'Small groups';
  return `${plan.displayName} · ${plan.gb} GB / month`;
}
