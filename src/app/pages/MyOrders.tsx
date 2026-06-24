import { useState, useEffect, useCallback, useRef } from 'react';
import { Package, Film } from 'lucide-react';
import { ArrowBackIosNewRounded, ArticleRounded, CalendarMonthRounded, InventoryRounded, OpenInNewRounded, PaidRounded, PrintRounded, ReceiptLongRounded, RefreshRounded, VerifiedRounded, VisibilityRounded, WorkspacePremiumRounded } from '../components/Icons';
import { useNavigate } from 'react-router';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { generateAgreementFromDB, generateReceiptFromDB } from '../lib/generatePDF';

interface Order {
  receipt_id:     string;
  agreement_id:   string | null;
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
  receipt_url:    string | null;
  agreement_url:  string | null;
}

function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' });
}

// ── Document button with open + download ──────────────────────────
// ── Document viewer modal ─────────────────────────────────────────
function DocViewer({ url, label, onClose, preloadedHtml }: { url: string; label: string; onClose: () => void; preloadedHtml?: string }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [htmlContent, setHtmlContent] = useState<string | null>(preloadedHtml || null);
  const [loadError,   setLoadError]   = useState(false);

  useEffect(() => {
    if (preloadedHtml) { setHtmlContent(preloadedHtml); return; }
    setHtmlContent(null);
    setLoadError(false);
    fetch(url)
      .then(r => {
        if (!r.ok) throw new Error('fetch failed');
        return r.text();
      })
      .then(html => setHtmlContent(html))
      .catch(() => setLoadError(true));
  }, [url, preloadedHtml]);

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
        <a href={url} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-1.5 px-3 py-2 bg-white/10 hover:bg-white/20 text-white text-xs font-semibold rounded-xl transition-colors">
          <OpenInNewRounded sx={{fontSize:14}} /> Raw
        </a>
      </div>

      {/* Document */}
      <div className="flex-1 bg-gray-200 overflow-hidden flex items-center justify-center">
        {loadError ? (
          <div className="text-center text-white">
            <p className="text-lg font-bold mb-2">Failed to load document</p>
            <a href={url} target="_blank" rel="noopener noreferrer"
              className="text-blue-300 underline text-sm">Open directly in browser</a>
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
function DocButton({
  label, url, receiptId, agreementId, type, onGenerated, preloadedHtml: externalHtml,
}: {
  label: string; url: string | null;
  receiptId?: string; agreementId?: string;
  type: 'agreement' | 'receipt';
  onGenerated?: (url: string) => void;
  preloadedHtml?: string;
}) {
  const [generating, setGenerating] = useState(false);
  const [localUrl,   setLocalUrl]   = useState(url);
  const [localHtml,  setLocalHtml]  = useState<string | undefined>(externalHtml);
  const [viewing,    setViewing]    = useState(false);
  useEffect(() => { setLocalUrl(url); }, [url]);
  useEffect(() => { if (externalHtml) setLocalHtml(externalHtml); }, [externalHtml]);

  const generate = async () => {
    setGenerating(true);
    try {
      let result: { url: string; html: string } | null = null;
      if (type === 'agreement' && agreementId) result = await generateAgreementFromDB(agreementId);
      else if (type === 'receipt' && receiptId)  result = await generateReceiptFromDB(receiptId);
      if (result?.url) {
        setLocalUrl(result.url);
        setLocalHtml(result.html);
        onGenerated?.(result.url);
      }
    } catch (e) { console.warn('Generate failed:', e); }
    setGenerating(false);
  };

  if (!localUrl) return (
    <button onClick={generate} disabled={generating}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-gray-200 bg-gray-50 text-gray-500 text-xs font-semibold hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600 transition-colors disabled:opacity-50">
      {generating
        ? <><div className="w-3 h-3 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" /> Generating…</>
        : <><RefreshRounded sx={{fontSize:13}} /> Generate {label}</>}
    </button>
  );

  return (
    <>
      {viewing && <DocViewer url={localUrl} label={label} onClose={() => setViewing(false)} preloadedHtml={localHtml} />}
      <div className="flex gap-1">
        <button onClick={() => setViewing(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-blue-200 bg-blue-50 text-blue-700 text-xs font-semibold hover:bg-blue-100 transition-colors">
          <VisibilityRounded sx={{fontSize:13}} /> {label}
        </button>
        <a href={localUrl} target="_blank" rel="noopener noreferrer"
          className="flex items-center justify-center w-7 h-7 rounded-xl border border-blue-200 bg-white text-blue-600 hover:bg-blue-50 transition-colors" title="Open in new tab">
          <OpenInNewRounded sx={{fontSize:13}} />
        </a>
      </div>
    </>
  );
}

function OrderCard({ order, tab }: { order: Order; tab: 'renter' | 'host' }) {
  const [agreementUrl,  setAgreementUrl]  = useState(order.agreement_url);
  const [receiptUrl,    setReceiptUrl]    = useState(order.receipt_url);
  const [agreementHtml, setAgreementHtml] = useState<string | undefined>(undefined);
  const [receiptHtml,   setReceiptHtml]   = useState<string | undefined>(undefined);

  // Pre-fetch HTML for existing URLs so viewer works without CORS issues
  useEffect(() => {
    if (order.agreement_url && !agreementHtml) {
      fetch(order.agreement_url).then(r => r.ok ? r.text() : Promise.reject())
        .then(h => setAgreementHtml(h)).catch(() => {});
    }
    if (order.receipt_url && !receiptHtml) {
      fetch(order.receipt_url).then(r => r.ok ? r.text() : Promise.reject())
        .then(h => setReceiptHtml(h)).catch(() => {});
    }
  }, [order.agreement_url, order.receipt_url]);

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

      {/* Documents */}
      <div className="px-5 pb-4 pt-3 border-t border-gray-100 flex flex-wrap gap-2">
        <DocButton
          label="Rental Agreement"
          url={agreementUrl}
          agreementId={order.agreement_id || undefined}
          type="agreement"
          onGenerated={u => setAgreementUrl(u)}
          preloadedHtml={agreementHtml}
        />
        <DocButton
          label="Receipt"
          url={receiptUrl}
          receiptId={order.receipt_id}
          type="receipt"
          onGenerated={u => setReceiptUrl(u)}
          preloadedHtml={receiptHtml}
        />
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────
export default function MyOrders() {
  const { user }  = useAuth();
  const navigate  = useNavigate();
  const isCreator = user?.accountType === 'business' || user?.accountMode === 'business';
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

      setOrders((data || []).map((r: any) => ({
        receipt_id:     r.receipt_id || r.id,
        agreement_id:   r.agreement_id || null,
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
        receipt_url:    r.receipt_url || null,
        agreement_url:  tab === 'host' ? (r.host_agreement_url || r.agreement_url) : r.agreement_url || null,
      })));
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