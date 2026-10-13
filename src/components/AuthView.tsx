import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Mail,
  Lock,
  User,
  Eye,
  EyeOff,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Database,
  ChevronDown,
  ChevronUp,
  ArrowLeft,
  KeyRound,
  Info,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const AuthView: React.FC = () => {
  const {
    login,
    register,
    resetPassword,
    updatePassword,
    loginWithGoogle,
    isSupabase,
    authError,
    setAuthError,
    isPasswordRecovery,
    setIsPasswordRecovery,
    continueAsGuest,
  } = useAuth();

  const [mode, setMode] = useState<'login' | 'register' | 'forgot' | 'reset'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showConfigHelper, setShowConfigHelper] = useState(false);

  // Switch to reset mode if arriving via password recovery link
  useEffect(() => {
    if (isPasswordRecovery) {
      setMode('reset');
      setErrorMessage(null);
      setSuccessMessage('Please choose a new password for your account.');
    }
  }, [isPasswordRecovery]);

  // Sync authError from context (e.g., session expiration)
  useEffect(() => {
    if (authError) {
      setErrorMessage(authError);
    }
  }, [authError]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);
    if (setAuthError) setAuthError(null);

    if (!isSupabase) {
      setErrorMessage('Authentication is not configured. Please contact the administrator.');
      return;
    }

    if (mode === 'forgot') {
      if (!email.trim()) {
        setErrorMessage('Please provide your email address.');
        return;
      }
      setLoading(true);
      try {
        const res = await resetPassword(email);
        if (!res.success) {
          setErrorMessage(res.error || 'Failed to send reset link. Please try again.');
        } else {
          setSuccessMessage('Password reset instructions have been sent to your email. Check your inbox.');
        }
      } catch (err: any) {
        setErrorMessage(err?.message || 'Password reset request failed.');
      } finally {
        setLoading(false);
      }
      return;
    }

    if (mode === 'reset') {
      if (!password || password.length < 6) {
        setErrorMessage('Password must be at least 6 characters long.');
        return;
      }
      if (password !== confirmPassword) {
        setErrorMessage('Passwords do not match.');
        return;
      }
      setLoading(true);
      try {
        const res = await updatePassword(password);
        if (!res.success) {
          setErrorMessage(res.error || 'Password update failed. Please request a new link.');
        } else {
          setSuccessMessage('Your password has been successfully updated! You can now log in.');
          setMode('login');
          setIsPasswordRecovery(false);
          setPassword('');
          setConfirmPassword('');
        }
      } catch (err: any) {
        setErrorMessage(err?.message || 'Password update failed.');
      } finally {
        setLoading(false);
      }
      return;
    }

    // Login or Register
    if (!email.trim() || !password) {
      setErrorMessage('Please fill in all required fields.');
      return;
    }

    if (mode === 'register' && password.length < 6) {
      setErrorMessage('Password must be at least 6 characters long.');
      return;
    }

    setLoading(true);

    try {
      if (mode === 'login') {
        const res = await login(email, password);
        if (!res.success) {
          setErrorMessage(res.error || 'Login failed. Please verify your credentials.');
        }
      } else {
        const res = await register(email, password, fullName.trim());
        if (!res.success) {
          setErrorMessage(res.error || 'Registration failed.');
        } else {
          setSuccessMessage(res.message || 'Account created successfully! Logging you into your workspace...');
          if (res.message) {
            setMode('login');
            setPassword('');
          }
        }
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleClick = async () => {
    setErrorMessage(null);
    setSuccessMessage(null);
    if (!isSupabase) {
      setErrorMessage('Authentication is not configured. Please contact the administrator.');
      return;
    }

    setLoading(true);
    try {
      const res = await loginWithGoogle();
      if (!res.success && res.error) {
        setErrorMessage(res.error);
      }
    } catch (err: any) {
      const msg = err?.message || '';
      if (
        msg.toLowerCase().includes('unsupported provider') ||
        msg.toLowerCase().includes('provider is not enabled')
      ) {
        setErrorMessage('Google Sign-In is not enabled yet. Please use Email & Password or enable Google provider in Supabase.');
      } else {
        setErrorMessage(msg || 'Google sign in failed');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 flex flex-col justify-center items-center p-4 sm:p-6 relative overflow-hidden">
      {/* Ambient background glows */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 sm:w-[600px] h-96 sm:h-[600px] bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-72 h-72 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Main Container */}
      <div className="w-full max-w-md relative z-10 space-y-6">
        {/* App Branding Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-cyan-500 to-blue-600 shadow-xl shadow-blue-500/25 ring-1 ring-white/20 mb-2">
            <Sparkles className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900">
            STOCK METADATA <span className="text-blue-600">PRO AI</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 max-w-xs mx-auto">
            Professional SEO Keyword Generator & Batch Metadata Tool for Microstock Contributors
          </p>
        </div>

        {/* Missing Supabase Configuration Notice */}
        {!isSupabase && (
          <div
            id="auth-not-configured-banner"
            className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs space-y-2 shadow-sm"
          >
            <div className="flex items-start gap-2.5 font-semibold text-amber-800">
              <AlertCircle className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
              <span>Authentication is not configured. Please contact the administrator.</span>
            </div>
            <p className="text-[11px] text-amber-700 leading-relaxed pl-6">
              To enable user accounts, provide <code className="text-amber-900 bg-amber-100/80 px-1 py-0.5 rounded font-mono">VITE_SUPABASE_URL</code> and{' '}
              <code className="text-amber-900 bg-amber-100/80 px-1 py-0.5 rounded font-mono">VITE_SUPABASE_PUBLISHABLE_KEY</code> in your environment settings.
            </p>
          </div>
        )}

        {/* Auth Box */}
        <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-xl backdrop-blur-xl space-y-6">
          {/* Mode Switcher Tabs (Only on login or register) */}
          {(mode === 'login' || mode === 'register') && (
            <div className="grid grid-cols-2 p-1 bg-slate-100 rounded-2xl border border-slate-200">
              <button
                type="button"
                id="tab-sign-in"
                onClick={() => {
                  setMode('login');
                  setErrorMessage(null);
                  setSuccessMessage(null);
                }}
                className={`py-2 text-xs sm:text-sm font-bold rounded-xl transition-all ${
                  mode === 'login'
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                id="tab-create-account"
                onClick={() => {
                  setMode('register');
                  setErrorMessage(null);
                  setSuccessMessage(null);
                }}
                className={`py-2 text-xs sm:text-sm font-bold rounded-xl transition-all ${
                  mode === 'register'
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Create Account
              </button>
            </div>
          )}

          {/* Forgot Password Header */}
          {mode === 'forgot' && (
            <div className="space-y-1">
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setErrorMessage(null);
                  setSuccessMessage(null);
                }}
                className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-blue-600 font-medium transition-colors mb-2"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to Sign In</span>
              </button>
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-blue-600" />
                <span>Reset Your Password</span>
              </h2>
              <p className="text-xs text-slate-500">
                Enter the email address registered with your account to receive reset instructions.
              </p>
            </div>
          )}

          {/* Reset Password Header */}
          {mode === 'reset' && (
            <div className="space-y-1">
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-blue-600" />
                <span>Choose New Password</span>
              </h2>
              <p className="text-xs text-slate-500">
                Enter your new password below to regain full workspace access.
              </p>
            </div>
          )}

          {/* Alerts */}
          {errorMessage && (
            <div
              id="auth-error-message"
              className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs space-y-2.5 animate-in fade-in relative"
            >
              <div className="flex items-start justify-between gap-2.5">
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
                  <span className="leading-relaxed font-medium text-rose-800">{errorMessage}</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setErrorMessage(null);
                    if (setAuthError) setAuthError(null);
                  }}
                  className="p-1 rounded-lg text-rose-500 hover:text-rose-800 hover:bg-rose-100 transition-colors shrink-0 cursor-pointer"
                  title="Dismiss error"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Actionable Solution Card for Email Provider Disabled */}
              {(errorMessage.toLowerCase().includes('disabled') || errorMessage.toLowerCase().includes('email provider')) && (
                <div className="pt-2 border-t border-rose-200 text-[11px] text-slate-700 space-y-2">
                  <div className="font-semibold text-amber-800 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                    <span>How to fix "Email signups are disabled":</span>
                  </div>
                  <div className="bg-white border border-amber-200 rounded-xl p-2.5 space-y-2 text-slate-700">
                    <div className="flex items-start gap-2">
                      <span className="w-4 h-4 rounded-full bg-amber-100 text-amber-800 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">1</span>
                      <span>Open your <strong className="text-slate-900">Supabase Dashboard</strong></span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="w-4 h-4 rounded-full bg-amber-100 text-amber-800 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">2</span>
                      <span>Go to <strong className="text-slate-900">Authentication → Providers → Email</strong></span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="w-4 h-4 rounded-full bg-amber-100 text-amber-800 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">3</span>
                      <span>
                        Turn the top toggle <strong className="text-emerald-700">"Enable Email provider"</strong> to <strong className="text-emerald-700">ON</strong>
                      </span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="w-4 h-4 rounded-full bg-amber-100 text-amber-800 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">4</span>
                      <span>
                        Under Email settings, toggle <strong className="text-blue-700">"Confirm email"</strong> to <strong className="text-blue-700">OFF</strong> (so you don't hit rate limits), then click <strong className="text-slate-900">Save</strong>
                      </span>
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-500 leading-normal pl-0.5">
                    The top switch was accidentally toggled off. Turning it back on will immediately restore email signups and logins.
                  </p>
                </div>
              )}

              {/* Actionable Solution Card for Google Provider Disabled */}
              {errorMessage.toLowerCase().includes('google') && !errorMessage.toLowerCase().includes('disabled') && (
                <div className="pt-2 border-t border-rose-200 text-[11px] text-slate-700 space-y-2">
                  <div className="font-semibold text-blue-700 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                    <span>How to enable Google Sign-In (or use Email):</span>
                  </div>
                  <div className="bg-white border border-blue-200 rounded-xl p-2.5 space-y-1.5 text-slate-700">
                    <p className="text-slate-700">
                      • You can log in using <strong>Email & Password</strong> above.
                    </p>
                    <p className="text-slate-500">
                      • To enable Google: Go to Supabase Dashboard → <strong>Authentication → Providers → Google</strong>, toggle <strong>Enable Google provider</strong>, and paste your Google OAuth Client credentials.
                    </p>
                  </div>
                </div>
              )}

              {/* Actionable Solution Card for Email Rate Limit */}
              {errorMessage.toLowerCase().includes('rate limit') && !errorMessage.toLowerCase().includes('disabled') && (
                <div className="pt-2 border-t border-rose-200 text-[11px] text-slate-700 space-y-2">
                  <div className="font-semibold text-blue-700 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                    <span>How to fix this instantly:</span>
                  </div>
                  <div className="bg-white border border-rose-200 rounded-xl p-2.5 space-y-1.5 text-slate-700">
                    <div className="flex items-start gap-2">
                      <span className="w-4 h-4 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">1</span>
                      <span>Open your <strong className="text-slate-900">Supabase Dashboard</strong></span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="w-4 h-4 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">2</span>
                      <span>Go to <strong className="text-slate-900">Authentication → Providers → Email</strong></span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="w-4 h-4 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">3</span>
                      <span>Toggle OFF <strong className="text-blue-700">"Confirm email"</strong> and click <strong className="text-slate-900">Save</strong></span>
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-500 leading-normal pl-0.5">
                    Supabase's default email service has an hourly cap of 3-4 verification emails. Turning off "Confirm email" lets you register and sign in immediately without email delays or rate limits.
                  </p>
                </div>
              )}
            </div>
          )}

          {successMessage && (
            <div
              id="auth-success-message"
              className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-start justify-between gap-2.5 animate-in fade-in"
            >
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
                <span>{successMessage}</span>
              </div>
              <button
                type="button"
                onClick={() => setSuccessMessage(null)}
                className="p-1 rounded-lg text-emerald-600 hover:text-emerald-900 hover:bg-emerald-100 transition-colors shrink-0 cursor-pointer"
                title="Dismiss message"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">Full Name</label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    id="auth-fullname-input"
                    autoComplete="name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Jane Doe"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl pl-10 pr-4 py-2.5 text-xs sm:text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                  />
                </div>
              </div>
            )}

            {(mode === 'login' || mode === 'register' || mode === 'forgot') && (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">Email Address</label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    id="auth-email-input"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="contributor@example.com"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl pl-10 pr-4 py-2.5 text-xs sm:text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                  />
                </div>
              </div>
            )}

            {(mode === 'login' || mode === 'register' || mode === 'reset') && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-700">
                    {mode === 'reset' ? 'New Password' : 'Password'}
                  </label>
                  {mode === 'login' && (
                    <button
                      type="button"
                      id="link-forgot-password"
                      onClick={() => {
                        setMode('forgot');
                        setErrorMessage(null);
                        setSuccessMessage(null);
                      }}
                      className="text-[11px] text-blue-600 hover:text-blue-700 font-medium transition-colors cursor-pointer"
                    >
                      Forgot password?
                    </button>
                  )}
                  {(mode === 'register' || mode === 'reset') && (
                    <span className="text-[11px] text-slate-500">Min. 6 characters</span>
                  )}
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    id="auth-password-input"
                    autoComplete={mode === 'register' || mode === 'reset' ? 'new-password' : 'current-password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl pl-10 pr-10 py-2.5 text-xs sm:text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            )}

            {mode === 'reset' && (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">Confirm New Password</label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    id="auth-confirm-password-input"
                    autoComplete="new-password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl pl-10 pr-4 py-2.5 text-xs sm:text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                  />
                </div>
              </div>
            )}

            <button
              type="submit"
              id="auth-submit-btn"
              disabled={loading}
              className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white font-bold text-xs sm:text-sm shadow-md shadow-blue-600/20 transition-all flex items-center justify-center gap-2 active:scale-98 disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <span>
                    {mode === 'login' && 'Sign In to Workspace'}
                    {mode === 'register' && 'Create Free Account'}
                    {mode === 'forgot' && 'Send Password Reset Link'}
                    {mode === 'reset' && 'Update Password'}
                  </span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Additional navigation link */}
          {mode === 'login' && (
            <div className="text-center text-xs text-slate-500">
              Don't have an account?{' '}
              <button
                type="button"
                id="link-create-account"
                onClick={() => {
                  setMode('register');
                  setErrorMessage(null);
                  setSuccessMessage(null);
                }}
                className="text-blue-600 hover:text-blue-700 font-semibold transition-colors"
              >
                Create Account
              </button>
            </div>
          )}

          {mode === 'register' && (
            <div className="text-center text-xs text-slate-500">
              Already have an account?{' '}
              <button
                type="button"
                id="link-sign-in"
                onClick={() => {
                  setMode('login');
                  setErrorMessage(null);
                  setSuccessMessage(null);
                }}
                className="text-blue-600 hover:text-blue-700 font-semibold transition-colors"
              >
                Sign In
              </button>
            </div>
          )}

          {/* Divider & Google OAuth (Only for login and register) */}
          {(mode === 'login' || mode === 'register') && (
            <>
              <div className="relative flex items-center justify-center">
                <div className="border-t border-slate-200 w-full" />
                <span className="bg-white px-3 text-[11px] uppercase tracking-wider text-slate-400 font-semibold absolute">
                  or
                </span>
              </div>

              <button
                type="button"
                id="google-signin-btn"
                onClick={handleGoogleClick}
                disabled={loading}
                className="w-full py-2.5 px-4 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-300 text-slate-700 font-semibold text-xs sm:text-sm transition-all flex items-center justify-center gap-3 active:scale-98 cursor-pointer disabled:opacity-50"
              >
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                <span>Continue with Google</span>
                <span className="text-[10px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200 ml-auto hidden sm:inline">Setup in Supabase</span>
              </button>

              <button
                type="button"
                id="guest-signin-btn"
                onClick={continueAsGuest}
                className="w-full py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-xs"
              >
                <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                <span>Continue as Guest / Enter Workspace</span>
              </button>
            </>
          )}

          {/* Security Badges */}
          <div className="pt-2 border-t border-slate-200 grid grid-cols-2 gap-2 text-[11px] text-slate-500">
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span>Isolated Workspaces</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-blue-600 shrink-0" />
              <span>Row-Level Security</span>
            </div>
          </div>
        </div>

        {/* Database Status & Config Helper */}
        <div className="bg-white border border-slate-200 rounded-2xl p-3.5 text-xs text-slate-600 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Database className="w-3.5 h-3.5 text-blue-600" />
              <span>
                Supabase Auth:{' '}
                <strong className={isSupabase ? 'text-emerald-700' : 'text-amber-700'}>
                  {isSupabase ? 'Connected & Active' : 'Configuration Required'}
                </strong>
              </span>
            </div>
            <button
              type="button"
              id="btn-toggle-config-guide"
              onClick={() => setShowConfigHelper(!showConfigHelper)}
              className="text-slate-400 hover:text-slate-700 p-1 cursor-pointer"
            >
              {showConfigHelper ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>

          {showConfigHelper && (
            <div className="mt-3 pt-3 border-t border-slate-200 space-y-2 text-[11px] text-slate-600">
              <div className="flex items-start gap-1.5 text-slate-800 font-medium">
                <Info className="w-3.5 h-3.5 text-blue-600 shrink-0 mt-0.5" />
                <span>Supabase Setup Instructions:</span>
              </div>
              <p>
                Add your Supabase project credentials to your environment settings or Vercel dashboard:
              </p>
              <div className="font-mono bg-slate-50 p-2.5 rounded-lg text-slate-800 text-[10px] space-y-1 border border-slate-200">
                <div>VITE_SUPABASE_URL=https://your-project.supabase.co</div>
                <div>VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-or-anon-key</div>
              </div>
              <p className="text-slate-500">
                Execute the included <code className="text-blue-600">supabase_schema.sql</code> in your Supabase SQL Editor to provision user-scoped tables and Row-Level Security (RLS) policies.
              </p>
              <div className="p-2 rounded-lg bg-blue-50 border border-blue-200 text-slate-700 text-[10px] space-y-1">
                <strong className="text-blue-800 font-semibold">Pro-tip for instant registrations:</strong>
                <div>In your Supabase project under <em>Authentication → Providers → Email</em>, switch OFF <strong>"Confirm email"</strong>. This eliminates the free-tier 3-email/hour SMTP rate limit and allows instant sign-ups.</div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <footer className="pt-2 text-center text-xs font-semibold text-slate-400 tracking-wider">
          AFTAB JAAN
        </footer>
      </div>
    </div>
  );
};
