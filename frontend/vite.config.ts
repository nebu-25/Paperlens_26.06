import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // GitHub Pages 프로젝트 사이트 서브경로(https://nebu-25.github.io/Paperlens_26.06/).
  // 정적 에셋이 이 경로 기준으로 로드되도록 한다.
  base: '/Paperlens_26.06/',
  plugins: [react()],
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

