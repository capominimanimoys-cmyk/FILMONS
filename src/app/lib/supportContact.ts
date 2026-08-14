// Centralized support-contact lookup — see supabase/migrations/
// 20240220000000_support_system.sql's support_contact table. Nothing else
// should hardcode a support agent's name/email/phone; read it from here.
import { supabase } from '../../lib/supabase';

export interface SupportContact {
  name: string;
  role: string;
  email: string;
  phone: string;
}

let cached: SupportContact | null = null;

export async function getSupportContact(): Promise<SupportContact> {
  if (cached) return cached;
  const { data } = await supabase
    .from('support_contact')
    .select('name, role, email, phone')
    .eq('active', true)
    .limit(1)
    .maybeSingle();
  cached = data || { name: 'Filmons Support', role: 'Filmons Support', email: 'support@filmons.com', phone: '' };
  return cached;
}

export function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `+1 (${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return phone;
}
