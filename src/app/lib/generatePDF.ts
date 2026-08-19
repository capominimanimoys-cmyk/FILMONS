/**
 * generatePDF.ts
 * Generates print-ready HTML documents for Filmons rental agreements and receipts.
 * Uploaded to the private `rental-verification` bucket as a path (never a
 * public URL) — see uploadPDFDoc. View access always goes through a
 * short-lived signed URL minted on demand.
 */

import { supabase } from '../../lib/supabase';
import { signRentalDoc } from '../../lib/upload';

// ── Types ──────────────────────────────────────────────────────────
export interface AgreementData {
  id: string;
  conversation_id?: string;
  message_id?: string;
  renter_id?: string;
  host_id?: string;
  first_name: string;
  last_name: string;
  birthdate: string;
  id_type?: string;
  id_country: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  province: string;
  postal_code: string;
  country: string;
  proof_of_address_type?: string;
  // True when the renter's identity/address came from an approved Creator+
  // verification instead of documents uploaded for this specific rental —
  // renders "Verified by Filmons" instead of "Provided" in that case.
  verification_reused?: boolean;
  signature_data?: string;
  listing_title: string;
  total_amount: number;
  // Server-computed breakdown (see supabase/functions/_shared/pricing.ts) —
  // frozen at signing time, never recalculated from today's fee config. No
  // tax is calculated by Filmons — Stripe handles applicable tax on its own.
  subtotal?: number;
  buyer_fee_amount?: number;
  payment_method: string;
  start_date?: string;
  duration?: number;
  duration_type?: string;
  signed_at: string;
  agreement_url?: string;
  // joined from host profile
  host_name?: string;
  host_email?: string;
  host_username?: string;
}

export interface ReceiptData {
  id: string;
  agreement_id?: string;
  renter_id?: string;
  host_id?: string;
  renter_name: string;
  renter_email: string;
  renter_phone?: string;
  host_name?: string;
  host_email?: string;
  listing_title: string;
  listing_type?: string;
  start_date?: string;
  duration?: number;
  duration_type?: string;
  total_amount: number;
  subtotal?: number;
  buyer_fee_amount?: number;
  payment_method: string;
  issued_at: string;
  receipt_url?: string;
}

