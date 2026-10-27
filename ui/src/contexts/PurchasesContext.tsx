import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import type { CustomerInfo } from 'react-native-purchases';
import { useAuth } from './AuthContext';
import {
  addCustomerInfoListener,
  billingSnapshot,
  getCustomerInfo,
  invalidateCustomerInfoCache,
  identifyRevenueCatUser,
  isAlreadyPurchased,
  isPurchaseCancelled,
  logOutRevenueCat,
  proEntitlementActive,
  purchasePro as purchaseProRc,
  purchasesErrorMessage,
  restorePurchases as restoreRevenueCatPurchases,
} from '../services/revenueCat';
import { presentCurrentPaywall, presentMoijiaCustomerCenter, type ProPaywallOutcome } from '../services/revenueCatUi';
import { UsersService } from '@moijia/client';
import { queryClient, queryKeys } from '../config/queryClient';

type PurchasesContextValue = {
  ready: boolean;
  customerInfo: CustomerInfo | null;
  isPro: boolean;
  presentPaywall: () => Promise<ProPaywallOutcome>;
  presentCustomerCenter: () => Promise<void>;
  purchasePro: () => Promise<CustomerInfo | null>;
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
      const snapshot = billingSnapshot(info);
      try {
        await UsersService.syncBilling(user.uid, {
          proActive: snapshot.proActive,
          proRenewing: snapshot.proRenewing,
          expiresAt: snapshot.expiresAt,
          purchasedAt: snapshot.purchasedAt,
        });
        await queryClient.invalidateQueries({ queryKey: queryKeys.groups._base });
        await queryClient.invalidateQueries({ queryKey: queryKeys.users.quota(user.uid) });
        await queryClient.invalidateQueries({ queryKey: queryKeys.users.detail(user.uid) });
      } catch {
        /* quota sync is best-effort */
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

  const presentPaywall = useCallback(async (): Promise<ProPaywallOutcome> => {
    const outcome = await presentCurrentPaywall();
    await refresh();
    return outcome;
  }, [refresh]);

  const presentCustomerCenter = useCallback(async () => {
    let info = customerInfo;
    if (!info) {
      info = await getCustomerInfo().catch(() => null);
      if (info) setCustomerInfo(info);
    }
    await presentMoijiaCustomerCenter((info) => {
      setCustomerInfo(info);
      void syncBilling(info);
    });
    await invalidateCustomerInfoCache().catch(() => undefined);
    await refresh();
  }, [customerInfo, refresh, syncBilling]);

  const purchasePro = useCallback(async (): Promise<CustomerInfo | null> => {
    try {
      const info = await purchaseProRc();
      setCustomerInfo(info);
      await syncBilling(info);
      return info;
    } catch (error) {
      if (isPurchaseCancelled(error)) return null;
      if (isAlreadyPurchased(error)) {
        const info = await getCustomerInfo().catch(() => null);
        if (info) {
          setCustomerInfo(info);
          await syncBilling(info);
        }
        return info;
      }
      throw new Error(purchasesErrorMessage(error, 'Could not complete purchase.'));
    }
  }, [syncBilling]);

  const restorePurchases = useCallback(async () => {
    const info = await restoreRevenueCatPurchases();
    setCustomerInfo(info);
    await syncBilling(info);
    return info;
  }, [syncBilling]);

  const isPro = proEntitlementActive(customerInfo);

  const value = useMemo<PurchasesContextValue>(
    () => ({
      ready,
      customerInfo,
      isPro,
      presentPaywall,
      presentCustomerCenter,
      purchasePro,
      restorePurchases,
      refresh,
    }),
    [ready, customerInfo, isPro, presentPaywall, presentCustomerCenter, purchasePro, restorePurchases, refresh]
  );

  return <PurchasesContext.Provider value={value}>{children}</PurchasesContext.Provider>;
};
