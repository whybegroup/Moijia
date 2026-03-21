import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, onAuthStateChange, signOut as firebaseSignOut, getCurrentUser } from '../config/firebase';
import { Platform } from 'react-native';
import { UsersService } from '@moija/client';

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

  // Create or update user in database
  const syncUserToDatabase = async (firebaseUser: User) => {
    try {
      console.log('[AuthContext] Syncing user to database:', firebaseUser.uid);
      
      // Check if user exists
      try {
        const existingUser = await UsersService.getUser(firebaseUser.uid);
        console.log('[AuthContext] User already exists in database:', existingUser.id);
        return;
      } catch (error: any) {
        console.log('[AuthContext] Error checking user:', {
          status: error.status,
          message: error.message,
          body: error.body,
        });
        
        // User doesn't exist (404), create them
        if (error.status === 404) {
          console.log('[AuthContext] User not found, creating new user in database');
          
          const displayName = firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User';
          
          try {
            await UsersService.createUser({
              id: firebaseUser.uid,
              name: displayName,
              displayName: displayName,
            });
            
            console.log('[AuthContext] User created successfully in database');
          } catch (createError: any) {
            console.error('[AuthContext] Error creating user:', createError);
            throw createError;
          }
        } else {
          // Some other error occurred
          console.error('[AuthContext] Unexpected error checking user:', error);
          throw error;
        }
      }
    } catch (error: any) {
      console.error('[AuthContext] Error syncing user to database:', error);
      // Don't block auth flow if database sync fails
    }
  };

  useEffect(() => {
    console.log('[AuthContext] Setting up auth listener');
    
    // The onAuthStateChanged listener will handle everything:
    // - Initial auth state on mount
    // - Auth state after popup sign-in
    // - Auth state changes (sign in/out)
    const unsubscribe = onAuthStateChange(async (firebaseUser) => {
      console.log('[AuthContext] Auth state changed:', {
        hasUser: !!firebaseUser,
        email: firebaseUser?.email,
        uid: firebaseUser?.uid,
      });
      
      if (firebaseUser) {
        // User signed in - sync to database
        await syncUserToDatabase(firebaseUser);
      }
      
      setUser(firebaseUser);
      setLoading(false);
    });

    // Cleanup subscription
    return () => unsubscribe();
  }, []);

  const signOut = async () => {
    try {
      console.log('[AuthContext] Starting sign out...');
      await firebaseSignOut();
      console.log('[AuthContext] Firebase sign out successful');
      setUser(null);
      console.log('[AuthContext] User state cleared');
    } catch (error) {
      console.error('[AuthContext] Error signing out:', error);
      throw error;
    }
  };

  const value = {
    user,
    loading,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
