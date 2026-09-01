import { useState, useEffect } from "react";
import { useOutletContext } from "react-router";
import emailjs from '@emailjs/browser';
import { EMAILJS_CONFIG } from '../lib/emailjs-config';
import { supabase } from '../../lib/supabase';
import { adminFn, type AdminSession } from '../lib/adminAuth';
import {
  CheckCircle,
  XCircle,
  Clock,
  Phone,
  Mail,
  User,
  FileText,
  Lock,
  Eye,
  MapPin,
  Calendar,
  CreditCard,
  Camera,
  RefreshCw,
  Globe,
  ArrowRight,
  Trash2,
  Search,
} from "lucide-react";
import { toast } from "sonner";

// ── Types ──────────────────────────────────────────────────────────
// Mirrors identity_verifications (+ joined profiles for contact info).
// Document fields are storage PATHS, not URLs — resolve with SignedImg.
type VerificationStatus = "pending" | "under_review" | "changes_requested" | "approved" | "denied";

interface VerificationRequest {
  id: string;
  userId: string;
  userName: string;
  username?: string;
  userEmail: string;
  userPhone: string;
  emailVerified?: boolean;
  phoneVerified?: boolean;
  avatarUrl?: string;
  primaryRole?: string;
  publicCity?: string;
  // Read-only billing context -- Stripe-webhook-driven, never something
  // this page approves/rejects (see accountType below: for Creator+
  // specifically, approving THIS verification is what sets it, but for
  // Professional/Business it's set purely by a separate paid checkout
  // with no review step at all, so this is display-only here).
  accountType?: string;
  subscriptionStatus?: string;
  fullName: string;
  legalFirstName?: string;
  legalLastName?: string;
  dob?: string;
  streetAddr?: string;
  unit?: string;
  city?: string;
  province?: string;
  postalCode?: string;
  residenceCountry?: string;
  issuingCountry?: string;
  idType?: string;
  idNumberLast4?: string;
  idExpiryDate?: string;
  idFrontPath?: string;
  idBackPath?: string;
  proofOfAddressType?: string;
  proofOfAddressPath?: string;
  selfiePath?: string;
  status: VerificationStatus;
  decisionReason?: string;
  documentsDeletedAt?: string | null;
  submittedAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  verifiedAt: string | null;
}

interface AuditEvent {
  id: string;
  action: string;
  detail: string | null;
  adminIdentifier: string;
  createdAt: string;
}

interface AdminNote {
  id: string;
  adminIdentifier: string;
  note: string;
  createdAt: string;
}

// 'service' is the legacy stored value for what's shown as Creator+
// everywhere else in this app (see normalizeTier/getTierLabel in
// src/app/lib/reliabilityApi.ts) -- matched here too so an older
// account doesn't misleadingly show "Creator → Creator+" when it's
// already Creator+.
const TIER_LABEL: Record<string, string> = {
  creator: 'Creator', creator_plus: 'Creator+', service: 'Creator+',
  professional: 'Professional', business: 'Business',
};

// ── Sub-components ────────────────────────────────────────────────

// Secure document viewer — fetches a fresh signed URL server-side (via
// verification-view-document, super_admin only, audit-logged) only once
// the admin explicitly clicks View; never shown inline/automatically.
function DocumentViewerModal({ userName, docLabel, url, onClose }: {
  userName: string; docLabel: string; url: string; onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[9999] bg-black/90 flex items-center justify-center p-4" onClick={onClose}>
      <div className="relative max-w-2xl w-full" onClick={(e) => e.stopPropagation()}>
        <div className="bg-white rounded-t-2xl px-5 py-3.5 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Verification Document</p>
            <p className="text-sm font-bold text-gray-900">User: {userName} · Document: {docLabel}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-sm font-bold">Close ✕</button>
        </div>
        <img src={url} alt={docLabel} className="w-full rounded-b-2xl shadow-2xl" />
      </div>
    </div>
  );
}

function DocumentViewButton({ label, hasDoc, canView, onView }: {
  label: string; hasDoc: boolean; canView: boolean; onView: () => Promise<void>;
}) {
  const [loading, setLoading] = useState(false);
  if (!hasDoc) {
    return (
      <div className="flex items-center gap-2 text-xs text-gray-400 bg-gray-50 border border-dashed border-gray-200 rounded-xl px-3 py-2.5">
        <FileText className="w-3.5 h-3.5" /> {label} — not uploaded
      </div>
    );
  }
  if (!canView) {
    return (
      <div className="flex items-center gap-2 text-xs text-gray-400 bg-gray-50 border border-gray-100 rounded-xl px-3 py-2.5">
        <Lock className="w-3.5 h-3.5" /> {label} — Super Admin only
      </div>
    );
  }
  const handleClick = async () => { setLoading(true); await onView(); setLoading(false); };
  return (
    <button
      type="button" onClick={handleClick} disabled={loading}
      className="flex items-center justify-center gap-1.5 w-full text-sm font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-xl px-3 py-2.5 transition-colors disabled:opacity-60"
    >
      {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />} {loading ? 'Loading…' : `View ${label}`}
    </button>
  );
}

function InfoRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value?: string;
}) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-gray-50 last:border-0">
      <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center shrink-0 mt-0.5">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">
          {label}
        </p>
        <p className="text-sm font-semibold text-gray-800 mt-0.5 break-words">
          {value}
        </p>
      </div>
    </div>
  );
}

// Compact label+value pair for the verification list card — always
// renders (unlike InfoRow, which hides empty fields) so every record
// shows the same field set, with "—" for anything not yet provided.
function CardField({ label, value }: { label: string; value?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wide">{label}</p>
      <p className="text-xs font-semibold text-gray-800 truncate">{value || '—'}</p>
    </div>
  );
}

