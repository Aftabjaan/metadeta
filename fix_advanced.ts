import fs from 'fs';
let content = fs.readFileSync('src/components/AdvancedSettingsModal.tsx', 'utf8');

// Remove geminiModel and groqModel states
content = content.replace(/const \[geminiModel.*?\] = useState<string>\([\s\S]*?\);\n/g, '');
content = content.replace(/const \[groqModel.*?\] = useState<string>\([\s\S]*?\);\n/g, '');

// Remove them from handleSave
content = content.replace(/geminiModel: geminiModel\.trim\(\) \|\| 'gemini-3\.8-flash',/g, '');
content = content.replace(/groqModel: groqModel\.trim\(\) \|\| 'qwen\/qwen3\.8-27b',/g, '');

// Preserve them in handleSave by passing them from props
content = content.replace(
  /onSave\(\{([\s\S]*?)\}\);/g,
  `onSave({
      $1,
      geminiModel: settings.geminiModel,
      groqModel: settings.groqModel,
      autoRotation: settings.autoRotation,
      autoFallback: settings.autoFallback
    });`
);

// Remove the input fields
content = content.replace(/\{.*?Gemini Vision Model[\s\S]*?\}\s*<\/div>\s*<\/div>\s*<\/div>\s*<\/div>/, '');

fs.writeFileSync('src/components/AdvancedSettingsModal.tsx', content);
