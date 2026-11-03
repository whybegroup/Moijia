import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AppState, Platform } from 'react-native';
import type { CustomerInfo } from 'react-native-purchases';
import { useAuth } from './AuthContext';
import {
  addCustomerInfoListener,
  getCustomerInfo,
  identifyRevenueCatUser,
  isAlreadyPurchased,
  isPurchaseCancelled,
  logOutRevenueCat,
  purchasePro as purchaseProRc,
  purchasesErrorMessage,
  restorePurchases as restoreRevenueCatPurchases,
} from '../services/revenueCat';
import { presentCurrentPaywall, presentMoijiaCustomerCenter, type ProPaywallOutcome } from '../services/revenueCatUi';
import { UsersService } from '@moijia/client';
import { queryClient, queryKeys } from '../config/queryClient';

type PurchasesContextValue = {
  ready: boolean;
  presentPaywall: () => Promise<ProPaywallOutcome>;
  presentCustomerCenter: () => Promise<void>;
  purchasePro: () => Promise<CustomerInfo | null>;
  restorePurchases: () => Promise<CustomerInfo>;
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

  const refreshBilling = useCallback(async () => {
    if (!user?.uid) return;
    try {
      await UsersService.syncBilling(user.uid);
      await queryClient.invalidateQueries({ queryKey: queryKeys.groups._base });
      await queryClient.invalidateQueries({ queryKey: queryKeys.users.quota(user.uid) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.users.detail(user.uid) });
    } catch {
      /* store refresh is best-effort */
    }
  }, [user?.uid]);

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
        await refreshBilling();
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
  }, [authLoading, user, refreshBilling]);

  useEffect(() => {
    return addCustomerInfoListener(() => {
      void refreshBilling();
    });
  }, [refreshBilling]);

  useEffect(() => {
    if (!user) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refreshBilling();
    });
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refreshBilling();
    };
    if (Platform.OS === 'web') document.addEventListener('visibilitychange', onVisible);
    return () => {
      sub.remove();
      if (Platform.OS === 'web') document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refreshBilling, user]);

  const presentPaywall = useCallback(async (): Promise<ProPaywallOutcome> => {
    const outcome = await presentCurrentPaywall();
    await refreshBilling();
    return outcome;
  }, [refreshBilling]);

  const presentCustomerCenter = useCallback(async () => {
    const info = customerInfo ?? (await getCustomerInfo().catch(() => null));
    if (info) setCustomerInfo(info);
    await presentMoijiaCustomerCenter(() => {
      void refreshBilling();
    });
    await refreshBilling();
  }, [customerInfo, refreshBilling]);

  const purchasePro = useCallback(async (): Promise<CustomerInfo | null> => {
    try {
      const info = await purchaseProRc();
      setCustomerInfo(info);
      await refreshBilling();
      return info;
    } catch (error) {
      if (isPurchaseCancelled(error)) return null;
      if (isAlreadyPurchased(error)) {
        await refreshBilling();
        return getCustomerInfo().catch(() => null);
      }
      throw new Error(purchasesErrorMessage(error, 'Could not complete purchase.'));
    }
  }, [refreshBilling]);

  const restorePurchases = useCallback(async () => {
    const info = await restoreRevenueCatPurchases();
    setCustomerInfo(info);
    await refreshBilling();
    return info;
  }, [refreshBilling]);

  const value = useMemo<PurchasesContextValue>(
    () => ({
      ready,
      presentPaywall,
      presentCustomerCenter,
      purchasePro,
      restorePurchases,
    }),
    [ready, presentPaywall, presentCustomerCenter, purchasePro, restorePurchases]
  );

  return <PurchasesContext.Provider value={value}>{children}</PurchasesContext.Provider>;
};
