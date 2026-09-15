import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { clearAiSettings } from '../utils/aiSettings';
import { startAuthBootstrap } from '../utils/authBootstrap';
import { createShoppingDraftOwner } from '../utils/shoppingDraftOwner';
import {
  clearCachedOfflineUser,
  clearOfflineDataForUser,
  loadCachedOfflineUser,
  saveCachedOfflineUser,
} from '../utils/offlineState';

const AuthContext = createContext({});

export const useAuth = () => useContext(AuthContext);

const isPasswordRecoveryUrl = () => {
  if (typeof window === 'undefined') return false;

  const searchParams = new URLSearchParams(window.location.search);
  if (searchParams.get('type') === 'recovery') {
    return true;
  }

  const hash = window.location.hash.startsWith('#')
    ? window.location.hash.slice(1)
    : window.location.hash;
  const hashParams = new URLSearchParams(hash);
  return hashParams.get('type') === 'recovery';
};

const clearRecoveryUrl = () => {
  if (typeof window === 'undefined') return;

  const url = new URL(window.location.href);
  let changed = false;

  if (url.searchParams.get('type') === 'recovery') {
    url.searchParams.delete('type');
    changed = true;
  }

  if (url.hash) {
    const hash = url.hash.startsWith('#') ? url.hash.slice(1) : url.hash;
    const hashParams = new URLSearchParams(hash);
    [
      'access_token',
      'refresh_token',
      'expires_at',
      'expires_in',
      'token_type',
      'type'
    ].forEach((key) => {
      if (hashParams.has(key)) {
        hashParams.delete(key);
        changed = true;
      }
    });
    url.hash = hashParams.toString() ? `#${hashParams.toString()}` : '';
  }

  if (changed) {
    window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
  }
};

const buildAuthRedirectUrl = () => (
  typeof window !== 'undefined'
    ? `${window.location.origin}/`
    : undefined
);

const clearSignedOutDeviceState = async (userId) => {
  clearAiSettings();
  clearCachedOfflineUser(userId);
  await clearOfflineDataForUser(userId);
};

const browserStartsOffline = () => (
  typeof navigator !== 'undefined' && navigator.onLine === false
);

