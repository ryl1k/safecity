// Thin client for the SafeCity Go API — the single entrypoint for all data and
// business logic (web and mobile render what it returns). Only identity (auth
// sessions), Storage uploads, and Realtime stay on Supabase directly.
import { supabase } from './supabase';

// In dev the API runs on :8080 next to the web server; deployments must set
// NEXT_PUBLIC_API_URL explicitly (build fails loudly at request time otherwise).
const BASE = (
  process.env.NEXT_PUBLIC_API_URL ??
  (process.env.NODE_ENV === 'development' ? 'http://localhost:8080' : '')
).replace(/\/+$/, '');

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
  if (!BASE) {
    throw new ApiError(0, 'not_configured', 'NEXT_PUBLIC_API_URL is not set — the app cannot reach the API');
  }
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

  const res = await fetch(`${BASE}${path}`, { method, headers, body: payload, signal });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const e = (json && json.error) || {};
    throw new ApiError(res.status, e.code ?? 'error', e.message ?? res.statusText, e.fields);
  }
  return json as T;
}

export const api = {
  get: <T>(path: string, opts?: { signal?: AbortSignal; auth?: boolean }) =>
    request<T>('GET', path, undefined, opts?.auth ?? false, opts?.signal),
  /** POST defaults to authenticated (most writes need it); pass {auth:false} for public posts. */
  post: <T>(path: string, body?: unknown, opts?: { auth?: boolean }) =>
    request<T>('POST', path, body, opts?.auth ?? true),
  /** PATCH is always authenticated (owner edits). */
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body, true),
  /** DELETE is always authenticated (moderation + owner deletes). */
  del: <T>(path: string) => request<T>('DELETE', path, undefined, true),
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
