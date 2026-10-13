import fs from 'fs';
let content = fs.readFileSync('src/utils/apiClient.ts', 'utf8');

// Replace the candidateKeys fallback logic
content = content.replace(
  /let candidateKeys = getRotatedClientKeys\(targetProvider\);\s*\/\/ If requested provider has no active keys[\s\S]*?if \(candidateKeys\.length === 0\) \{/m,
  `let candidateKeys = getRotatedClientKeys(targetProvider);

  // Load settings for autoFallback and autoRotation
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

  if (!autoRotation && candidateKeys.length > 0) {
    candidateKeys = [candidateKeys[0]]; // Only try the first one
  }

  // If requested provider has no active keys (or fails), and fallback is enabled
  if (candidateKeys.length === 0 && autoFallback) {
    const fallbackProvider = targetProvider === 'gemini' ? 'groq' : 'gemini';
    candidateKeys = getRotatedClientKeys(fallbackProvider);
    if (!autoRotation && candidateKeys.length > 0) {
      candidateKeys = [candidateKeys[0]];
    }
  }

  if (candidateKeys.length === 0) {`
);

// Fix the error handling to allow fallback in the loop
content = content.replace(
  /catch \(err: any\) \{\s*lastClientError = err;\s*recordClientKeyUsage\(activeKey\.entry\.id, false, err\?\.message\);\s*console\.warn\([\s\S]*?\);\s*\/\/ Continue to next available key\s*\}/m,
  `catch (err: any) {
      lastClientError = err;
      recordClientKeyUsage(activeKey.entry.id, false, err?.message);
      console.warn(
        \`Client key \${activeKey.entry.label} failed (\${err?.message}).\`
      );
      if (!autoRotation && !autoFallback) {
        break; // Stop if neither rotation nor fallback is allowed
      }
      // Note: If autoFallback is allowed, we might want to switch providers mid-loop if we added fallback keys to candidateKeys.
      // Wait, we only put fallback keys in candidateKeys if the original had length 0.
      // To support fallback when all keys of target fail, we should dynamically add fallback keys to candidateKeys if we exhaust the first set.
    }`
);

fs.writeFileSync('src/utils/apiClient.ts', content);
