import { StockAssetErrorInfo } from '../types';

/**
 * Normalizes any error from Groq or Gemini providers into a consistent,
 * safe, and professional human-readable error info object.
 * Guaranteeing that sensitive details like keys are NEVER exposed.
 */
export function normalizeErrorInfo(err: any, provider: 'groq' | 'gemini' | 'openai' | null): StockAssetErrorInfo {
  const rawMsg = typeof err === 'string' ? err : err?.message || JSON.stringify(err) || '';
  
  // Clean rawMsg from any potential key leakage (e.g., gsk_ or API key characters)
  let cleanMsg = rawMsg;
  cleanMsg = cleanMsg.replace(/gsk_[a-zA-Z0-9_]{30,}/g, '••••••••');
  cleanMsg = cleanMsg.replace(/AIzaSy[a-zA-Z0-9_-]{33}/g, '••••••••');
  cleanMsg = cleanMsg.replace(/Bearer\s+[a-zA-Z0-9_.-]+/gi, 'Bearer ••••••••');
  
  let type = 'Unknown Error';
  let message = 'An unexpected error occurred.';
  let retryable = true;

  const lower = cleanMsg.toLowerCase();

  if (
    lower.includes('401') || 
    lower.includes('403') || 
    lower.includes('unauthorized') || 
    lower.includes('invalid api key') || 
    lower.includes('key is invalid') ||
    lower.includes('forbidden') ||
    lower.includes('api_key_invalid') ||
    lower.includes('api key') && (lower.includes('invalid') || lower.includes('rejected') || lower.includes('missing'))
  ) {
    type = 'API Key Error';
    message = 'API key is invalid or rejected.';
    retryable = false;
  } else if (
    lower.includes('quota') || 
    lower.includes('exceeded') || 
    lower.includes('credit') ||
    lower.includes('billing') ||
    lower.includes('limit_reached')
  ) {
    type = 'API Quota';
    message = 'API quota has been exceeded.';
    retryable = false;
  } else if (
    lower.includes('429') || 
    lower.includes('rate limit') || 
    lower.includes('resource_exhausted') || 
    lower.includes('try again') || 
    lower.includes('retry in') || 
    lower.includes('too many requests')
  ) {
    type = 'API Rate Limit';
    message = 'API rate limit reached. Retry available.';
    retryable = true;
  } else if (
    lower.includes('408') || 
    lower.includes('timeout') || 
    lower.includes('deadline_exceeded') ||
    lower.includes('timed out')
  ) {
    type = 'Timeout';
    message = 'AI request timed out.';
    retryable = true;
  } else if (
    lower.includes('fetch') || 
    lower.includes('network') || 
    lower.includes('failed to fetch') || 
    lower.includes('connect') ||
    lower.includes('dns') ||
    lower.includes('offline')
  ) {
    type = 'Network Error';
    message = 'Unable to connect to the AI service.';
    retryable = true;
  } else if (
    lower.includes('keyword count') || 
    lower.includes('keyword target mismatch') ||
    (lower.includes('keywords, but') && lower.includes('requested'))
  ) {
    type = 'Keyword Count';
    message = cleanMsg.includes('requested') ? cleanMsg : 'Generated keywords do not match the requested count.';
    retryable = true;
  } else if (
    lower.includes('validation') || 
    lower.includes('validator') || 
    lower.includes('sanitize') ||
    lower.includes('did not pass validation')
  ) {
    type = 'Metadata Validation';
    message = 'Generated metadata did not pass validation.';
    retryable = true;
  } else if (
    lower.includes('json') || 
    lower.includes('invalid response') || 
    lower.includes('schema') || 
    lower.includes('incomplete') ||
    lower.includes('parse')
  ) {
    type = 'Invalid Response';
    message = 'AI returned an incomplete or invalid metadata response.';
    retryable = true;
  } else if (
    lower.includes('404') ||
    lower.includes('not_found') ||
    lower.includes('not found') ||
    (lower.includes('model') && (lower.includes('available') || lower.includes('exist') || lower.includes('deprecated') || lower.includes('no longer')))
  ) {
    type = 'Model Error';
    message = cleanMsg || 'The requested AI model is not available.';
    retryable = false;
  } else if (
    lower.includes('503') || 
    lower.includes('502') || 
    lower.includes('504') || 
    lower.includes('high demand') ||
    lower.includes('unavailable') ||
    lower.includes('overloaded') ||
    lower.includes('server error') ||
    lower.includes('bad gateway') ||
    lower.includes('service unavailable')
  ) {
    type = lower.includes('high demand') || lower.includes('503') || lower.includes('unavailable') ? 'Service High Demand' : 'Generation Error';
    message = cleanMsg ? `Service Temporary Notice: ${cleanMsg}` : 'The AI service is experiencing temporary high demand. Click retry to re-process.';
    retryable = true;
  } else {
    type = provider ? `${provider.toUpperCase()} API Error` : 'Provider Error';
    message = cleanMsg || 'An unexpected error occurred during API request.';
    retryable = true;
  }

  return {
    type,
    message,
    retryable,
    timestamp: new Date().toISOString(),
    attemptedProvider: provider
  };
}