// ── Shared CSS ──────────────────────────────────────────────────────
const BASE_CSS = `
  *{box-sizing:border-box;margin:0;padding:0}
  @page{size:A4;margin:20mm 18mm}
  body{font-family:'Helvetica Neue',Arial,sans-serif;font-size:10.5px;color:#111;background:#fff;max-width:780px;margin:0 auto;padding:24px 0}
  .cover{background:linear-gradient(135deg,#1e3a5f 0%,#2563eb 100%);color:#fff;padding:28px 32px;border-radius:10px;margin-bottom:28px}
  .cover-logo{font-size:26px;font-weight:900;letter-spacing:-0.5px}
  .cover-sub{font-size:10px;opacity:.7;text-transform:uppercase;letter-spacing:1.2px;margin-top:2px}
  .cover-title{font-size:18px;font-weight:800;margin-top:18px;padding-top:18px;border-top:1px solid rgba(255,255,255,.22)}
  .cover-desc{font-size:10px;opacity:.7;margin-top:5px;line-height:1.6}
  .cover-ref{font-family:monospace;font-size:9px;opacity:.55;margin-top:12px;line-height:1.8}
  .cover-site{font-size:9px;opacity:.4;margin-top:3px}
  .sec{margin-bottom:22px;page-break-inside:avoid}
  .sec-title{font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:1.8px;color:#2563eb;border-bottom:2px solid #2563eb;padding-bottom:3px;margin-bottom:10px}
  .sub{font-size:10.5px;font-weight:700;color:#1e3a5f;margin:10px 0 6px}
  table.info{width:100%;border-collapse:collapse;margin-bottom:8px}
  table.info td{padding:4.5px 8px;border:1px solid #e5e7eb;font-size:10px;vertical-align:top}
  table.info td:first-child{background:#f8fafc;font-weight:600;color:#374151;width:36%}
  table.data{width:100%;border-collapse:collapse;margin-bottom:8px}
  table.data th{background:#1e3a5f;color:#fff;padding:5.5px 8px;font-size:9.5px;text-align:left;font-weight:700}
  table.data td{padding:4.5px 8px;border-bottom:1px solid #f1f5f9;font-size:10px}
  table.data tr:nth-child(even) td{background:#fafafa}
  .two{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:8px}
  .field{margin-bottom:8px}
  .fl{font-size:8.5px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.6px;margin-bottom:2px}
  .fv{font-size:10.5px;color:#111;padding-bottom:5px;border-bottom:1px solid #e5e7eb;min-height:20px}
  .note{background:#fffbeb;border-left:3px solid #f59e0b;padding:6px 10px;border-radius:0 5px 5px 0;font-size:9.5px;color:#78350f;margin:6px 0}
  .sig-box{border:1.5px solid #d1d5db;border-radius:8px;background:#f9fafb;padding:10px;min-height:75px;text-align:center;margin-top:6px}
  .sig-box img{max-height:55px;max-width:180px;object-fit:contain}
  .sig-line{border-top:1px solid #9ca3af;margin-top:6px;padding-top:3px;font-size:8.5px;color:#9ca3af}
  .badge{display:inline-block;background:#dcfce7;color:#15803d;padding:1px 7px;border-radius:99px;font-size:8.5px;font-weight:700;border:1px solid #bbf7d0}
  .badge-blue{background:#dbeafe;color:#1d4ed8;border:1px solid #bfdbfe}
  .badge-gray{background:#f3f4f6;color:#374151;border:1px solid #e5e7eb}
  .pgbreak{page-break-before:always;padding-top:20px}
  .confirmed{display:inline-block;background:#4ade80;color:#14532d;font-size:11px;font-weight:800;padding:4px 14px;border-radius:99px;margin-top:10px}
  .amount-big{font-size:44px;font-weight:900;margin:16px 0 2px}
  .footer{margin-top:28px;padding-top:10px;border-top:1px solid #e5e7eb;font-size:8.5px;color:#9ca3af;text-align:center;line-height:1.8}
  .price-row td{padding:6px 10px;border-bottom:1px solid #f1f5f9;font-size:10.5px}
  .price-row td:last-child{text-align:right}
  .price-total td{background:linear-gradient(135deg,#1e3a5f,#2563eb);color:#fff;font-weight:800;font-size:12px;padding:8px 10px}
  .price-total td:last-child{text-align:right}
  .policy-row td{padding:5px 8px;border-bottom:1px solid #f1f5f9;font-size:10px;vertical-align:top}
  .policy-row td:first-child{font-weight:600;color:#374151;width:30%;background:#f8fafc}
  .confirm-box{background:linear-gradient(135deg,#f0fdf4,#dcfce7);border:1px solid #bbf7d0;border-radius:10px;padding:14px 18px;margin:14px 0;text-align:center}
  .thank{font-size:12px;font-weight:800;color:#15803d;margin-bottom:3px}
  @media print{
    .cover{-webkit-print-color-adjust:exact;print-color-adjust:exact}
    table.data th{-webkit-print-color-adjust:exact;print-color-adjust:exact}
    .price-total td{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  }
`;

