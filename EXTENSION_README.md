# Stock Metadata Pro AI — Chrome Extension package

This package preserves the existing React/Vite application and adds a Manifest V3 Chrome extension shell. The extension opens the full dashboard in a browser tab so the existing dashboard layout, upload table, settings, SEO Finder, CSV controls, and embed workflow have room to work.

## Important architecture note

The extension frontend is packaged locally, but this project also has an Express/Vercel API. For server-backed features, deploy the existing backend to HTTPS (for example, Vercel), then open the extension's **Options** page and save the backend origin. Do not put Gemini/Groq provider secrets in extension code or manifest. Use the existing user-owned key workflow.

The extension build uses relative asset paths and `src/utils/apiClient.ts` resolves `/api/*` calls against the backend origin saved in extension settings. The backend includes CORS handling for `chrome-extension://` origins.

## Build the extension

Requirements: Node.js 20+ and npm.

1. Extract this ZIP.
2. In the extracted folder run `npm install`.
3. Run `npm run build:extension`.
4. The build output is in `dist/`. It should contain `index.html`, bundled assets, `manifest.json`, `extension-background.js`, `options.html`, and `options.js`.
5. Open `chrome://extensions` in Chrome, enable **Developer mode**, choose **Load unpacked**, and select the `dist` folder.
6. Open the extension's **Details → Extension options** and save the deployed HTTPS backend origin.
7. Click the extension toolbar icon to open Stock Metadata Pro AI in a full tab.

## Backend deployment

Deploy the same source project's Express/Vercel API with its existing Vercel configuration. After deploying, set the API origin in extension Options. The backend must permit the extension origin via the CORS middleware included in `server.ts`. Check that your host's deployment platform accepts this middleware and test `/api/health` from the extension before relying on generation.

## Limits / verification

The original source ZIP does not contain a prebuilt `dist/` folder. This environment could not complete `npm install`, so this package has not been compiled or runtime-tested here. Build the project locally or in a connected build environment before loading `dist` into Chrome. This package does not claim that remote AI generation, authentication, metadata embedding, CSV, or ZIP has passed end-to-end tests.
