import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import {
  User,
  getCurrentUser,
  needsEmailVerification,
  onAuthStateChange,
  reloadCurrentUser,
  signOut as firebaseSignOut,
} from '../config/firebase';
import { UsersService } from '@moijia/client';

interface AuthContextType {
  user: User | null;
  emailVerified: boolean;
  loading: boolean;
  signOut: () => Promise<void>;
  reloadUser: () => Promise<User | null>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  emailVerified: false,
  loading: true,
  signOut: async () => {},
  reloadUser: async () => null,
});

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [emailVerified, setEmailVerified] = useState(false);
  const [loading, setLoading] = useState(true);

  const applyUser = useCallback((next: User | null) => {
    setUser(next);
    setEmailVerified(!!next?.emailVerified);
  }, []);

  const syncUserToDatabase = async (firebaseUser: User) => {
    const displayName =
      firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User';
    try {
      await UsersService.syncUser({
        id: firebaseUser.uid,
        name: displayName,
        displayName: displayName,
        email: firebaseUser.email ?? null,
      });
    } catch {
      // Don't block auth flow if database sync fails
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChange((firebaseUser) => {
      applyUser(firebaseUser);
      setLoading(false);
      if (firebaseUser) void syncUserToDatabase(firebaseUser);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', async (state) => {
      if (state !== 'active') return;
      const current = getCurrentUser();
      if (!current || !needsEmailVerification(current)) return;
      const next = await reloadCurrentUser();
      if (next) applyUser(next);
    });
    return () => sub.remove();
  }, []);

  const reloadUser = useCallback(async () => {
    const next = await reloadCurrentUser();
    applyUser(next);
    return next;
  }, [applyUser]);

  const signOut = useCallback(async () => {
    await firebaseSignOut();
    applyUser(null);
  }, [applyUser]);

  const value = {
    user,
    emailVerified,
    loading,
    signOut,
    reloadUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
