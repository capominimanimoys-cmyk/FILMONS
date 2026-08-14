import { useState, useEffect, useCallback, useRef } from 'react';
import { Package, Film } from 'lucide-react';
import { ArrowBackIosNewRounded, ArticleRounded, CalendarMonthRounded, InventoryRounded, OpenInNewRounded, PaidRounded, PrintRounded, ReceiptLongRounded, RefreshRounded, VerifiedRounded, VisibilityRounded, WorkspacePremiumRounded } from '../components/Icons';
import { useNavigate } from 'react-router';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { signRentalDoc } from '../../lib/upload';

interface Order {
  receipt_id:     string;
  agreement_id:   string | null;
  rental_agreement_id: string | null;
  listing_title:  string;
  start_date:     string | null;
  duration:       number;
  duration_type:  string;
  total_amount:   number;
  payment_method: string;
  host_name:      string | null;
  renter_name:    string | null;
  issued_at:      string;
  signed_at:      string | null;
  // Private storage paths — never a URL — signed on demand at view time.
  agreement_path: string | null;
  receipt_path:   string | null;
  id_verification_status: string | null;
  address_verification_status: string | null;
  // Server-computed price breakdown, frozen at payment time. No tax is
  // calculated by Filmons — Stripe handles applicable tax on its own.
  subtotal:            number;
  buyer_fee_rate:       number;
  buyer_fee_amount:     number;
  seller_fee_amount:    number;
}

function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' });
}

// ── Document viewer modal ─────────────────────────────────────────
// `path` is a private storage path — a fresh short-lived signed URL is
// minted on open (never persisted, never reused past its expiry).
function DocViewer({ path, label, onClose }: { path: string; label: string; onClose: () => void }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [htmlContent, setHtmlContent] = useState<string | null>(null);
  const [loadError,   setLoadError]   = useState(false);
  const [signedUrl,   setSignedUrl]   = useState<string | null>(null);

  useEffect(() => {
    setHtmlContent(null);
    setLoadError(false);
    signRentalDoc(path, 300)
      .then(url => {
        if (!url) throw new Error('sign failed');
        setSignedUrl(url);
        return fetch(url);
      })
      .then(r => { if (!r.ok) throw new Error('fetch failed'); return r.text(); })
      .then(html => setHtmlContent(html))
      .catch(() => setLoadError(true));
  }, [path]);

  const handlePrint = () => iframeRef.current?.contentWindow?.print();

  return (
    <div className="fixed inset-0 z-[300] bg-black/80 flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-3 bg-gray-900 shrink-0">
        <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-colors">
          <ArrowBackIosNewRounded sx={{fontSize:16,color:'white'}} />
        </button>
        <div className="flex-1">
          <p className="text-sm font-bold text-white">{label}</p>
          <p className="text-[10px] text-gray-400">Print to save as PDF (Ctrl+P / ⌘P)</p>
        </div>
        {htmlContent && (
          <button onClick={handlePrint}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-colors">
            <PrintRounded sx={{fontSize:14,color:'white'}} /> Print / Save as PDF
          </button>
        )}
        {signedUrl && (
          <a href={signedUrl} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-2 bg-white/10 hover:bg-white/20 text-white text-xs font-semibold rounded-xl transition-colors">
            <OpenInNewRounded sx={{fontSize:14}} /> Raw
          </a>
        )}
      </div>

      {/* Document */}
      <div className="flex-1 bg-gray-200 overflow-hidden flex items-center justify-center">
        {loadError ? (
          <div className="text-center text-white">
            <p className="text-lg font-bold mb-2">Failed to load document</p>
            <p className="text-sm text-gray-300">Please try again in a moment.</p>
          </div>
        ) : !htmlContent ? (
          <div className="flex flex-col items-center gap-3 text-white">
            <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            <p className="text-sm">Loading document…</p>
          </div>
        ) : (
          <iframe
            ref={iframeRef}
            srcDoc={htmlContent}
            className="w-full h-full border-0 bg-white"
            title={label}
            sandbox="allow-same-origin allow-modals"
          />
        )}
      </div>
    </div>
  );
}

