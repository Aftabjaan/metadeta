import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { AuthUser } from '../types';
import { supabase, isSupabaseConfigured, getSupabaseConfigStatus } from '../utils/supabaseClient';
import { setAuthToken, setOnAuthExpired } from '../utils/apiClient';

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  loading: boolean;
  isSupabase: boolean;
  isSupabaseActive: boolean;
  authError: string | null;
  setAuthError: (error: string | null) => void;
  isPasswordRecovery: boolean;
  setIsPasswordRecovery: (recovering: boolean) => void;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  register: (email: string, password: string, fullName?: string) => Promise<{ success: boolean; error?: string; message?: string }>;
  resetPassword: (email: string) => Promise<{ success: boolean; error?: string }>;
  updatePassword: (newPassword: string) => Promise<{ success: boolean; error?: string }>;
  loginWithGoogle: () => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  continueAsGuest: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const LOCAL_SESSION_KEY = 'stock_pro_auth_session';

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState<boolean>(false);
  const isSupabase = isSupabaseConfigured();

  // Register session expiration handler
  useEffect(() => {
    setOnAuthExpired((message: string) => {
      logout();
      setAuthError(message || 'Your session has expired. Please log in again.');
    });

    return () => {
      setOnAuthExpired(null);
    };
  }, []);

  // Check URL query parameters and hash for OAuth errors (e.g. Unsupported provider) or recovery
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const searchParams = new URLSearchParams(window.location.search);
      const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : window.location.hash;
      const hashParams = new URLSearchParams(hash);

      const err = searchParams.get('error') || hashParams.get('error') || '';
      const errDesc = searchParams.get('error_description') || hashParams.get('error_description') || '';
      const combined = `${err} ${errDesc}`.toLowerCase();

      if (
        combined.includes('unsupported provider') ||
        combined.includes('provider is not enabled') ||
        combined.includes('unsupported_provider')
      ) {
        setAuthError('Google Sign-In is not enabled yet. Please use Email & Password or enable Google provider in Supabase.');
        window.history.replaceState(null, '', window.location.pathname);
      } else if (errDesc) {
        setAuthError(decodeURIComponent(errDesc.replace(/\+/g, ' ')));
        window.history.replaceState(null, '', window.location.pathname);
      }

      if (hash.includes('type=recovery') || hash.includes('access_token=')) {
        setIsPasswordRecovery(true);
      }
    } catch {
      // Ignore URL parsing errors
    }
  }, []);

  // Initialize session on mount
  useEffect(() => {
    let isMounted = true;

    const initAuth = async () => {
      try {
        if (isSupabase && supabase) {
          // 1. Supabase Session Check with 1.5s timeout safety
          const sessionPromise = supabase.auth.getSession();
          const timeoutPromise = new Promise<{ data: { session: null }; error: any }>((resolve) =>
            setTimeout(() => resolve({ data: { session: null }, error: new Error('Auth session check timeout') }), 1500)
          );
          const { data, error } = await Promise.race([sessionPromise, timeoutPromise]);

          if (!error && data.session?.user && isMounted) {
            const supaUser = data.session.user;
            const mappedUser: AuthUser = {
              id: supaUser.id,
              email: supaUser.email || '',
              fullName: supaUser.user_metadata?.full_name || supaUser.user_metadata?.name || '',
              avatarUrl: supaUser.user_metadata?.avatar_url,
              provider: supaUser.app_metadata?.provider || 'email',
              createdAt: supaUser.created_at,
            };
            setUser(mappedUser);
            setToken(data.session.access_token);
            setAuthToken(data.session.access_token, supaUser.id);
          }

          // Listen for Supabase auth state changes
          const { data: authListener } = supabase.auth.onAuthStateChange(
            async (event, session) => {
              if (event === 'PASSWORD_RECOVERY') {
                setIsPasswordRecovery(true);
              }

              if (session?.user && isMounted) {
                const u = session.user;
                const mappedUser: AuthUser = {
                  id: u.id,
                  email: u.email || '',
                  fullName: u.user_metadata?.full_name || u.user_metadata?.name || '',
                  avatarUrl: u.user_metadata?.avatar_url,
                  provider: u.app_metadata?.provider || 'email',
                  createdAt: u.created_at,
                };
                setUser(mappedUser);
                setToken(session.access_token);
                setAuthToken(session.access_token, u.id);
              } else if (isMounted) {
                setUser(null);
                setToken(null);
                setAuthToken(null, null);
              }
            }
          );

          return () => {
            authListener.subscription.unsubscribe();
          };
        } else {
          // Standalone session check
          const stored = localStorage.getItem(LOCAL_SESSION_KEY);
          if (stored && isMounted) {
            try {
              const session = JSON.parse(stored);
              if (session?.user && session?.token) {
                setUser(session.user);
                setToken(session.token);
                setAuthToken(session.token, session.user.id);
              }
            } catch {
              localStorage.removeItem(LOCAL_SESSION_KEY);
            }
          }
        }
      } catch (err) {
        console.error('Error initializing auth session:', err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    initAuth();

    return () => {
      isMounted = false;
    };
  }, [isSupabase]);

  // Email + Password Login
  const login = async (
    email: string,
    pass: string
  ): Promise<{ success: boolean; error?: string }> => {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !pass) {
      return { success: false, error: 'Email and password are required' };
    }

    const configStatus = getSupabaseConfigStatus();
    if (!configStatus.isConfigured || !supabase) {
      return {
        success: false,
        error: configStatus.errorMessage || 'Authentication is not configured. Please contact the administrator.',
      };
    }

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password: pass,
      });

      if (error) {
        const msg = error.message || '';
        if (
          error.code === 'email_provider_disabled' ||
          msg.toLowerCase().includes('email logins are disabled') ||
          msg.toLowerCase().includes('email signups are disabled')
        ) {
          return {
            success: false,
            error: 'Email provider is turned off in your Supabase project. In Supabase Dashboard → Authentication → Providers → Email, turn ON "Enable Email provider".',
          };
        }
        if (error.code === 'email_not_confirmed' || msg.toLowerCase().includes('email not confirmed')) {
          return {
            success: false,
            error: 'Your email address has not been confirmed yet. Please check your inbox for the confirmation link from Supabase.',
          };
        }
        if (error.code === 'invalid_credentials' || msg.toLowerCase().includes('invalid login credentials')) {
          return {
            success: false,
            error: 'Invalid email or password. Please verify your credentials.',
          };
        }
        if (msg.toLowerCase().includes('invalid api key')) {
          return {
            success: false,
            error: 'Authentication configuration error: Invalid Supabase Publishable Key. Please check your VITE_SUPABASE_PUBLISHABLE_KEY setting.',
          };
        }
        return { success: false, error: msg };
      }

      if (data.user && data.session) {
        const mappedUser: AuthUser = {
          id: data.user.id,
          email: data.user.email || cleanEmail,
          fullName: data.user.user_metadata?.full_name || '',
          avatarUrl: data.user.user_metadata?.avatar_url,
          provider: 'email',
          createdAt: data.user.created_at,
        };
        setUser(mappedUser);
        setToken(data.session.access_token);
        setAuthToken(data.session.access_token, data.user.id);
        setAuthError(null);
        return { success: true };
      }
      return { success: false, error: 'Authentication failed. Please verify your credentials.' };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Login failed unexpectedly' };
    }
  };

  // Register Account (Sign Up)
  const register = async (
    email: string,
    pass: string,
    fullName?: string
  ): Promise<{ success: boolean; error?: string; message?: string }> => {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !pass) {
      return { success: false, error: 'Email and password are required' };
    }
    if (pass.length < 6) {
      return { success: false, error: 'Password must be at least 6 characters long' };
    }

    const configStatus = getSupabaseConfigStatus();
    if (!configStatus.isConfigured || !supabase) {
      return {
        success: false,
        error: configStatus.errorMessage || 'Authentication is not configured. Please contact the administrator.',
      };
    }

    try {
      const { data, error } = await supabase.auth.signUp({
        email: cleanEmail,
        password: pass,
        options: {
          data: {
            full_name: fullName || '',
          },
        },
      });

      if (error) {
        const msg = error.message || '';
        if (
          error.code === 'email_provider_disabled' ||
          msg.toLowerCase().includes('email signups are disabled') ||
          msg.toLowerCase().includes('email logins are disabled') ||
          msg.toLowerCase().includes('signups not allowed')
        ) {
          return {
            success: false,
            error: 'Email signups are disabled in your Supabase project. In Supabase Dashboard → Authentication → Providers → Email, make sure "Enable Email provider" is turned ON.',
          };
        }
        if (
          error.code === 'over_email_send_rate_limit' ||
          msg.toLowerCase().includes('email rate limit exceeded') ||
          msg.toLowerCase().includes('rate limit')
        ) {
          return {
            success: false,
            error: 'Supabase email rate limit reached (free tier allows 3-4 verification emails/hour). To allow instant sign-ups without email delays, turn off "Confirm email" in your Supabase Dashboard under Authentication → Providers → Email.',
          };
        }
        if (msg.toLowerCase().includes('user already registered') || error.code === 'user_already_exists') {
          return {
            success: false,
            error: 'An account with this email already exists. Please switch to the "Sign In" tab.',
          };
        }
        if (msg.toLowerCase().includes('invalid api key')) {
          return {
            success: false,
            error: 'Authentication configuration error: Invalid Supabase Publishable Key. Please check your VITE_SUPABASE_PUBLISHABLE_KEY setting.',
          };
        }
        return { success: false, error: msg };
      }

      if (data.user) {
        const mappedUser: AuthUser = {
          id: data.user.id,
          email: data.user.email || cleanEmail,
          fullName: fullName || '',
          provider: 'email',
          createdAt: data.user.created_at,
        };

        if (data.session) {
          setUser(mappedUser);
          setToken(data.session.access_token);
          setAuthToken(data.session.access_token, data.user.id);
          setAuthError(null);
          return { success: true };
        } else {
          // Email confirmation is required by Supabase project settings
          return {
            success: true,
            message: 'Account created! If confirmation is required, please check your email before logging in.',
          };
        }
      }
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Registration failed' };
    }
  };

  // Forgot Password (Send Reset Email)
  const resetPassword = async (email: string): Promise<{ success: boolean; error?: string }> => {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      return { success: false, error: 'Email address is required' };
    }

    const configStatus = getSupabaseConfigStatus();
    if (!configStatus.isConfigured || !supabase) {
      return {
        success: false,
        error: configStatus.errorMessage || 'Authentication is not configured. Please contact the administrator.',
      };
    }

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo: window.location.origin,
      });

      if (error) {
        const msg = error.message || '';
        if (
          error.code === 'over_email_send_rate_limit' ||
          msg.toLowerCase().includes('email rate limit exceeded') ||
          msg.toLowerCase().includes('rate limit')
        ) {
          return {
            success: false,
            error: 'Email rate limit reached for password reset emails. Please wait a few minutes before requesting another reset email.',
          };
        }
        return { success: false, error: msg };
      }

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Password reset request failed' };
    }
  };

  // Update Password (After clicking recovery link)
  const updatePassword = async (newPassword: string): Promise<{ success: boolean; error?: string }> => {
    if (!newPassword || newPassword.length < 6) {
      return { success: false, error: 'Password must be at least 6 characters long' };
    }

    const configStatus = getSupabaseConfigStatus();
    if (!configStatus.isConfigured || !supabase) {
      return {
        success: false,
        error: configStatus.errorMessage || 'Authentication is not configured. Please contact the administrator.',
      };
    }

    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) {
        return { success: false, error: error.message };
      }

      setIsPasswordRecovery(false);
      // Clean up URL hash
      if (typeof window !== 'undefined' && window.location.hash) {
        window.history.replaceState(null, '', window.location.pathname);
      }
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Password update failed' };
    }
  };

  // Google OAuth Sign In
  const loginWithGoogle = async (): Promise<{ success: boolean; error?: string }> => {
    const configStatus = getSupabaseConfigStatus();
    if (!configStatus.isConfigured || !supabase) {
      return {
        success: false,
        error: configStatus.errorMessage || 'Authentication is not configured. Please contact the administrator.',
      };
    }

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
        },
      });

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Google sign-in failed unexpectedly.' };
    }
  };

  // Continue as Guest (instant local mode without Supabase blocker)
  const continueAsGuest = (): void => {
    const guestUser: AuthUser = {
      id: 'guest-user',
      email: 'contributor@stockpro.local',
      fullName: 'Stock Contributor',
      provider: 'email',
      createdAt: new Date().toISOString(),
    };
    setUser(guestUser);
    setToken('guest-local-token');
    setAuthToken('guest-local-token', 'guest-user');
    setAuthError(null);
    try {
      localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify({ user: guestUser, token: 'guest-local-token' }));
    } catch {}
  };

  // Logout
  const logout = async (): Promise<void> => {
    try {
      if (isSupabase && supabase) {
        await supabase.auth.signOut();
      }
    } catch (err) {
      console.error('Error signing out of Supabase:', err);
    } finally {
      localStorage.removeItem(LOCAL_SESSION_KEY);
      setUser(null);
      setToken(null);
      setAuthToken(null, null);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        loading: isLoading,
        isSupabase,
        isSupabaseActive: isSupabase,
        authError,
        setAuthError,
        isPasswordRecovery,
        setIsPasswordRecovery,
        login,
        register,
        resetPassword,
        updatePassword,
        loginWithGoogle,
        logout,
        continueAsGuest,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

