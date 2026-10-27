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
  PRO_ENTITLEMENT_ID,
  PRO_OFFERING_ID,
  PRO_PACKAGE_ID,
  PRO_PRODUCT_ID,
  getRevenueCatApiKey,
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

export function isAlreadyPurchased(error: unknown): boolean {
  if (isPurchasesError(error)) {
    return error.code === PURCHASES_ERROR_CODE.PRODUCT_ALREADY_PURCHASED_ERROR;
  }
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'object' && error !== null && 'message' in error
        ? String((error as { message: unknown }).message)
        : '';
  return /already (been )?purchased|already subscribed|already owned|product_already_purchased/i.test(
    message
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

export function proEntitlementActive(customerInfo: CustomerInfo | null | undefined): boolean {
  if (!customerInfo) return false;
  if (customerInfo.entitlements.active[PRO_ENTITLEMENT_ID]?.isActive) return true;
  return customerInfo.activeSubscriptions.includes(PRO_PRODUCT_ID);
}

export function billingSnapshot(customerInfo: CustomerInfo | null | undefined): {
  proActive: boolean;
  proRenewing: boolean;
  expiresAt: string | null;
} {
  const proActive = proEntitlementActive(customerInfo);
  const entitlement = customerInfo?.entitlements.active[PRO_ENTITLEMENT_ID];
  const expiresAt =
    entitlement?.expirationDate ??
    customerInfo?.allExpirationDates?.[PRO_PRODUCT_ID] ??
    null;
  return {
    proActive,
    proRenewing: proActive && entitlement?.willRenew !== false,
    expiresAt,
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
}): Promise<CustomerInfo> {
  await configureRevenueCat(input.appUserID);
  const { customerInfo } = await Purchases.logIn(input.appUserID);
  const email = input.email?.trim() || '';
  if (email) {
    await Purchases.setAttributes({ $email: email }).catch(() => undefined);
    await Purchases.setEmail(email).catch(() => undefined);
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

export async function getProOffering(): Promise<PurchasesOffering | null> {
  const offerings = await getOfferings();
  const named = offerings.all[PRO_OFFERING_ID] ?? offerings.current ?? null;
  if (named && packageForPro(named)) return named;
  for (const offering of Object.values(offerings.all)) {
    if (packageForPro(offering)) return offering;
  }
  return named;
}

function packageForPro(offering: PurchasesOffering): PurchasesPackage | null {
  return (
    offering.availablePackages.find(
      (pkg) => pkg.identifier === PRO_PACKAGE_ID || pkg.product.identifier === PRO_PRODUCT_ID
    ) ?? null
  );
}

export async function purchasePro(): Promise<CustomerInfo> {
  const products = await Purchases.getProducts([PRO_PRODUCT_ID]);
  const product = products[0];
  if (product) {
    const { customerInfo } = await Purchases.purchaseStoreProduct(product);
    return customerInfo;
  }
  const offering = await getProOffering();
  const pkg = offering ? packageForPro(offering) : null;
  if (!pkg) {
    throw new Error(
      'Pro is not available from the App Store. In RevenueCat, attach Apple product subscription_pro to the current offering.'
    );
  }
  const { customerInfo } = await Purchases.purchasePackage(pkg);
  return customerInfo;
}

export async function restorePurchases(): Promise<CustomerInfo> {
  return Purchases.restorePurchases();
}
