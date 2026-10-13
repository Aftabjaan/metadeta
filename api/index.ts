import app from '../server.ts';

// Vercel serverless function entry point
export default function handler(req: any, res: any) {
  // Determine the original requested URL
  let originalUrl = req.url || '';
  
  // Vercel often rewrites req.url to the serverless function path (e.g. /api/index.ts).
  // We can retrieve the actual requested URL from Vercel-specific headers.
  const matchedPath = req.headers['x-matched-path'];
  const originalUrlHeader = req.headers['x-original-url'] || req.headers['x-forwarded-url'];
  
  if (originalUrlHeader && typeof originalUrlHeader === 'string') {
    originalUrl = originalUrlHeader;
  } else if (matchedPath && typeof matchedPath === 'string') {
    // x-matched-path is the path before rewrites, so append any query string from req.url
    const queryIndex = req.url ? req.url.indexOf('?') : -1;
    const queryString = queryIndex !== -1 ? req.url.slice(queryIndex) : '';
    originalUrl = `${matchedPath}${queryString}`;
  }

  // Ensure /api prefix is present when routed by Vercel
  if (originalUrl && !originalUrl.startsWith('/api')) {
    originalUrl = `/api${originalUrl.startsWith('/') ? '' : '/'}${originalUrl}`;
  }

  // Assign the normalized original URL back to req.url so Express can route it correctly
  req.url = originalUrl;

  return app(req, res);
}

export { app };
