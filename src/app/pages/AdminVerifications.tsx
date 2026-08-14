import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import emailjs from '@emailjs/browser';
import { EMAILJS_CONFIG } from '../lib/emailjs-config';
import { supabase } from '../../lib/supabase';
import { projectId, publicAnonKey } from '/utils/supabase/info';
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
import { signVerificationDoc } from "../../lib/upload";

// ── Types ──────────────────────────────────────────────────────────
// Mirrors identity_verifications (+ joined profiles for contact info).
// Document fields are storage PATHS, not URLs — resolve with SignedImg.
type VerificationStatus = "pending" | "under_review" | "changes_requested" | "approved" | "denied";

interface VerificationRequest {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  userPhone: string;
  fullName: string;
  dob?: string;
  streetAddr?: string;
  unit?: string;
  city?: string;
  province?: string;
  postalCode?: string;
  residenceCountry?: string;
  issuingCountry?: string;
  idType?: string;
  idNumber?: string;
  idExpiryDate?: string;
  idFrontPath?: string;
  idBackPath?: string;
  proofOfAddressPath?: string;
  selfiePath?: string;
  status: VerificationStatus;
  decisionReason?: string;
  documentsDeletedAt?: string | null;
  submittedAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
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
      };
    });
  } catch {
    return [];
  }
}

// ── Sub-components ────────────────────────────────────────────────

