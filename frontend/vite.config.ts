import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';

type MutableHeaders = Record<string, number | string | string[] | readonly string[] | undefined>;

const DEV_CACHE_CONTROL = 'no-cache, max-age=0, must-revalidate';
const HTML_CACHE_CONTROL = 'public, max-age=0, must-revalidate';
const STATIC_CACHE_CONTROL = 'public, max-age=3600';
const VERSIONED_ASSET_CACHE_CONTROL = 'public, max-age=31536000, immutable';

function paperlensResponseHeaders(): Plugin {
  const cacheControlForPreview = (url = '/') => {
    const pathname = url.split('?')[0] ?? '/';
    if (/^\/Paperlens_26\.06\/assets\/.+-[A-Za-z0-9_-]+\.(?:css|js|mjs)$/.test(pathname)
      || /^\/assets\/.+-[A-Za-z0-9_-]+\.(?:css|js|mjs)$/.test(pathname)) {
      return VERSIONED_ASSET_CACHE_CONTROL;
    }
    if (/\.(?:css|js|mjs|svg|png|jpg|jpeg|webp|woff2?)$/.test(pathname)) {
      return STATIC_CACHE_CONTROL;
    }
    return HTML_CACHE_CONTROL;
  };

  const normalizeHeaderValue = (name: string, value: number | string | string[] | readonly string[] | undefined, cacheControl: string) => {
    const key = name.toLowerCase();
    if (key === 'x-content-type-options') return 'nosniff';
    if (key === 'cache-control') return cacheControl;
    if (key !== 'content-type' || typeof value !== 'string') return value;

    let contentType = value.replace(/^text\/javascript\b/i, 'application/javascript');
    if (/^(text\/html|text\/css|application\/json|application\/javascript|image\/svg\+xml)\b/i.test(contentType)
      && !/;\s*charset=/i.test(contentType)) {
      contentType = `${contentType}; charset=utf-8`;
    }
    return contentType;
  };

  const applyHeaders = (res: import('http').ServerResponse, cacheControl: string) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', cacheControl);
    const contentType = res.getHeader('Content-Type') ?? res.getHeader('content-type');
    const normalizedContentType = normalizeHeaderValue('content-type', contentType, cacheControl);
    if (normalizedContentType) res.setHeader('Content-Type', normalizedContentType);
  };

  const patchContentType = (res: import('http').ServerResponse, cacheControl: string) => {
    const setHeader = res.setHeader.bind(res);
    res.setHeader = (name, value) => {
      const normalizedValue = normalizeHeaderValue(String(name), value, cacheControl) ?? value;
      return setHeader(name, Array.isArray(normalizedValue) ? [...normalizedValue] : normalizedValue);
    };
  };

  const patchWriteHeadHeaders = (headers: unknown, cacheControl: string) => {
    if (!headers || typeof headers !== 'object' || Array.isArray(headers)) return;
    const mutableHeaders = headers as MutableHeaders;
    for (const [name, value] of Object.entries(mutableHeaders)) {
      mutableHeaders[name] = normalizeHeaderValue(name, value, cacheControl) ?? value;
    }
    mutableHeaders['Cache-Control'] = cacheControl;
    mutableHeaders['X-Content-Type-Options'] = 'nosniff';
  };

  return {
    name: 'paperlens-response-headers',
    configureServer(server) {
      server.middlewares.use((_req, res, next) => {
        patchContentType(res, DEV_CACHE_CONTROL);
        const writeHead = res.writeHead.bind(res);
        res.writeHead = ((...args: Parameters<typeof res.writeHead>) => {
          patchWriteHeadHeaders(args[args.length - 1], DEV_CACHE_CONTROL);
          applyHeaders(res, DEV_CACHE_CONTROL);
          return writeHead(...args);
        }) as typeof res.writeHead;

        next();
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        const cacheControl = cacheControlForPreview(req.url);
        patchContentType(res, cacheControl);
        const writeHead = res.writeHead.bind(res);
        res.writeHead = ((...args: Parameters<typeof res.writeHead>) => {
          patchWriteHeadHeaders(args[args.length - 1], cacheControl);
          applyHeaders(res, cacheControl);
          return writeHead(...args);
        }) as typeof res.writeHead;
        next();
      });
    },
  };
}

export default defineConfig({
  // GitHub Pages 프로젝트 사이트 서브경로(https://nebu-25.github.io/Paperlens_26.06/).
  // 정적 에셋이 이 경로 기준으로 로드되도록 한다.
  base: '/Paperlens_26.06/',
  plugins: [paperlensResponseHeaders(), react()],
  build: {
    cssTarget: 'chrome107',
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
});
