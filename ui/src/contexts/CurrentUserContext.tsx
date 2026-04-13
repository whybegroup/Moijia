import React, { createContext, useContext } from 'react';
import { User } from '@moijia/client';
import { useCurrentUser } from '../hooks/useCurrentUser';
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

export const CurrentUserProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const currentUser = useCurrentUser();

  return (
    <CurrentUserContext.Provider value={currentUser}>
      {children}
    </CurrentUserContext.Provider>
  );
};
