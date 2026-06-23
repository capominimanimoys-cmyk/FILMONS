import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import emailjs from '@emailjs/browser';
import { EMAILJS_CONFIG } from '../lib/emailjs-config';
import { supabase } from '../../lib/supabase';
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
  ArrowUpRight,
  MapPin,
  Calendar,
  CreditCard,
  Camera,
  RefreshCw,
  Globe,
  Zap,
  ShoppingBag,
  Rocket,
} from "lucide-react";
import { toast } from "sonner";
import { fpApi, FP } from "../lib/fpSystem";
import { projectId, publicAnonKey } from "/utils/supabase/info";

// ── Server helpers ─────────────────────────────────────────────────
const _BASE = `https://${projectId}.supabase.co/functions/v1/make-server-ec8fe879`;
const _H = {
  "Content-Type": "application/json",
  Authorization: `Bearer ${publicAnonKey}`,
};
async function _sGet(path: string) {
  const r = await fetch(`${_BASE}${path}`, { headers: _H });
  return r.json();
}
async function _sPut(path: string, body: any) {
  const r = await fetch(`${_BASE}${path}`, {
    method: "PUT",
    headers: _H,
    body: JSON.stringify(body),
  });
  return r.json();
}

// ── Types ──────────────────────────────────────────────────────────
interface VerificationRequest {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  userPhone: string;
  phoneVerified: boolean;
  emailVerified: boolean;
  fullName: string;
  dob?: string;
  streetAddr?: string;
  city?: string;
  province?: string;
  postalCode?: string;
  issuingCountry?: string;
  idType?: string;
  utilityBillPhoto?: string;
  govIdPhoto?: string;
  selfiePhoto?: string;
  // legacy
  idNumber?: string;
  idPhoto?: string;
  status: "pending" | "approved" | "denied" | "rejected" | "needs_resubmission";
  rejectionReason?: string;
  adminNotes?: string;
  submittedAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
}

interface WalletTx {
  id: string;
  amount: number;
  platformFee: number;
  creatorPayout: number;
  title: string;
  status: "paid" | "pending";
  date: string;
  hostName?: string;
  renterName?: string;
  method?: string;
}

