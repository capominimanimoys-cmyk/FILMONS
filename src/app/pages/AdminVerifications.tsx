import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import emailjs from '@emailjs/browser';
import { EMAILJS_CONFIG } from '../lib/emailjs-config';
import { supabase } from '../../lib/supabase';
import { projectId, publicAnonKey } from '/utils/supabase/info';
import { adminAuth as adminAuthClient } from '../lib/adminAuth';
import {
  ShieldCheck,
  ArrowLeft,
  CheckCircle,
  XCircle,
  Clock,
  Phone,
  Mail,
  User,
  FileText,
  Lock,
  Eye,
  EyeOff,
  LogOut,
  Wallet,
  DollarSign,
  TrendingUp,
  ArrowDownLeft,
  MapPin,
  Calendar,
  CreditCard,
  Camera,
  RefreshCw,
  Globe,
  ArrowRight,
  Trash2,
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

interface WalletTx {
  id: string;
  amount: number;      // total charged to the renter (subtotal + buyer fee) — Stripe handles tax separately, outside this figure
  subtotal: number;
  buyerFee: number;
  sellerFee: number;
  platformFee: number; // buyerFee + sellerFee — total Filmons fee revenue for this order
  creatorPayout: number; // subtotal - sellerFee — what the host actually earns
  feeConfigVersion?: string;
  title: string;
  status: "paid" | "pending";
  date: string;
  hostName?: string;
  renterName?: string;
  method?: string;
  refundStatus: string;
  disputeStatus: string;
}

interface RefundRequest {
  id: string;
  order_id: string;
  requester_id: string;
  reason: string | null;
  amount: number;
  status: 'requested' | 'approved' | 'denied' | 'processed';
  requested_at: string;
  processed_at: string | null;
  processed_by: string | null;
}

const fmt = (n: number) =>
  n.toLocaleString("en-CA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

// ── Helpers ────────────────────────────────────────────────────────
// Real completed orders from Supabase — every `orders` row is only ever
// created after payment succeeds (see Checkout.tsx's finalizeOrder), so
// there's no "pending" order concept here; this previously reconstructed
// numbers from localStorage chat history with a hardcoded 15% fee, which
// only ever reflected the current browser and never matched what was
// actually charged.
async function loadWalletTxs(): Promise<WalletTx[]> {
  try {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .order('paid_at', { ascending: false })
      .limit(200);
    if (error || !data) return [];
    return data.map((r: any) => {
      const subtotal = Number(r.subtotal ?? r.total_amount ?? 0);
      const buyerFee = Number(r.buyer_fee_amount ?? 0);
      const sellerFee = Number(r.seller_fee_amount ?? 0);
      return {
        id: r.id,
        amount: Number(r.total_amount ?? 0),
        subtotal, buyerFee, sellerFee,
        platformFee: buyerFee + sellerFee,
        creatorPayout: subtotal - sellerFee,
        feeConfigVersion: r.fee_config_version || undefined,
        title: r.listing_title || 'Payment',
        status: 'paid',
        date: r.paid_at || new Date().toISOString(),
        hostName: r.host_name,
        renterName: r.renter_name,
        method: r.payment_method,
        refundStatus: r.refund_status || 'none',
        disputeStatus: r.dispute_status || 'none',
      };
    });
  } catch {
    return [];
  }
}

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
  const navigate = useNavigate();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [adminName, setAdminName] = useState("");
  const [activeTab, setActiveTab] = useState<
    "verifications" | "wallet"
  >("verifications");

  // Verifications state
  const [requests, setRequests] = useState<
    VerificationRequest[]
  >([]);
  const [selectedRequest, setSelectedRequest] =
    useState<VerificationRequest | null>(null);
  const [filter, setFilter] = useState<
    "all" | VerificationStatus
  >("pending");

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
  const adminRole = adminAuthClient.getAdmin()?.role;
  const canDecide = adminRole === 'super_admin';
  const canViewSensitive = adminRole === 'super_admin'; // raw ID docs + full ID number

  const [viewerDoc, setViewerDoc] = useState<{ label: string; url: string } | null>(null);
  const [history, setHistory] = useState<AuditEvent[]>([]);
  const [notes, setNotes] = useState<AdminNote[]>([]);
  const [newNote, setNewNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  const viewDocument = async (verificationId: string, docType: 'id_front' | 'id_back' | 'selfie' | 'proof_of_address', label: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('verification-view-document', {
        body: { verificationId, docType },
        headers: adminAuthClient.authHeader(),
      });
      if (error || data?.error || !data?.url) throw error || new Error(data?.error || 'Could not load document');
      setViewerDoc({ label, url: data.url });
    } catch (e: any) {
      toast.error(e?.message || 'Could not load document');
    }
  };

  const revealIdNumber = async (verificationId: string): Promise<string | null> => {
    try {
      const { data, error } = await supabase.functions.invoke('verification-reveal-id', {
        body: { verificationId },
        headers: adminAuthClient.authHeader(),
      });
      if (error || data?.error) throw error || new Error(data?.error || 'Could not reveal ID number');
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

  // Wallet state
  const [walletTxs, setWalletTxs] = useState<WalletTx[]>([]);
  const [walletFilter, setWalletFilter] = useState<
    "all" | "paid" | "pending"
  >("all");
  const [payoutRequests, setPayoutRequests] = useState<any[]>([]);
  const [processingPayoutId, setProcessingPayoutId] = useState<string | null>(null);
  const [payoutAction, setPayoutAction] = useState<{ payout: any; action: 'reject' | 'paid' } | null>(null);
  const [payoutActionInput, setPayoutActionInput] = useState('');
  const [payoutActionNotes, setPayoutActionNotes] = useState('');

  // Refund requests + disputes
  const [refundRequests, setRefundRequests] = useState<RefundRequest[]>([]);
  const [processingRefundId, setProcessingRefundId] = useState<string | null>(null);
  const [disputeUpdatingOrderId, setDisputeUpdatingOrderId] = useState<string | null>(null);

  // Opportunity payments (read-only reporting for V1 — disputes/refunds
  // reuse the existing Marketplace Transactions dispute toggle below,
  // since every Opportunity payment also creates a real orders row)
  const [opportunityPayments, setOpportunityPayments] = useState<any[]>([]);

  useEffect(() => {
    const session = adminAuthClient.getAdmin();
    if (session) {
      setIsAuthenticated(true);
      setAdminName(session.name);
      loadAll().catch(console.error);
    }
  }, []);

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
        .select('*, profiles(name, username, email, phone, avatar_url, primary_role, city, email_verified, phone_verified)')
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

    // ── WALLET ─────────────────────────────────────────────────────
    loadWalletTxs().then(setWalletTxs);

    // ── PAYOUT REQUESTS ───────────────────────────────────────────
    try {
      const { data } = await supabase
        .from('payout_requests')
        .select('*, profiles(name, email)')
        .order('requested_at', { ascending: false })
        .limit(100);
      // Instant requests surface first regardless of request time — this
      // is the entire mechanism behind "Instant" meaning something real,
      // since every payout is still a human admin sending it manually.
      const sorted = [...(data || [])].sort((a: any, b: any) => {
        const ai = a.payout_speed === 'instant' ? 1 : 0;
        const bi = b.payout_speed === 'instant' ? 1 : 0;
        if (ai !== bi) return bi - ai;
        return 0;
      });
      setPayoutRequests(sorted);
    } catch (e) {
      console.warn('payout_requests query failed:', e);
    }

    // ── REFUND REQUESTS ───────────────────────────────────────────
    try {
      const { data } = await supabase
        .from('refund_requests')
        .select('*')
        .order('requested_at', { ascending: false })
        .limit(100);
      setRefundRequests(data || []);
    } catch (e) {
      console.warn('refund_requests query failed:', e);
    }

    // ── OPPORTUNITY PAYMENTS ───────────────────────────────────────
    try {
      const { data: txns } = await supabase
        .from('opportunity_transactions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      const rows = txns || [];
      const listingIds = [...new Set(rows.map((r: any) => r.listing_id))];
      const userIds = [...new Set(rows.flatMap((r: any) => [r.owner_id, r.worker_id]))];
      const [{ data: listingRows }, { data: profileRows }] = await Promise.all([
        listingIds.length ? supabase.from('listings').select('id, title').in('id', listingIds) : Promise.resolve({ data: [] as any[] }),
        userIds.length ? supabase.from('profiles').select('id, name').in('id', userIds) : Promise.resolve({ data: [] as any[] }),
      ]);
      const listingMap = Object.fromEntries((listingRows || []).map((l: any) => [l.id, l.title]));
      const nameMap = Object.fromEntries((profileRows || []).map((p: any) => [p.id, p.name]));
      setOpportunityPayments(rows.map((r: any) => ({ ...r, listing_title: listingMap[r.listing_id], owner_name: nameMap[r.owner_id], worker_name: nameMap[r.worker_id] })));
    } catch (e) {
      console.warn('opportunity_transactions query failed:', e);
    }
  };

  // Simple actions (approve, mark_processing) need no extra input.
  const processPayoutSimple = async (payoutRequestId: string, action: 'approve' | 'mark_processing') => {
    setProcessingPayoutId(payoutRequestId);
    try {
      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/admin-process-payout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${publicAnonKey}`, ...adminAuthClient.authHeader() },
        body: JSON.stringify({ payoutRequestId, action, adminName }),
      });
      const result = await res.json();
      if (!res.ok || result.error) throw new Error(result.error || 'Failed');
      toast.success(action === 'approve' ? 'Payout approved' : 'Payout marked as processing');
      loadAll().catch(console.error);
    } catch (e: any) {
      toast.error(e?.message || 'Could not update payout');
    } finally {
      setProcessingPayoutId(null);
    }
  };

  // Reject (needs a reason) and Mark Paid (needs a payment reference) go
  // through the small confirm modal below instead of firing immediately.
  const submitPayoutAction = async () => {
    if (!payoutAction) return;
    const { payout, action } = payoutAction;
    if (action === 'reject' && !payoutActionInput.trim()) { toast.error('A rejection reason is required.'); return; }
    if (action === 'paid' && !payoutActionInput.trim()) { toast.error('A payment reference is required.'); return; }
    setProcessingPayoutId(payout.id);
    try {
      const body: Record<string, unknown> = { payoutRequestId: payout.id, adminName };
      if (action === 'reject') { body.action = 'reject'; body.reason = payoutActionInput.trim(); }
      else { body.action = 'paid'; body.paymentReference = payoutActionInput.trim(); body.notes = payoutActionNotes.trim() || undefined; }

      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/admin-process-payout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${publicAnonKey}`, ...adminAuthClient.authHeader() },
        body: JSON.stringify(body),
      });
      const result = await res.json();
      if (!res.ok || result.error) throw new Error(result.error || 'Failed');
      toast.success(action === 'reject' ? 'Payout rejected' : 'Payout marked as paid');
      setPayoutAction(null);
      setPayoutActionInput('');
      setPayoutActionNotes('');
      loadAll().catch(console.error);
    } catch (e: any) {
      toast.error(e?.message || 'Could not process payout');
    } finally {
      setProcessingPayoutId(null);
    }
  };

  const processRefund = async (refundRequestId: string, action: 'approve' | 'deny') => {
    setProcessingRefundId(refundRequestId);
    try {
      if (action === 'deny') {
        const { error } = await supabase.from('refund_requests').update({
          status: 'denied', processed_at: new Date().toISOString(), processed_by: adminName,
        }).eq('id', refundRequestId);
        if (error) throw new Error(error.message);
        toast.success('Refund request denied');
      } else {
        const res = await fetch(`https://${projectId}.supabase.co/functions/v1/process-refund`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${publicAnonKey}`, ...adminAuthClient.authHeader() },
          body: JSON.stringify({ refundRequestId, adminName }),
        });
        const result = await res.json();
        if (!res.ok || result.error) throw new Error(result.error || 'Failed');
        toast.success('Refund processed');
      }
      loadAll().catch(console.error);
    } catch (e: any) {
      toast.error(e?.message || 'Could not process refund');
    } finally {
      setProcessingRefundId(null);
    }
  };

  const toggleDispute = async (orderId: string, currentStatus: string) => {
    setDisputeUpdatingOrderId(orderId);
    try {
      const next = currentStatus === 'disputed' ? 'resolved' : 'disputed';
      const { error } = await supabase.from('orders').update({
        dispute_status: next,
        disputed_at: next === 'disputed' ? new Date().toISOString() : undefined,
      }).eq('id', orderId);
      if (error) throw new Error(error.message);
      toast.success(next === 'disputed' ? 'Order marked disputed — pending earnings held' : 'Dispute resolved');
      loadAll().catch(console.error);
    } catch (e: any) {
      toast.error(e?.message || 'Could not update dispute status');
    } finally {
      setDisputeUpdatingOrderId(null);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = adminName.trim();
    if (!name || !password) { toast.error('Enter your name and password.'); return; }
    const { success, error } = await adminAuthClient.login(name, password);
    if (success) {
      const session = adminAuthClient.getAdmin();
      setIsAuthenticated(true);
      setAdminName(session?.name || name);
      loadAll().catch(console.error);
      toast.success("Admin access granted");
    } else {
      toast.error(error || "Incorrect name or password");
    }
  };

  const handleLogout = () => {
    adminAuthClient.logout();
    setIsAuthenticated(false);
    setPassword("");
    toast.info("Logged out");
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
      const { data, error } = await supabase.functions.invoke('verification-decision', {
        body: { verificationId: request.id, action, reason, adminIdentifier: adminName || 'Admin' },
        headers: adminAuthClient.authHeader(),
      });
      if (error || !data?.success) throw error || new Error(data?.error || 'Decision failed');

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
  const filteredRequests = requests.filter(
    (r) => filter === "all" || r.status === filter,
  );
  const pendingCount = requests.filter(r => r.status === "pending").length;
  const underReviewCount = requests.filter(r => r.status === "under_review").length;
  const changesRequestedCount = requests.filter(r => r.status === "changes_requested").length;
  const approvedCount = requests.filter(r => r.status === "approved").length;
  const deniedCount = requests.filter(r => r.status === "denied").length;

  const paidTxs = walletTxs.filter((t) => t.status === "paid");
  const pendingTxs = walletTxs.filter(
    (t) => t.status === "pending",
  );
  const totalVolume = paidTxs.reduce((s, t) => s + t.amount, 0);
  const totalFees = paidTxs.reduce(
    (s, t) => s + t.platformFee,
    0,
  );
  const totalPayouts = paidTxs.reduce(
    (s, t) => s + t.creatorPayout,
    0,
  );
  const pendingVol = pendingTxs.reduce(
    (s, t) => s + t.amount,
    0,
  );
  const filteredWallet =
    walletFilter === "all"
      ? walletTxs
      : walletTxs.filter((t) => t.status === walletFilter);

  // ── Login screen ───────────────────────────────────────────────
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 to-blue-950 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-sm w-full">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Lock className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-black text-gray-900">
              Admin Panel
            </h1>
            <p className="text-gray-400 text-sm mt-1">
              Filmons back office
            </p>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            <input
              type="text"
              value={adminName}
              onChange={(e) => setAdminName(e.target.value)}
              placeholder="Admin name"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Admin password"
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showPassword ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
            <button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl py-3 transition-colors"
            >
              Access Admin Panel
            </button>
            <button
              type="button"
              onClick={() => navigate("/")}
              className="w-full text-gray-500 hover:text-gray-700 text-sm flex items-center justify-center gap-2 py-2"
            >
              <ArrowLeft className="w-4 h-4" /> Back to Home
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ── Admin Dashboard ────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate("/")}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <ShieldCheck className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="text-base font-black text-gray-900">
                Filmons Admin
              </h1>
              <p className="text-xs text-gray-400">
                Back office panel
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => loadAll().catch(console.error)}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500"
              title="Refresh"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded-xl hover:bg-gray-100 transition-colors"
            >
              <LogOut className="w-4 h-4" /> Logout
            </button>
          </div>
        </div>

        {/* Tab bar */}
        <div className="max-w-7xl mx-auto px-4 flex gap-1 border-t border-gray-100">
          {(["verifications", "wallet"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors capitalize ${
                activeTab === tab
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab === "verifications" ? (
                <ShieldCheck className="w-4 h-4" />
              ) : (
                <Wallet className="w-4 h-4" />
              )}
              {tab === "verifications"
                ? `Verifications`
                : "Filmons Wallet"}
              {tab === "verifications" && pendingCount > 0 && (
                <span className="w-5 h-5 bg-amber-500 text-white text-[10px] font-black rounded-full flex items-center justify-center">
                  {pendingCount}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* ══ VERIFICATIONS TAB ══════════════════════════════════════ */}
        {activeTab === "verifications" && (
          <>
            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
              {[
                {
                  label: "Total",
                  value: requests.length,
                  icon: (
                    <ShieldCheck className="w-5 h-5 text-blue-500" />
                  ),
                  bg: "bg-blue-50",
                  action: () => setFilter("all"),
                },
                {
                  label: "Pending",
                  value: pendingCount + underReviewCount,
                  icon: (
                    <Clock className="w-5 h-5 text-amber-500" />
                  ),
                  bg: "bg-amber-50",
                  action: () => setFilter("pending"),
                },
                {
                  label: "Changes Requested",
                  value: changesRequestedCount,
                  icon: (
                    <RefreshCw className="w-5 h-5 text-orange-500" />
                  ),
                  bg: "bg-orange-50",
                  action: () => setFilter("changes_requested"),
                },
                {
                  label: "Approved",
                  value: approvedCount,
                  icon: (
                    <CheckCircle className="w-5 h-5 text-green-500" />
                  ),
                  bg: "bg-green-50",
                  action: () => setFilter("approved"),
                },
                {
                  label: "Denied",
                  value: deniedCount,
                  icon: (
                    <XCircle className="w-5 h-5 text-red-500" />
                  ),
                  bg: "bg-red-50",
                  action: () => setFilter("denied"),
                },
              ].map((s) => (
                <button
                  key={s.label}
                  onClick={s.action}
                  className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-3 hover:shadow-md transition-shadow text-left"
                >
                  <div
                    className={`w-10 h-10 ${s.bg} rounded-xl flex items-center justify-center shrink-0`}
                  >
                    {s.icon}
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 font-medium">
                      {s.label}
                    </p>
                    <p className="text-2xl font-black text-gray-900">
                      {s.value}
                    </p>
                  </div>
                </button>
              ))}
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
                          {req.status.replace('_', ' ')}
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
          </>
        )}

        {/* ══ WALLET TAB ════════════════════════════════════════════ */}
        {activeTab === "wallet" && (
          <>
            {/* Marketplace Wallet stats */}
            <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-3xl p-6 text-white mb-6 shadow-xl">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center">
                  <Wallet className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-black">
                    Filmons Platform Wallet
                  </h2>
                  <p className="text-blue-200 text-xs">
                    8% Filmons Fee on all completed marketplace
                    transactions
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="bg-white/10 rounded-2xl p-4">
                  <p className="text-blue-200 text-xs font-semibold mb-1">
                    Platform Revenue
                  </p>
                  <p className="text-2xl font-black">
                    ${fmt(totalFees)}
                  </p>
                  <p className="text-blue-300 text-[11px] mt-0.5">
                    CAD earned (marketplace)
                  </p>
                </div>
                <div className="bg-white/10 rounded-2xl p-4">
                  <p className="text-blue-200 text-xs font-semibold mb-1">
                    Total Volume
                  </p>
                  <p className="text-2xl font-black">
                    ${fmt(totalVolume)}
                  </p>
                  <p className="text-blue-300 text-[11px] mt-0.5">
                    {paidTxs.length} paid orders
                  </p>
                </div>
                <div className="bg-white/10 rounded-2xl p-4">
                  <p className="text-blue-200 text-xs font-semibold mb-1">
                    Paid to Creators
                  </p>
                  <p className="text-2xl font-black">
                    ${fmt(totalPayouts)}
                  </p>
                  <p className="text-blue-300 text-[11px] mt-0.5">
                    Net of Filmons Fee
                  </p>
                </div>
                <div className="bg-white/10 rounded-2xl p-4">
                  <p className="text-blue-200 text-xs font-semibold mb-1">
                    Pending Volume
                  </p>
                  <p className="text-2xl font-black">
                    ${fmt(pendingVol)}
                  </p>
                  <p className="text-blue-300 text-[11px] mt-0.5">
                    {pendingTxs.length} pending
                  </p>
                </div>
              </div>
            </div>

            {/* Revenue breakdown */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
                    <TrendingUp className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 font-medium">
                      Completed
                    </p>
                    <p className="text-xl font-black text-gray-900">
                      {paidTxs.length}
                    </p>
                  </div>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Revenue</span>
                  <span className="font-bold text-green-600">
                    +${fmt(totalFees)}
                  </span>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
                    <Clock className="w-5 h-5 text-amber-600" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 font-medium">
                      Pending
                    </p>
                    <p className="text-xl font-black text-gray-900">
                      {pendingTxs.length}
                    </p>
                  </div>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">
                    Expected
                  </span>
                  <span className="font-bold text-amber-600">
                    $
                    {fmt(
                      pendingTxs.reduce(
                        (s, t) => s + t.platformFee,
                        0,
                      ),
                    )}
                  </span>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
                    <ArrowDownLeft className="w-5 h-5 text-purple-600" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 font-medium">
                      Total Payouts
                    </p>
                    <p className="text-xl font-black text-gray-900">
                      ${fmt(totalPayouts)}
                    </p>
                  </div>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">
                    Sent to sellers
                  </span>
                  <span className="font-bold text-purple-600">
                    {paidTxs.length > 0
                      ? Math.round(
                          (totalPayouts / totalVolume) * 100,
                        )
                      : 0}
                    % of vol.
                  </span>
                </div>
              </div>
            </div>

            {/* Payout requests queue */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-6">
              <div className="px-5 py-4 border-b border-gray-50">
                <h3 className="text-sm font-bold text-gray-900">Payout Requests</h3>
                <p className="text-xs text-gray-400 mt-0.5">No automated payout provider is configured yet — send funds manually (e-transfer, bank transfer) using the destination shown, then mark paid here.</p>
              </div>
              {payoutRequests.length === 0 ? (
                <div className="p-8 text-center text-sm text-gray-400">No payout requests yet.</div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {payoutRequests.map((p) => {
                    const dest = p.payout_destination || {};
                    const destText = p.payout_method === 'interac'
                      ? dest.email
                      : p.payout_method === 'bank_transfer'
                        ? `${dest.accountHolder || ''} · inst ${dest.institutionNumber || '—'} · transit ${dest.transitNumber || '—'} · acct ${dest.accountNumber || '—'}`
                        : null;
                    const busy = processingPayoutId === p.id;
                    return (
                      <div key={p.id} className="px-5 py-3.5">
                        <div className="flex items-center gap-4">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-800 truncate flex items-center gap-1.5">
                              {p.profiles?.name || p.host_id}
                              {p.payout_speed === 'instant' && (
                                <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 flex items-center gap-0.5">⚡ Instant</span>
                              )}
                            </p>
                            <p className="text-xs text-gray-400">{new Date(p.requested_at).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })} · {p.profiles?.email || ''}</p>
                            {p.payout_speed === 'instant' && (
                              <p className="text-xs text-amber-600 mt-0.5">Fee {fmt(Number(p.fee_amount || 0))} · Net to host ${fmt(Number(p.net_amount ?? p.amount))}</p>
                            )}
                            {p.payout_method && (
                              <p className="text-xs text-gray-500 mt-1 font-mono">
                                {p.payout_method === 'interac' ? 'Interac' : 'Bank Transfer'}: {destText || '—'}
                              </p>
                            )}
                            {p.status === 'rejected' && p.rejection_reason && (
                              <p className="text-xs text-red-500 mt-1">Rejected: {p.rejection_reason}</p>
                            )}
                            {p.status === 'paid' && p.payment_reference && (
                              <p className="text-xs text-green-600 mt-1">Ref: {p.payment_reference}</p>
                            )}
                          </div>
                          <span className="text-sm font-black text-gray-900 shrink-0">${fmt(Number(p.amount))}</span>
                          {['requested', 'under_review', 'approved', 'processing'].includes(p.status) ? (
                            <div className="flex gap-1.5 shrink-0 flex-wrap justify-end">
                              {(p.status === 'requested' || p.status === 'under_review') && (
                                <button onClick={() => processPayoutSimple(p.id, 'approve')} disabled={busy}
                                  className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold disabled:opacity-50">
                                  Approve
                                </button>
                              )}
                              {p.status === 'approved' && (
                                <button onClick={() => processPayoutSimple(p.id, 'mark_processing')} disabled={busy}
                                  className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold disabled:opacity-50">
                                  Mark Processing
                                </button>
                              )}
                              {(p.status === 'approved' || p.status === 'processing') && (
                                <button onClick={() => setPayoutAction({ payout: p, action: 'paid' })} disabled={busy}
                                  className="px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-bold disabled:opacity-50">
                                  Mark Paid
                                </button>
                              )}
                              <button onClick={() => setPayoutAction({ payout: p, action: 'reject' })} disabled={busy}
                                className="px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 text-xs font-bold disabled:opacity-50">
                                Reject
                              </button>
                            </div>
                          ) : (
                            <span className={`text-xs font-bold uppercase shrink-0 ${p.status === 'paid' ? 'text-green-600' : 'text-red-500'}`}>{p.status}</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Refund requests queue */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-6">
              <div className="px-5 py-4 border-b border-gray-50">
                <h3 className="text-sm font-bold text-gray-900">Refund Requests</h3>
                <p className="text-xs text-gray-400 mt-0.5">Approve calls Stripe's Refund API when the order has a captured payment (card), then reverses the ledger either way.</p>
              </div>
              {refundRequests.length === 0 ? (
                <div className="p-8 text-center text-sm text-gray-400">No refund requests yet.</div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {refundRequests.map((r) => (
                    <div key={r.id} className="flex items-center gap-4 px-5 py-3.5">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-800 truncate">Order {r.order_id}</p>
                        <p className="text-xs text-gray-400">{new Date(r.requested_at).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}{r.reason ? ` · ${r.reason}` : ''}</p>
                      </div>
                      <span className="text-sm font-black text-gray-900 shrink-0">${fmt(Number(r.amount))}</span>
                      {r.status === 'requested' || r.status === 'approved' ? (
                        <div className="flex gap-1.5 shrink-0">
                          <button onClick={() => processRefund(r.id, 'approve')} disabled={processingRefundId === r.id}
                            className="px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-bold disabled:opacity-50">
                            Approve &amp; Refund
                          </button>
                          <button onClick={() => processRefund(r.id, 'deny')} disabled={processingRefundId === r.id}
                            className="px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 text-xs font-bold disabled:opacity-50">
                            Deny
                          </button>
                        </div>
                      ) : (
                        <span className={`text-xs font-bold uppercase shrink-0 ${r.status === 'processed' ? 'text-green-600' : 'text-red-500'}`}>{r.status}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Opportunity payments — read-only reporting; disputes/refunds
                reuse the Marketplace Transactions dispute toggle below since
                every Opportunity payment also creates a real orders row. */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-6">
              <div className="px-5 py-4 border-b border-gray-50">
                <h3 className="text-sm font-bold text-gray-900">Opportunity Payments</h3>
                <p className="text-xs text-gray-400 mt-0.5">50% releases immediately on funding, 50% holds until work is confirmed complete.</p>
              </div>
              {opportunityPayments.length === 0 ? (
                <div className="p-8 text-center text-sm text-gray-400">No Opportunity payments yet.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-gray-400 border-b border-gray-100">
                        <th className="px-4 py-2.5 font-bold">Opportunity</th>
                        <th className="px-4 py-2.5 font-bold">Owner</th>
                        <th className="px-4 py-2.5 font-bold">Worker</th>
                        <th className="px-4 py-2.5 font-bold">Gross</th>
                        <th className="px-4 py-2.5 font-bold">Fee</th>
                        <th className="px-4 py-2.5 font-bold">Net</th>
                        <th className="px-4 py-2.5 font-bold">Available</th>
                        <th className="px-4 py-2.5 font-bold">Held</th>
                        <th className="px-4 py-2.5 font-bold">Payment</th>
                        <th className="px-4 py-2.5 font-bold">Work</th>
                        <th className="px-4 py-2.5 font-bold">Funded</th>
                      </tr>
                    </thead>
                    <tbody>
                      {opportunityPayments.map((p: any) => (
                        <tr key={p.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                          <td className="px-4 py-2.5 font-semibold text-gray-900 whitespace-nowrap max-w-[160px] truncate">{p.listing_title || p.listing_id}</td>
                          <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">{p.owner_name || p.owner_id?.slice(0, 8)}</td>
                          <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">{p.worker_name || p.worker_id?.slice(0, 8)}</td>
                          <td className="px-4 py-2.5 text-gray-900 font-bold whitespace-nowrap">${fmt(Number(p.gross_amount))}</td>
                          <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">${fmt(Number(p.fee_amount))}</td>
                          <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">${fmt(Number(p.net_amount))}</td>
                          <td className="px-4 py-2.5 text-green-600 whitespace-nowrap">${fmt(Number(p.initial_release_amount || 0))}</td>
                          <td className="px-4 py-2.5 text-amber-600 whitespace-nowrap">${fmt(Number(p.held_amount || 0))}</td>
                          <td className="px-4 py-2.5 whitespace-nowrap"><span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 uppercase">{p.payment_status}</span></td>
                          <td className="px-4 py-2.5 whitespace-nowrap"><span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 uppercase">{p.work_status.replace(/_/g, ' ')}</span></td>
                          <td className="px-4 py-2.5 text-gray-400 whitespace-nowrap">{p.funded_at ? new Date(p.funded_at).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' }) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Transaction list */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
                <h3 className="text-sm font-bold text-gray-900">
                  Marketplace Transactions
                </h3>
                <div className="flex gap-1.5">
                  {(["all", "paid", "pending"] as const).map(
                    (f) => (
                      <button
                        key={f}
                        onClick={() => setWalletFilter(f)}
                        className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                          walletFilter === f
                            ? "bg-blue-600 text-white"
                            : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                        }`}
                      >
                        {f.charAt(0).toUpperCase() + f.slice(1)}{" "}
                        {f === "all"
                          ? `(${walletTxs.length})`
                          : f === "paid"
                            ? `(${paidTxs.length})`
                            : `(${pendingTxs.length})`}
                      </button>
                    ),
                  )}
                </div>
              </div>

              {filteredWallet.length === 0 ? (
                <div className="p-12 text-center">
                  <DollarSign className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                  <p className="text-gray-400 text-sm font-medium">
                    No transactions yet
                  </p>
                  <p className="text-gray-300 text-xs mt-1">
                    Completed payments will appear here.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {filteredWallet.map((tx) => (
                    <div
                      key={tx.id}
                      className="flex items-center gap-4 px-5 py-4"
                    >
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${tx.status === "paid" ? "bg-green-100" : "bg-amber-100"}`}
                      >
                        {tx.status === "paid" ? (
                          <CheckCircle className="w-5 h-5 text-green-600" />
                        ) : (
                          <Clock className="w-5 h-5 text-amber-600" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-800 truncate">
                          {tx.title}
                        </p>
                        <div className="flex items-center gap-3 mt-0.5">
                          <p className="text-xs text-gray-400">
                            {new Date(
                              tx.date,
                            ).toLocaleDateString("en-CA", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })}
                          </p>
                          {tx.hostName && (
                            <p className="text-xs text-gray-400">
                              from {tx.hostName}
                            </p>
                          )}
                          {tx.renterName && (
                            <p className="text-xs text-gray-400">
                              to {tx.renterName}
                            </p>
                          )}
                          {tx.method && (
                            <p className="text-xs text-gray-400">
                              · {tx.method}
                            </p>
                          )}
                          {tx.disputeStatus === 'disputed' && (
                            <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-red-100 text-red-600">Disputed</span>
                          )}
                          {tx.refundStatus !== 'none' && (
                            <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-600">{tx.refundStatus.replace('_', ' ')}</span>
                          )}
                        </div>
                        <button
                          onClick={() => toggleDispute(tx.id, tx.disputeStatus)}
                          disabled={disputeUpdatingOrderId === tx.id}
                          className="text-[10px] font-bold text-gray-400 hover:text-red-500 mt-1 disabled:opacity-50"
                        >
                          {tx.disputeStatus === 'disputed' ? 'Resolve dispute' : 'Mark disputed'}
                        </button>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="flex items-center gap-2 justify-end">
                          <div className="text-right">
                            <p className="text-[10px] text-gray-400 font-semibold">
                              Total
                            </p>
                            <p className="text-sm font-black text-gray-900">
                              ${fmt(tx.amount)}
                            </p>
                          </div>
                          <div className="w-px h-8 bg-gray-100" />
                          <div className="text-right">
                            <p className="text-[10px] text-gray-400 font-semibold">
                              Filmons
                            </p>
                            <p
                              className={`text-sm font-black ${tx.status === "paid" ? "text-green-600" : "text-amber-500"}`}
                            >
                              +${fmt(tx.platformFee)}
                            </p>
                          </div>
                          <div className="w-px h-8 bg-gray-100" />
                          <div className="text-right">
                            <p className="text-[10px] text-gray-400 font-semibold">
                              Creator
                            </p>
                            <p className="text-sm font-black text-blue-600">
                              ${fmt(tx.creatorPayout)}
                            </p>
                          </div>
                        </div>
                        <span
                          className={`text-[10px] font-bold uppercase mt-1 inline-block ${tx.status === "paid" ? "text-green-500" : "text-amber-500"}`}
                        >
                          {tx.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
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
                      {selectedRequest.status.replace('_', ' ')}
                    </span>
                    <span className="text-[11px] text-gray-400">Submitted {new Date(selectedRequest.submittedAt).toLocaleDateString("en-CA", { year: 'numeric', month: "short", day: "numeric" })}</span>
                  </div>
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

      {payoutAction && (
        <div className="fixed inset-0 z-[9999] bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-5">
            <h3 className="text-sm font-bold text-gray-900 mb-1">
              {payoutAction.action === 'reject' ? 'Reject payout request' : 'Mark payout as paid'}
            </h3>
            <p className="text-xs text-gray-400 mb-4">${fmt(Number(payoutAction.payout.amount))} — {payoutAction.payout.profiles?.name || payoutAction.payout.host_id}</p>
            <input
              type="text"
              value={payoutActionInput}
              onChange={(e) => setPayoutActionInput(e.target.value)}
              placeholder={payoutAction.action === 'reject' ? 'Rejection reason (required)' : 'Payment reference (required)'}
              className="w-full border-2 border-gray-100 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-400 mb-2"
            />
            {payoutAction.action === 'paid' && (
              <textarea
                value={payoutActionNotes}
                onChange={(e) => setPayoutActionNotes(e.target.value)}
                placeholder="Notes (optional)"
                rows={2}
                className="w-full border-2 border-gray-100 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-400 mb-2"
              />
            )}
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => { setPayoutAction(null); setPayoutActionInput(''); setPayoutActionNotes(''); }}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-xs font-bold"
              >
                Cancel
              </button>
              <button
                onClick={submitPayoutAction}
                disabled={processingPayoutId === payoutAction.payout.id}
                className={`flex-1 py-2.5 rounded-xl text-white text-xs font-bold disabled:opacity-50 ${payoutAction.action === 'reject' ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'}`}
              >
                {payoutAction.action === 'reject' ? 'Reject' : 'Confirm Paid'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}