import { defineConfig } from 'vitest/config';

// 기본은 순수 로직(lib/*) 단위 테스트라 node 환경을 쓴다.
// DOM/컴포넌트 테스트(.test.tsx, 일부 .test.ts)는 파일 상단
// `// @vitest-environment happy-dom` 도크블록으로 개별 전환한다.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
