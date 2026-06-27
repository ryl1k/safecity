import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Server-side signup using the admin API with email_confirm=true. Sidesteps the
// project's email-confirmation + send-rate-limit so accounts are usable instantly.
// (Hackathon-grade: open endpoint. Add captcha / verification before production.)
export async function POST(req: NextRequest) {
  const url = process.env.SUPABASE_URL?.trim();
  const secret = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!url || !secret) return Response.json({ error: 'server not configured' }, { status: 500 });

  let body: { email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'bad request' }, { status: 400 });
  }
  const email = body.email?.trim();
  const password = body.password ?? '';
  if (!email || !password) return Response.json({ error: 'Вкажіть пошту й пароль' }, { status: 400 });
  if (password.length < 8) return Response.json({ error: 'Пароль має містити щонайменше 8 символів' }, { status: 400 });

  const admin = createClient(url, secret, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) {
    const msg = /already|registered|exists/i.test(error.message)
      ? 'Користувач із такою поштою вже існує'
      : error.message;
    return Response.json({ error: msg }, { status: 400 });
  }
  return Response.json({ ok: true });
}