const PLATFORM_FEE_PCT = 0.15; // 15% commission
const fmt = (n: number) =>
  n.toLocaleString("en-CA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

// ── Helpers ────────────────────────────────────────────────────────
function loadWalletTxs(): WalletTx[] {
  try {
    const convs: any[] = JSON.parse(
      localStorage.getItem("filmons_conversations") || "[]",
    );
    const users: any[] = JSON.parse(
      localStorage.getItem("filmons_users") ||
        localStorage.getItem("users") ||
        "[]",
    );
    const getUser = (id: string) =>
      users.find((u: any) => u.id === id);
    const txs: WalletTx[] = [];
    convs.forEach((conv: any) => {
      conv.messages?.forEach((msg: any) => {
        if (
          msg.type === "payment_request" &&
          msg.paymentRequest
        ) {
          const pr = msg.paymentRequest;
          const amount = Number(pr.amount) || 0;
          const fee = parseFloat(
            (amount * PLATFORM_FEE_PCT).toFixed(2),
          );
          const payout = parseFloat(
            (amount * (1 - PLATFORM_FEE_PCT)).toFixed(2),
          );
          const sender = getUser(msg.senderId);
          const receiver = conv.participants
            ?.filter((id: string) => id !== msg.senderId)
            .map((id: string) => getUser(id))
            .filter(Boolean)[0];
          txs.push({
            id: msg.id || `tx_${Math.random()}`,
            amount,
            platformFee: fee,
            creatorPayout: payout,
            title:
              pr.description || pr.listingTitle || "Payment",
            status: pr.status || "pending",
            date: msg.createdAt || new Date().toISOString(),
            hostName: sender?.name,
            renterName: receiver?.name,
            method: pr.paymentMethod,
          });
        }
      });
    });
    txs.sort(
      (a, b) =>
        new Date(b.date).getTime() - new Date(a.date).getTime(),
    );
    return txs;
  } catch {
    return [];
  }
}

// ── Sub-components ────────────────────────────────────────────────

function PhotoViewer({
  src,
  label,
}: {
  src?: string;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  if (!src) {
    return (
      <div className="h-28 flex flex-col items-center justify-center bg-gray-50 border border-dashed border-gray-200 rounded-xl gap-2">
        <FileText className="w-6 h-6 text-gray-300" />
        <p className="text-xs text-gray-400">Not uploaded</p>
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
    "all" | "pending" | "approved" | "denied" | "rejected" | "needs_resubmission"
  >("pending");

  // Rejection / resubmission modal
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<{ request: VerificationRequest; type: 'rejected' | 'needs_resubmission' } | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const REJECTION_PRESETS = [
    'Blurry or unreadable ID',
    'Expired document',
    'Name mismatch between ID and selfie',
    'Incomplete document — front and back required',
    'Selfie does not match ID photo',
    'Document not accepted in your region',
    'Suspected duplicate account',
  ];

  // Wallet state
  const [walletTxs, setWalletTxs] = useState<WalletTx[]>([]);
  const [fpTxs, setFpTxs] = useState<any[]>([]);
  const [fpAccounts, setFpAccounts] = useState<any[]>([]);
  const [walletFilter, setWalletFilter] = useState<
    "all" | "paid" | "pending"
  >("all");

  const ADMIN_PASSWORD = "filmons2024";

  useEffect(() => {
    const adminAuth = sessionStorage.getItem(
      "adminAuthenticated",
    );
    if (adminAuth === "true") {
      setIsAuthenticated(true);
      loadAll().catch(console.error);
    }
  }, []);

  const loadAll = async () => {
    // ── VERIFICATIONS ─────────────────────────────────────────────
    // Query Supabase directly (bypasses edge function host allowlist)
    let serverReqs: VerificationRequest[] = [];
    try {
      const { data, error } = await supabase
        .from('verification_requests')
        .select('*')
        .order('submitted_at', { ascending: false });

      if (!error && data) {
        serverReqs = data.map((row: any) => {
          const m = (typeof row.metadata === 'string'
            ? (() => { try { return JSON.parse(row.metadata); } catch { return {}; } })()
            : row.metadata) || {};
          return {
            id:               row.id,
            userId:           row.user_id,
            userName:         m.userName    || row.full_name || '',
            userEmail:        row.email     || m.email       || '',
            userPhone:        m.phone       || '',
            phoneVerified:    m.phoneVerified ?? false,
            emailVerified:    m.emailVerified ?? false,
            fullName:         row.full_name  || m.fullName   || '',
            dob:              m.dob          || undefined,
            streetAddr:       m.streetAddr   || m.address?.streetAddr || undefined,
            city:             m.city         || m.address?.city       || undefined,
            province:         m.province     || m.address?.province   || undefined,
            postalCode:       m.postalCode   || m.address?.postalCode || undefined,
            issuingCountry:   m.issuingCountry || undefined,
            idType:           m.idType        || undefined,
            govIdPhoto:       m.govIdUrl      || m.govIdPhoto    || undefined,
            utilityBillPhoto: m.utilityBillUrl || m.utilityBillPhoto || undefined,
            selfiePhoto:      m.selfieUrl     || m.selfiePhoto   || undefined,
            status:           row.status      || 'pending',
            rejectionReason:  m.rejectionReason || undefined,
            adminNotes:       m.adminNotes     || undefined,
            submittedAt:      row.submitted_at || new Date().toISOString(),
            reviewedAt:       row.reviewed_at  || null,
            reviewedBy:       row.reviewed_by  || null,
          } as VerificationRequest;
        });
      }
    } catch (e) {
      console.warn('Supabase direct query failed:', e);
    }

    // Merge with localStorage (catches submissions that failed to reach server)
    const localReqs: VerificationRequest[] = (() => {
      try { return JSON.parse(localStorage.getItem('verificationRequests') || '[]'); } catch { return []; }
    })();

    const merged = [...serverReqs];
    localReqs.forEach((r: any) => {
      if (!merged.some((s: any) => s.id === r.id)) merged.push(r);
    });
    merged.sort((a: any, b: any) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
    setRequests(merged);

    // ── WALLET ─────────────────────────────────────────────────────
    setWalletTxs(loadWalletTxs());

    // ── FP SYSTEM (non-blocking) ──────────────────────────────────
    try {
      const [txs, accts] = await Promise.all([
        fpApi.getAllTransactionsAsync(),
        fpApi.getAllAccountsAsync(),
      ]);
      setFpTxs(txs);
      setFpAccounts(accts);
    } catch { /* FP system offline */ }
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === ADMIN_PASSWORD) {
      setIsAuthenticated(true);
      sessionStorage.setItem("adminAuthenticated", "true");
      loadAll().catch(console.error);
      toast.success("Admin access granted");
    } else {
      toast.error("Incorrect password");
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    sessionStorage.removeItem("adminAuthenticated");
    setPassword("");
    toast.info("Logged out");
  };

  const sendUserEmail = async (request: VerificationRequest, status: string, reason?: string) => {
    if (!request.userEmail) return;
    const isApproved = status === 'approved';
    const isResubmit = status === 'needs_resubmission';
    emailjs.send(
      EMAILJS_CONFIG.serviceId,
      EMAILJS_CONFIG.templates.verificationSubmission,
      {
        to_email:    request.userEmail,
        to_name:     request.userName || request.fullName,
        user_name:   request.userName || request.fullName,
        status:      isApproved ? 'Approved ✅' : isResubmit ? 'New Documents Required 📄' : 'Denied ❌',
        message:     isApproved
          ? 'Congratulations! Your identity has been verified and your account has been upgraded to Creator+. All Creator+ features are now unlocked.'
          : isResubmit
          ? `The admin has reviewed your submission and needs updated documents:\n\n${reason || 'Please resubmit with clearer documents.'}\n\nLog in and visit the Verification page to upload new documents.`
          : `Your verification request was denied.\n\nReason: ${reason || 'Please review your documents and resubmit.'}\n\nYou may resubmit after correcting the issue.`,
        site_url:    window.location.origin,
      },
      EMAILJS_CONFIG.publicKey
    ).catch(e => console.warn('User email failed:', e));
  };

  const handleDecision = async (
    request: VerificationRequest,
    status: "approved" | "rejected" | "needs_resubmission",
    reason?: string,
  ) => {
    const now = new Date().toISOString();

    try {
      // ── Update Supabase table directly ────────────────────────
      const patch: any = {
        status:      status,
        reviewed_at: now,
        reviewed_by: "Admin",
      };
      if (reason) {
        // Merge rejection reason into metadata
        const { data: existing } = await supabase
          .from('verification_requests')
          .select('metadata')
          .eq('id', request.id)
          .single();
        const currentMeta = (typeof existing?.metadata === 'string'
          ? (() => { try { return JSON.parse(existing.metadata); } catch { return {}; } })()
          : existing?.metadata) || {};
        patch.metadata = { ...currentMeta, rejectionReason: reason, adminNotes: reason };
      }
      await supabase
        .from('verification_requests')
        .update(patch)
        .eq('id', request.id);

      // Also try edge function (non-blocking, may be blocked)
      fetch(`${_BASE}/verifications/${request.id}/decision`, {
        method: "POST", headers: _H,
        body: JSON.stringify({ status, reviewedAt: now, reviewedBy: "Admin", userId: request.userId, rejectionReason: reason }),
      }).catch(() => {});

      // ── Update profiles table directly ────────────────────────
      const profilePatch: any = { verification_status: status };
      if (status === "approved") {
        profilePatch.is_verified  = true;
        profilePatch.account_type = "business";
        profilePatch.account_mode = "business";
      } else if (status === "rejected" || status === "denied") {
        profilePatch.is_verified = false;
      }
      await supabase.from('profiles').update(profilePatch).eq('id', request.userId);
      const lsUsers: any[] = JSON.parse(localStorage.getItem("filmons_users") || "[]");
      localStorage.setItem("filmons_users", JSON.stringify(lsUsers.map(u => {
        if (u.id !== request.userId) return u;
        const patch: any = { verificationStatus: status };
        if (status === "approved") { patch.isVerified = true; patch.accountType = "business"; patch.accountMode = "business"; }
        return { ...u, ...patch };
      })));

      // Update current session if same user
      try {
        const SESSION_KEY = "filmons_current_user";
        const session = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
        if (session?.id === request.userId) {
          const patch: any = { verificationStatus: status };
          if (status === "approved") { patch.isVerified = true; patch.accountType = "business"; patch.accountMode = "business"; }
          localStorage.setItem(SESSION_KEY, JSON.stringify({ ...session, ...patch }));
        }
      } catch {}

      // Update verificationRequests cache
      const localReqs: any[] = JSON.parse(localStorage.getItem("verificationRequests") || "[]");
      localStorage.setItem("verificationRequests", JSON.stringify(
        localReqs.map(r => r.id === request.id
          ? { ...r, status, reviewedAt: now, reviewedBy: "Admin", rejectionReason: reason || r.rejectionReason }
          : r)
      ));

      // ── Send email to user ─────────────────────────────────────
      await sendUserEmail(request, status, reason);

      toast.success(
        status === "approved"
          ? `✅ ${request.userName} approved — upgraded to Creator+`
          : status === "needs_resubmission"
          ? `📄 Resubmission requested from ${request.userName}`
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

  const openRejectModal = (request: VerificationRequest, type: 'rejected' | 'needs_resubmission') => {
    setRejectTarget({ request, type });
    setRejectionReason('');
    setShowRejectModal(true);
  };
  // ── Derived stats ──────────────────────────────────────────────
  const filteredRequests = requests.filter(
    (r) => filter === "all" || r.status === filter,
  );
  const pendingCount = requests.filter(r => r.status === "pending").length;
  const approvedCount = requests.filter(r => r.status === "approved").length;
  const deniedCount = requests.filter(r => r.status === "rejected" || r.status === "denied").length;
  const resubmitCount = requests.filter(r => r.status === "needs_resubmission").length;

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
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
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
                  value: pendingCount,
                  icon: (
                    <Clock className="w-5 h-5 text-amber-500" />
                  ),
                  bg: "bg-amber-50",
                  action: () => setFilter("pending"),
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
                  "approved",
                  "denied",
                ] as const
              ).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-colors capitalize border ${
                    filter === f
                      ? f === "pending"
                        ? "bg-amber-500 text-white border-amber-500"
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
                    : `${f.charAt(0).toUpperCase() + f.slice(1)} (${requests.filter((r) => r.status === f).length})`}
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
                    className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow cursor-pointer overflow-hidden"
                    onClick={() => setSelectedRequest(req)}
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
                              {req.userEmail}
                            </p>
                          </div>
                        </div>
                        <span
                          className={`text-[11px] font-black px-2.5 py-1 rounded-full uppercase ${
                            req.status === "pending"
                              ? "bg-amber-100 text-amber-700"
                              : req.status === "approved"
                                ? "bg-green-100 text-green-700"
                                : "bg-red-100 text-red-700"
                          }`}
                        >
                          {req.status}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                        {req.fullName && (
                          <div className="flex items-center gap-1.5 text-gray-500">
                            <User className="w-3.5 h-3.5 text-gray-400" />
                            <span className="truncate">
                              {req.fullName}
                            </span>
                          </div>
                        )}
                        {req.idType && (
                          <div className="flex items-center gap-1.5 text-gray-500">
                            <CreditCard className="w-3.5 h-3.5 text-gray-400" />
                            <span className="truncate">
                              {req.idType}
                            </span>
                          </div>
                        )}
                        {req.city && (
                          <div className="flex items-center gap-1.5 text-gray-500">
                            <MapPin className="w-3.5 h-3.5 text-gray-400" />
                            <span className="truncate">
                              {[req.city, req.province]
                                .filter(Boolean)
                                .join(", ")}
                            </span>
                          </div>
                        )}
                        {req.dob && (
                          <div className="flex items-center gap-1.5 text-gray-500">
                            <Calendar className="w-3.5 h-3.5 text-gray-400" />
                            <span>
                              {new Date(
                                req.dob + "T00:00:00",
                              ).toLocaleDateString("en-CA", {
                                year: "numeric",
                                month: "short",
                                day: "numeric",
                              })}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Document preview thumbnails */}
                      <div className="flex gap-2 mb-3">
                        {[
                          {
                            src: req.govIdPhoto || req.idPhoto,
                            label: "Gov ID",
                          },
                          {
                            src: req.utilityBillPhoto,
                            label: "Utility",
                          },
                          {
                            src: req.selfiePhoto,
                            label: "Selfie",
                          },
                        ].map((doc) =>
                          doc.src ? (
                            <div
                              key={doc.label}
                              className="w-14 h-14 rounded-lg overflow-hidden border border-gray-200 bg-gray-50 relative"
                            >
                              <img
                                src={doc.src}
                                alt={doc.label}
                                className="w-full h-full object-cover"
                              />
                              <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[8px] text-center py-0.5 font-semibold">
                                {doc.label}
                              </div>
                            </div>
                          ) : (
                            <div
                              key={doc.label}
                              className="w-14 h-14 rounded-lg border border-dashed border-gray-200 flex flex-col items-center justify-center gap-0.5"
                            >
                              <FileText className="w-4 h-4 text-gray-300" />
                              <span className="text-[8px] text-gray-300 font-semibold">
                                {doc.label}
                              </span>
                            </div>
                          ),
                        )}
                      </div>

                      <p className="text-[11px] text-gray-400 mb-3">
                        Submitted{" "}
                        {new Date(
                          req.submittedAt,
                        ).toLocaleDateString("en-CA", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>

                      {req.status === "pending" && (
                        <div className="flex gap-2">
                          <button
                            className="flex-1 flex items-center justify-center gap-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-bold rounded-xl py-2 transition-colors"
                            onClick={(e) => { e.stopPropagation(); handleDecision(req, "approved"); }}
                          >
                            <CheckCircle className="w-3.5 h-3.5" /> Approve
                          </button>
                          <button
                            className="flex-1 flex items-center justify-center gap-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl py-2 transition-colors"
                            onClick={(e) => { e.stopPropagation(); openRejectModal(req, 'rejected'); }}
                          >
                            <XCircle className="w-3.5 h-3.5" /> Deny
                          </button>
                          <button
                            className="flex items-center justify-center gap-1 bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold rounded-xl py-2 px-2 transition-colors"
                            title="Request new documents"
                            onClick={(e) => { e.stopPropagation(); openRejectModal(req, 'needs_resubmission'); }}
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
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
                    15% commission on all completed marketplace
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
                    85% of volume
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

            {/* FP Economy stats */}
            <div className="bg-gradient-to-br from-indigo-700 to-purple-800 rounded-3xl p-6 text-white mb-6 shadow-xl">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center">
                  <Zap className="w-6 h-6 text-yellow-300" />
                </div>
                <div>
                  <h2 className="text-lg font-black">
                    FP (Filmons Points) Economy
                  </h2>
                  <p className="text-indigo-200 text-xs">
                    Buy: ${FP.BUY_RATE}/FP · Payout: $
                    {FP.PAYOUT_RATE}/FP · ~32.5% spread margin
                  </p>
                </div>
              </div>
              {(() => {
                const purchases = fpTxs.filter(
                  (t: any) => t.type === "purchase",
                );
                const withdrawals = fpTxs.filter(
                  (t: any) => t.type === "withdrawal",
                );
                const boosts = fpTxs.filter(
                  (t: any) =>
                    t.type === "boost_post" ||
                    t.type === "boost_listing",
                );
                const totalPurchasedFP = purchases.reduce(
                  (s: number, t: any) =>
                    s + Math.abs(t.fpAmount),
                  0,
                );
                const totalPurchasedCAD = purchases.reduce(
                  (s: number, t: any) =>
                    s + Math.abs(t.cadEquiv),
                  0,
                );
                const totalWithdrawnFP = Math.abs(
                  withdrawals.reduce(
                    (s: number, t: any) => s + t.fpAmount,
                    0,
                  ),
                );
                const totalWithdrawnCAD = Math.abs(
                  withdrawals.reduce(
                    (s: number, t: any) => s + t.cadEquiv,
                    0,
                  ),
                );
                const totalBoostFP = Math.abs(
                  boosts.reduce(
                    (s: number, t: any) => s + t.fpAmount,
                    0,
                  ),
                );
                const spreadEarned = parseFloat(
                  (
                    totalPurchasedFP *
                    (FP.BUY_RATE - FP.PAYOUT_RATE)
                  ).toFixed(2),
                );
                const totalCirculation = fpAccounts.reduce(
                  (s: number, a: any) => s + (a.balance || 0),
                  0,
                );
                return (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {[
                      {
                        label: "FP Sold",
                        value: `${fpApi.fmt(totalPurchasedFP)} FP`,
                        sub: `$${fmt(totalPurchasedCAD)} CAD`,
                        icon: (
                          <ShoppingBag className="w-4 h-4" />
                        ),
                      },
                      {
                        label: "In Circulation",
                        value: `${fpApi.fmt(totalCirculation)} FP`,
                        sub: `${fpAccounts.length} accounts`,
                        icon: (
                          <Zap className="w-4 h-4 text-yellow-300" />
                        ),
                      },
                      {
                        label: "Withdrawn",
                        value: `${fpApi.fmt(totalWithdrawnFP)} FP`,
                        sub: `$${fmt(totalWithdrawnCAD)} paid out`,
                        icon: (
                          <ArrowUpRight className="w-4 h-4" />
                        ),
                      },
                      {
                        label: "Boost Spend",
                        value: `${fpApi.fmt(totalBoostFP)} FP`,
                        sub: `$${fmt(totalBoostFP * FP.BUY_RATE)} equiv.`,
                        icon: (
                          <Rocket className="w-4 h-4 text-orange-300" />
                        ),
                      },
                      {
                        label: "Spread Earned",
                        value: `$${fmt(spreadEarned)}`,
                        sub: `$${FP.BUY_RATE} buy vs $${FP.PAYOUT_RATE} payout`,
                        icon: (
                          <TrendingUp className="w-4 h-4 text-green-300" />
                        ),
                      },
                      {
                        label: "FP Transactions",
                        value: fpTxs.length.toString(),
                        sub: "total economy events",
                        icon: (
                          <DollarSign className="w-4 h-4" />
                        ),
                      },
                    ].map((s) => (
                      <div
                        key={s.label}
                        className="bg-white/10 rounded-2xl p-3"
                      >
                        <div className="flex items-center gap-1.5 mb-1 text-white/70">
                          {s.icon}
                          <p className="text-[10px] font-semibold uppercase tracking-wide">
                            {s.label}
                          </p>
                        </div>
                        <p className="text-lg font-black text-white leading-tight">
                          {s.value}
                        </p>
                        <p className="text-[10px] text-white/50 mt-0.5">
                          {s.sub}
                        </p>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>

            {/* FP Transaction ledger */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-6">
              <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
                <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                  <Zap className="w-4 h-4 text-yellow-500" /> FP
                  Transactions
                </h3>
                <span className="text-xs text-gray-400">
                  {fpTxs.length} total
                </span>
              </div>
              {fpTxs.length === 0 ? (
                <div className="p-8 text-center text-gray-400 text-sm">
                  No FP transactions yet.
                </div>
              ) : (
                <div className="divide-y divide-gray-50 max-h-64 overflow-y-auto">
                  {fpTxs.slice(0, 50).map((tx: any) => {
                    const isCredit = tx.fpAmount > 0;
                    const allUsers: any[] = JSON.parse(
                      localStorage.getItem("filmons_users") ||
                        "[]",
                    );
                    const u = allUsers.find(
                      (u: any) => u.id === tx.userId,
                    );
                    return (
                      <div
                        key={tx.id}
                        className="flex items-center gap-3 px-5 py-3"
                      >
                        <div
                          className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-xs font-black ${isCredit ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}
                        >
                          {isCredit ? "+" : "−"}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-gray-800 truncate">
                            {tx.description}
                          </p>
                          <p className="text-[10px] text-gray-400">
                            {u?.name || tx.userId?.slice(0, 8)}{" "}
                            ·{" "}
                            {new Date(
                              tx.createdAt,
                            ).toLocaleDateString("en-CA", {
                              month: "short",
                              day: "numeric",
                            })}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p
                            className={`text-sm font-black ${isCredit ? "text-green-600" : "text-red-500"}`}
                          >
                            {isCredit ? "+" : ""}
                            {fpApi.fmt(
                              Math.abs(tx.fpAmount),
                            )}{" "}
                            FP
                          </p>
                          <p className="text-[10px] text-gray-400">
                            ${Math.abs(tx.cadEquiv).toFixed(2)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
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
                      selectedRequest.status === "pending"
                        ? "bg-amber-200 text-amber-800"
                        : selectedRequest.status === "approved"
                          ? "bg-green-200 text-green-800"
                          : "bg-red-200 text-red-800"
                    }`}
                  >
                    {selectedRequest.status}
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
                    value={`${selectedRequest.userEmail}${selectedRequest.emailVerified ? " ✓ verified" : ""}`}
                  />
                  <InfoRow
                    icon={
                      <Phone className="w-4 h-4 text-blue-500" />
                    }
                    label="Phone"
                    value={
                      selectedRequest.userPhone
                        ? `${selectedRequest.userPhone}${selectedRequest.phoneVerified ? " ✓ verified" : ""}`
                        : undefined
                    }
                  />
                  <InfoRow
                    icon={
                      <User className="w-4 h-4 text-gray-400" />
                    }
                    label="User ID"
                    value={selectedRequest.userId}
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
                    value={selectedRequest.streetAddr}
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
                </div>
              </section>

              {/* Documents */}
              <section>
                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                  <Camera className="w-3.5 h-3.5" /> Submitted
                  Documents
                </h3>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <p className="text-xs font-bold text-gray-500 mb-1.5 text-center">
                      Government ID
                    </p>
                    <PhotoViewer
                      src={
                        selectedRequest.govIdPhoto ||
                        selectedRequest.idPhoto
                      }
                      label="Gov ID"
                    />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-gray-500 mb-1.5 text-center">
                      Utility Bill
                    </p>
                    <PhotoViewer
                      src={selectedRequest.utilityBillPhoto}
                      label="Utility Bill"
                    />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-gray-500 mb-1.5 text-center">
                      Selfie
                    </p>
                    <PhotoViewer
                      src={selectedRequest.selfiePhoto}
                      label="Selfie"
                    />
                  </div>
                </div>
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

              {/* Actions */}
              {selectedRequest.status === "pending" && (
                <div className="flex gap-3 flex-wrap">
                  <button
                    className="flex-1 flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white font-bold rounded-2xl py-3.5 transition-colors min-w-[120px]"
                    onClick={() => handleDecision(selectedRequest, "approved")}
                  >
                    <CheckCircle className="w-5 h-5" /> Approve Creator+
                  </button>
                  <button
                    className="flex-1 flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded-2xl py-3.5 transition-colors min-w-[120px]"
                    onClick={() => openRejectModal(selectedRequest, 'rejected')}
                  >
                    <XCircle className="w-5 h-5" /> Deny
                  </button>
                  <button
                    className="w-full flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-2xl py-3 transition-colors"
                    onClick={() => openRejectModal(selectedRequest, 'needs_resubmission')}
                  >
                    <RefreshCw className="w-4 h-4" /> Request New Documents
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
              {rejectTarget.type === 'needs_resubmission'
                ? <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center"><RefreshCw className="w-5 h-5 text-orange-600"/></div>
                : <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center"><XCircle className="w-5 h-5 text-red-600"/></div>
              }
              <div>
                <h3 className="font-black text-gray-900 text-base">
                  {rejectTarget.type === 'needs_resubmission' ? 'Request New Documents' : 'Deny Verification'}
                </h3>
                <p className="text-xs text-gray-400">{rejectTarget.request.userName}</p>
              </div>
            </div>

            <div>
              <p className="text-xs font-bold text-gray-500 mb-2 uppercase tracking-wide">Reason (required)</p>
              <textarea
                value={rejectionReason}
                onChange={e => setRejectionReason(e.target.value)}
                placeholder="Explain why this verification is being denied or what documents are needed…"
                rows={3}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
              />
            </div>

            <div>
              <p className="text-xs font-semibold text-gray-400 mb-2">Quick reasons</p>
              <div className="flex flex-wrap gap-1.5">
                {REJECTION_PRESETS.map(p => (
                  <button key={p} onClick={() => setRejectionReason(p)}
                    className="text-xs px-2.5 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-full transition-colors">
                    {p}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button onClick={() => { setShowRejectModal(false); setRejectionReason(''); }}
                className="flex-1 py-3 border border-gray-200 rounded-2xl text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button
                disabled={!rejectionReason.trim()}
                onClick={() => handleDecision(rejectTarget.request, rejectTarget.type, rejectionReason.trim())}
                className={`flex-1 py-3 rounded-2xl text-sm font-bold text-white transition-colors disabled:opacity-40 ${
                  rejectTarget.type === 'needs_resubmission' ? 'bg-orange-500 hover:bg-orange-600' : 'bg-red-600 hover:bg-red-700'
                }`}>
                {rejectTarget.type === 'needs_resubmission' ? 'Request Documents' : 'Deny & Notify'}
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