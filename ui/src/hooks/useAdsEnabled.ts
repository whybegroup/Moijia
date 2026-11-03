import { Platform } from 'react-native';
import { useCurrentUserContext } from '../contexts/CurrentUserContext';
import { useOwnedGroupQuota } from './api';

/** Free iOS accounts only. Pro and Enterprise are ad-free, and web has no AdMob SDK. */
export function useAdsEnabled(): boolean {
  const { userId } = useCurrentUserContext();
  const { data: quota, isSuccess } = useOwnedGroupQuota(userId ?? '');
  if (Platform.OS !== 'ios') return false;
  if (!userId || !isSuccess || !quota) return false;
  return quota.subscriptionTier === 'free';
}
