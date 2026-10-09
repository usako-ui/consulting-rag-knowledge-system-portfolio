/**
 * POST /api/auth/logout
 */

import { NextResponse } from 'next/server';
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from '@/lib/supabase/server';

export async function POST() {
  const supabase = createSupabaseServerClient();

  const { data } = await supabase.auth.getUser();
  const userId = data.user?.id ?? null;
  const email = data.user?.email ?? null;

  await supabase.auth.signOut();

  if (userId) {
    const service = createSupabaseServiceRoleClient();
    await service.from('audit_log').insert({
      actor_id: userId,
      actor_email: email,
      action_type: 'logout',
      target_type: 'session',
    });
  }

  return NextResponse.json({ ok: true });
}
