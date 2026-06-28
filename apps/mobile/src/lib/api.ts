// Thin client for the SafeCity Go API (RN port of apps/web/src/lib/api.ts).
// Hybrid: uses the API when EXPO_PUBLIC_API_URL is set, else callers fall back
// to Supabase-direct. Auth token rides in the Authorization header.
import { API_URL, apiEnabled } from './env';
import { supabase } from './supabase';

export { apiEnabled };

export interface ApiFieldError {
  field: string;
  message: string;
}

/** Error carrying the API's `{error:{code,message,fields}}` envelope. */
export class ApiError extends Error {
  status: number;
  code: string;
  fields?: ApiFieldError[];
  constructor(status: number, code: string, message: string, fields?: ApiFieldError[]) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  auth = false,
  signal?: AbortSignal,
): Promise<T> {
  const headers: Record<string, string> = {};
  let payload: string | undefined;
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  if (auth) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new ApiError(401, 'unauthorized', 'not-authenticated');
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_URL}${path}`, { method, headers, body: payload, signal });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const e = (json && json.error) || {};
    throw new ApiError(res.status, e.code ?? 'error', e.message ?? res.statusText, e.fields);
  }
  return json as T;
}

export const api = {
  get: <T>(path: string, opts?: { signal?: AbortSignal }) =>
    request<T>('GET', path, undefined, false, opts?.signal),
  post: <T>(path: string, body?: unknown, opts?: { auth?: boolean }) =>
    request<T>('POST', path, body, opts?.auth ?? true),
};

/** Build a query string from defined, non-empty params. */
export function qs(params: Record<string, string | number | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}
