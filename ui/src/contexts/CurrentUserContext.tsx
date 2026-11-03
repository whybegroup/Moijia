import React, { createContext, useContext, useEffect, useRef } from 'react';
import { User } from '@moijia/client';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { useUpdateUser } from '../hooks/api/useUsers';
import { setDisplayTimeZone } from '../utils/groupPlanPeriod';
import { User as FirebaseUser } from 'firebase/auth';

interface CurrentUserContextType {
  userId: string | null;
  user: User | null | undefined;
  firebaseUser: FirebaseUser | null;
  loading: boolean;
}

const CurrentUserContext = createContext<CurrentUserContextType>({
  userId: null,
  user: null,
  firebaseUser: null,
  loading: true,
});

export const useCurrentUserContext = () => {
  const context = useContext(CurrentUserContext);
  if (!context) {
    throw new Error('useCurrentUserContext must be used within CurrentUserProvider');
  }
  return context;
};

function deviceTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

export const CurrentUserProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const currentUser = useCurrentUser();
  const updateUser = useUpdateUser(currentUser.userId ?? '');
  const seeded = useRef<string | null>(null);
  const stored = currentUser.user?.timeZone?.trim() || '';
  setDisplayTimeZone(currentUser.user ? stored || deviceTimeZone() : null);

  useEffect(() => {
    const id = currentUser.userId;
    const user = currentUser.user;
    if (!id || !user || user.timeZone?.trim()) return;
    const device = deviceTimeZone();
    if (!device || seeded.current === id) return;
    seeded.current = id;
    updateUser.mutate({ timeZone: device });
  }, [currentUser.user, currentUser.userId, updateUser]);

  return (
    <CurrentUserContext.Provider value={currentUser}>
      {children}
    </CurrentUserContext.Provider>
  );
};