export const AuthProvider = ({ children }) => {
  const cachedOfflineUserRef = useRef(loadCachedOfflineUser());
  const initialOfflineUser = browserStartsOffline() ? cachedOfflineUserRef.current : null;
  const [user, setUser] = useState(initialOfflineUser);
  const [loading, setLoading] = useState(() => !initialOfflineUser);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(() => isPasswordRecoveryUrl());
  const activeUserIdRef = useRef(initialOfflineUser?.id || null);
  const shoppingDraftOwnerRef = useRef(null);
  if (!shoppingDraftOwnerRef.current) {
    // Construction is storage-free, including StrictMode's discarded render.
    // Only an opt-in consumer's capability.acquire() creates a draft writer.
    shoppingDraftOwnerRef.current = createShoppingDraftOwner({
      enabled: import.meta.env.VITE_SHOPPING_DURABLE_CREATES === 'true', initialUserId: initialOfflineUser?.id || null,
    });
  }
  const [shoppingDraftScope, setShoppingDraftScope] = useState(() => shoppingDraftOwnerRef.current.getScope());
  const setDraftOwner = useCallback(userId => {
    setShoppingDraftScope(shoppingDraftOwnerRef.current.setOwner(userId));
  }, []);

  const normalizeFullName = (value) => {
    if (typeof value === 'string') return value.trim();
    if (value && typeof value === 'object' && typeof value.full_name === 'string') {
      return value.full_name.trim();
    }
    return '';
  };

  useEffect(() => {
    let isActive = true;
    // Publish a fresh capability after StrictMode effect cleanup/replay.
    setDraftOwner(activeUserIdRef.current);

    const applyOfflineUser = () => {
      const cachedUser = cachedOfflineUserRef.current || loadCachedOfflineUser();
      if (!cachedUser || !isActive) return false;
      cachedOfflineUserRef.current = cachedUser;
      activeUserIdRef.current = cachedUser.id;
      setDraftOwner(cachedUser.id);
      setUser(cachedUser);
      return true;
    };

    const acceptSessionUser = (sessionUser) => {
      if (!sessionUser || !isActive) return false;
      cachedOfflineUserRef.current = sessionUser;
      activeUserIdRef.current = sessionUser.id;
      setDraftOwner(sessionUser.id);
      saveCachedOfflineUser(sessionUser);
      setUser(sessionUser);
      return true;
    };

    const acceptPendingProjectInvites = async (session) => {
      const accessToken = session?.access_token;
      const email = session?.user?.email;
      if (!accessToken || !email) return;

      try {
        await fetch('/api/project-members-accept-pending', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`
          }
        });
      } catch (error) {
        console.warn('Unable to check pending project invites:', error);
      }
    };

    const finishBootstrap = () => {
      if (!isActive) return;
      setLoading(false);
    };

    const stopBootstrap = startAuthBootstrap({
      auth: supabase.auth,
      onTimeout: () => {
        console.warn('Supabase session bootstrap timed out; continuing with fallback auth state.');
        applyOfflineUser();
        finishBootstrap();
      },
      onSession: (session) => {
        if (!isActive) return;
        const acceptedSession = acceptSessionUser(session?.user);
        if (!acceptedSession) {
          activeUserIdRef.current = null;
          if (!browserStartsOffline() || !applyOfflineUser()) {
            setDraftOwner(null);
            setUser(null);
          }
        }
        setIsPasswordRecovery(isPasswordRecoveryUrl());
        void acceptPendingProjectInvites(session);
        finishBootstrap();
      },
      onError: (error) => {
        console.warn('Unable to load initial Supabase session:', error);
        if (!isActive) return;
        if (!applyOfflineUser()) {
          setDraftOwner(null);
          setUser(null);
        }
        setIsPasswordRecovery(isPasswordRecoveryUrl());
        finishBootstrap();
      },

      onAuthStateChange: (event, session) => {
        if (!isActive) return;
        const previousUserId = activeUserIdRef.current;
        // Revoke immediately, before asynchronous device cleanup and before
        // React can batch a subsequent sign-in to the same account.
        if (event === 'SIGNED_OUT') setDraftOwner(null);
        activeUserIdRef.current = session?.user?.id || null;
        if (session?.user) {
          acceptSessionUser(session.user);
        } else if (event !== 'SIGNED_OUT' && browserStartsOffline()) {
          applyOfflineUser();
        } else {
          setDraftOwner(null);
          setUser(null);
        }
        if (event === 'PASSWORD_RECOVERY') {
          setIsPasswordRecovery(true);
        } else if (event === 'SIGNED_OUT') {
          cachedOfflineUserRef.current = null;
          setIsPasswordRecovery(false);
          clearRecoveryUrl();
          void clearSignedOutDeviceState(previousUserId);
        } else if ((event === 'SIGNED_IN' || event === 'USER_UPDATED') && session?.user?.email) {
          void acceptPendingProjectInvites(session);
        }
        finishBootstrap();
      },
    });

    return () => {
      isActive = false;
      stopBootstrap();
      shoppingDraftOwnerRef.current.close();
    };
  }, [setDraftOwner]);

  const signUp = async (email, password, fullNameInput) => {
    const fullName = normalizeFullName(fullNameInput);
    const payload = {
      email,
      password
    };
    if (fullName) {
      payload.options = { data: { full_name: fullName } };
    }

    const { data, error } = await supabase.auth.signUp(payload);
    return { data, error };
  };

  const signIn = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });
    return { data, error };
  };

  const requestPasswordReset = async (email) => {
    const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: buildAuthRedirectUrl()
    });
    return { data, error };
  };

  const resendVerificationEmail = async (email) => {
    const { data, error } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: {
        emailRedirectTo: buildAuthRedirectUrl()
      }
    });
    return { data, error };
  };

  const updatePassword = async (password) => {
    const { data, error } = await supabase.auth.updateUser({ password });
    return { data, error };
  };

  const signOut = async () => {
    const signedOutUserId = activeUserIdRef.current || user?.id || null;
    const signingOutScope = shoppingDraftOwnerRef.current.getScope();
    const { error } = await supabase.auth.signOut();
    if (!error) {
      // A delayed sign-out response must not revoke an intervening sign-in.
      const currentScope = shoppingDraftOwnerRef.current.getScope();
      if (currentScope && currentScope !== signingOutScope) return { error };
      setDraftOwner(null);
      activeUserIdRef.current = null;
      cachedOfflineUserRef.current = null;
      await clearSignedOutDeviceState(signedOutUserId);
      if (shoppingDraftOwnerRef.current.getScope()) return { error };
      setUser(null);
      setIsPasswordRecovery(false);
      clearRecoveryUrl();
    }
    return { error };
  };

  const clearPasswordRecovery = async ({ signOutSession = false } = {}) => {
    setIsPasswordRecovery(false);
    clearRecoveryUrl();

    if (!signOutSession) {
      return { error: null };
    }

    const signedOutUserId = activeUserIdRef.current || user?.id || null;
    const signingOutScope = shoppingDraftOwnerRef.current.getScope();
    const { error } = await supabase.auth.signOut();
    if (!error) {
      const currentScope = shoppingDraftOwnerRef.current.getScope();
      if (currentScope && currentScope !== signingOutScope) return { error };
      setDraftOwner(null);
      activeUserIdRef.current = null;
      cachedOfflineUserRef.current = null;
      await clearSignedOutDeviceState(signedOutUserId);
      if (shoppingDraftOwnerRef.current.getScope()) return { error };
      setUser(null);
    }
    return { error };
  };

  const value = {
    user,
    shoppingDraftScope: shoppingDraftScope?.userId === user?.id ? shoppingDraftScope : null,
    loading,
    signUp,
    signIn,
    signOut,
    requestPasswordReset,
    resendVerificationEmail,
    updatePassword,
    isPasswordRecovery,
    clearPasswordRecovery
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
