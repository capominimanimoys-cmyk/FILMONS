import { ReactElement } from 'react';

export const PaymentLogo = ({ method, size = 32 }: { method: string; size?: number }) => {
  const w = Math.round(size * 1.65);
  const h = size;

  const logos: Record<string, ReactElement> = {
    Visa: (
      <svg width={w} height={h} viewBox="0 0 52 30" fill="none">
        <rect width="52" height="30" rx="5" fill="#1A1F71" />
        <rect width="52" height="30" rx="5" fill="url(#visa-g)" opacity="0.15" />
        <defs>
          <linearGradient id="visa-g" x1="0" y1="0" x2="52" y2="30" gradientUnits="userSpaceOnUse">
            <stop stopColor="white" /><stop offset="1" stopColor="#3B4FD9" />
          </linearGradient>
        </defs>
        {/* Italic VISA wordmark approximation */}
        <text x="26" y="21" textAnchor="middle" fill="white" fontFamily="'Times New Roman',serif"
          fontSize="15" fontWeight="900" fontStyle="italic" letterSpacing="1">VISA</text>
      </svg>
    ),

    Mastercard: (
      <svg width={w} height={h} viewBox="0 0 52 30" fill="none">
        <rect width="52" height="30" rx="5" fill="#1A1A1A" />
        <defs>
          <linearGradient id="mc-left" x1="12" y1="6" x2="12" y2="24" gradientUnits="userSpaceOnUse">
            <stop stopColor="#FF5F57" /><stop offset="1" stopColor="#EB001B" />
          </linearGradient>
          <linearGradient id="mc-right" x1="30" y1="6" x2="30" y2="24" gradientUnits="userSpaceOnUse">
            <stop stopColor="#FFC107" /><stop offset="1" stopColor="#F79E1B" />
          </linearGradient>
        </defs>
        <circle cx="19" cy="15" r="9" fill="url(#mc-left)" />
        <circle cx="33" cy="15" r="9" fill="url(#mc-right)" />
        <path d="M26 8.27a9 9 0 0 1 0 13.46A9 9 0 0 1 26 8.27z" fill="#FF5F00" />
      </svg>
    ),

    PayPal: (
      <svg width={w} height={h} viewBox="0 0 52 30" fill="none">
        <rect width="52" height="30" rx="5" fill="#F7F9FC" />
        <rect x="0.5" y="0.5" width="51" height="29" rx="4.5" stroke="#E2E8F0" />
        <defs>
          <linearGradient id="pp-g" x1="14" y1="6" x2="14" y2="24" gradientUnits="userSpaceOnUse">
            <stop stopColor="#009CDE" /><stop offset="1" stopColor="#003087" />
          </linearGradient>
        </defs>
        {/* P */}
        <text x="14" y="21" fill="url(#pp-g)" fontFamily="Arial,sans-serif" fontSize="14" fontWeight="900">P</text>
        {/* ay */}
        <text x="22" y="21" fill="#003087" fontFamily="Arial,sans-serif" fontSize="14" fontWeight="900">ayPal</text>
      </svg>
    ),

    'Apple Pay': (
      <svg width={w} height={h} viewBox="0 0 52 30" fill="none">
        <rect width="52" height="30" rx="5" fill="#000" />
        {/* Apple logo path (simplified) */}
        <path d="M17.3 10.2c.7-.9 1.1-2 1-3.2-1 .1-2.2.7-2.9 1.6-.7.8-1.2 1.9-1 3.1 1 0 2.2-.6 2.9-1.5zm.9 1.5c-1.6-.1-3 1-3.8 1-.8 0-2-.9-3.3-.9-1.7.1-3.3 1-4.1 2.6-1.8 3 .4 7.5 1.6 9.8.8 1.1 1.7 2.3 3 2.3 1.2-.1 1.6-.8 3-.8 1.5 0 1.9.8 3.1.8 1.3 0 2.1-1.2 2.9-2.3.9-1.3 1.2-2.6 1.2-2.7-.1 0-2.4-1-2.4-3.7 0-2.3 1.9-3.4 2-3.5-.9-1-2-1.6-3.2-1.6z"
          fill="white" transform="translate(1, 0)" />
        <text x="32" y="21" textAnchor="middle" fill="white"
          fontFamily="-apple-system,BlinkMacSystemFont,'Helvetica Neue',sans-serif"
          fontSize="11" fontWeight="600" letterSpacing="0.5">Pay</text>
      </svg>
    ),

    'E-Transfer': (
      <svg width={w} height={h} viewBox="0 0 52 30" fill="none">
        <rect width="52" height="30" rx="5" fill="#F0FFF4" />
        <rect x="0.5" y="0.5" width="51" height="29" rx="4.5" stroke="#BBF7D0" />
        <defs>
          <linearGradient id="et-g" x1="0" y1="0" x2="52" y2="30" gradientUnits="userSpaceOnUse">
            <stop stopColor="#059669" /><stop offset="1" stopColor="#047857" />
          </linearGradient>
        </defs>
        <text x="26" y="13" textAnchor="middle" fill="url(#et-g)"
          fontFamily="Arial,sans-serif" fontSize="7.5" fontWeight="800" letterSpacing="0.3">Interac</text>
        <text x="26" y="23" textAnchor="middle" fill="#065F46"
          fontFamily="Arial,sans-serif" fontSize="7" letterSpacing="0.2">e-Transfer</text>
      </svg>
    ),

    'Credit Card': (
      <svg width={w} height={h} viewBox="0 0 52 30" fill="none">
        <defs>
          <linearGradient id="cc-g" x1="0" y1="0" x2="52" y2="30" gradientUnits="userSpaceOnUse">
            <stop stopColor="#2563EB" /><stop offset="1" stopColor="#4F46E5" />
          </linearGradient>
        </defs>
        <rect width="52" height="30" rx="5" fill="url(#cc-g)" />
        {/* Chip */}
        <rect x="7" y="8" width="11" height="8" rx="2" fill="#FBBF24" />
        <rect x="9" y="9.5" width="7" height="5" rx="1" fill="#F59E0B" />
        <line x1="12.5" y1="8" x2="12.5" y2="16" stroke="#FBBF24" strokeWidth="0.75" opacity="0.6" />
        {/* Card number dots */}
        <circle cx="21" cy="22" r="1.2" fill="white" opacity="0.7" />
        <circle cx="25" cy="22" r="1.2" fill="white" opacity="0.7" />
        <circle cx="29" cy="22" r="1.2" fill="white" opacity="0.7" />
        <circle cx="33" cy="22" r="1.2" fill="white" opacity="0.7" />
        <text x="45" y="13" textAnchor="end" fill="white" opacity="0.85"
          fontFamily="Arial,sans-serif" fontSize="5.5" fontWeight="700" letterSpacing="0.5">CREDIT</text>
      </svg>
    ),

    'Debit Card': (
      <svg width={w} height={h} viewBox="0 0 52 30" fill="none">
        <defs>
          <linearGradient id="dc-g" x1="0" y1="0" x2="52" y2="30" gradientUnits="userSpaceOnUse">
            <stop stopColor="#059669" /><stop offset="1" stopColor="#0D9488" />
          </linearGradient>
        </defs>
        <rect width="52" height="30" rx="5" fill="url(#dc-g)" />
        <rect x="0" y="9" width="52" height="8" fill="rgba(0,0,0,0.25)" />
        <rect x="7" y="21" width="9" height="3" rx="1" fill="white" opacity="0.7" />
        <rect x="18" y="21" width="6" height="3" rx="1" fill="white" opacity="0.7" />
        <text x="45" y="8" textAnchor="end" fill="white" opacity="0.85"
          fontFamily="Arial,sans-serif" fontSize="5.5" fontWeight="700" letterSpacing="0.5">DEBIT</text>
      </svg>
    ),

    FP: (
      <svg width={w} height={h} viewBox="0 0 52 30" fill="none">
        <defs>
          <linearGradient id="fp-g" x1="0" y1="0" x2="52" y2="30" gradientUnits="userSpaceOnUse">
            <stop stopColor="#7C3AED" /><stop offset="1" stopColor="#4F46E5" />
          </linearGradient>
        </defs>
        <rect width="52" height="30" rx="5" fill="url(#fp-g)" />
        <text x="26" y="21" textAnchor="middle" fill="white"
          fontFamily="Arial,sans-serif" fontSize="14" fontWeight="900" letterSpacing="2">FP</text>
      </svg>
    ),

    Cash: (
      <svg width={w} height={h} viewBox="0 0 52 30" fill="none">
        <defs>
          <linearGradient id="cash-g" x1="0" y1="0" x2="52" y2="30" gradientUnits="userSpaceOnUse">
            <stop stopColor="#16A34A" /><stop offset="1" stopColor="#15803D" />
          </linearGradient>
        </defs>
        <rect width="52" height="30" rx="5" fill="url(#cash-g)" />
        {/* Dollar sign circle */}
        <circle cx="14" cy="15" r="7" fill="rgba(255,255,255,0.12)" />
        <text x="14" y="19.5" textAnchor="middle" fill="white"
          fontFamily="Arial,sans-serif" fontSize="11" fontWeight="800">$</text>
        <text x="34" y="17" textAnchor="middle" fill="white"
          fontFamily="Arial,sans-serif" fontSize="8.5" fontWeight="700" letterSpacing="0.5">CASH</text>
      </svg>
    ),
  };

  const key = Object.keys(logos).find(k => method?.toLowerCase().includes(k.toLowerCase())) ?? 'Credit Card';
  return logos[key] ?? logos['Credit Card'];
};
