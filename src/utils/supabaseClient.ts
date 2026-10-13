import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Sanitizes an environment variable value by removing surrounding quotes,
 * extraneous whitespace, and any accidental "VARIABLE_NAME=" prefixes
 * that can occur when pasting into environment configuration settings.
 */
export function cleanEnvValue(val?: string | null): string {
  if (!val) return '';
  let cleaned = String(val).trim();

  // Strip enclosing quotes if present (double or single quotes)
  if (
    (cleaned.startsWith('"') && cleaned.endsWith('"')) ||
    (cleaned.startsWith("'") && cleaned.endsWith("'"))
  ) {
    cleaned = cleaned.slice(1, -1).trim();
  }

  // Handle accidental "KEY=value" string pasting
  if (cleaned.includes('=')) {
    const parts = cleaned.split('=');
    cleaned = parts[parts.length - 1].trim();
    if (
      (cleaned.startsWith('"') && cleaned.endsWith('"')) ||
      (cleaned.startsWith("'") && cleaned.endsWith("'"))
    ) {
      cleaned = cleaned.slice(1, -1).trim();
    }
  }

  return cleaned;
}

const getRawEnv = (key: string): string => {
  try {
    if (typeof import.meta !== 'undefined' && (import.meta as any).env) {
      const val = (import.meta as any).env[key];
      if (val) return String(val);
    }
  } catch {
    // Ignore runtime context errors
  }
  try {
    if (typeof process !== 'undefined' && process.env) {
      const val = process.env[key];
      if (val) return String(val);
    }
  } catch {
    // Ignore runtime context errors
  }
  return '';
};

// Project default Supabase configuration used as fallback for deployments (e.g. Vercel)
const DEFAULT_SUPABASE_URL = 'https://jfpwbhqnmhpkulhxbhrh.supabase.co';
const DEFAULT_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_SRGPNYnRML7vu2oOQJWFTA_BLwDNl1T';

// Retrieve and sanitize Supabase URL and Publishable Key from standard Vite env, falling back to project credentials
export const supabaseUrl = cleanEnvValue(
  getRawEnv('VITE_SUPABASE_URL') || getRawEnv('SUPABASE_URL')
) || DEFAULT_SUPABASE_URL;

export const supabasePublishableKey = cleanEnvValue(
  getRawEnv('VITE_SUPABASE_PUBLISHABLE_KEY') ||
  getRawEnv('VITE_SUPABASE_ANON_KEY') ||
  getRawEnv('SUPABASE_PUBLISHABLE_KEY') ||
  getRawEnv('SUPABASE_ANON_KEY')
) || DEFAULT_SUPABASE_PUBLISHABLE_KEY;

export interface SupabaseConfigStatus {
  isConfigured: boolean;
  errorMessage: string | null;
}

/**
 * Performs strict validation on the Supabase configuration before any auth calls
 */
export const getSupabaseConfigStatus = (): SupabaseConfigStatus => {
  if (!supabaseUrl) {
    return {
      isConfigured: false,
      errorMessage: 'Authentication is not configured: VITE_SUPABASE_URL is missing. Please set your Supabase project URL.',
    };
  }

  if (!supabasePublishableKey) {
    return {
      isConfigured: false,
      errorMessage: 'Authentication is not configured: VITE_SUPABASE_PUBLISHABLE_KEY is missing. Please set your Supabase Publishable Key.',
    };
  }

  if (!supabaseUrl.startsWith('https://') || !supabaseUrl.includes('.supabase.co')) {
    return {
      isConfigured: false,
      errorMessage: 'Invalid Supabase URL: It must start with "https://" and end with ".supabase.co".',
    };
  }

  if (supabaseUrl.includes('your-project') || supabaseUrl.includes('placeholder')) {
    return {
      isConfigured: false,
      errorMessage: 'Placeholder Supabase URL detected. Please provide your real Supabase project URL.',
    };
  }

  // Explicit safety check: Ensure neither Gemini nor Groq API keys are mistakenly used
  if (supabasePublishableKey.startsWith('AIzaSy') || supabasePublishableKey.startsWith('gsk_')) {
    return {
      isConfigured: false,
      errorMessage: 'Configuration error: A Gemini or Groq API key was detected in VITE_SUPABASE_PUBLISHABLE_KEY. Please provide your Supabase Publishable Key.',
    };
  }

  // Explicit safety check: Ensure secret or service_role key is never exposed or used on the client
  if (supabasePublishableKey.includes('service_role') || supabasePublishableKey.startsWith('sb_secret_')) {
    return {
      isConfigured: false,
      errorMessage: 'Security error: A Supabase service_role or secret key must never be used on the client. Please use your Supabase Publishable or Anon key.',
    };
  }

  if (supabasePublishableKey.length < 20) {
    return {
      isConfigured: false,
      errorMessage: 'Invalid Supabase Publishable Key: Key is too short. Please verify your Supabase Publishable Key.',
    };
  }

  return {
    isConfigured: true,
    errorMessage: null,
  };
};

export const isSupabaseConfigured = (): boolean => {
  return getSupabaseConfigStatus().isConfigured;
};

// Initialize the Supabase client exactly once
export const supabase: SupabaseClient | null = isSupabaseConfigured()
  ? createClient(supabaseUrl, supabasePublishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

