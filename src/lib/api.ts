let csrf: string | null = null;
export function setCsrfToken(token: string | null) { csrf = token; }
export class ApiError extends Error {
  constructor(message: string, public status: number, public code?: string) { super(message); }
}
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body) headers.set('Content-Type', 'application/json');
  if (csrf) headers.set('X-CSRF-Token', csrf);
  const response = await fetch('/api/v1' + path, { credentials: 'same-origin', ...options, headers });
  const body: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const data = body && typeof body === 'object' ? body as { error?: { message?: unknown; code?: unknown }; message?: unknown } : {};
    const message = data.error?.message ?? data.message;
    throw new ApiError(typeof message === 'string' ? message : 'Не удалось выполнить запрос. Попробуйте ещё раз.', response.status, typeof data.error?.code === 'string' ? data.error.code : undefined);
  }
  return body as T;
}
export function post<T>(path: string, body: unknown, method = 'POST') {
  return api<T>(path, { method, body: JSON.stringify(body) });
}
export function profileQuery(profileId: string) { return '?profileId=' + encodeURIComponent(profileId); }
