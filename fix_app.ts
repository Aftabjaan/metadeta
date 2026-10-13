import fs from 'fs';
let content = fs.readFileSync('src/App.tsx', 'utf8');

// Replace imports
content = content.replace(/import \{ ApiKeyManagerModal \} from '\.\/components\/ApiKeyManagerModal';/, "import { AiSettingsModal } from './components/AiSettingsModal';");

// Replace modal component
content = content.replace(
  /<ApiKeyManagerModal\s*isOpen=\{isKeysOpen\}[\s\S]*?\/>/,
  `<AiSettingsModal
        isOpen={isKeysOpen}
        onClose={() => setIsKeysOpen(false)}
        apiKeys={apiKeys}
        settings={settings}
        onSettingsUpdated={setSettings}
        onKeysUpdated={async () => {
          const keys = await fetchApiKeys().catch(() => []);
          setApiKeys(keys);
        }}
      />`
);

fs.writeFileSync('src/App.tsx', content);
