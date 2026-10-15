import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { waitForBundleIfPending } from '../lib/dashboardCache';

export type InvoiceDot = 'red' | 'green' | null;

let cachedByKey: Record<string, InvoiceDot> = {};
let cachedAtByKey: Record<string, number> = {};
const TTL_MS = 5 * 60 * 1000;

export function invalidateInvoiceNotification(): void {
  cachedByKey = {};
  cachedAtByKey = {};
}

export function seedInvoiceDotCache(userId: string, role: string, dot: InvoiceDot): void {
  const key = `${role}:${userId}`;
  cachedByKey[key] = dot;
  cachedAtByKey[key] = Date.now();
}

async function fetchDotForRole(userId: string, userEmail: string | undefined, role: string): Promise<InvoiceDot> {
  const bundleData = await waitForBundleIfPending();
  if (bundleData) {
    return bundleData.invoiceDot;
  }

  let memberIds: string[] = [];

  if (role === 'parent') {
    const { data } = await supabase
      .from('parent_members')
      .select('member_id')
      .eq('parent_user_id', userId);
    memberIds = (data || []).map((r: any) => r.member_id);
  } else if (role === 'member') {
    if (!userEmail) return null;
    const { data } = await supabase
      .from('members')
      .select('id')
      .ilike('email', userEmail.trim().toLowerCase())
      .maybeSingle();
    if (data?.id) memberIds = [data.id];
  } else {
    return null;
  }

  if (memberIds.length === 0) return null;

  const { data: rows } = await supabase
    .from('invoices')
    .select('status, due_date')
    .in('member_id', memberIds)
    .neq('status', 'cancelled')
    .neq('status', 'paid');

  if (!rows || rows.length === 0) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let hasOverdue = false;
  let hasToPay = false;
  for (const r of rows as any[]) {
    if (r.status === 'pending' || r.status === 'sent' || r.status === 'draft' || r.status === 'overdue') {
      const due = r.due_date ? new Date(r.due_date) : null;
      if (due && due < today) hasOverdue = true;
      else hasToPay = true;
    }
  }
  if (hasOverdue) return 'red';
  if (hasToPay) return 'green';
  return null;
}

export function useInvoiceNotification(
  userId: string | undefined,
  userEmail: string | undefined,
  role: string | undefined,
  enabled: boolean,
): InvoiceDot {
  const [dot, setDot] = useState<InvoiceDot>(null);

  useEffect(() => {
    if (!enabled || !userId || !role) { setDot(null); return; }
    if (role !== 'parent' && role !== 'member') { setDot(null); return; }

    const key = `${role}:${userId}`;
    const now = Date.now();
    if (cachedByKey[key] !== undefined && cachedAtByKey[key] && (now - cachedAtByKey[key] < TTL_MS)) {
      setDot(cachedByKey[key]);
      return;
    }
    let active = true;
    (async () => {
      const result = await fetchDotForRole(userId, userEmail, role);
      cachedByKey[key] = result;
      cachedAtByKey[key] = Date.now();
      if (active) setDot(result);
    })();
    return () => { active = false; };
  }, [userId, userEmail, role, enabled]);

  return dot;
}
