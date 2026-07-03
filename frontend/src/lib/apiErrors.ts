export type ApiErrorKind =
  | 'auth'
  | 'forbidden'
  | 'not_found'
  | 'server_starting'
  | 'server_error'
  | 'timeout'
  | 'network'
  | 'cors_or_network'
  | 'bad_request'
  | 'unknown';

export interface ApiErrorInfo {
  kind: ApiErrorKind;
  title: string;
  message: string;
  status?: number;
}

export class ApiRequestError extends Error {
  constructor(public readonly info: ApiErrorInfo) {
    super(info.message);
    this.name = 'ApiRequestError';
  }
}

async function detailFromResponse(res: Response, fallback: string): Promise<string> {
  try {
    return ((await res.json()) as { detail?: string }).detail ?? fallback;
  } catch {
    return fallback;
  }
}

export function classifyApiException(error: unknown, fallback = '요청을 처리하지 못했습니다.'): ApiErrorInfo {
  if (error instanceof ApiRequestError) return error.info;
  if (error instanceof DOMException && error.name === 'AbortError') {
    return {
      kind: 'timeout',
      title: '요청 시간 초과',
      message: '서버 응답이 지연되고 있습니다. 변경 사항은 로컬에 보관하고 잠시 뒤 다시 시도합니다.',
    };
  }
  if (error instanceof TypeError && /failed to fetch|networkerror|load failed/i.test(error.message)) {
    return {
      kind: 'cors_or_network',
      title: '서버 요청 차단 또는 네트워크 실패',
      message:
        '브라우저가 서버 요청을 완료하지 못했습니다. 배포 직후라면 강력 새로고침을 하고, 계속되면 CORS 설정 또는 네트워크 연결을 확인해 주세요.',
    };
  }
  if (error instanceof Error && error.message) {
    return {
      kind: 'unknown',
      title: '요청 실패',
      message: error.message,
    };
  }
  return {
    kind: 'unknown',
    title: '요청 실패',
    message: fallback,
  };
}

export async function apiErrorFromResponse(res: Response, fallback: string): Promise<ApiErrorInfo> {
  const detail = await detailFromResponse(res, fallback);
  if (res.status === 401) {
    return {
      kind: 'auth',
      title: '인증 확인 필요',
      message: detail || '로그인 정보가 만료되었습니다. 다시 로그인하면 서버 요청을 재개합니다.',
      status: res.status,
    };
  }
  if (res.status === 403) {
    return {
      kind: 'forbidden',
      title: '권한 확인 필요',
      message: detail || '이 작업을 수행할 권한이 없습니다. 로그인 계정과 접근 권한을 확인해 주세요.',
      status: res.status,
    };
  }
  if (res.status === 404) {
    return {
      kind: 'not_found',
      title: '요청 대상을 찾지 못했습니다',
      message: detail || '요청한 노트나 파일을 서버에서 찾지 못했습니다. 새로고침 후 다시 확인해 주세요.',
      status: res.status,
    };
  }
  if (res.status === 503) {
    return {
      kind: 'server_starting',
      title: '서버 준비 중',
      message: detail || 'Render 백엔드 또는 인증 서버가 준비 중입니다. 변경 사항은 로컬에 보관했습니다.',
      status: res.status,
    };
  }
  if (res.status >= 500) {
    return {
      kind: 'server_error',
      title: '서버 처리 오류',
      message: detail || '백엔드 처리 중 오류가 발생했습니다. 변경 사항은 로컬에 보관하고 다시 시도합니다.',
      status: res.status,
    };
  }
  if (res.status >= 400) {
    return {
      kind: 'bad_request',
      title: '요청 확인 필요',
      message: detail,
      status: res.status,
    };
  }
  return {
    kind: 'unknown',
    title: '요청 실패',
    message: detail,
    status: res.status,
  };
}

export async function throwApiResponseError(res: Response, fallback: string): Promise<never> {
  throw new ApiRequestError(await apiErrorFromResponse(res, fallback));
}
