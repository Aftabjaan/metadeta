import fs from 'fs';
let content = fs.readFileSync('src/utils/apiClient.ts', 'utf8');

// The block to replace starts around line 178 "const targetProvider..." and ends before "export async function requestOptimizeTitle"
const startMarker = "const targetProvider: 'gemini' | 'groq' = provider === 'groq' ? 'groq' : 'gemini';";
const endMarker = "export async function requestOptimizeTitle";

const startIndex = content.indexOf(startMarker);
const endIndex = content.indexOf(endMarker);

const newBlock = `const targetProvider: 'gemini' | 'groq' = provider === 'groq' ? 'groq' : 'gemini';
  
  let autoFallback = true;
  let autoRotation = true;
  try {
    const saved = localStorage.getItem('stock_pro_settings_backup');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.autoFallback !== undefined) autoFallback = parsed.autoFallback;
      if (parsed.autoRotation !== undefined) autoRotation = parsed.autoRotation;
    }
  } catch (e) {}

  let candidateKeys = getRotatedClientKeys(targetProvider);
  if (!autoRotation && candidateKeys.length > 0) {
    candidateKeys = [candidateKeys[0]];
  }

  const fallbackProvider = targetProvider === 'gemini' ? 'groq' : 'gemini';
  let fallbackKeys = getRotatedClientKeys(fallbackProvider);
  if (!autoRotation && fallbackKeys.length > 0) {
    fallbackKeys = [fallbackKeys[0]];
  }

  let keysToTry = [...candidateKeys];
  if (autoFallback) {
    keysToTry = [...keysToTry, ...fallbackKeys];
  }

  if (keysToTry.length === 0) {
    throw new Error(
      'No active API key found. Please open AI Settings and add your API key.'
    );
  }

  let lastClientError: any = null;
  for (const activeKey of keysToTry) {
    try {
      if (activeKey.entry.provider === 'groq') {
        const metadata = await generateMetadataClientWithGroq(
          imageBase64,
          mimeType,
          options,
          activeKey.rawKey
        );
        recordClientKeyUsage(activeKey.entry.id, true);
        return {
          metadata,
          provider: 'groq',
          keyLabel: activeKey.entry.label,
        };
      } else {
        const metadata = await generateMetadataClientWithGemini(
          imageBase64,
          mimeType,
          options,
          activeKey.rawKey
        );
        recordClientKeyUsage(activeKey.entry.id, true);
        return {
          metadata,
          provider: 'gemini',
          keyLabel: activeKey.entry.label,
        };
      }
    } catch (err: any) {
      lastClientError = err;
      recordClientKeyUsage(activeKey.entry.id, false, err?.message);
      console.warn(
        \`Client key \${activeKey.entry.label} failed (\${err?.message}). Trying next...\`
      );
    }
  }

  throw lastClientError || new Error('All configured client API keys failed.');
}

`;

content = content.substring(0, startIndex) + newBlock + content.substring(endIndex);
fs.writeFileSync('src/utils/apiClient.ts', content);
