import { describe, expect, it } from 'vitest';
import { apiErrorFromResponse, classifyApiException } from './apiErrors';

describe('apiErrors', () => {
  it('classifies auth responses separately', async () => {
    const res = new Response(JSON.stringify({ detail: '로그인이 필요합니다.' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
    await expect(apiErrorFromResponse(res, 'failed')).resolves.toMatchObject({
      kind: 'auth',
      title: '인증 확인 필요',
      message: '로그인이 필요합니다.',
    });
  });

  it('classifies server startup responses separately', async () => {
    const res = new Response('', { status: 503 });
    await expect(apiErrorFromResponse(res, 'server unavailable')).resolves.toMatchObject({
      kind: 'server_starting',
      title: '서버 준비 중',
    });
  });

  it('classifies failed fetch as network or CORS failure', () => {
    expect(classifyApiException(new TypeError('Failed to fetch'))).toMatchObject({
      kind: 'cors_or_network',
      title: '서버 요청 차단 또는 네트워크 실패',
    });
  });
});
