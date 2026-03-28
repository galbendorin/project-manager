import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

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

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(() => isPasswordRecoveryUrl());

  const normalizeFullName = (value) => {
    if (typeof value === 'string') return value.trim();
    if (value && typeof value === 'object' && typeof value.full_name === 'string') {
      return value.full_name.trim();
    }
    return '';
  };

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setIsPasswordRecovery(isPasswordRecoveryUrl());
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      if (event === 'PASSWORD_RECOVERY') {
        setIsPasswordRecovery(true);
      } else if (event === 'SIGNED_OUT') {
        setIsPasswordRecovery(false);
        clearRecoveryUrl();
      }
      // Only set loading false if we're still loading
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

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
    const redirectTo = typeof window !== 'undefined'
      ? `${window.location.origin}/`
      : undefined;

    const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo
    });
    return { data, error };
  };

  const updatePassword = async (password) => {
    const { data, error } = await supabase.auth.updateUser({ password });
    return { data, error };
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (!error) {
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

    const { error } = await supabase.auth.signOut();
    if (!error) {
      setUser(null);
    }
    return { error };
  };

  const value = {
    user,
    loading,
    signUp,
    signIn,
    signOut,
    requestPasswordReset,
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
