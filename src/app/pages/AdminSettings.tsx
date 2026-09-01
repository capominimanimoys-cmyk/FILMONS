// FILMONS Admin — Settings. Platform configuration and admin
// preferences, kept fully separate from Users/Verifications/
// Transactions/Wallet/Support Chats.
//
// Every value on this page is either (a) a real, editable row backed by
// an actual table (Support Contact -> support_contact), (b) an accurate
// read-only report of a real, already-enforced server-side constant
// (Opportunity limits, admin session/code security), or (c) an honest
// "not configurable yet" note. Nothing here is a toggle that doesn't
// actually change platform behavior -- checked what's real before
// building this (Marketplace listing rules, per-category notification
// toggles, SMS, and support-flow kill switches all turned out to have
// no backing enforcement anywhere in this schema, so none of them are
// rendered as interactive controls).
import { useEffect, useState } from 'react';
import {
  Settings as SettingsIcon, Store, Briefcase, CreditCard, Bell, LifeBuoy,
  ShieldCheck, Users, Save, X, Check, AlertTriangle, Loader2,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { adminFn } from '../lib/adminAuth';
import { toast } from 'sonner';

const CATEGORIES = [
  { id: 'general', label: 'General', icon: SettingsIcon },
  { id: 'marketplace', label: 'Marketplace', icon: Store },
  { id: 'opportunities', label: 'Opportunities', icon: Briefcase },
  { id: 'payments', label: 'Payments & Payouts', icon: CreditCard },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'support', label: 'Support', icon: LifeBuoy },
  { id: 'security', label: 'Security', icon: ShieldCheck },
  { id: 'admin-access', label: 'Admin Access', icon: Users },
] as const;
type CategoryId = typeof CATEGORIES[number]['id'];

function maskEmail(email: string): string {
  const [user, domain] = email.split('@');
  if (!domain || user.length <= 2) return email;
  const visible = user.length <= 4 ? 1 : 2;
  const masked = user.slice(0, visible) + '*'.repeat(Math.max(3, user.length - visible * 2)) + user.slice(-visible);
  return `${masked}@${domain}`;
}

// A read-only fact — no save state, just label + value.
function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0 gap-4">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm font-semibold text-gray-800 text-right">{value}</span>
    </div>
  );
}

// A checklist line describing something that's already true (security
// posture, etc.) — not a togglable setting, just a fact with a check.
function FactRow({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 py-1.5">
      <Check className="w-4 h-4 text-green-500 shrink-0" />
      <span className="text-sm text-gray-700">{text}</span>
    </div>
  );
}

function StatusDot({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-800">
      <span className={`w-2 h-2 rounded-full ${ok ? 'bg-green-500' : 'bg-gray-300'}`} />
      {label}
    </span>
  );
}

// Wraps an editable group of fields with its own Cancel/Save Changes --
// per the spec, never one giant Save button for the whole page.
function SettingsGroup({ title, description, children, dirty, saving, onSave, onCancel, notConfigurable }: {
  title: string; description?: string; children: React.ReactNode;
  dirty?: boolean; saving?: boolean; onSave?: () => void; onCancel?: () => void;
  notConfigurable?: boolean;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <div className="mb-4">
        <h3 className="text-sm font-bold text-gray-900">{title}</h3>
        {description && <p className="text-xs text-gray-400 mt-0.5">{description}</p>}
      </div>
      {children}
      {notConfigurable && (
        <p className="text-xs text-gray-400 mt-4 flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> Not configurable yet — nothing in FILMONS enforces this server-side.
        </p>
      )}
      {dirty && onSave && onCancel && (
        <div className="flex gap-2 mt-4 pt-4 border-t border-gray-50">
          <button onClick={onCancel} disabled={saving} className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-bold text-gray-600 hover:bg-gray-50 disabled:opacity-50">
            Cancel
          </button>
          <button onClick={onSave} disabled={saving} className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold disabled:opacity-50 flex items-center gap-1.5">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Save Changes
          </button>
        </div>
      )}
    </div>
  );
}

interface SupportContact { id: string; name: string; role: string; email: string; phone: string; active: boolean; }
interface AdminUserRow { id: string; name: string; role: string; active: boolean; created_at: string; last_login_at: string | null; }

