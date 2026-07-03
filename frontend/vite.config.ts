import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';

type MutableHeaders = Record<string, number | string | string[] | readonly string[] | undefined>;

function paperlensResponseHeaders(): Plugin {
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

  const patchContentType = (res: import('http').ServerResponse) => {
    const setHeader = res.setHeader.bind(res);
    res.setHeader = (name, value) => {
      const normalizedValue = normalizeHeaderValue(String(name), value, 'no-store') ?? value;
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
        patchContentType(res);
        const writeHead = res.writeHead.bind(res);
        res.writeHead = ((...args: Parameters<typeof res.writeHead>) => {
          patchWriteHeadHeaders(args[args.length - 1], 'no-store');
          applyHeaders(res, 'no-store');
          return writeHead(...args);
        }) as typeof res.writeHead;

        next();
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((_req, res, next) => {
        patchContentType(res);
        const writeHead = res.writeHead.bind(res);
        res.writeHead = ((...args: Parameters<typeof res.writeHead>) => {
          patchWriteHeadHeaders(args[args.length - 1], 'public, max-age=300');
          applyHeaders(res, 'public, max-age=300');
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
