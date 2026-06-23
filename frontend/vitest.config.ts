import { defineConfig } from 'vitest/config';

// 순수 로직(lib/*) 단위 테스트. DOM이 필요 없으므로 node 환경에서 실행한다.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
