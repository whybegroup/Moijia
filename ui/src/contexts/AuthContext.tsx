import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, onAuthStateChange, signOut as firebaseSignOut } from '../config/firebase';
import { UsersService } from '@moijia/client';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  signOut: async () => {},
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
  const [loading, setLoading] = useState(true);

  const syncUserToDatabase = async (firebaseUser: User) => {
    const displayName =
      firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User';
    try {
      await UsersService.syncUser({
        id: firebaseUser.uid,
        name: displayName,
        displayName: displayName,
      });
    } catch {
      // Don't block auth flow if database sync fails
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChange(async (firebaseUser) => {
      if (firebaseUser) {
        await syncUserToDatabase(firebaseUser);
      }

      setUser(firebaseUser);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const signOut = async () => {
    await firebaseSignOut();
    setUser(null);
  };

  const value = {
    user,
    loading,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
