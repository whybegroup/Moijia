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
  purchasePro as purchaseProRc,
  purchasesErrorMessage,
  restorePurchases as restoreRevenueCatPurchases,
} from '../services/revenueCat';
import { presentCurrentPaywall, presentMoijiaCustomerCenter, type ProPaywallOutcome } from '../services/revenueCatUi';
import { UsersService, type OwnedGroupQuota } from '@moijia/client';
import { queryClient, queryKeys } from '../config/queryClient';

function logBilling(action: string, userId: string, quota: OwnedGroupQuota) {
  const at = (value: Date | string | null | undefined) => {
    if (!value) return 'none';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'none' : date.toISOString();
  };
  console.log(
    `[billing] ${action} ${userId}: plan=${quota.planLabel} tier=${quota.subscriptionTier} price=${quota.priceLabel ?? 'none'} ${quota.periodLabel ?? 'period'}=${at(quota.subscriptionExpiresAt)} started=${at(quota.subscriptionStartedAt)} renewing=${quota.subscriptionWillRenew ?? false} downgrade=${at(quota.plannedDowngradeAt)} grace=${quota.graceStarted}`
  );
}

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

  const refreshBilling = useCallback(async (action = 'sync') => {
    if (!user?.uid) return;
    try {
      const quota = await UsersService.syncBilling(user.uid);
      logBilling(action, user.uid, quota);
      await queryClient.invalidateQueries({ queryKey: queryKeys.groups._base });
      await queryClient.invalidateQueries({ queryKey: queryKeys.users.quota(user.uid) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.users.detail(user.uid) });
    } catch (err) {
      console.warn(`[billing] ${action} failed for ${user.uid}`, err);
    }
  }, [user?.uid]);

  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;

    const run = async () => {
      if (!user) {
        console.log('[billing] signed out');
        if (!cancelled) {
          setCustomerInfo(null);
          setReady(false);
        }
        return;
      }

      try {
        console.log(`[billing] sign-in ${user.uid}`);
        const name = user.displayName || user.email?.split('@')[0] || 'User';
        await UsersService.syncUser({
          id: user.uid,
          name,
          displayName: name,
          email: user.email ?? null,
        });
        const info = await identifyRevenueCatUser(user.uid);
        if (!cancelled) {
          setCustomerInfo(info);
          setReady(true);
        }
        await refreshBilling('sign-in');
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
      void refreshBilling('store update');
    });
  }, [refreshBilling]);

  useEffect(() => {
    if (!user) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refreshBilling('foreground');
    });
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refreshBilling('foreground');
    };
    if (Platform.OS === 'web') document.addEventListener('visibilitychange', onVisible);
    return () => {
      sub.remove();
      if (Platform.OS === 'web') document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refreshBilling, user]);

  const presentPaywall = useCallback(async (): Promise<ProPaywallOutcome> => {
    const outcome = await presentCurrentPaywall();
    console.log(`[billing] paywall ${outcome}`);
    await refreshBilling('paywall');
    return outcome;
  }, [refreshBilling]);

  const presentCustomerCenter = useCallback(async () => {
    const info = customerInfo ?? (await getCustomerInfo().catch(() => null));
    if (info) setCustomerInfo(info);
    console.log('[billing] customer center');
    await presentMoijiaCustomerCenter(() => {
      void refreshBilling('customer center');
    });
    await refreshBilling('customer center');
  }, [customerInfo, refreshBilling]);

  const purchasePro = useCallback(async (): Promise<CustomerInfo | null> => {
    try {
      const info = await purchaseProRc();
      setCustomerInfo(info);
      await refreshBilling('purchase');
      return info;
    } catch (error) {
      if (isPurchaseCancelled(error)) return null;
      if (isAlreadyPurchased(error)) {
        await refreshBilling('purchase');
        return getCustomerInfo().catch(() => null);
      }
      throw new Error(purchasesErrorMessage(error, 'Could not complete purchase.'));
    }
  }, [refreshBilling]);

  const restorePurchases = useCallback(async () => {
    const info = await restoreRevenueCatPurchases();
    setCustomerInfo(info);
    await refreshBilling('restore');
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
