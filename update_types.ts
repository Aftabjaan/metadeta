import fs from 'fs';
let content = fs.readFileSync('src/types.ts', 'utf8');

content = content.replace(
  /export interface ProcessingSettings \{[\s\S]*?\}/,
  `export interface ProcessingSettings {
  concurrency: number;
  retryCount: number;
  provider?: AIProvider;
  preferredProvider?: AIProvider;
  groqModel: string;
  geminiModel: string;
  enableAutoSave?: boolean;
  autoRotation?: boolean;
  autoFallback?: boolean;
}`
);

fs.writeFileSync('src/types.ts', content);
