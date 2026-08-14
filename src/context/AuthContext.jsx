import { useState, useEffect, useRef } from 'react';
import { supabase } from '../config/supabase';
import { userService } from '../services/userService';
import { AuthContext } from './auth-context';

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  // True ONLY until the very first auth resolution. Route guards gate on this,
  // never on `loading`, so a background auth refresh (Supabase re-fires
  // SIGNED_IN/TOKEN_REFRESHED on every tab focus) can never unmount and remount
  // the routed page — which was resetting in-progress forms back to Step 1.
  const [initializing, setInitializing] = useState(true);
  const [error, setError] = useState(null);
  const activeRef = useRef(true);
  // Guards the auth listener against Supabase re-firing SIGNED_IN/TOKEN_REFRESHED
  // every time the tab regains focus. `initializedRef` marks the first load as
  // done; `currentUserIdRef` lets us detect focus refires (same user) and
  // refresh state WITHOUT toggling the app-wide `loading` gate — otherwise
  // ProtectedRoute swaps the routed page for a spinner and remounts it, wiping
  // in-progress local state (e.g. a half-filled new job sheet jumps to Step 1).
  const initializedRef = useRef(false);
  const currentUserIdRef = useRef(null);

  useEffect(() => {
    activeRef.current = true;

    // Loads (and, on first login, completes) the profile for a given
    // Supabase session. No live listener — per the "simple refetch first"
    // decision, profile changes just require a fresh fetch (see
    // refreshProfile/updateActiveScheme below) instead of a Realtime channel.
    const loadForSession = async (session) => {
      const user = session?.user ?? null;
      currentUserIdRef.current = user?.id ?? null;
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
        initializedRef.current = true;
        if (activeRef.current) {
          setLoading(false);
          setInitializing(false);
        }
      });
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextUserId = session?.user?.id ?? null;

      // Focus refire for the same signed-in user (Supabase re-emits
      // SIGNED_IN/TOKEN_REFRESHED on tab focus): refresh the profile silently so
      // the archived-mid-session sign-out still fires, but DON'T touch `loading`
      // — flipping it here remounts the whole routed page and resets any
      // in-progress form.
      if (initializedRef.current && nextUserId === currentUserIdRef.current) {
        loadForSession(session);
        return;
      }

      // Genuine transition (real sign-in or sign-out): gate the UI so we never
      // render with a half-loaded profile.
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
    initializing,
    error,
    isAuthenticated: !!currentUser,
    isEmailVerified: Boolean(currentUser?.email_confirmed_at),
    role: userProfile?.role || null,
    updateActiveScheme,
    refreshProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
