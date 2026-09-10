import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import type { CustomerInfo, PurchasesPackage } from 'react-native-purchases';
import type { SizeAddon } from '../config/revenueCat';
import type { GroupSizeTier } from '../utils/groupTiers';
import { useAuth } from './AuthContext';
import {
  addCustomerInfoListener,
  billingSnapshot,
  getActiveSizeAddon,
  getCustomerInfo,
  identifyRevenueCatUser,
  isPurchaseCancelled,
  logOutRevenueCat,
  purchaseExtraGroupSlot as purchaseExtraGroupSlotRc,
  purchaseProPackage,
  purchasesErrorMessage,
  restorePurchases as restoreRevenueCatPurchases,
} from '../services/revenueCat';
import {
  presentCurrentPaywall,
  presentMoijiaCustomerCenter,
  presentStoragePaywall,
  type ProPaywallOutcome,
} from '../services/revenueCatUi';
import { UsersService } from '@moijia/client';

type PurchasesContextValue = {
  ready: boolean;
  customerInfo: CustomerInfo | null;
  hasPaidSizeAddon: boolean;
  sizeAddon: SizeAddon | null;
  presentPaywall: (plan?: SizeAddon, currentTier?: GroupSizeTier) => Promise<ProPaywallOutcome>;
  presentCustomerCenter: () => Promise<void>;
  purchasePackage: (pkg: PurchasesPackage) => Promise<CustomerInfo | null>;
  purchaseExtraGroupSlot: () => Promise<void>;
  restorePurchases: () => Promise<CustomerInfo>;
  refresh: () => Promise<CustomerInfo | null>;
};

const PurchasesContext = createContext<PurchasesContextValue | null>(null);

export function usePurchases(): PurchasesContextValue {
  const ctx = useContext(PurchasesContext);
  if (!ctx) {
    throw new Error('usePurchases must be used within PurchasesProvider');
  }
  return ctx;
}

export const PurchasesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading: authLoading } = useAuth();
  const [ready, setReady] = useState(false);
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);

  const syncBilling = useCallback(
    async (info: CustomerInfo | null) => {
      if (!user?.uid || !info) return;
      try {
        await UsersService.syncBilling(user.uid, billingSnapshot(info));
      } catch {
        /* quota/grace sync is best-effort */
      }
    },
    [user?.uid]
  );

  const refresh = useCallback(async (): Promise<CustomerInfo | null> => {
    try {
      const info = await getCustomerInfo();
      setCustomerInfo(info);
      await syncBilling(info);
      return info;
    } catch {
      return null;
    }
  }, [syncBilling]);

  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;

    const run = async () => {
      if (!user) {
        await logOutRevenueCat().catch(() => undefined);
        if (!cancelled) {
          setCustomerInfo(null);
          setReady(false);
        }
        return;
      }

      try {
        const info = await identifyRevenueCatUser({
          appUserID: user.uid,
          email: user.email,
        });
        if (!cancelled) {
          setCustomerInfo(info);
          setReady(true);
        }
        await syncBilling(info);
      } catch {
        if (!cancelled) {
          setCustomerInfo(null);
          setReady(false);
        }
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [authLoading, user, syncBilling]);

  useEffect(() => {
    return addCustomerInfoListener((info) => {
      setCustomerInfo(info);
      void syncBilling(info);
    });
  }, [syncBilling]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && user) void refresh();
    });
    return () => sub.remove();
  }, [refresh, user]);

  const presentPaywall = useCallback(
    async (plan?: SizeAddon, currentTier?: GroupSizeTier): Promise<ProPaywallOutcome> => {
      const outcome = plan
        ? await presentStoragePaywall(plan, currentTier)
        : await presentCurrentPaywall(currentTier);
      await refresh();
      return outcome;
    },
    [refresh]
  );

  const presentCustomerCenter = useCallback(async () => {
    await presentMoijiaCustomerCenter((info) => {
      setCustomerInfo(info);
      void syncBilling(info);
    });
    await refresh();
  }, [refresh, syncBilling]);

  const purchasePackage = useCallback(async (pkg: PurchasesPackage): Promise<CustomerInfo | null> => {
    try {
      const info = await purchaseProPackage(pkg);
      setCustomerInfo(info);
      await syncBilling(info);
      return info;
    } catch (error) {
      if (isPurchaseCancelled(error)) return null;
      throw new Error(purchasesErrorMessage(error, 'Could not complete purchase.'));
    }
  }, [syncBilling]);

  const purchaseExtraGroupSlot = useCallback(async () => {
    const info = await purchaseExtraGroupSlotRc();
    setCustomerInfo(info);
    if (user?.uid) {
      await UsersService.addExtraGroupSlot(user.uid);
    }
  }, [user?.uid]);

  const restorePurchases = useCallback(async () => {
    const info = await restoreRevenueCatPurchases();
    setCustomerInfo(info);
    await syncBilling(info);
    return info;
  }, [syncBilling]);

  const sizeAddon = getActiveSizeAddon(customerInfo);

  const value = useMemo<PurchasesContextValue>(
    () => ({
      ready,
      customerInfo,
      hasPaidSizeAddon: sizeAddon != null,
      sizeAddon,
      presentPaywall,
      presentCustomerCenter,
      purchasePackage,
      purchaseExtraGroupSlot,
      restorePurchases,
      refresh,
    }),
    [
      ready,
      customerInfo,
      sizeAddon,
      presentPaywall,
      presentCustomerCenter,
      purchasePackage,
      purchaseExtraGroupSlot,
      restorePurchases,
      refresh,
    ]
  );

  return <PurchasesContext.Provider value={value}>{children}</PurchasesContext.Provider>;
};