// ── Agreement HTML ─────────────────────────────────────────────────
export function buildAgreementHTML(d: AgreementData, isHostCopy = false): string {
  const subtotal = d.subtotal ?? d.total_amount;
  const buyerFeeAmount = d.buyer_fee_amount ?? 0;
  const dailyRate = d.duration ? (subtotal / d.duration).toFixed(2) : subtotal.toFixed(2);
  const returnDate = d.start_date && d.duration
    ? (() => { const dt = new Date(d.start_date); dt.setDate(dt.getDate() + d.duration); return dt.toISOString().split('T')[0]; })()
    : '&#x2014;';
  const signedAt = d.signed_at
    ? new Date(d.signed_at).toLocaleString('en-CA', { timeZone: 'America/Toronto', year:'numeric', month:'long', day:'numeric', hour:'2-digit', minute:'2-digit' })
    : '';

  // Draft/preview support — this same function renders both the mid-flow
  // preview (fields not filled in yet) and the final signed document
  // (everything guaranteed present). Empty required fields show "Not
  // completed" instead of blank cells or a misleadingly-hardcoded "Provided".
  const renterName = (d.first_name || d.last_name) ? `${d.first_name} ${d.last_name}`.trim() : 'Not completed';
  const hasAddress = !!(d.address || d.city || d.province || d.postal_code);
  const idProvided = !!d.id_type || !!d.verification_reused;
  const proofProvided = !!d.proof_of_address_type || !!d.verification_reused;

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><meta http-equiv="Content-Type" content="text/html; charset=utf-8"/>
<title>Filmons Rental Agreement &#x2014; ${d.id}</title>
<style>${BASE_CSS}</style>
</head><body>

<!-- COVER -->
<div class="cover">
  <div class="cover-logo">&#x1F3AC; FILMONS</div>
  <div class="cover-sub">Film Gear Rental Marketplace</div>
  <div class="cover-title">EQUIPMENT RENTAL AGREEMENT${isHostCopy ? ' &#x2014; HOST COPY' : ''}</div>
  <div class="cover-desc">This Agreement governs the rental of film and production equipment between Hosts and Renters on the Filmons platform.</div>
  <div class="cover-ref">
    Booking Reference: ${d.id}<br/>
    Agreement Date: ${d.signed_at ? d.signed_at.split('T')[0] : '&#x2014;'}
  </div>
  <div class="cover-site">filmons.com | support@filmons.com</div>
</div>

<!-- SECTION 1 -->
<div class="sec">
  <div class="sec-title">Section 1 &#x2014; Parties &amp; Booking Details</div>
  <div class="sub">1.1 Host (Gear Owner)</div>
  <div class="two">
    <div class="field"><div class="fl">Full Legal Name</div><div class="fv">${d.host_name || '&#x2014;'}</div></div>
    <div class="field"><div class="fl">Filmons Username</div><div class="fv">${d.host_username ? '@'+d.host_username : '&#x2014;'}</div></div>
    <div class="field"><div class="fl">Email Address</div><div class="fv">${d.host_email || '&#x2014;'}</div></div>
    <div class="field"><div class="fl">Phone Number</div><div class="fv">&#x2014;</div></div>
  </div>

  <div class="sub">1.2 Renter</div>
  <div class="two">
    <div class="field"><div class="fl">Full Legal Name</div><div class="fv">${renterName}</div></div>
    <div class="field"><div class="fl">Email Address</div><div class="fv">${d.email ? `${d.email} <span class="badge">&#x2713; Verified</span>` : 'Not completed'}</div></div>
    <div class="field"><div class="fl">Phone Number</div><div class="fv">${d.phone ? `${d.phone} <span class="badge">&#x2713; Verified</span>` : 'Not completed'}</div></div>
    <div class="field"><div class="fl">Date of Birth</div><div class="fv">${d.birthdate || 'Not completed'}</div></div>
    <div class="field"><div class="fl">Government ID Type</div><div class="fv">${d.verification_reused ? '&#x2014;' : (d.id_type || 'Not completed')}</div></div>
    <div class="field"><div class="fl">ID Country of Issue</div><div class="fv">${d.id_country || '&#x2014;'}</div></div>
    <div class="field"><div class="fl">Government ID</div><div class="fv">${d.verification_reused
      ? '<span class="badge">&#x2713; Verified by Filmons</span> &#x2014; identity confirmed via approved Creator+ verification'
      : idProvided ? '<span class="badge">&#x2713; Provided</span> &#x2014; document is private and never shown here' : '<span class="badge badge-gray">Not completed</span>'}</div></div>
  </div>

  <div class="sub">1.3 Rental Period</div>
  <table class="info">
    <tr><td>Pickup Date</td><td>${d.start_date || '&#x2014;'}</td><td>Return Date</td><td>${returnDate || '&#x2014;'}</td></tr>
    <tr><td>Duration</td><td>${d.duration || 1} ${d.duration_type || 'day'}(s)</td><td>Pickup Method</td><td>As agreed via Filmons</td></tr>
  </table>

  <div class="sub">1.4 Renter Address</div>
  <div class="two">
    <div class="field"><div class="fl">Street Address</div><div class="fv">${d.address || (hasAddress ? '&#x2014;' : 'Not completed')}</div></div>
    <div class="field"><div class="fl">City</div><div class="fv">${d.city || (hasAddress ? '&#x2014;' : 'Not completed')}</div></div>
    <div class="field"><div class="fl">Province / State</div><div class="fv">${d.province || (hasAddress ? '&#x2014;' : 'Not completed')}</div></div>
    <div class="field"><div class="fl">Postal / ZIP Code</div><div class="fv">${d.postal_code || (hasAddress ? '&#x2014;' : 'Not completed')}</div></div>
    <div class="field"><div class="fl">Country</div><div class="fv">${d.country || (hasAddress ? '&#x2014;' : 'Not completed')}</div></div>
    <div class="field"><div class="fl">Proof of Address</div><div class="fv">${d.verification_reused
      ? '<span class="badge">&#x2713; Verified by Filmons</span> &#x2014; address confirmed via approved Creator+ verification'
      : proofProvided ? `${d.proof_of_address_type} <span class="badge">&#x2713; Provided</span>` : 'Not completed'}</div></div>
  </div>
</div>

<!-- SECTION 2 -->
<div class="sec">
  <div class="sec-title">Section 2 &#x2014; Equipment Description</div>
  <div class="sub">2.1 Rented Equipment</div>
  <table class="data">
    <tr><th>#</th><th>Equipment Description</th><th>Type</th><th>Duration</th><th>Condition</th></tr>
    <tr><td>1</td><td>${d.listing_title}</td><td>Rental</td><td>${d.duration||1} ${d.duration_type||'day'}(s)</td><td>As listed on Filmons</td></tr>
  </table>
  <div class="note">&#x23F1; The Renter must inspect all equipment at the time of pickup and report any pre-existing damage or missing accessories via the Filmons platform within <strong>2 hours</strong> of taking possession. Failure to report constitutes acceptance of equipment as described.</div>
</div>

<!-- SECTION 3 -->
<div class="sec">
  <div class="sec-title">Section 3 &#x2014; Pricing &amp; Payment</div>
  <table class="info">
    <tr><td>Daily Rate</td><td>$${dailyRate} CAD</td><td>Number of Days</td><td>${d.duration || 1}</td></tr>
    <tr><td>Subtotal (Rate &#xD7; Days)</td><td>$${subtotal.toFixed(2)} CAD</td><td>Payment Method</td><td>${d.payment_method}</td></tr>
    <tr><td>Filmons Fee</td><td>$${buyerFeeAmount.toFixed(2)} CAD</td><td></td><td></td></tr>
    <tr><td style="font-weight:800">TOTAL PAID AT BOOKING</td><td style="font-weight:800;color:#1e3a5f" colspan="3">$${d.total_amount.toFixed(2)} CAD</td></tr>
  </table>
  <div class="note">The Security Deposit is authorized (held) on the Renter's payment method at booking and is not charged unless damage is confirmed through the Filmons dispute process. Released within 48 hours of confirmed return in satisfactory condition. Late returns incur 1.5&#xD7; the daily rate per additional day.</div>
</div>

<!-- SECTION 6 -->
<div class="sec pgbreak">
  <div class="sec-title">Section 6 &#x2014; Damage Policy &amp; Liability</div>
  <table class="data">
    <tr><th>Damage Tier</th><th>Description</th><th>Responsible Party</th><th>Resolution</th></tr>
    <tr><td>Normal Wear</td><td>Minor dust, expected surface marks</td><td>Host absorbs</td><td>No charge</td></tr>
    <tr><td>Accidental Damage</td><td>Drops, scratches, functional issues</td><td>Renter</td><td>Repair cost, capped at deposit</td></tr>
    <tr><td>Major Damage</td><td>Broken parts, water damage, bent gear</td><td>Renter</td><td>Full repair or replacement value</td></tr>
    <tr><td>Total Loss / Theft</td><td>Gear not returned or stolen</td><td>Renter</td><td>Full replacement value + fees</td></tr>
  </table>
  <div class="note">All damage claims must be submitted through the Filmons platform within <strong>48 hours</strong> of equipment return. Filmons will mediate disputes within 5 business days. Decisions on disputes up to CAD $2,500 are final; above that amount proceeds to binding arbitration.</div>
</div>

<!-- SECTION 8 -->
<div class="sec">
  <div class="sec-title">Section 8 &#x2014; Cancellation Policy</div>
  <table class="data">
    <tr><th>Cancellation Window</th><th>Renter Refund</th><th>Host Payout</th></tr>
    <tr><td>7+ days before rental start</td><td>100%</td><td>0%</td></tr>
    <tr><td>3–6 days before rental start</td><td>50%</td><td>25% of rental fee</td></tr>
    <tr><td>24–48 hours before rental start</td><td>25%</td><td>50% of rental fee</td></tr>
    <tr><td>Less than 24 hours / No-show</td><td>0%</td><td>75% of rental fee</td></tr>
  </table>
</div>

<!-- SECTION 9 -->
<div class="sec">
  <div class="sec-title">Section 9 &#x2014; General Terms &amp; Conditions</div>
  <table class="info">
    <tr><td>Filmons' Role</td><td>Marketplace facilitator only. Not owner, lessor, or insurer of any equipment.</td></tr>
    <tr><td>Governing Law</td><td>Province of British Columbia, Canada, and applicable federal laws.</td></tr>
    <tr><td>Dispute Resolution</td><td>BCICAC binding arbitration. Arbitrator's decision is final. Class actions waived.</td></tr>
    <tr><td>Entire Agreement</td><td>This Agreement together with Filmons Terms of Service constitutes the entire agreement.</td></tr>
  </table>
</div>

<!-- SECTION 10 -->
<div class="sec">
  <div class="sec-title">Section 10 &#x2014; Acknowledgement &amp; Signatures</div>
  <p style="font-size:9.5px;color:#374151;margin-bottom:14px;line-height:1.6">By signing below (or accepting digitally on the Filmons platform), both parties confirm they have read, understood, and agree to be bound by all terms of this Film Gear Rental Agreement.</p>

  <div class="two">
    <div>
      <div class="sub" style="margin-top:0">HOST (GEAR OWNER)</div>
      <div class="field"><div class="fl">Full Name</div><div class="fv">${d.host_name || '&#x2014;'}</div></div>
      <div class="field"><div class="fl">Signature</div>
        <div class="sig-box"><div class="sig-line">Digital signature on file (Filmons platform)</div></div>
      </div>
      <div class="field"><div class="fl">Date</div><div class="fv">${d.signed_at ? d.signed_at.split('T')[0] : '&#x2014;'}</div></div>
    </div>
    <div>
      <div class="sub" style="margin-top:0">RENTER</div>
      <div class="field"><div class="fl">Full Name</div><div class="fv">${renterName}</div></div>
      <div class="field"><div class="fl">Signature</div>
        <div class="sig-box">
          ${d.signature_data ? `<img src="${d.signature_data}" alt="Renter signature"/>` : ''}
          <div class="sig-line">${d.signature_data ? `Digitally signed &#x2014; ${signedAt} EST` : 'Not signed'}</div>
        </div>
      </div>
      <div class="field"><div class="fl">Date</div><div class="fv">${d.signed_at ? d.signed_at.split('T')[0] : '&#x2014;'}</div></div>
    </div>
  </div>

  <table class="info" style="margin-top:14px;border:2px solid #e5e7eb">
    <tr><td colspan="4" style="background:#f8fafc;font-weight:700;font-size:9px;letter-spacing:.5px;text-transform:uppercase;color:#374151">For Platform Use Only</td></tr>
    <tr><td>Booking ID</td><td>${d.id}</td><td>Verified By</td><td>Filmons Platform</td></tr>
    <tr><td>Signed At</td><td colspan="3">${signedAt ? `${signedAt} EST` : 'Not signed'}</td></tr>
  </table>
</div>

<div class="footer">
  This document is generated by Filmons Film Gear Rental Marketplace. For support, visit filmons.com or email support@filmons.com.<br/>
  Agreement Ref: ${d.id} &nbsp;&#xB7;&nbsp; Version 1.0 &#x2014; ${new Date().getFullYear()}
</div>

</body></html>`;
}

// ── Receipt HTML ───────────────────────────────────────────────────
export function buildReceiptHTML(d: ReceiptData): string {
  const subtotalNum = d.subtotal ?? d.total_amount;
  const buyerFeeAmount = d.buyer_fee_amount ?? 0;
  const dailyRate = d.duration ? (subtotalNum / d.duration).toFixed(2) : subtotalNum.toFixed(2);
  const subtotal   = subtotalNum.toFixed(2);
  const deposit    = (d.total_amount * 1.44).toFixed(2);
  const returnDate = d.start_date && d.duration
    ? (() => { const dt = new Date(d.start_date); dt.setDate(dt.getDate() + d.duration); return dt.toISOString().split('T')[0]; })()
    : '&#x2014;';
  const issuedAt = new Date(d.issued_at).toLocaleString('en-CA', { timeZone: 'America/Toronto', year:'numeric', month:'long', day:'numeric', hour:'2-digit', minute:'2-digit' });

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><meta http-equiv="Content-Type" content="text/html; charset=utf-8"/>
<title>Filmons Receipt &#x2014; ${d.id}</title>
<style>${BASE_CSS}
  .cover{text-align:center}
</style>
</head><body>

<!-- COVER -->
<div class="cover">
  <div class="cover-logo">&#x1F3AC; FILMONS</div>
  <div class="cover-sub">Film Gear Rental Marketplace</div>
  <div style="border-top:1px solid rgba(255,255,255,.22);margin-top:16px;padding-top:16px">
    <div class="cover-sub">PAYMENT RECEIPT</div>
    <div class="amount-big">$${d.total_amount.toFixed(2)} CAD</div>
    <div style="font-size:11px;opacity:.75">Total Paid</div>
    <div class="confirmed">&#x2713; PAYMENT CONFIRMED</div>
  </div>
  <div class="cover-ref">
    Receipt No: ${d.id}<br/>
    Agreement Ref: ${d.agreement_id || '&#x2014;'}<br/>
    Issued: ${issuedAt} EST
  </div>
  <div class="cover-site">filmons.com | support@filmons.com</div>
</div>

<!-- SECTION 1: Receipt Info -->
<div class="sec">
  <div class="sec-title">Section 1 &#x2014; Receipt Information</div>
  <table class="info">
    <tr><td>Receipt Number</td><td>${d.id}</td><td>Agreement Ref</td><td>${d.agreement_id || '&#x2014;'}</td></tr>
    <tr><td>Issued Date</td><td>${d.issued_at ? d.issued_at.split('T')[0] : '&#x2014;'}</td><td>Issued Time</td><td>${issuedAt.split('at')[1]?.trim() || '&#x2014;'} EST</td></tr>
    <tr><td>Payment Status</td><td><strong>PAID &#x2713;</strong></td><td>Payment Method</td><td>${d.payment_method}</td></tr>
  </table>
</div>

<!-- SECTION 2: Parties -->
<div class="sec">
  <div class="sec-title">Section 2 &#x2014; Parties</div>
  <div class="two">
    <div>
      <div class="sub" style="margin-top:0">2.1 Host (Gear Owner)</div>
      <table class="info">
        <tr><td>Full Name</td><td>${d.host_name || '&#x2014;'}</td></tr>
        <tr><td>Email</td><td>${d.host_email || '&#x2014;'}</td></tr>
        <tr><td>Role</td><td>Host / Gear Owner</td></tr>
      </table>
    </div>
    <div>
      <div class="sub" style="margin-top:0">2.2 Renter</div>
      <table class="info">
        <tr><td>Full Name</td><td>${d.renter_name}</td></tr>
        <tr><td>Email</td><td>${d.renter_email} <span class="badge">&#x2713;</span></td></tr>
        <tr><td>Phone</td><td>${d.renter_phone || '&#x2014;'} <span class="badge">&#x2713;</span></td></tr>
      </table>
    </div>
  </div>
</div>

<!-- SECTION 3: Rental Details -->
<div class="sec">
  <div class="sec-title">Section 3 &#x2014; Rental Details</div>
  <table class="info">
    <tr><td>Listing</td><td colspan="3"><strong>${d.listing_title}</strong></td></tr>
    <tr><td>Type</td><td>${d.listing_type || 'Rental'}</td><td>Condition</td><td>As listed on Filmons</td></tr>
    <tr><td>Start Date</td><td>${d.start_date || '&#x2014;'}</td><td>End Date</td><td>${returnDate || '&#x2014;'}</td></tr>
    <tr><td>Duration</td><td>${d.duration || 1} ${d.duration_type || 'day'}(s)</td><td>Pickup Time</td><td>As agreed via Filmons</td></tr>
  </table>
</div>

<!-- SECTION 4: Price Breakdown -->
<div class="sec">
  <div class="sec-title">Section 4 &#x2014; Price Breakdown</div>
  <table width="100%" style="border-collapse:collapse">
    <tr style="background:#f8fafc">
      <td style="padding:6px 10px;font-weight:700;font-size:10px;border-bottom:2px solid #e5e7eb">Description</td>
      <td style="padding:6px 10px;font-weight:700;font-size:10px;border-bottom:2px solid #e5e7eb;text-align:center">Qty</td>
      <td style="padding:6px 10px;font-weight:700;font-size:10px;border-bottom:2px solid #e5e7eb;text-align:center">Unit Price</td>
      <td style="padding:6px 10px;font-weight:700;font-size:10px;border-bottom:2px solid #e5e7eb;text-align:right">Amount</td>
    </tr>
    <tr class="price-row">
      <td>${d.listing_title}</td>
      <td style="text-align:center">${d.duration || 1} ${d.duration_type || 'day'}(s)</td>
      <td style="text-align:center">$${dailyRate} CAD</td>
      <td>$${subtotal} CAD</td>
    </tr>
    <tr class="price-row">
      <td>Filmons Fee</td>
      <td style="text-align:center">1</td>
      <td style="text-align:center">&#x2014;</td>
      <td>$${buyerFeeAmount.toFixed(2)} CAD</td>
    </tr>
    <tr class="price-total">
      <td colspan="3"><strong>TOTAL PAID</strong></td>
      <td><strong>$${d.total_amount.toFixed(2)} CAD</strong></td>
    </tr>
  </table>
  <table class="info" style="margin-top:8px">
    <tr><td>Security Deposit (authorized, not charged)</td><td>Held &nbsp;<span class="badge-blue" style="display:inline-block;background:#dbeafe;color:#1d4ed8;padding:1px 7px;border-radius:99px;font-size:8.5px;font-weight:700;border:1px solid #bfdbfe">$${deposit} CAD</span></td></tr>
  </table>
  <p style="font-size:9px;color:#6b7280;margin-top:5px;line-height:1.5">The security deposit is authorized (held) on your payment method and is not charged unless damage is confirmed through the Filmons dispute process. Released within 48 hours of confirmed return in satisfactory condition.</p>
</div>

<!-- SECTION 5: Key Policies -->
<div class="sec">
  <div class="sec-title">Section 5 &#x2014; Key Policies</div>
  <table width="100%" style="border-collapse:collapse">
    <tr class="policy-row"><td>Security Deposit</td><td>Authorized (held) &#x2014; released 48 hrs after confirmed return in good condition.</td></tr>
    <tr class="policy-row"><td>Late Return Fee</td><td>1.5&#xD7; daily rate per additional day after agreed return time.</td></tr>
    <tr class="policy-row"><td>Cancellation</td><td>Full refund if cancelled 7+ days before start. See Agreement §8.</td></tr>
    <tr class="policy-row"><td>Dispute Window</td><td>48 hours after return via Filmons platform.</td></tr>
  </table>
  <p style="font-size:9px;color:#6b7280;margin-top:5px">Full terms are available in your signed Rental Agreement (ref: ${d.agreement_id || '&#x2014;'}). For support, visit filmons.com or email support@filmons.com.</p>
</div>

<!-- SECTION 6: Platform Confirmation -->
<div class="sec">
  <div class="sec-title">Section 6 &#x2014; Platform Confirmation</div>
  <table class="info">
    <tr><td>Payment Processed By</td><td>Filmons Platform (secure escrow)</td><td>Release to Host</td><td>24 hrs after confirmed return</td></tr>
    <tr><td>Email Verified</td><td>Yes &#x2713;</td><td>Phone Verified</td><td>Yes &#x2713;</td></tr>
    <tr><td>ID Verified</td><td>Yes &#x2014; stored in Filmons vault</td><td>Agreement Signed</td><td>Yes &#x2014; digital signature &#x2713;</td></tr>
    <tr><td>Governing Law</td><td>Province of British Columbia, Canada</td><td>Dispute Resolution</td><td>BCICAC binding arbitration</td></tr>
  </table>
</div>

<div class="confirm-box">
  <div class="thank">Thank you for renting on Filmons, ${d.renter_name.split(' ')[0]}!</div>
  <div style="font-size:9.5px;color:#374151">This receipt was automatically generated and emailed to ${d.renter_email} and ${d.host_name || 'the host'} upon payment confirmation.</div>
</div>

<div class="footer">
  Filmons Film Gear Rental Marketplace | filmons.com | support@filmons.com<br/>
  Receipt ${d.id} | Agreement ${d.agreement_id || '&#x2014;'} | Version 1.0 &#x2014; ${new Date().getFullYear()}
</div>

</body></html>`;
}

// ── Upload to the private rental-verification bucket, return the storage
// PATH (never a public URL — callers mint a short-lived signed URL at view
// time via signRentalDoc in src/lib/upload.ts). ─────────────────────
export async function uploadPDFDoc(path: string, html: string): Promise<string> {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(html);
  const blob = new Blob([bytes], { type: 'text/html; charset=utf-8' });
  try {
    const { data, error } = await supabase.storage.from('rental-verification')
      .upload(path, blob, { contentType: 'text/html; charset=utf-8', upsert: true });
    if (error) { console.warn('Document upload failed:', error.message); return ''; }
    return data?.path || '';
  } catch {
    return '';
  }
}

// ── Regenerate a signed agreement's documents from its frozen snapshot ────
// Used when Checkout.tsx's post-sign generation failed (see its catch
// block) and MyOrders.tsx's "Retry generating documents" needs to recover.
// Deterministic and safe to re-run: everything is read from the already-
// immutable `rental_agreements` row (the DB trigger allows updating the
// document-path columns even after status='signed'), never from live
// profile/listing state — a later address/name/listing change must not
// leak into an already-signed document.
export async function regenerateAgreementDocuments(agreementId: string): Promise<{
  renterPath: string | null; hostPath: string | null; receiptPath: string | null; error?: string;
}> {
  const { data: agRow, error: fetchErr } = await supabase.from('rental_agreements').select('*').eq('id', agreementId).maybeSingle();
  if (fetchErr || !agRow) return { renterPath: null, hostPath: null, receiptPath: null, error: fetchErr?.message || 'Agreement not found' };

  const [renterProfile, hostProfile] = await Promise.all([
    agRow.renter_id ? supabase.from('profiles').select('name, email, phone').eq('id', agRow.renter_id).maybeSingle().then(r => r.data) : null,
    agRow.host_id ? supabase.from('profiles').select('name, email, username').eq('id', agRow.host_id).maybeSingle().then(r => r.data) : null,
  ]);

  let signatureDataUrl = '';
  if (agRow.signature_path) {
    const signed = await signRentalDoc(agRow.signature_path, 300);
    if (signed) {
      try {
        const blob = await (await fetch(signed)).blob();
        signatureDataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      } catch { /* signature is best-effort — document still generates without it */ }
    }
  }

  const details = agRow.rental_details_snapshot || {};
  const pricing = agRow.pricing_snapshot || {};

  const baseAgreement: AgreementData = {
    id: agRow.id,
    renter_id: agRow.renter_id, host_id: agRow.host_id,
    first_name: agRow.legal_first_name || renterProfile?.name?.split(' ')[0] || '',
    last_name: agRow.legal_last_name || renterProfile?.name?.split(' ').slice(1).join(' ') || '',
    birthdate: agRow.date_of_birth || '',
    id_type: agRow.id_type, id_country: agRow.id_issuing_country || '',
    email: agRow.verified_email || renterProfile?.email || '',
    phone: agRow.verified_phone || renterProfile?.phone || '',
    address: agRow.address_line1 || '', city: agRow.city || '',
    province: agRow.province_state || '', postal_code: agRow.postal_code || '',
    country: agRow.address_country === 'US' ? 'United States' : 'Canada',
    proof_of_address_type: agRow.proof_of_address_type,
    signature_data: signatureDataUrl || undefined,
    listing_title: details.listingTitle || '—',
    total_amount: Number(pricing.total ?? details.amount ?? 0),
    subtotal: pricing.subtotal, buyer_fee_amount: pricing.buyerFeeAmount,
    payment_method: details.paymentMethod || 'Card',
    start_date: details.startDate, duration: details.duration, duration_type: details.durationType,
    signed_at: agRow.signed_at || '',
    host_name: hostProfile?.name, host_email: hostProfile?.email, host_username: hostProfile?.username,
    verification_reused: !!agRow.renter_verification_id,
  };

  const renterHtml = buildAgreementHTML(baseAgreement, false);
  const hostHtml = buildAgreementHTML(baseAgreement, true);
  const receiptHtml = buildReceiptHTML({
    id: agRow.agreement_number, agreement_id: agRow.id,
    renter_id: agRow.renter_id, host_id: agRow.host_id,
    renter_name: `${baseAgreement.first_name} ${baseAgreement.last_name}`.trim(),
    renter_email: baseAgreement.email, renter_phone: baseAgreement.phone,
    host_name: hostProfile?.name, host_email: hostProfile?.email,
    listing_title: baseAgreement.listing_title, start_date: baseAgreement.start_date,
    duration: baseAgreement.duration, duration_type: baseAgreement.duration_type,
    total_amount: baseAgreement.total_amount, subtotal: baseAgreement.subtotal, buyer_fee_amount: baseAgreement.buyer_fee_amount,
    payment_method: baseAgreement.payment_method, issued_at: agRow.signed_at || new Date().toISOString(),
  });

  const [renterPath, hostPath, receiptPath] = await Promise.all([
    uploadPDFDoc(`${agRow.id}/agreement-renter.html`, renterHtml),
    uploadPDFDoc(`${agRow.id}/agreement-host.html`, hostHtml),
    uploadPDFDoc(`${agRow.id}/receipt.html`, receiptHtml),
  ]);

  await supabase.from('rental_agreements').update({
    agreement_renter_path: renterPath || null,
    agreement_host_path: hostPath || null,
    receipt_path: receiptPath || null,
  }).eq('id', agreementId);

  return { renterPath: renterPath || null, hostPath: hostPath || null, receiptPath: receiptPath || null };
}