// ID numbers stay masked until an admin explicitly clicks Reveal, which
// calls verification-reveal-id (super_admin only, server-audit-logged) —
// the full number is never in the initial fetch (identity_verifications_
// admin_view only ever exposes the last 4 digits) and never logged/
// emailed/notified anywhere client-side.
function MaskedIdNumber({ last4, canReveal, onReveal }: {
  last4?: string; canReveal: boolean; onReveal: () => Promise<string | null>;
}) {
  const [revealed, setRevealed] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  if (!last4) return <p className="text-sm font-semibold text-gray-800 mt-0.5">—</p>;
  const masked = `••••••${last4}`;

  const handleClick = async () => {
    if (revealed) { setRevealed(null); return; }
    setLoading(true);
    const full = await onReveal();
    setLoading(false);
    if (full) setRevealed(full);
  };

  return (
    <div className="flex items-center gap-2 mt-0.5">
      <p className="text-sm font-semibold text-gray-800 font-mono">{revealed || masked}</p>
      {canReveal ? (
        <button type="button" onClick={handleClick} disabled={loading} className="text-[11px] font-bold text-blue-600 hover:underline disabled:opacity-50">
          {loading ? 'Revealing…' : revealed ? 'Hide' : 'Reveal'}
        </button>
      ) : (
        <span className="text-[11px] font-bold text-gray-300">Super Admin only</span>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────
export function AdminVerifications() {
  // AdminLayout already gates every /admin/* route behind its own
  // passwordless login -- by the time this component mounts, the admin
  // session is already confirmed, so this never shows its own (removed)
  // login screen. adminName/role come from that same session via Outlet
  // context instead of a separate client-side session read.
  const session = useOutletContext<AdminSession | null>();
  const adminName = session?.name || 'Admin';

  // Verifications state
  const [requests, setRequests] = useState<
    VerificationRequest[]
  >([]);
  const [selectedRequest, setSelectedRequest] =
    useState<VerificationRequest | null>(null);
  const [filter, setFilter] = useState<
    "all" | VerificationStatus
  >("pending");
  const [search, setSearch] = useState('');

  // Deny / request-changes modal
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<{ request: VerificationRequest; type: 'denied' | 'changes_requested' } | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const DENY_PRESETS = [
    'ID unreadable',
    'ID expired',
    "Information doesn't match",
    'Invalid proof of address',
    "Selfie doesn't match",
    'Unsupported document',
    'Suspected fraudulent document',
    'Other',
  ];
  const CHANGES_PRESETS = [
    'Upload a clearer ID',
    'Upload a newer proof of address',
    'ID back is missing',
    "Information doesn't match",
  ];

  // Review-flow additions: role gate, secure document viewer, history, notes.
  const adminRole = session?.role;
  const canDecide = adminRole === 'super_admin';
  const canViewSensitive = adminRole === 'super_admin'; // raw ID docs + full ID number

  const [viewerDoc, setViewerDoc] = useState<{ label: string; url: string } | null>(null);
  const [history, setHistory] = useState<AuditEvent[]>([]);
  const [notes, setNotes] = useState<AdminNote[]>([]);
  const [newNote, setNewNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  // adminFn() (not supabase.functions.invoke, which always calls
  // *.supabase.co directly) routes through the same-origin /api/fn/*
  // proxy so the browser attaches the HttpOnly admin session cookie --
  // see src/app/lib/adminAuth.ts.
  const viewDocument = async (verificationId: string, docType: 'id_front' | 'id_back' | 'selfie' | 'proof_of_address', label: string) => {
    try {
      const res = await fetch(adminFn('verification-view-document'), {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ verificationId, docType }),
      });
      const data = await res.json();
      if (!res.ok || data?.error || !data?.url) throw new Error(data?.error || 'Could not load document');
      setViewerDoc({ label, url: data.url });
    } catch (e: any) {
      toast.error(e?.message || 'Could not load document');
    }
  };

  const revealIdNumber = async (verificationId: string): Promise<string | null> => {
    try {
      const res = await fetch(adminFn('verification-reveal-id'), {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ verificationId }),
      });
      const data = await res.json();
      if (!res.ok || data?.error) throw new Error(data?.error || 'Could not reveal ID number');
      return data?.idNumber || null;
    } catch (e: any) {
      toast.error(e?.message || 'Could not reveal ID number');
      return null;
    }
  };

  const loadReviewExtras = async (verificationId: string) => {
    const [historyRes, notesRes] = await Promise.all([
      supabase.from('verification_audit_log').select('id, action, detail, admin_identifier, created_at')
        .eq('verification_id', verificationId).order('created_at', { ascending: true }),
      supabase.from('verification_admin_notes').select('id, note, admin_identifier, created_at')
        .eq('verification_id', verificationId).order('created_at', { ascending: false }),
    ]);
    setHistory((historyRes.data || []).map((r: any) => ({ id: r.id, action: r.action, detail: r.detail, adminIdentifier: r.admin_identifier, createdAt: r.created_at })));
    setNotes((notesRes.data || []).map((r: any) => ({ id: r.id, note: r.note, adminIdentifier: r.admin_identifier, createdAt: r.created_at })));
  };

  const addNote = async (verificationId: string) => {
    const text = newNote.trim();
    if (!text) return;
    setSavingNote(true);
    try {
      const { error } = await supabase.from('verification_admin_notes').insert({
        verification_id: verificationId, admin_identifier: adminName || 'Admin', note: text,
      });
      if (error) throw new Error(error.message);
      setNewNote('');
      await loadReviewExtras(verificationId);
    } catch (e: any) {
      toast.error(e?.message || 'Could not save note');
    } finally {
      setSavingNote(false);
    }
  };

  useEffect(() => { loadAll().catch(console.error); }, []);

  const loadAll = async () => {
    // ── VERIFICATIONS ─────────────────────────────────────────────
    // identity_verifications holds the KYC data; profiles (embedded via
    // the user_id FK) supplies contact info for display only.
    let serverReqs: VerificationRequest[] = [];
    try {
      // Admin-facing view only — never exposes the full id_number (see
      // identity_verifications_admin_view; the raw table + full number are
      // only ever read server-side by verification-reveal-id).
      const { data, error } = await supabase
        .from('identity_verifications_admin_view')
        .select('*, profiles(name, username, email, phone, avatar_url, primary_role, city, email_verified, phone_verified, account_type, subscription_status)')
        .order('submitted_at', { ascending: false });

      if (!error && data) {
        serverReqs = data.map((row: any) => {
          const profile = row.profiles || {};
          return {
            id:                 row.id,
            userId:             row.user_id,
            userName:           profile.name || [row.legal_first_name, row.legal_last_name].filter(Boolean).join(' '),
            username:           profile.username || undefined,
            userEmail:          profile.email || '',
            userPhone:          profile.phone || '',
            emailVerified:      !!profile.email_verified,
            phoneVerified:      !!profile.phone_verified,
            avatarUrl:          profile.avatar_url || undefined,
            primaryRole:        profile.primary_role || undefined,
            publicCity:         profile.city || undefined,
            accountType:        profile.account_type || undefined,
            subscriptionStatus: profile.subscription_status || undefined,
            fullName:           [row.legal_first_name, row.legal_last_name].filter(Boolean).join(' '),
            legalFirstName:     row.legal_first_name || undefined,
            legalLastName:      row.legal_last_name || undefined,
            dob:                row.date_of_birth || undefined,
            streetAddr:         row.address_line1 || undefined,
            unit:               row.address_line2 || undefined,
            city:               row.city || undefined,
            province:           row.province_state || undefined,
            postalCode:         row.postal_code || undefined,
            residenceCountry:   row.country_of_residence || undefined,
            issuingCountry:     row.id_issuing_country || undefined,
            idType:             row.id_type || undefined,
            idNumberLast4:      row.id_number_last4 || undefined,
            idExpiryDate:       row.id_expiry_date || undefined,
            idFrontPath:        row.id_front_path || undefined,
            idBackPath:         row.id_back_path || undefined,
            proofOfAddressType: row.proof_of_address_type || undefined,
            proofOfAddressPath: row.proof_of_address_path || undefined,
            selfiePath:         row.selfie_path || undefined,
            status:             row.status || 'pending',
            decisionReason:     row.decision_reason || undefined,
            documentsDeletedAt: row.documents_deleted_at || null,
            submittedAt:        row.submitted_at || row.created_at,
            reviewedAt:         row.reviewed_at || null,
            reviewedBy:         row.reviewed_by || null,
            verifiedAt:         row.verified_at || null,
          } as VerificationRequest;
        });
      } else if (error) {
        console.warn('identity_verifications_admin_view query failed:', error.message);
      }
    } catch (e) {
      console.warn('identity_verifications_admin_view query threw:', e);
    }

    setRequests(serverReqs);
  };


  const sendUserEmail = async (request: VerificationRequest, status: VerificationStatus, reason?: string) => {
    if (!request.userEmail) return;
    const isApproved = status === 'approved';
    const isChanges = status === 'changes_requested';
    emailjs.send(
      EMAILJS_CONFIG.serviceId,
      EMAILJS_CONFIG.templates.verificationSubmission,
      {
        to_email:    request.userEmail,
        to_name:     request.userName || request.fullName,
        user_name:   request.userName || request.fullName,
        status:      isApproved ? 'Approved ✅' : isChanges ? 'Changes Requested 📄' : 'Denied ❌',
        message:     isApproved
          ? 'Congratulations! Your identity has been verified and your Creator+ account is now verified. All Creator+ features are now unlocked.'
          : isChanges
          ? `The admin reviewed your submission and needs a correction:\n\n${reason || 'Please review and resubmit.'}\n\nLog in and visit the Verification page to continue.`
          : `Your verification was unsuccessful.\n\nReason: ${reason || 'Please review your documents and resubmit.'}\n\nYou may resubmit after correcting the issue.`,
        site_url:    window.location.origin,
      },
      EMAILJS_CONFIG.publicKey
    ).catch(e => console.warn('User email failed:', e));
  };

  // Opening the review page moves a fresh application out of the "pending"
  // queue and into "under_review" so other admins can see it's being looked
  // at — a non-destructive, reversible transition, unlike the three final
  // decisions below, so it's fine to do directly from the client. Also logs
  // the access for the audit trail the spec requires.
  const openReview = async (request: VerificationRequest) => {
    setSelectedRequest(request);
    setViewerDoc(null);
    setHistory([]);
    setNotes([]);
    if (request.status === 'pending') {
      await supabase.from('identity_verifications').update({ status: 'under_review' }).eq('id', request.id);
      await supabase.from('profiles').update({ verification_status: 'under_review' }).eq('id', request.userId);
      setSelectedRequest({ ...request, status: 'under_review' });
      setRequests(prev => prev.map(r => r.id === request.id ? { ...r, status: 'under_review' } : r));
    }
    await supabase.from('verification_audit_log').insert({
      verification_id: request.id,
      user_id: request.userId,
      admin_identifier: adminName || 'Admin',
      action: 'verification_opened',
      detail: null,
    });
    loadReviewExtras(request.id).catch(console.error);
  };

  // Approve / Deny both delete the submitted documents from storage as the
  // final decision lands — that has to happen server-side (a client-side
  // delete call is skippable), so this goes through the verification-decision
  // Edge Function (service-role key) instead of writing the table directly.
  // Request Changes keeps documents in place, but is routed the same way for
  // one consistent, auditable decision path.
  const handleDecision = async (
    request: VerificationRequest,
    action: "approve" | "changes_requested" | "deny",
    reason?: string,
  ) => {
    try {
      const decisionRes = await fetch(adminFn('verification-decision'), {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ verificationId: request.id, action, reason, adminIdentifier: adminName || 'Admin' }),
      });
      const data = await decisionRes.json();
      if (!decisionRes.ok || !data?.success) throw new Error(data?.error || 'Decision failed');

      const status: VerificationStatus = action === 'approve' ? 'approved' : action === 'deny' ? 'denied' : 'changes_requested';
      await sendUserEmail(request, status, reason);

      toast.success(
        status === "approved"
          ? `✅ ${request.userName} approved — upgraded to Creator+`
          : status === "changes_requested"
          ? `📄 Changes requested from ${request.userName}`
          : `❌ ${request.userName} denied`,
      );

      setSelectedRequest(null);
      setShowRejectModal(false);
      setRejectionReason('');
      setRejectTarget(null);
      loadAll().catch(console.error);
    } catch (err) {
      console.error(err);
      toast.error("Failed to update verification");
    }
  };

  const openRejectModal = (request: VerificationRequest, type: 'denied' | 'changes_requested') => {
    setRejectTarget({ request, type });
    setRejectionReason('');
    setShowRejectModal(true);
  };
  // ── Derived stats ──────────────────────────────────────────────
  const searchQuery = search.trim().toLowerCase();
  const filteredRequests = requests.filter((r) => {
    if (filter !== "all" && r.status !== filter) return false;
    if (!searchQuery) return true;
    return (
      r.userName?.toLowerCase().includes(searchQuery) ||
      r.username?.toLowerCase().includes(searchQuery) ||
      r.userEmail?.toLowerCase().includes(searchQuery)
    );
  });
  const pendingCount = requests.filter(r => r.status === "pending").length;
  const underReviewCount = requests.filter(r => r.status === "under_review").length;
  const changesRequestedCount = requests.filter(r => r.status === "changes_requested").length;
  const approvedCount = requests.filter(r => r.status === "approved").length;
  const deniedCount = requests.filter(r => r.status === "denied").length;

  // No separate login screen here anymore -- AdminLayout's own gate is
  // the only one, and this component never mounts until that's satisfied.

  // ── Admin Dashboard ────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-1">
          <div>
            <h1 className="text-xl font-black text-gray-900">Verifications</h1>
            <p className="text-sm text-gray-400">Review and manage verification requests</p>
          </div>
          <button
            onClick={() => loadAll().catch(console.error)}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
        {/* Identity is the only verification type that actually exists
            today -- there's no admin-reviewed "Payment"/"Professional"/
            "Business" application anywhere in this app (Professional and
            Business are granted purely by a Stripe subscription checkout
            with zero review step). A type-filter row for those would just
            be permanently empty, so it isn't shown. */}
        <p className="text-xs text-gray-400 mb-5">Identity Verification (Creator+)</p>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          {[
            { label: "Pending", value: pendingCount, icon: <Clock className="w-5 h-5 text-amber-500" />, bg: "bg-amber-50", action: () => setFilter("pending") },
            { label: "In Review", value: underReviewCount, icon: <RefreshCw className="w-5 h-5 text-blue-500" />, bg: "bg-blue-50", action: () => setFilter("under_review") },
            { label: "Approved", value: approvedCount, icon: <CheckCircle className="w-5 h-5 text-green-500" />, bg: "bg-green-50", action: () => setFilter("approved") },
            { label: "Rejected", value: deniedCount, icon: <XCircle className="w-5 h-5 text-red-500" />, bg: "bg-red-50", action: () => setFilter("denied") },
          ].map((s) => (
            <button
              key={s.label}
              onClick={s.action}
              className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-3 hover:shadow-md transition-shadow text-left"
            >
              <div className={`w-10 h-10 ${s.bg} rounded-xl flex items-center justify-center shrink-0`}>
                {s.icon}
              </div>
              <div>
                <p className="text-xs text-gray-400 font-medium">{s.label}</p>
                <p className="text-2xl font-black text-gray-900">{s.value}</p>
              </div>
            </button>
          ))}
        </div>
        {changesRequestedCount > 0 && (
          <button onClick={() => setFilter('changes_requested')} className="text-xs font-semibold text-orange-600 bg-orange-50 rounded-xl px-3 py-2 mb-5 inline-block hover:bg-orange-100">
            {changesRequestedCount} awaiting changes from the user →
          </button>
        )}

        {/* Search */}
        <div className="relative mb-4">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search user, email, username..."
            className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-200 rounded-xl outline-none focus:border-blue-300"
          />
        </div>

        {/* Filter tabs */}
            <div className="flex gap-2 mb-4 flex-wrap">
              {(
                [
                  "all",
                  "pending",
                  "under_review",
                  "changes_requested",
                  "approved",
                  "denied",
                ] as const
              ).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-colors capitalize border ${
                    filter === f
                      ? f === "pending" || f === "under_review"
                        ? "bg-amber-500 text-white border-amber-500"
                        : f === "changes_requested"
                          ? "bg-orange-500 text-white border-orange-500"
                          : f === "approved"
                            ? "bg-green-600 text-white border-green-600"
                            : f === "denied"
                              ? "bg-red-600 text-white border-red-600"
                              : "bg-blue-600 text-white border-blue-600"
                      : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
                  }`}
                >
                  {f === "all"
                    ? `All (${requests.length})`
                    : f === "denied"
                    ? `Rejected (${requests.filter((r) => r.status === f).length})`
                    : `${f.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')} (${requests.filter((r) => r.status === f).length})`}
                </button>
              ))}
            </div>

            {/* Requests grid */}
            {filteredRequests.length === 0 ? (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
                <Clock className="w-12 h-12 text-gray-200 mx-auto mb-4" />
                <h3 className="text-lg font-bold text-gray-400">
                  No {filter !== "all" ? filter : ""}{" "}
                  verification requests
                </h3>
                <p className="text-sm text-gray-400 mt-1">
                  When users complete the verification flow,
                  requests appear here.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {filteredRequests.map((req) => (
                  <div
                    key={req.id}
                    className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow overflow-hidden"
                  >
                    <div className="p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className="w-11 h-11 rounded-xl overflow-hidden bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-black text-base shrink-0">
                            {req.avatarUrl
                              ? <img src={req.avatarUrl} alt="" className="w-full h-full object-cover" />
                              : (req.fullName || req.userName)?.charAt(0)?.toUpperCase() || "?"}
                          </div>
                          <div>
                            <p className="font-bold text-gray-900 text-sm">
                              {req.fullName || req.userName}
                            </p>
                            <p className="text-xs text-gray-400">
                              {req.username ? `@${req.username}` : `@${req.userId.slice(0, 8)}`}
                            </p>
                          </div>
                        </div>
                        <span
                          className={`text-[11px] font-black px-2.5 py-1 rounded-full uppercase whitespace-nowrap ${
                            req.status === "pending" || req.status === "under_review"
                              ? "bg-amber-100 text-amber-700"
                              : req.status === "changes_requested"
                                ? "bg-orange-100 text-orange-700"
                                : req.status === "approved"
                                  ? "bg-green-100 text-green-700"
                                  : "bg-red-100 text-red-700"
                          }`}
                        >
                          {req.status === 'denied' ? 'rejected' : req.status.replace('_', ' ')}
                        </span>
                      </div>

                      {/* Kept compact per spec — full legal record lives in Review Verification, not here */}
                      <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs mb-3 bg-gray-50 rounded-xl p-3">
                        <CardField label="Country" value={req.residenceCountry} />
                        <CardField
                          label="Submitted"
                          value={new Date(req.submittedAt).toLocaleDateString("en-CA", { year: 'numeric', month: "short", day: "numeric" })}
                        />
                        <CardField
                          label="Government ID"
                          value={(req.idFrontPath || req.documentsDeletedAt) ? 'Provided ✓' : 'Not provided'}
                        />
                        <CardField
                          label="Proof of address"
                          value={(req.proofOfAddressPath || req.documentsDeletedAt) ? 'Provided ✓' : 'Not provided'}
                        />
                      </div>

                      <button
                        className="w-full flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl py-2.5 transition-colors"
                        onClick={() => openReview(req)}
                      >
                        Review Verification <ArrowRight className="w-4 h-4" />
                      </button>
                      {req.reviewedAt && (
                        <p className="text-[11px] text-gray-400 mt-2">
                          Reviewed{" "}
                          {new Date(
                            req.reviewedAt,
                          ).toLocaleDateString("en-CA", {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}{" "}
                          · by {req.reviewedBy}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
      </div>

      {/* ── Review Verification Modal ─────────────────────────────── */}
      {selectedRequest && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50"
          onClick={() => setSelectedRequest(null)}
        >
          <div
            className="bg-white w-full max-w-4xl max-h-[92vh] overflow-y-auto rounded-3xl shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div
              className={`p-5 flex items-center justify-between border-b border-gray-100 ${
                selectedRequest.status === "approved"
                  ? "bg-green-50"
                  : selectedRequest.status === "denied"
                    ? "bg-red-50"
                    : selectedRequest.status === "changes_requested"
                      ? "bg-orange-50"
                      : "bg-amber-50"
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-12 h-12 rounded-xl overflow-hidden bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-black text-lg shrink-0">
                  {selectedRequest.avatarUrl
                    ? <img src={selectedRequest.avatarUrl} alt="" className="w-full h-full object-cover" />
                    : (selectedRequest.fullName || selectedRequest.userName)?.charAt(0)?.toUpperCase() || "?"}
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Review Verification · Creator+ Verification</p>
                  <h2 className="text-lg font-black text-gray-900 truncate">
                    {selectedRequest.fullName || selectedRequest.userName}
                  </h2>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`text-xs font-bold px-2.5 py-0.5 rounded-full uppercase ${
                        selectedRequest.status === "pending" || selectedRequest.status === "under_review"
                          ? "bg-amber-200 text-amber-800"
                          : selectedRequest.status === "changes_requested"
                            ? "bg-orange-200 text-orange-800"
                            : selectedRequest.status === "approved"
                              ? "bg-green-200 text-green-800"
                              : "bg-red-200 text-red-800"
                      }`}
                    >
                      {selectedRequest.status === 'denied' ? 'rejected' : selectedRequest.status.replace('_', ' ')}
                    </span>
                    <span className="text-[11px] text-gray-400">Submitted {new Date(selectedRequest.submittedAt).toLocaleDateString("en-CA", { year: 'numeric', month: "short", day: "numeric" })}</span>
                  </div>
                  <p className="text-[11px] font-semibold text-gray-500 mt-1">
                    {TIER_LABEL[selectedRequest.accountType || ''] || 'Creator'}
                    {selectedRequest.accountType !== 'creator_plus' && selectedRequest.accountType !== 'service' && <> → <span className="text-blue-600">Creator+</span></>}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedRequest(null)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-white/80 hover:bg-white text-gray-500 shadow shrink-0"
              >
                ✕
              </button>
            </div>

            <div className="p-5 space-y-5">
              <p className="text-[11px] text-gray-300 font-mono">Verification ID: {selectedRequest.id}</p>

              {/* Verification checks — an at-a-glance summary of exactly
                  what's real and checkable for THIS verification (Creator+
                  identity only). Deliberately does not include a
                  "Professional"/"Business" review item: no such review
                  step exists anywhere in this app today (see
                  ProfessionalAccountSteps.tsx/BusinessAccountSteps.tsx --
                  neither persists a submission an admin could review), so
                  showing one here would imply a feature that isn't real. */}
              <section>
                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-2.5">Verification Checks</h3>
                <div className="flex flex-wrap gap-2">
                  {[
                    { label: 'Email verified', ok: selectedRequest.emailVerified },
                    { label: 'Phone verified', ok: selectedRequest.phoneVerified },
                    { label: 'ID submitted', ok: !!selectedRequest.idFrontPath || !!selectedRequest.documentsDeletedAt },
                    { label: 'Selfie submitted', ok: !!selectedRequest.selfiePath || !!selectedRequest.documentsDeletedAt },
                    { label: 'Proof of address submitted', ok: !!selectedRequest.proofOfAddressPath || !!selectedRequest.documentsDeletedAt },
                  ].map(c => (
                    <span key={c.label} className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-full ${c.ok ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
                      {c.ok ? <CheckCircle className="w-3.5 h-3.5" /> : <span className="w-3.5 h-3.5 rounded-full border-2 border-gray-300 inline-block" />}
                      {c.label}
                    </span>
                  ))}
                </div>
                {/* Plan & billing -- display-only. Stripe-webhook-driven,
                    never something this page approves or rejects; shown
                    here purely for context while reviewing identity. */}
                <p className="text-[11px] text-gray-400 mt-2.5">
                  Plan: <span className="font-semibold text-gray-600">{TIER_LABEL[selectedRequest.accountType || ''] || 'Creator'}</span>
                  {selectedRequest.subscriptionStatus && <> · Billing: <span className="font-semibold text-gray-600 capitalize">{selectedRequest.subscriptionStatus}</span></>}
                </p>
              </section>

              <div className="lg:grid lg:grid-cols-2 lg:gap-6 space-y-5 lg:space-y-0">
                {/* ── LEFT: Public preview + Personal + Address ── */}
                <div className="space-y-5">
                  {/* Public profile preview — distinct from legal info below */}
                  <section>
                    <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                      <User className="w-3.5 h-3.5" /> Public Profile
                    </h3>
                    <div className="bg-gray-50 rounded-2xl p-3.5 flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-200 shrink-0">
                        {selectedRequest.avatarUrl && <img src={selectedRequest.avatarUrl} alt="" className="w-full h-full object-cover" />}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-gray-900 truncate">{selectedRequest.userName}</p>
                        <p className="text-xs text-gray-400 truncate">
                          {selectedRequest.username ? `@${selectedRequest.username}` : '—'}
                          {selectedRequest.primaryRole ? ` · ${selectedRequest.primaryRole}` : ''}
                          {selectedRequest.publicCity ? ` · ${selectedRequest.publicCity}` : ''}
                        </p>
                      </div>
                    </div>
                  </section>

                  {/* Personal information — legal identity, source of truth for Creator+ */}
                  <section>
                    <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                      <FileText className="w-3.5 h-3.5" /> Personal Information
                    </h3>
                    <div className="bg-gray-50 rounded-2xl overflow-hidden">
                      <InfoRow icon={<User className="w-4 h-4 text-blue-500" />} label="Legal First Name" value={selectedRequest.legalFirstName} />
                      <InfoRow icon={<User className="w-4 h-4 text-blue-500" />} label="Legal Last Name" value={selectedRequest.legalLastName} />
                      <InfoRow
                        icon={<Calendar className="w-4 h-4 text-purple-500" />}
                        label="Date of Birth"
                        value={selectedRequest.dob ? new Date(selectedRequest.dob + "T00:00:00").toLocaleDateString("en-CA", { year: "numeric", month: "long", day: "numeric" }) : undefined}
                      />
                      <InfoRow
                        icon={<Mail className="w-4 h-4 text-blue-500" />}
                        label="Email"
                        value={selectedRequest.userEmail ? `${selectedRequest.userEmail} · ${selectedRequest.emailVerified ? 'Verified ✓' : 'Not verified'}` : undefined}
                      />
                      <InfoRow
                        icon={<Phone className="w-4 h-4 text-blue-500" />}
                        label="Phone"
                        value={selectedRequest.userPhone ? `${selectedRequest.userPhone} · ${selectedRequest.phoneVerified ? 'Verified ✓' : 'Not verified'}` : undefined}
                      />
                      <InfoRow
                        icon={<User className="w-4 h-4 text-gray-400" />}
                        label="Filmons Username"
                        value={selectedRequest.username ? `@${selectedRequest.username}` : undefined}
                      />
                    </div>
                  </section>

                  {/* Address — from identity_verifications, never the editable public profile location */}
                  <section>
                    <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                      <MapPin className="w-3.5 h-3.5" /> Residential Address
                    </h3>
                    <div className="bg-gray-50 rounded-2xl p-4 text-sm text-gray-800 leading-relaxed">
                      {selectedRequest.streetAddr ? (
                        <>
                          {selectedRequest.streetAddr}{selectedRequest.unit ? `, ${selectedRequest.unit}` : ''}<br/>
                          {[selectedRequest.city, selectedRequest.province, selectedRequest.postalCode].filter(Boolean).join(', ')}<br/>
                          {selectedRequest.residenceCountry}
                        </>
                      ) : <span className="text-gray-400">Not provided</span>}
                    </div>
                  </section>
                </div>

                {/* ── RIGHT: Government ID + Proof of Address + History + Notes ── */}
                <div className="space-y-5">
                  <section>
                    <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                      <CreditCard className="w-3.5 h-3.5" /> Government ID
                    </h3>
                    <div className="bg-gray-50 rounded-2xl overflow-hidden">
                      <InfoRow
                        icon={<CheckCircle className="w-4 h-4 text-green-500" />}
                        label="Government ID"
                        value={(selectedRequest.idFrontPath || selectedRequest.documentsDeletedAt) ? 'Provided ✓' : 'Not provided'}
                      />
                      <InfoRow icon={<CreditCard className="w-4 h-4 text-indigo-500" />} label="ID Type" value={selectedRequest.idType} />
                      <div className="flex items-start gap-3 py-2.5 border-b border-gray-50 last:border-0">
                        <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center shrink-0 mt-0.5">
                          <CreditCard className="w-4 h-4 text-indigo-500" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">ID Number</p>
                          <MaskedIdNumber last4={selectedRequest.idNumberLast4} canReveal={canViewSensitive} onReveal={() => revealIdNumber(selectedRequest.id)} />
                        </div>
                      </div>
                      <InfoRow icon={<Globe className="w-4 h-4 text-indigo-500" />} label="Issuing Country" value={selectedRequest.issuingCountry} />
                      <InfoRow icon={<Calendar className="w-4 h-4 text-indigo-500" />} label="Expiration Date" value={selectedRequest.idExpiryDate} />
                    </div>
                    {!selectedRequest.documentsDeletedAt && (
                      <div className="mt-2 space-y-1.5">
                        <DocumentViewButton label="Government ID" hasDoc={!!selectedRequest.idFrontPath} canView={canViewSensitive}
                          onView={() => viewDocument(selectedRequest.id, 'id_front', 'Government ID')} />
                        {selectedRequest.idBackPath && (
                          <DocumentViewButton label="Government ID (Back)" hasDoc={!!selectedRequest.idBackPath} canView={canViewSensitive}
                            onView={() => viewDocument(selectedRequest.id, 'id_back', 'Government ID (Back)')} />
                        )}
                        <DocumentViewButton label="Selfie" hasDoc={!!selectedRequest.selfiePath} canView={canViewSensitive}
                          onView={() => viewDocument(selectedRequest.id, 'selfie', 'Selfie')} />
                      </div>
                    )}
                  </section>

                  <section>
                    <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                      <Camera className="w-3.5 h-3.5" /> Proof of Address
                    </h3>
                    <div className="bg-gray-50 rounded-2xl overflow-hidden">
                      <InfoRow
                        icon={<CheckCircle className="w-4 h-4 text-green-500" />}
                        label="Proof of Address"
                        value={(selectedRequest.proofOfAddressPath || selectedRequest.documentsDeletedAt) ? 'Provided ✓' : 'Not provided'}
                      />
                      <InfoRow icon={<FileText className="w-4 h-4 text-indigo-500" />} label="Document Type" value={selectedRequest.proofOfAddressType} />
                    </div>
                    {!selectedRequest.documentsDeletedAt && (
                      <div className="mt-2">
                        <DocumentViewButton label="Proof of Address" hasDoc={!!selectedRequest.proofOfAddressPath} canView={canViewSensitive}
                          onView={() => viewDocument(selectedRequest.id, 'proof_of_address', 'Proof of Address')} />
                      </div>
                    )}
                    {selectedRequest.documentsDeletedAt && (
                      <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4 text-center mt-2">
                        <Trash2 className="w-6 h-6 text-gray-300 mx-auto mb-1.5" />
                        <p className="text-xs font-bold text-gray-600">Documents removed</p>
                        <p className="text-[11px] text-gray-400 mt-0.5">Securely removed after the final decision.</p>
                      </div>
                    )}
                  </section>

                  {/* Verification History — lifecycle only, never document contents */}
                  <section>
                    <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                      <Clock className="w-3.5 h-3.5" /> Verification History
                    </h3>
                    <div className="bg-gray-50 rounded-2xl p-4 space-y-2.5 text-sm max-h-48 overflow-y-auto">
                      <div className="flex items-start gap-2">
                        <span className="text-[11px] text-gray-400 shrink-0 w-16">{new Date(selectedRequest.submittedAt).toLocaleDateString("en-CA", { month: 'short', day: 'numeric' })}</span>
                        <span className="text-gray-700 font-medium">Verification submitted</span>
                      </div>
                      {history.map(h => (
                        <div key={h.id} className="flex items-start gap-2">
                          <span className="text-[11px] text-gray-400 shrink-0 w-16">{new Date(h.createdAt).toLocaleDateString("en-CA", { month: 'short', day: 'numeric' })}</span>
                          <span className="text-gray-700">
                            {{
                              verification_opened: 'Review started',
                              government_id_viewed: 'Government ID viewed',
                              proof_of_address_viewed: 'Proof of address viewed',
                              id_number_revealed: 'ID number revealed',
                              approved: 'Approved',
                              changes_requested: 'Changes requested',
                              denied: 'Denied',
                              documents_deleted: 'Documents removed',
                              viewed_document: 'Document viewed',
                            }[h.action] || h.action} <span className="text-gray-400">— {h.adminIdentifier}</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </section>

                  {/* Internal Notes — admin-only, never shown to the user */}
                  <section>
                    <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                      <FileText className="w-3.5 h-3.5" /> Internal Notes
                    </h3>
                    <div className="space-y-2 mb-2 max-h-32 overflow-y-auto">
                      {notes.map(n => (
                        <div key={n.id} className="bg-gray-50 rounded-xl p-3 text-sm">
                          <p className="text-gray-800">{n.note}</p>
                          <p className="text-[10px] text-gray-400 mt-1">{n.adminIdentifier} · {new Date(n.createdAt).toLocaleString('en-CA')}</p>
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <input
                        value={newNote} onChange={e => setNewNote(e.target.value)}
                        placeholder="Add an internal note…"
                        className="flex-1 bg-gray-50 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200"
                      />
                      <button
                        onClick={() => addNote(selectedRequest.id)} disabled={savingNote || !newNote.trim()}
                        className="text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-xl px-3 disabled:opacity-50"
                      >
                        {savingNote ? '…' : 'Add Note'}
                      </button>
                    </div>
                  </section>
                </div>
              </div>

              {/* Actions — only while the application is still active, and only Super Admin can decide */}
              {(selectedRequest.status === "pending" || selectedRequest.status === "under_review") && (
                canDecide ? (
                  <div className="flex gap-3 flex-wrap">
                    <button
                      className="flex-1 flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white font-bold rounded-2xl py-3.5 transition-colors min-w-[120px]"
                      onClick={() => handleDecision(selectedRequest, "approve")}
                    >
                      <CheckCircle className="w-5 h-5" /> Approve
                    </button>
                    <button
                      className="flex-1 flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-2xl py-3.5 transition-colors min-w-[120px]"
                      onClick={() => openRejectModal(selectedRequest, 'changes_requested')}
                    >
                      <RefreshCw className="w-4 h-4" /> Request Changes
                    </button>
                    <button
                      className="flex-1 flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded-2xl py-3.5 transition-colors min-w-[120px]"
                      onClick={() => openRejectModal(selectedRequest, 'denied')}
                    >
                      <XCircle className="w-5 h-5" /> Deny
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 justify-center text-sm text-gray-400 bg-gray-50 rounded-2xl py-3.5">
                    <Lock className="w-4 h-4" /> Only Super Admin can approve, request changes, or deny
                  </div>
                )
              )}
              <button
                className="w-full text-gray-500 hover:text-gray-700 text-sm py-2 font-semibold"
                onClick={() => setSelectedRequest(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {viewerDoc && (
        <DocumentViewerModal
          userName={selectedRequest?.fullName || selectedRequest?.userName || ''}
          docLabel={viewerDoc.label}
          url={viewerDoc.url}
          onClose={() => setViewerDoc(null)}
        />
      )}

      {/* ── Rejection Reason Modal ──────────────────────────────── */}
      {showRejectModal && rejectTarget && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[60]"
          onClick={() => setShowRejectModal(false)}>
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl p-6 space-y-4"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3">
              {rejectTarget.type === 'changes_requested'
                ? <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center"><RefreshCw className="w-5 h-5 text-orange-600"/></div>
                : <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center"><XCircle className="w-5 h-5 text-red-600"/></div>
              }
              <div>
                <h3 className="font-black text-gray-900 text-base">
                  {rejectTarget.type === 'changes_requested' ? 'Request Changes' : 'Deny Verification'}
                </h3>
                <p className="text-xs text-gray-400">{rejectTarget.request.userName}</p>
              </div>
            </div>

            <div>
              <p className="text-xs font-bold text-gray-500 mb-2 uppercase tracking-wide">Reason (required)</p>
              <textarea
                value={rejectionReason}
                onChange={e => setRejectionReason(e.target.value)}
                placeholder={rejectTarget.type === 'changes_requested' ? 'Tell the user exactly what needs to be corrected…' : 'Explain why this verification is being denied…'}
                rows={3}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
              />
            </div>

            <div>
              <p className="text-xs font-semibold text-gray-400 mb-2">Quick reasons</p>
              <div className="flex flex-wrap gap-1.5">
                {(rejectTarget.type === 'changes_requested' ? CHANGES_PRESETS : DENY_PRESETS).map(p => (
                  <button key={p} onClick={() => setRejectionReason(p)}
                    className="text-xs px-2.5 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-full transition-colors">
                    {p}
                  </button>
                ))}
              </div>
            </div>

            {rejectTarget.type === 'denied' && (
              <p className="text-xs text-gray-400">
                Approving or denying permanently deletes the submitted documents from storage once this decision is saved.
              </p>
            )}

            <div className="flex gap-3 pt-2">
              <button onClick={() => { setShowRejectModal(false); setRejectionReason(''); }}
                className="flex-1 py-3 border border-gray-200 rounded-2xl text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button
                disabled={!rejectionReason.trim()}
                onClick={() => handleDecision(rejectTarget.request, rejectTarget.type === 'changes_requested' ? 'changes_requested' : 'deny', rejectionReason.trim())}
                className={`flex-1 py-3 rounded-2xl text-sm font-bold text-white transition-colors disabled:opacity-40 ${
                  rejectTarget.type === 'changes_requested' ? 'bg-orange-500 hover:bg-orange-600' : 'bg-red-600 hover:bg-red-700'
                }`}>
                {rejectTarget.type === 'changes_requested' ? 'Request Changes' : 'Deny & Notify'}
              </button>
            </div>

            <p className="text-xs text-gray-400 text-center">
              An email will be sent to {rejectTarget.request.userEmail} with this reason.
            </p>
          </div>
        </div>
      )}

    </div>
  );
}