import fs from 'fs';
let content = fs.readFileSync('src/utils/clientKeyStorage.ts', 'utf8');

content = content.replace(/export function validateKeyFormatClient_OLD[\s\S]*?return false;\n}/m, `
export function validateKeyFormatClient(key: string, provider: 'gemini' | 'groq'): boolean {
  if (!key || typeof key !== 'string') return false;
  const clean = key.trim();
  if (clean.length < 5) return false;
  return true;
}
`);

fs.writeFileSync('src/utils/clientKeyStorage.ts', content);