// ── Document button ───────────────────────────────────────────────
// `path` is null until the document has actually been generated (which now
// always happens once, right after payment — see Checkout.tsx's
// finalizeOrder). There's no client-side "Generate" fallback anymore: a
// signed agreement/receipt should already exist, and re-deriving one from
// scratch here would mean the app, not the signed snapshot, was the source
// of truth for a legal document.
function DocButton({ label, path }: { label: string; path: string | null }) {
  const [viewing, setViewing] = useState(false);

  if (!path) return (
    <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-gray-200 bg-gray-50 text-gray-400 text-xs font-semibold">
      {label} unavailable
    </span>
  );

  return (
    <>
      {viewing && <DocViewer path={path} label={label} onClose={() => setViewing(false)} />}
      <button onClick={() => setViewing(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-blue-200 bg-blue-50 text-blue-700 text-xs font-semibold hover:bg-blue-100 transition-colors">
        <VisibilityRounded sx={{fontSize:13}} /> {label}
      </button>
    </>
  );
}

function OrderCard({ order, tab }: { order: Order; tab: 'renter' | 'host' }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-100 flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="font-bold text-gray-900 text-sm truncate">{order.listing_title}</p>
          <p className="text-xs text-gray-400 mt-0.5">
            {tab === 'renter' ? `Host: ${order.host_name || '—'}` : `Renter: ${order.renter_name || '—'}`}
          </p>
        </div>
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border bg-green-100 text-green-700 border-green-200 shrink-0">
          ✓ Paid
        </span>
      </div>

      {/* Detail grid */}
      <div className="px-5 py-4 grid grid-cols-2 gap-3">
        <div className="flex items-center gap-2">
          <CalendarMonthRounded sx={{fontSize:16,color:'#9ca3af'}} />
          <div>
            <p className="text-[10px] text-gray-400">Start date</p>
            <p className="text-xs font-semibold text-gray-800">{formatDate(order.start_date)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <PaidRounded sx={{fontSize:16,color:'#9ca3af'}} />
          <div>
            <p className="text-[10px] text-gray-400">Total paid</p>
            <p className="text-xs font-bold text-blue-700">${Number(order.total_amount).toFixed(2)} CAD</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <VerifiedRounded sx={{fontSize:16,color:'#9ca3af'}} />
          <div>
            <p className="text-[10px] text-gray-400">Duration</p>
            <p className="text-xs font-semibold text-gray-800">{order.duration} {order.duration_type}(s)</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ArticleRounded sx={{fontSize:16,color:'#9ca3af'}} />
          <div>
            <p className="text-[10px] text-gray-400">Signed</p>
            <p className="text-xs font-semibold text-gray-800">{formatDate(order.signed_at || order.issued_at)}</p>
          </div>
        </div>
      </div>

      {/* Reference numbers */}
      <div className="px-5 pb-3 flex flex-wrap gap-1.5">
        <span className="font-mono text-[10px] text-gray-400 bg-gray-50 border border-gray-200 px-2 py-0.5 rounded-lg">
          {order.receipt_id}
        </span>
        {order.agreement_id && (
          <span className="font-mono text-[10px] text-gray-400 bg-gray-50 border border-gray-200 px-2 py-0.5 rounded-lg">
            {order.agreement_id}
          </span>
        )}
      </div>

      {/* Financial breakdown — renter sees what they paid, owner sees what they earned */}
      <div className="px-5 pb-3">
        {tab === 'renter' ? (
          <div className="bg-gray-50 rounded-xl p-3 space-y-1">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Payment Details</p>
            <div className="flex justify-between text-xs"><span className="text-gray-500">Rental</span><span className="text-gray-700">${order.subtotal.toFixed(2)}</span></div>
            <div className="flex justify-between text-xs"><span className="text-gray-500">Filmons Fee{order.buyer_fee_rate ? ` (${(order.buyer_fee_rate * 100).toFixed(0)}%)` : ''}</span><span className="text-gray-700">${order.buyer_fee_amount.toFixed(2)}</span></div>
            <div className="flex justify-between text-xs font-bold border-t border-gray-200 pt-1 mt-0.5"><span className="text-gray-800">Total paid</span><span className="text-gray-900">${Number(order.total_amount).toFixed(2)} CAD</span></div>
          </div>
        ) : (
          <div className="bg-gray-50 rounded-xl p-3 space-y-1">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Earnings</p>
            <div className="flex justify-between text-xs"><span className="text-gray-500">Gross rental earnings</span><span className="text-gray-700">${order.subtotal.toFixed(2)}</span></div>
            <div className="flex justify-between text-xs"><span className="text-gray-500">Filmons Fee</span><span className="text-gray-700">−${order.seller_fee_amount.toFixed(2)}</span></div>
            <div className="flex justify-between text-xs font-bold border-t border-gray-200 pt-1 mt-0.5"><span className="text-gray-800">Net earnings</span><span className="text-gray-900">${(order.subtotal - order.seller_fee_amount).toFixed(2)} CAD</span></div>
          </div>
        )}
      </div>

      {/* Verification status — statuses only, never the underlying documents */}
      {tab === 'host' && (order.id_verification_status || order.address_verification_status) && (
        <div className="px-5 pb-2 flex flex-wrap gap-1.5">
          {order.id_verification_status && (
            <span className="text-[10px] font-semibold text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-lg">
              Identity verification {order.id_verification_status === 'provided' || order.id_verification_status === 'verified' ? 'completed ✓' : 'pending'}
            </span>
          )}
          {order.address_verification_status && (
            <span className="text-[10px] font-semibold text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-lg">
              Address verification {order.address_verification_status === 'provided' || order.address_verification_status === 'verified' ? 'completed ✓' : 'pending'}
            </span>
          )}
        </div>
      )}

      {/* Documents */}
      <div className="px-5 pb-4 pt-3 border-t border-gray-100 flex flex-wrap gap-2">
        <DocButton label="Rental Agreement" path={order.agreement_path} />
        <DocButton label="Receipt" path={order.receipt_path} />
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────
export default function MyOrders() {
  const { user }  = useAuth();
  const navigate  = useNavigate();
  // Matches the gate CreateListing.tsx uses for who can list gear — was
  // previously checking only 'business', so a Creator+ approved account
  // (the actual common case) still saw the "Become Creator+" upsell here.
  const HOST_TYPES = ['creator_plus', 'professional', 'business'];
  const isCreator = HOST_TYPES.includes(user?.accountType || '') || HOST_TYPES.includes(user?.accountMode || '');
  const [orders,  setOrders]  = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab,     setTab]     = useState<'renter' | 'host'>('renter');

  useEffect(() => {
    if (!user) { navigate('/login'); return; }
    loadOrders();
  }, [user, tab]);

  const loadOrders = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq(tab === 'renter' ? 'renter_id' : 'host_id', user.id)
        .order('paid_at', { ascending: false });

      if (error) console.warn('Orders fetch error:', error.message);

      const rows = data || [];
      const agreementIds = [...new Set(rows.map((r: any) => r.rental_agreement_id).filter(Boolean))];
      const agreementsById: Record<string, any> = {};
      if (agreementIds.length) {
        const { data: agRows } = await supabase
          .from('rental_agreements')
          .select('id, agreement_renter_path, agreement_host_path, receipt_path, id_verification_status, address_verification_status')
          .in('id', agreementIds);
        (agRows || []).forEach((a: any) => { agreementsById[a.id] = a; });
      }

      setOrders(rows.map((r: any) => {
        const ag = r.rental_agreement_id ? agreementsById[r.rental_agreement_id] : null;
        return {
          receipt_id:     r.receipt_id || r.id,
          agreement_id:   r.agreement_id || null,
          rental_agreement_id: r.rental_agreement_id || null,
          listing_title:  r.listing_title || '—',
          start_date:     r.start_date,
          duration:       r.duration || 1,
          duration_type:  r.duration_type || 'day',
          total_amount:   Number(r.total_amount),
          payment_method: r.payment_method,
          host_name:      r.host_name,
          renter_name:    r.renter_name,
          issued_at:      r.paid_at || r.issued_at || new Date().toISOString(),
          signed_at:      r.paid_at || null,
          agreement_path: ag ? (tab === 'host' ? ag.agreement_host_path : ag.agreement_renter_path) : null,
          receipt_path:   ag?.receipt_path || null,
          id_verification_status: ag?.id_verification_status || null,
          address_verification_status: ag?.address_verification_status || null,
          subtotal:            Number(r.subtotal ?? r.total_amount ?? 0),
          buyer_fee_rate:       Number(r.buyer_fee_rate ?? 0),
          buyer_fee_amount:     Number(r.buyer_fee_amount ?? 0),
          seller_fee_amount:    Number(r.seller_fee_amount ?? 0),
        };
      }));
    } catch (e) {
      console.warn('MyOrders load failed:', e);
    }
    setLoading(false);
  }, [user, tab]);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <button onClick={() => navigate(-1)}
            className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors">
            <ArrowBackIosNewRounded sx={{fontSize:18,color:'#374151'}} />
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <InventoryRounded sx={{fontSize:22,color:'#2563eb'}} /> My Orders
            </h1>
            <p className="text-xs text-gray-400">Rental agreements &amp; receipts</p>
          </div>
          <button onClick={loadOrders} className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors">
            <RefreshRounded sx={{fontSize:20,color:'#6b7280'}} />
          </button>
        </div>

        {/* Tabs */}
        <div className="max-w-2xl mx-auto px-4 pb-3 flex gap-2">
          {(['renter', 'host'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors flex items-center gap-1.5 ${tab === t ? 'bg-blue-600 text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {t === 'renter' ? <><Package className="w-4 h-4"/> As Renter</> : <><Film className="w-4 h-4"/> As Host</>}
            </button>
          ))}
        </div>
      </div>

      {/* Orders list */}
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        {/* Creator+ required for host tab */}
        {tab === 'host' && !isCreator && (
          <div className="bg-gradient-to-br from-purple-50 to-indigo-50 border-2 border-purple-200 rounded-2xl p-6 text-center">
            <div className="w-14 h-14 rounded-full bg-purple-100 flex items-center justify-center mx-auto mb-3">
              <WorkspacePremiumRounded sx={{fontSize:28,color:'#7c3aed'}} />
            </div>
            <h3 className="text-base font-bold text-gray-900 mb-1">Creator+ Account Required</h3>
            <p className="text-sm text-gray-500 mb-4">
              Only Creator+ hosts can list gear and accept rental orders. Upgrade your account to start earning.
            </p>
            <button onClick={() => navigate('/verification')}
              className="inline-flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white font-bold text-sm px-5 py-2.5 rounded-xl transition-colors shadow-sm">
              <WorkspacePremiumRounded sx={{fontSize:16,color:'white'}} /> Become a Creator+
            </button>
          </div>
        )}

        {(tab === 'renter' || isCreator) && (loading ? (
          <div className="space-y-4">
            {[1,2,3].map(i => (
              <div key={i} className="bg-white rounded-2xl p-5 border border-gray-100 animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-2/3 mb-3" />
                <div className="h-3 bg-gray-100 rounded w-1/2 mb-2" />
                <div className="h-3 bg-gray-100 rounded w-1/3" />
              </div>
            ))}
          </div>
        ) : orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
              <InventoryRounded sx={{fontSize:32,color:'#d1d5db'}} />
            </div>
            <h3 className="text-base font-bold text-gray-700 mb-1">No orders yet</h3>
            <p className="text-sm text-gray-400">
              {tab === 'renter' ? 'Your completed rentals will appear here.' : 'Rentals of your gear will appear here.'}
            </p>
          </div>
        ) : (
          <>
            <p className="text-xs text-gray-400 text-center">
              {orders.length} order{orders.length !== 1 ? 's' : ''} found
            </p>
            {orders.map(order => (
              <OrderCard key={order.receipt_id} order={order} tab={tab} />
            ))}
          </>
        ))}
      </div>
    </div>
  );
}