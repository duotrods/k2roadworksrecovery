import { createContext, useState, useEffect, useRef } from 'react';
import { supabase } from '../config/supabase';
import { userService } from '../services/userService';

export const AuthContext = createContext({});

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const activeRef = useRef(true);

  useEffect(() => {
    activeRef.current = true;

    // Loads (and, on first login, completes) the profile for a given
    // Supabase session. No live listener — per the "simple refetch first"
    // decision, profile changes just require a fresh fetch (see
    // refreshProfile/updateActiveScheme below) instead of a Realtime channel.
    const loadForSession = async (session) => {
      const user = session?.user ?? null;
      // Keep `.uid` around alongside the raw Supabase user object since most
      // of the app reads `currentUser.uid`.
      setCurrentUser(user ? { ...user, uid: user.id } : null);

      if (!user) {
        setUserProfile(null);
        return;
      }

      try {
        const profile = await userService.ensureUserProfile(user);
        if (!activeRef.current) return;

        if (profile?.isArchived) {
          await supabase.auth.signOut();
          setCurrentUser(null);
          setUserProfile(null);
          setError(new Error('Your account has been archived. Please contact an administrator.'));
          return;
        }

        setUserProfile(profile);
        setError(null);
      } catch (err) {
        if (activeRef.current) {
          console.error('Failed to load user profile:', err);
          setError(err);
        }
      }
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      loadForSession(session).finally(() => {
        if (activeRef.current) setLoading(false);
      });
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setLoading(true);
      loadForSession(session).finally(() => {
        if (activeRef.current) setLoading(false);
      });
    });

    return () => {
      activeRef.current = false;
      subscription.unsubscribe();
    };
  }, []);

  // Re-fetches the current user's profile row. Used after any self-service
  // profile write (e.g. updateActiveScheme) since there's no live channel.
  const refreshProfile = async () => {
    if (!currentUser) return;
    const profile = await userService.getUserDocument(currentUser.id);
    setUserProfile(profile);
  };

  const updateActiveScheme = async (schemeId) => {
    if (!currentUser) {
      throw new Error('No user is logged in');
    }
    await userService.updateUserProfile(currentUser.id, { activeSchemeId: schemeId });
    await refreshProfile();
  };

  const value = {
    currentUser,
    userProfile,
    loading,
    error,
    isAuthenticated: !!currentUser,
    isEmailVerified: Boolean(currentUser?.email_confirmed_at),
    role: userProfile?.role || null,
    updateActiveScheme,
    refreshProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