function PhotoViewer({
  path,
  label,
}: {
  path?: string;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  // `path` is a storage path (verification-documents bucket, private) or,
  // for older/failed-upload rows, a raw base64 string — either way we need
  // a real URL to render. Signed URLs expire, so mint one fresh here rather
  // than trusting anything persisted.
  const [src, setSrc] = useState<string | null>(null);
  const [loadingUrl, setLoadingUrl] = useState(false);

  useEffect(() => {
    if (!path) { setSrc(null); return; }
    if (path.startsWith('data:')) { setSrc(path); return; } // legacy base64 fallback
    setLoadingUrl(true);
    signVerificationDoc(path, 600).then(url => { setSrc(url); setLoadingUrl(false); });
  }, [path]);

  if (!path) {
    return (
      <div className="h-28 flex flex-col items-center justify-center bg-gray-50 border border-dashed border-gray-200 rounded-xl gap-2">
        <FileText className="w-6 h-6 text-gray-300" />
        <p className="text-xs text-gray-400">Not uploaded</p>
      </div>
    );
  }
  if (loadingUrl || !src) {
    return (
      <div className="h-28 flex flex-col items-center justify-center bg-gray-50 border border-gray-100 rounded-xl gap-2">
        <RefreshCw className="w-5 h-5 text-gray-300 animate-spin" />
      </div>
    );
  }
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="relative group w-full rounded-xl overflow-hidden border border-gray-200 bg-gray-50 hover:border-blue-300 transition-colors"
      >
        <img
          src={src}
          alt={label}
          className="w-full h-28 object-cover"
        />
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all flex items-center justify-center">
          <Eye className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow" />
        </div>
        <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[10px] font-semibold py-1 text-center">
          {label}
        </div>
      </button>
      {open && (
        <div
          className="fixed inset-0 z-[9999] bg-black/90 flex items-center justify-center p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="relative max-w-2xl w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="absolute -top-10 right-0 text-white/70 hover:text-white text-sm"
              onClick={() => setOpen(false)}
            >
              ✕ Close
            </button>
            <img
              src={src}
              alt={label}
              className="w-full rounded-2xl shadow-2xl"
            />
            <p className="text-center text-white/60 text-sm mt-3">
              {label}
            </p>
          </div>
        </div>
      )}
    </>
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

  // Wallet state
  const [walletTxs, setWalletTxs] = useState<WalletTx[]>([]);
  const [walletFilter, setWalletFilter] = useState<
    "all" | "paid" | "pending"
  >("all");
  const [payoutRequests, setPayoutRequests] = useState<any[]>([]);
  const [processingPayoutId, setProcessingPayoutId] = useState<string | null>(null);

  const ADMIN_PASSWORD = "filmons2024";

  useEffect(() => {
    const adminAuth = sessionStorage.getItem(
      "adminAuthenticated",
    );
    if (adminAuth === "true") {
      setIsAuthenticated(true);
      setAdminName(sessionStorage.getItem("adminName") || "Admin");
      loadAll().catch(console.error);
    }
  }, []);

  const loadAll = async () => {
    // ── VERIFICATIONS ─────────────────────────────────────────────
    // identity_verifications holds the KYC data; profiles (embedded via
    // the user_id FK) supplies contact info for display only.
    let serverReqs: VerificationRequest[] = [];
    try {
      const { data, error } = await supabase
        .from('identity_verifications')
        .select('*, profiles(name, email, phone)')
        .order('submitted_at', { ascending: false });

      if (!error && data) {
        serverReqs = data.map((row: any) => {
          const profile = row.profiles || {};
          return {
            id:                 row.id,
            userId:             row.user_id,
            userName:           profile.name || [row.legal_first_name, row.legal_last_name].filter(Boolean).join(' '),
            userEmail:          profile.email || '',
            userPhone:          profile.phone || '',
            fullName:           [row.legal_first_name, row.legal_last_name].filter(Boolean).join(' '),
            dob:                row.date_of_birth || undefined,
            streetAddr:         row.address_line1 || undefined,
            unit:               row.address_line2 || undefined,
            city:               row.city || undefined,
            province:           row.province_state || undefined,
            postalCode:         row.postal_code || undefined,
            residenceCountry:   row.country_of_residence || undefined,
            issuingCountry:     row.id_issuing_country || undefined,
            idType:             row.id_type || undefined,
            idNumber:           row.id_number || undefined,
            idExpiryDate:       row.id_expiry_date || undefined,
            idFrontPath:        row.id_front_path || undefined,
            idBackPath:         row.id_back_path || undefined,
            proofOfAddressPath: row.proof_of_address_path || undefined,
            selfiePath:         row.selfie_path || undefined,
            status:             row.status || 'pending',
            decisionReason:     row.decision_reason || undefined,
            documentsDeletedAt: row.documents_deleted_at || null,
            submittedAt:        row.submitted_at || row.created_at,
            reviewedAt:         row.reviewed_at || null,
            reviewedBy:         row.reviewed_by || null,
          } as VerificationRequest;
        });
      } else if (error) {
        console.warn('identity_verifications query failed:', error.message);
      }
    } catch (e) {
      console.warn('identity_verifications query threw:', e);
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
      setPayoutRequests(data || []);
    } catch (e) {
      console.warn('payout_requests query failed:', e);
    }
  };

  const processPayout = async (payoutRequestId: string, action: 'paid' | 'rejected') => {
    setProcessingPayoutId(payoutRequestId);
    try {
      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/admin-process-payout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${publicAnonKey}` },
        body: JSON.stringify({ payoutRequestId, action, adminName }),
      });
      const result = await res.json();
      if (!res.ok || result.error) throw new Error(result.error || 'Failed');
      toast.success(action === 'paid' ? 'Payout marked as paid' : 'Payout rejected');
      loadAll().catch(console.error);
    } catch (e: any) {
      toast.error(e?.message || 'Could not process payout');
    } finally {
      setProcessingPayoutId(null);
    }
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === ADMIN_PASSWORD) {
      const name = adminName.trim() || "Admin";
      setIsAuthenticated(true);
      setAdminName(name);
      sessionStorage.setItem("adminAuthenticated", "true");
      sessionStorage.setItem("adminName", name);
      loadAll().catch(console.error);
      toast.success("Admin access granted");
    } else {
      toast.error("Incorrect password");
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    sessionStorage.removeItem("adminAuthenticated");
    sessionStorage.removeItem("adminName");
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
      action: 'viewed_document',
      detail: 'Opened review',
    });
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
              placeholder="Your name (for the review record)"
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
                          <div className="w-11 h-11 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center text-white font-black text-base shrink-0">
                            {req.userName
                              ?.charAt(0)
                              ?.toUpperCase() || "?"}
                          </div>
                          <div>
                            <p className="font-bold text-gray-900 text-sm">
                              {req.userName}
                            </p>
                            <p className="text-xs text-gray-400">
                              @{req.userName?.toLowerCase().replace(/\s+/g, '') || req.userId.slice(0, 8)}
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

                      <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                        <div className="flex items-center gap-1.5 text-gray-500">
                          <Calendar className="w-3.5 h-3.5 text-gray-400" />
                          <span>
                            Submitted{" "}
                            {new Date(req.submittedAt).toLocaleDateString("en-CA", {
                              month: "short",
                              day: "numeric",
                            })}
                          </span>
                        </div>
                        {req.residenceCountry && (
                          <div className="flex items-center gap-1.5 text-gray-500">
                            <Globe className="w-3.5 h-3.5 text-gray-400" />
                            <span className="truncate">{req.residenceCountry}</span>
                          </div>
                        )}
                        {req.issuingCountry && (
                          <div className="flex items-center gap-1.5 text-gray-500">
                            <MapPin className="w-3.5 h-3.5 text-gray-400" />
                            <span className="truncate">ID: {req.issuingCountry}</span>
                          </div>
                        )}
                        {req.idType && (
                          <div className="flex items-center gap-1.5 text-gray-500">
                            <CreditCard className="w-3.5 h-3.5 text-gray-400" />
                            <span className="truncate">{req.idType}</span>
                          </div>
                        )}
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
                <p className="text-xs text-gray-400 mt-0.5">No automated payout provider is configured yet — process these manually (e-transfer, etc.), then mark paid here.</p>
              </div>
              {payoutRequests.length === 0 ? (
                <div className="p-8 text-center text-sm text-gray-400">No payout requests yet.</div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {payoutRequests.map((p) => (
                    <div key={p.id} className="flex items-center gap-4 px-5 py-3.5">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-800 truncate">{p.profiles?.name || p.host_id}</p>
                        <p className="text-xs text-gray-400">{new Date(p.requested_at).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })} · {p.profiles?.email || ''}</p>
                      </div>
                      <span className="text-sm font-black text-gray-900 shrink-0">${fmt(Number(p.amount))}</span>
                      {p.status === 'requested' || p.status === 'processing' ? (
                        <div className="flex gap-1.5 shrink-0">
                          <button onClick={() => processPayout(p.id, 'paid')} disabled={processingPayoutId === p.id}
                            className="px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-bold disabled:opacity-50">
                            Mark Paid
                          </button>
                          <button onClick={() => processPayout(p.id, 'rejected')} disabled={processingPayoutId === p.id}
                            className="px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 text-xs font-bold disabled:opacity-50">
                            Reject
                          </button>
                        </div>
                      ) : (
                        <span className={`text-xs font-bold uppercase shrink-0 ${p.status === 'paid' ? 'text-green-600' : 'text-red-500'}`}>{p.status}</span>
                      )}
                    </div>
                  ))}
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
                        </div>
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

      {/* ── Verification Detail Modal ─────────────────────────────── */}
      {selectedRequest && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50"
          onClick={() => setSelectedRequest(null)}
        >
          <div
            className="bg-white w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-3xl shadow-2xl"
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
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center text-white font-black text-lg">
                  {selectedRequest.userName
                    ?.charAt(0)
                    ?.toUpperCase() || "?"}
                </div>
                <div>
                  <h2 className="text-lg font-black text-gray-900">
                    {selectedRequest.userName}
                  </h2>
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
                </div>
              </div>
              <button
                onClick={() => setSelectedRequest(null)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-white/80 hover:bg-white text-gray-500 shadow"
              >
                ✕
              </button>
            </div>

            <div className="p-5 space-y-5">
              {/* Account info */}
              <section>
                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                  <User className="w-3.5 h-3.5" /> Account
                </h3>
                <div className="bg-gray-50 rounded-2xl overflow-hidden">
                  <InfoRow
                    icon={
                      <User className="w-4 h-4 text-blue-500" />
                    }
                    label="Full Legal Name"
                    value={
                      selectedRequest.fullName ||
                      selectedRequest.userName
                    }
                  />
                  <InfoRow
                    icon={
                      <Mail className="w-4 h-4 text-blue-500" />
                    }
                    label="Email"
                    value={selectedRequest.userEmail}
                  />
                  <InfoRow
                    icon={
                      <Phone className="w-4 h-4 text-blue-500" />
                    }
                    label="Phone"
                    value={selectedRequest.userPhone || undefined}
                  />
                  <InfoRow
                    icon={
                      <CreditCard className="w-4 h-4 text-gray-400" />
                    }
                    label="Government ID Number"
                    value={selectedRequest.idNumber}
                  />
                </div>
              </section>

              {/* Personal details */}
              <section>
                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                  <FileText className="w-3.5 h-3.5" /> Personal
                  Details
                </h3>
                <div className="bg-gray-50 rounded-2xl overflow-hidden">
                  <InfoRow
                    icon={
                      <Calendar className="w-4 h-4 text-purple-500" />
                    }
                    label="Date of Birth"
                    value={
                      selectedRequest.dob
                        ? new Date(
                            selectedRequest.dob + "T00:00:00",
                          ).toLocaleDateString("en-CA", {
                            year: "numeric",
                            month: "long",
                            day: "numeric",
                          })
                        : undefined
                    }
                  />
                  <InfoRow
                    icon={
                      <MapPin className="w-4 h-4 text-red-400" />
                    }
                    label="Street Address"
                    value={[selectedRequest.streetAddr, selectedRequest.unit].filter(Boolean).join(', ')}
                  />
                  <InfoRow
                    icon={
                      <MapPin className="w-4 h-4 text-red-400" />
                    }
                    label="City / Province / Postal"
                    value={
                      [
                        selectedRequest.city,
                        selectedRequest.province,
                        selectedRequest.postalCode,
                      ]
                        .filter(Boolean)
                        .join(", ") || undefined
                    }
                  />
                  <InfoRow
                    icon={
                      <Globe className="w-4 h-4 text-indigo-500" />
                    }
                    label="Country of ID"
                    value={selectedRequest.issuingCountry}
                  />
                  <InfoRow
                    icon={
                      <CreditCard className="w-4 h-4 text-indigo-500" />
                    }
                    label="ID Type"
                    value={selectedRequest.idType}
                  />
                  <InfoRow
                    icon={
                      <CreditCard className="w-4 h-4 text-indigo-500" />
                    }
                    label="ID Number"
                    value={selectedRequest.idNumber}
                  />
                  <InfoRow
                    icon={
                      <Calendar className="w-4 h-4 text-indigo-500" />
                    }
                    label="ID Expiry"
                    value={selectedRequest.idExpiryDate}
                  />
                </div>
              </section>

              {/* Documents */}
              <section>
                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                  <Camera className="w-3.5 h-3.5" /> Submitted
                  Documents
                </h3>
                {selectedRequest.documentsDeletedAt ? (
                  <div className="bg-gray-50 border border-gray-100 rounded-2xl p-5 text-center">
                    <Trash2 className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                    <p className="text-sm font-bold text-gray-600">Identity documents removed</p>
                    <p className="text-xs text-gray-400 mt-1">The submitted documents were securely removed after the verification decision.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs font-bold text-gray-500 mb-1.5 text-center">
                        ID Front
                      </p>
                      <PhotoViewer
                        path={selectedRequest.idFrontPath}
                        label="ID Front"
                      />
                    </div>
                    {selectedRequest.idBackPath && (
                      <div>
                        <p className="text-xs font-bold text-gray-500 mb-1.5 text-center">
                          ID Back
                        </p>
                        <PhotoViewer
                          path={selectedRequest.idBackPath}
                          label="ID Back"
                        />
                      </div>
                    )}
                    <div>
                      <p className="text-xs font-bold text-gray-500 mb-1.5 text-center">
                        Proof of Address
                      </p>
                      <PhotoViewer
                        path={selectedRequest.proofOfAddressPath}
                        label="Proof of Address"
                      />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-gray-500 mb-1.5 text-center">
                        Selfie
                      </p>
                      <PhotoViewer
                        path={selectedRequest.selfiePath}
                        label="Selfie"
                      />
                    </div>
                  </div>
                )}
              </section>

              {/* Timeline */}
              <section className="bg-gray-50 rounded-2xl p-4 text-sm space-y-1.5">
                <p className="text-gray-500">
                  <span className="font-semibold text-gray-700">
                    Submitted:
                  </span>{" "}
                  {new Date(
                    selectedRequest.submittedAt,
                  ).toLocaleString("en-CA")}
                </p>
                {selectedRequest.reviewedAt && (
                  <>
                    <p className="text-gray-500">
                      <span className="font-semibold text-gray-700">
                        Reviewed:
                      </span>{" "}
                      {new Date(
                        selectedRequest.reviewedAt,
                      ).toLocaleString("en-CA")}
                    </p>
                    <p className="text-gray-500">
                      <span className="font-semibold text-gray-700">
                        By:
                      </span>{" "}
                      {selectedRequest.reviewedBy}
                    </p>
                  </>
                )}
              </section>

              {/* Actions — only while the application is still active (not a final decision yet) */}
              {(selectedRequest.status === "pending" || selectedRequest.status === "under_review") && (
                <div className="flex gap-3 flex-wrap">
                  <button
                    className="flex-1 flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white font-bold rounded-2xl py-3.5 transition-colors min-w-[120px]"
                    onClick={() => handleDecision(selectedRequest, "approve")}
                  >
                    <CheckCircle className="w-5 h-5" /> Approve Creator+
                  </button>
                  <button
                    className="flex-1 flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded-2xl py-3.5 transition-colors min-w-[120px]"
                    onClick={() => openRejectModal(selectedRequest, 'denied')}
                  >
                    <XCircle className="w-5 h-5" /> Deny
                  </button>
                  <button
                    className="w-full flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-2xl py-3 transition-colors"
                    onClick={() => openRejectModal(selectedRequest, 'changes_requested')}
                  >
                    <RefreshCw className="w-4 h-4" /> Request Changes
                  </button>
                </div>
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