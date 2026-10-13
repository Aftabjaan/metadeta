import { StockMetadata, PromptBuildOptions } from '../types';
import { geminiProviderAdapter, groqProviderAdapter } from './aiAdapters';
import { resolveEffectiveModel } from './aiModelService';

/**
 * Direct client-side verification for Google Gemini API key.
 */
export async function verifyGeminiKeyClient(
  apiKey: string
): Promise<{ success: boolean; message?: string; error?: string }> {
  return geminiProviderAdapter.testKey(apiKey);
}

/**
 * Direct client-side verification for Groq API key.
 */
export async function verifyGroqKeyClient(
  apiKey: string
): Promise<{ success: boolean; message?: string; error?: string }> {
  return groqProviderAdapter.testKey(apiKey);
}

/**
 * Direct client-side metadata generation using Google Gemini REST API.
 */
export async function generateMetadataClientWithGemini(
  imageBase64: string,
  mimeType: string,
  options: PromptBuildOptions,
  apiKey: string,
  modelId?: string
): Promise<StockMetadata> {
  let selectedModel = modelId;
  if (!selectedModel) {
    try {
      const saved = localStorage.getItem('stock_pro_settings_backup');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.geminiModel) selectedModel = parsed.geminiModel;
      }
    } catch {}
  }
  const effectiveModel = resolveEffectiveModel('gemini', selectedModel);
  return geminiProviderAdapter.generateMetadata(
    imageBase64,
    mimeType,
    options,
    apiKey,
    effectiveModel
  );
}

/**
 * Direct client-side metadata generation using Groq Vision API.
 */
export async function generateMetadataClientWithGroq(
  imageBase64: string,
  mimeType: string,
  options: PromptBuildOptions,
  apiKey: string,
  modelId?: string
): Promise<StockMetadata> {
  let selectedModel = modelId;
  if (!selectedModel) {
    try {
      const saved = localStorage.getItem('stock_pro_settings_backup');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.groqModel) selectedModel = parsed.groqModel;
      }
    } catch {}
  }
  const effectiveModel = resolveEffectiveModel('groq', selectedModel);
  return groqProviderAdapter.generateMetadata(
    imageBase64,
    mimeType,
    options,
    apiKey,
    effectiveModel
  );
}

/**
 * Direct client-side title optimization
 */
export async function optimizeTitleClient(
  currentTitle: string,
  context: { category?: string; keywords?: string[]; marketplace?: string },
  apiKey: string,
  modelId?: string
): Promise<string> {
  if (!apiKey || !apiKey.trim()) return currentTitle;

  const targetModel = resolveEffectiveModel('gemini', modelId);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${targetModel}:generateContent?key=${encodeURIComponent(
    apiKey.trim()
  )}`;

  const prompt = `Refine this stock title for maximum commercial click-through on Adobe Stock:
Original Title: "${currentTitle}"
Category: ${context.category || 'General'}
Keywords: ${(context.keywords || []).slice(0, 5).join(', ')}

Rules: Return ONLY the refined title as plain text. No quotes, no markdown, no filler.`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
      }),
    });
    if (!res.ok) return currentTitle;
    const data = await res.json();
    const result = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    return result ? result.replace(/^["']|["']$/g, '') : currentTitle;
  } catch {
    return currentTitle;
  }
}

/**
 * Direct client-side description optimization
 */
export async function optimizeDescriptionClient(
  currentDescription: string,
  title: string,
  apiKey: string,
  modelId?: string
): Promise<string> {
  if (!apiKey || !apiKey.trim()) return currentDescription;

  const targetModel = resolveEffectiveModel('gemini', modelId);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${targetModel}:generateContent?key=${encodeURIComponent(
    apiKey.trim()
  )}`;

  const prompt = `Rewrite this stock photo description to be clear, descriptive, professional, and SEO-friendly:
Title: "${title}"
Current Description: "${currentDescription}"

Rules: Return ONLY the refined description (1-2 sentences) as plain text. No quotes, no markdown.`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
      }),
    });
    if (!res.ok) return currentDescription;
    const data = await res.json();
    const result = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    return result ? result.replace(/^["']|["']$/g, '') : currentDescription;
  } catch {
    return currentDescription;
  }
}
