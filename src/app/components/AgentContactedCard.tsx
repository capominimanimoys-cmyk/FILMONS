import { useEffect, useState } from 'react';
import { Mail, Phone, MessageCircle } from 'lucide-react';
import { getSupportContact, formatPhone, type SupportContact } from '../lib/supportContact';

/**
 * Premium contact card shown once a support case is created / handed off
 * to human support — centralized so Gabriel's (or a future agent's)
 * contact info is never hardcoded across components (see supportContact.ts).
 */
export function AgentContactedCard({ onContinueChat }: { onContinueChat?: () => void }) {
  const [contact, setContact] = useState<SupportContact | null>(null);

  useEffect(() => { getSupportContact().then(setContact); }, []);

  if (!contact) return null;

  return (
    <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6">
      <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">Agent Contacted</p>
      <div className="flex items-center gap-3 mb-5">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-black text-lg">
          {contact.name.split(' ').map(n => n[0]).slice(0, 2).join('')}
        </div>
        <div>
          <p className="text-base font-black text-gray-900">{contact.name}</p>
          <p className="text-xs text-gray-400">{contact.role}</p>
        </div>
      </div>

      <div className="space-y-2 mb-5">
        <a href={`mailto:${contact.email}`} className="flex items-center gap-2 text-sm text-gray-600 hover:text-blue-600">
          <Mail className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">{contact.email}</span>
        </a>
        {contact.phone && (
          <a href={`tel:${contact.phone}`} className="flex items-center gap-2 text-sm text-gray-600 hover:text-blue-600">
            <Phone className="w-3.5 h-3.5 shrink-0" />
            <span>{formatPhone(contact.phone)}</span>
          </a>
        )}
      </div>

      <div className="space-y-2">
        {onContinueChat && (
          <button
            onClick={onContinueChat}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-black text-sm rounded-2xl flex items-center justify-center gap-2"
          >
            <MessageCircle className="w-4 h-4" /> Continue in Support Chat
          </button>
        )}
        <div className="grid grid-cols-2 gap-2">
          <a href={`mailto:${contact.email}`} className="py-2.5 border border-gray-200 rounded-xl text-xs font-bold text-gray-600 flex items-center justify-center gap-1.5">
            <Mail className="w-3.5 h-3.5" /> Send Email
          </a>
          {contact.phone ? (
            <a href={`tel:${contact.phone}`} className="py-2.5 border border-gray-200 rounded-xl text-xs font-bold text-gray-600 flex items-center justify-center gap-1.5">
              <Phone className="w-3.5 h-3.5" /> Call
            </a>
          ) : <span />}
        </div>
      </div>
    </div>
  );
}