export function AdminSettings() {
  const [category, setCategory] = useState<CategoryId>('general');
  const [loading, setLoading] = useState(true);

  const [contact, setContact] = useState<SupportContact | null>(null);
  const [contactDraft, setContactDraft] = useState<SupportContact | null>(null);
  const [savingContact, setSavingContact] = useState(false);

  const [admins, setAdmins] = useState<AdminUserRow[]>([]);
  const [currentAdmin, setCurrentAdmin] = useState<AdminUserRow | null>(null);

  const [stripeStatus, setStripeStatus] = useState<'checking' | 'connected' | 'error'>('checking');

  useEffect(() => {
    supabase.from('support_contact').select('id, name, role, email, phone, active').eq('active', true).limit(1).maybeSingle()
      .then(({ data }) => { setContact(data); setContactDraft(data); })
      .catch(() => {});

    fetch(adminFn('admin-settings-info'), { credentials: 'same-origin' })
      .then(r => r.json())
      .then(data => {
        if (data.admins) setAdmins(data.admins);
        if (data.currentAdmin) setCurrentAdmin(data.currentAdmin);
      })
      .catch(() => {})
      .finally(() => setLoading(false));

    fetch(adminFn('admin-stripe-balance'), { credentials: 'same-origin' })
      .then(r => r.json())
      .then(data => setStripeStatus(data.error ? 'error' : 'connected'))
      .catch(() => setStripeStatus('error'));
  }, []);

  const contactDirty = !!contact && !!contactDraft && JSON.stringify(contact) !== JSON.stringify(contactDraft);

  const saveContact = async () => {
    if (!contactDraft) return;
    setSavingContact(true);
    try {
      const { error } = await supabase.from('support_contact')
        .update({ name: contactDraft.name, role: contactDraft.role, email: contactDraft.email, phone: contactDraft.phone, updated_at: new Date().toISOString() })
        .eq('id', contactDraft.id);
      if (error) throw new Error(error.message);
      setContact(contactDraft);
      toast.success('Changes saved');
    } catch (e: any) {
      toast.error(e?.message || "Couldn't save changes. Try again.");
    } finally {
      setSavingContact(false);
    }
  };

  if (loading) return <div className="h-full flex items-center justify-center"><div className="w-6 h-6 border-2 border-blue-200 border-t-blue-500 rounded-full animate-spin" /></div>;

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <div className="mb-6">
        <h1 className="text-xl font-black text-gray-900">Settings</h1>
        <p className="text-sm text-gray-400">Platform configuration and admin preferences</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Category nav */}
        <div className="lg:w-56 shrink-0">
          <div className="flex lg:flex-col gap-1 overflow-x-auto lg:overflow-visible pb-2 lg:pb-0">
            {CATEGORIES.map(c => (
              <button key={c.id} onClick={() => setCategory(c.id)}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-semibold whitespace-nowrap transition-colors shrink-0 ${category === c.id ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
                <c.icon className="w-4 h-4 shrink-0" /> {c.label}
              </button>
            ))}
          </div>
        </div>

        {/* Panel */}
        <div className="flex-1 min-w-0 space-y-4">
          {category === 'general' && (
            <>
              <SettingsGroup title="Platform" description="Structural facts about this deployment — not stored config, so not editable here.">
                <InfoRow label="Platform Name" value="FILMONS" />
                <InfoRow label="Primary Domain" value="filmons.app" />
                <InfoRow label="Admin Domain" value="admin.filmons.app" />
                <InfoRow label="Default Currency" value="CAD" />
              </SettingsGroup>

              <SettingsGroup title="Support Contact" description="Shown to users as the agent card in Support; drives the support_contact record used across the app."
                dirty={contactDirty} saving={savingContact} onSave={saveContact} onCancel={() => setContactDraft(contact)}>
                {contactDraft ? (
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-bold text-gray-500 block mb-1">Name</label>
                      <input value={contactDraft.name} onChange={e => setContactDraft({ ...contactDraft, name: e.target.value })}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-blue-300" />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-gray-500 block mb-1">Role</label>
                      <input value={contactDraft.role} onChange={e => setContactDraft({ ...contactDraft, role: e.target.value })}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-blue-300" />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-gray-500 block mb-1">Support Email</label>
                      <input value={contactDraft.email} onChange={e => setContactDraft({ ...contactDraft, email: e.target.value })}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-blue-300" />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-gray-500 block mb-1">Phone</label>
                      <input value={contactDraft.phone} onChange={e => setContactDraft({ ...contactDraft, phone: e.target.value })}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-blue-300" />
                    </div>
                  </div>
                ) : <p className="text-sm text-gray-400">No support contact configured.</p>}
              </SettingsGroup>
            </>
          )}

          {category === 'marketplace' && (
            <SettingsGroup title="Listings" notConfigurable>
              <p className="text-sm text-gray-500">Listing creation, rental radius, and listing types have no server-side kill switch or limit anywhere in FILMONS today — every account can currently create any listing type with no radius restriction. There's nothing real to control here yet.</p>
            </SettingsGroup>
          )}

          {category === 'opportunities' && (
            <>
              <SettingsGroup title="Opportunity Access" description="Enforced server-side (get-opportunity-feed) — read-only.">
                <InfoRow label="Creator / Creator+ daily browsing limit" value="5 opportunities" />
                <InfoRow label="Professional" value="Unlimited" />
                <InfoRow label="Business" value="Unlimited" />
              </SettingsGroup>
              <SettingsGroup title="Opportunity Posting" description="Enforced server-side (entitlements) — read-only.">
                <InfoRow label="Creator" value="Not allowed" />
                <InfoRow label="Creator+" value="2 posts / month" />
                <InfoRow label="Professional" value="5 posts / week" />
                <InfoRow label="Business" value="Unlimited" />
              </SettingsGroup>
            </>
          )}

          {category === 'payments' && (
            <>
              <SettingsGroup title="Currency">
                <InfoRow label="Default marketplace currency" value="CAD" />
              </SettingsGroup>
              <SettingsGroup title="Stripe" description="Balances and payout requests live in FILMONS Wallet, not here. Individual payment records live in Transactions.">
                <InfoRow label="Stripe Connection" value={<StatusDot ok={stripeStatus === 'connected'} label={stripeStatus === 'checking' ? 'Checking…' : stripeStatus === 'connected' ? 'Connected' : 'Unable to reach Stripe'} />} />
                <InfoRow label="Mode" value="Live" />
              </SettingsGroup>
              <SettingsGroup title="Payouts" notConfigurable>
                <p className="text-sm text-gray-500">No minimum withdrawal amount or withdrawal kill switch is enforced anywhere in FILMONS today.</p>
              </SettingsGroup>
            </>
          )}

          {category === 'notifications' && (
            <>
              <SettingsGroup title="Integration Status">
                <InfoRow label="Email Service" value={<StatusDot ok label="Connected" />} />
                <InfoRow label="SMS Service" value={<StatusDot ok={false} label="Not configured" />} />
              </SettingsGroup>
              <SettingsGroup title="Per-event notifications" notConfigurable>
                <p className="text-sm text-gray-500">Every notification email (new application, message, payment, payout, verification, support update) sends unconditionally today — there's no stored preference gating any of them on/off yet.</p>
              </SettingsGroup>
            </>
          )}

          {category === 'support' && (
            <>
              <SettingsGroup title="Support Cases">
                <FactRow text="Users can contact an agent from the AI Assistant escalation" />
                <FactRow text="Guests (unauthenticated) can submit support requests" />
                <FactRow text="Contact Agent reuses the user's existing open case instead of creating a duplicate" />
                <FactRow text="Real-time admin email notification sent on every new case and every user reply" />
                <FactRow text="User sees an on-screen confirmation once their request is sent" />
              </SettingsGroup>
              <SettingsGroup title="Case Management">
                <InfoRow label="Default new case status" value="Waiting for Agent" />
                <InfoRow label="Available statuses" value="Open, Waiting for Agent, In Review, Waiting for Customer, Resolved, Closed" />
              </SettingsGroup>
              <p className="text-xs text-gray-400">Actual conversations live in Admin → Support Chats. This page only describes behavior.</p>
            </>
          )}

          {category === 'security' && (
            <>
              <SettingsGroup title="Admin Session">
                <InfoRow label="Current session" value={<StatusDot ok label="Active" />} />
                <InfoRow label="Signed in as" value={currentAdmin?.name || '—'} />
                <InfoRow label="Last sign-in" value={currentAdmin?.last_login_at ? new Date(currentAdmin.last_login_at).toLocaleString('en-CA', { dateStyle: 'medium', timeStyle: 'short' }) : '—'} />
                <InfoRow label="Session timeout" value="8 hours" />
              </SettingsGroup>
              <SettingsGroup title="Admin Login">
                <InfoRow label="Authentication method" value="Email One-Time Code" />
                <InfoRow label="Authorized admin email" value={maskEmail('gabriel@filmons.app')} />
              </SettingsGroup>
              <SettingsGroup title="Login Security">
                <FactRow text="One-time codes expire automatically after 10 minutes" />
                <FactRow text="Code is invalidated immediately after successful use" />
                <FactRow text="Code generation is rate-limited (45s between requests)" />
                <FactRow text="Verification attempts are limited (5 max)" />
                <FactRow text="Sessions are server-managed via an HttpOnly cookie — never localStorage" />
              </SettingsGroup>
            </>
          )}

          {category === 'admin-access' && (
            <SettingsGroup title="Administrators" description="Only Super Admin and Support Agent roles exist today — no role beyond those is enforced anywhere, so none are offered here.">
              <div className="divide-y divide-gray-50">
                {admins.map(a => (
                  <div key={a.id} className="flex items-center justify-between py-3">
                    <div>
                      <p className="text-sm font-bold text-gray-900">{a.name}</p>
                      <p className="text-xs text-gray-400">{a.role === 'super_admin' ? 'Super Admin' : 'Support Agent'}</p>
                    </div>
                    <StatusDot ok={a.active} label={a.active ? 'Active' : 'Inactive'} />
                  </div>
                ))}
                {admins.length === 0 && <p className="text-sm text-gray-400 py-2">No admin accounts found.</p>}
              </div>
            </SettingsGroup>
          )}
        </div>
      </div>
    </div>
  );
}
