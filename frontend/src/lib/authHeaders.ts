export function authHeaders(accessToken: string | null, demoSessionId: string | null = null): Record<string, string> {
  const headers: Record<string, string> = {};
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (demoSessionId) headers['X-PaperLens-Demo-Session'] = demoSessionId;
  return headers;
}
