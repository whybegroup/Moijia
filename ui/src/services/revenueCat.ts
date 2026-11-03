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
  PRO_OFFERING_ID,
  PRO_PACKAGE_ID,
  PRO_PRODUCT_ID,
  getRevenueCatApiKey,
} from '../config/revenueCat';

let configureLock: Promise<void> | null = null;

function rejectAnonymous(appUserID: string): void {
  if (!appUserID.trim() || appUserID.startsWith('$')) {
    throw new Error('RevenueCat requires a signed-in user. Refusing an anonymous customer.');
  }
}

async function assertIdentifiedUser(): Promise<void> {
  if (!(await Purchases.isConfigured())) {
    throw new Error('RevenueCat requires a signed-in user. Refusing an anonymous customer.');
  }
  const appUserID = await Purchases.getAppUserID();
  const anonymous = await Purchases.isAnonymous();
  if (anonymous || !appUserID || appUserID.startsWith('$')) {
    throw new Error(`RevenueCat is signed in as an anonymous customer (${appUserID || 'none'}).`);
  }
}

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

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return '';
}

/** StoreKit handed back an expired sandbox transaction. The next purchase succeeds. */
function isInvalidReceipt(error: unknown): boolean {
  if (isPurchasesError(error) && error.code === PURCHASES_ERROR_CODE.INVALID_RECEIPT_ERROR) {
    return true;
  }
  return /receipt is not valid|missing in the receipt|invalid_receipt/i.test(errorText(error));
}

async function purchaseOnceMore<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (isPurchaseCancelled(error) || !isInvalidReceipt(error)) throw error;
    console.warn('[revenuecat] StoreKit returned an expired receipt. Purchasing again.');
    return run();
  }
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

function installRevenueCatLogHandler(): void {
  Purchases.setLogHandler((logLevel, message) => {
    if (/purchase(s)? (was )?cancelled|user cancelled/i.test(message)) {
      console.log(`[RevenueCat] ${message}`);
      return;
    }
    switch (logLevel) {
      case LOG_LEVEL.DEBUG:
        console.debug(`[RevenueCat] ${message}`);
        break;
      case LOG_LEVEL.INFO:
        console.info(`[RevenueCat] ${message}`);
        break;
      case LOG_LEVEL.WARN:
        console.warn(`[RevenueCat] ${message}`);
        break;
      case LOG_LEVEL.ERROR:
        console.error(`[RevenueCat] ${message}`);
        break;
      default:
        console.log(`[RevenueCat] ${message}`);
    }
  });
}

export async function configureRevenueCat(appUserID: string): Promise<void> {
  rejectAnonymous(appUserID);
  installRevenueCatLogHandler();
  if (configureLock) {
    await configureLock;
  } else {
    configureLock = (async () => {
      await Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.INFO : LOG_LEVEL.WARN);
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

export async function identifyRevenueCatUser(appUserID: string): Promise<CustomerInfo> {
  rejectAnonymous(appUserID);
  await configureRevenueCat(appUserID);
  const { customerInfo, created } = await Purchases.logIn(appUserID);
  if (created) console.log(`[revenuecat] created customer ${appUserID}`);
  await assertIdentifiedUser();
  if (Platform.OS === 'ios' || Platform.OS === 'android') {
    try {
      await Purchases.showInAppMessages();
    } catch {
      // Billing issue sheets are optional.
    }
  }
  return customerInfo;
}

/**
 * Drop the cached customer without calling `Purchases.logOut()`.
 * That call always mints a `$RCAnonymousID` and then posts attributes such as
 * `$attConsentStatus`. RevenueCat returns "subscriber was not found" for that
 * id, including while the login screen is waiting for an account.
 * The next sign-in calls `Purchases.logIn` with the chosen user id.
 */
export async function logOutRevenueCat(): Promise<void> {
  if (!(await Purchases.isConfigured())) return;
  const appUserID = await Purchases.getAppUserID();
  if (!appUserID || appUserID.startsWith('$') || (await Purchases.isAnonymous())) {
    throw new Error(
      `RevenueCat cannot log out because the user id does not exist (${appUserID || 'none'}).`
    );
  }
  await Purchases.invalidateCustomerInfoCache();
  configureLock = null;
}

export async function getCustomerInfo(): Promise<CustomerInfo> {
  await assertIdentifiedUser();
  return Purchases.getCustomerInfo();
}

/** Drop the cached CustomerInfo so a cancel is visible on the next read. */
export async function invalidateCustomerInfoCache(): Promise<void> {
  await Purchases.invalidateCustomerInfoCache();
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
  await assertIdentifiedUser();
  const products = await Purchases.getProducts([PRO_PRODUCT_ID]);
  const product = products[0];
  if (product) {
    const { customerInfo } = await purchaseOnceMore(() => Purchases.purchaseStoreProduct(product));
    await assertIdentifiedUser();
    return customerInfo;
  }
  const offering = await getProOffering();
  const pkg = offering ? packageForPro(offering) : null;
  if (!pkg) {
    throw new Error(
      'Pro is not available from the App Store. In RevenueCat, attach Apple product pro_subscription to the current offering.'
    );
  }
  const { customerInfo } = await purchaseOnceMore(() => Purchases.purchasePackage(pkg));
  await assertIdentifiedUser();
  return customerInfo;
}

export async function restorePurchases(): Promise<CustomerInfo> {
  await assertIdentifiedUser();
  const customerInfo = await Purchases.restorePurchases();
  await assertIdentifiedUser();
  return customerInfo;
}
