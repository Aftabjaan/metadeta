import { verifyGeminiKeyClient, verifyGroqKeyClient } from './clientAiService';

/**
 * Detect the likely provider from the structural key pattern.
 */
export function detectProviderFromKeyPattern(key: string): 'gemini' | 'groq' | 'openai' | 'unknown' {
  if (!key) return 'unknown';
  const clean = key.trim();
  if (clean.startsWith('gsk_')) {
    return 'groq';
  }
  if (clean.startsWith('AIzaSy')) {
    return 'gemini';
  }
  if (clean.startsWith('sk-')) {
    return 'openai';
  }
  return 'unknown';
}

/**
 * Strict double-verification of API Key and Provider mismatch.
 */
export async function verifyKeyProvider(
  key: string,
  expectedProvider: 'gemini' | 'groq' | 'openai'
): Promise<{ success: boolean; error?: string; message?: string }> {
  const clean = key.trim();
  
  if (clean.length < 16) {
    return {
      success: false,
      error: 'Invalid API key. Please check the key and try again.',
    };
  }

  const patternProvider = detectProviderFromKeyPattern(clean);

  // 1. Prefix mismatch checks (Instant rejection)
  if (patternProvider !== 'unknown' && patternProvider !== expectedProvider) {
     return { success: false, error: `This is a ${patternProvider.charAt(0).toUpperCase() + patternProvider.slice(1)} API key. Please enter a ${expectedProvider.charAt(0).toUpperCase() + expectedProvider.slice(1)} API key.` };
  }

  // 2. Perform verification check via server
  try {
    const endpoint = expectedProvider === 'groq' ? '/api/ai/verify-groq-key' : '/api/ai/verify-gemini-key';
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: clean }),
    });
    
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const data = await res.json();
      if (res.ok && data.valid) {
        return {
          success: true,
          message: `${expectedProvider.charAt(0).toUpperCase() + expectedProvider.slice(1)} API key verified.`,
        };
      } else {
        return {
          success: false,
          error: data.error || `${expectedProvider.charAt(0).toUpperCase() + expectedProvider.slice(1)} verification failed.`,
        };
      }
    }
  } catch (e) {
    console.warn('Provider verification failed:', e);
  }

  return {
    success: false,
    error: 'Invalid API key or network error during verification.',
  };
}
