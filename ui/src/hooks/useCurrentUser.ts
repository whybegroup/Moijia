import { useEffect, useState, useRef } from 'react';
import type { User } from '@moija/client';
import { useAuth } from '../contexts/AuthContext';
import { useUser, useCreateUser } from './api';

/**
 * Hook to get or create the current user in the database
 * Syncs Firebase user with backend database
 */
export const useCurrentUser = () => {
  const { user: firebaseUser, loading: authLoading } = useAuth();
  const [userId, setUserId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const creationAttempted = useRef<Set<string>>(new Set());
  const lastUserRef = useRef<User | null>(null);

  // Try to get user from database
  const { data: dbUser, isLoading: dbLoading } = useUser(userId || '');
  const createUser = useCreateUser();

  // Cache last known user so we don't lose it when switching tabs (query can briefly return undefined)
  if (dbUser) lastUserRef.current = dbUser;
  const user = dbUser ?? (userId ? lastUserRef.current : null);

  useEffect(() => {
    const syncUser = async () => {
      if (authLoading || !firebaseUser) {
        setUserId(null);
        lastUserRef.current = null;
        return;
      }

      // Use Supabase user ID as the user ID
      const uid = firebaseUser.uid;
      
      // Only set userId if it's different
      if (userId !== uid) {
        setUserId(uid);
      }
    };

    syncUser();
  }, [firebaseUser, authLoading, userId]);

  // Separate effect to handle user creation
  useEffect(() => {
    const createUserIfNeeded = async () => {
      if (!userId || authLoading || dbLoading || isCreating) {
        return;
      }

      // If user doesn't exist and we haven't tried creating them yet
      if (!dbUser && !creationAttempted.current.has(userId)) {
        console.log('Creating new user in database:', firebaseUser?.email);
        creationAttempted.current.add(userId);
        setIsCreating(true);
        
        try {
          const displayName = firebaseUser?.displayName || 
                             firebaseUser?.email ||
                             'User';
          
          await createUser.mutateAsync({
            id: userId,
            name: displayName,
            displayName: displayName,
          });
          
          console.log('User created successfully');
        } catch (error: any) {
          console.error('Error creating user:', error);
          
          // If it's a duplicate error, the user might have been created by another process
          if (error?.message?.includes('Unique constraint') || error?.message?.includes('duplicate')) {
            console.log('Duplicate detected, user may already exist');
          }
        } finally {
          setIsCreating(false);
        }
      }
    };

    createUserIfNeeded();
  }, [userId, dbUser, dbLoading, authLoading, isCreating, firebaseUser, createUser]);

  return {
    userId,
    user,
    firebaseUser,
    loading: authLoading || dbLoading || isCreating,
  };
};
