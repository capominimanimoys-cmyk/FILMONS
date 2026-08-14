import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { supportApi, STATUS_LABEL, type SupportCase, type SupportMessage } from '../lib/supportApi';
import { ArrowLeft, Paperclip, Send, Loader2, ExternalLink } from 'lucide-react';

const STATUS_CLASS: Record<string, string> = {
  open: 'bg-blue-100 text-blue-600', waiting_for_agent: 'bg-blue-100 text-blue-600',
  in_review: 'bg-amber-100 text-amber-600', waiting_for_customer: 'bg-indigo-100 text-indigo-600',
  resolved: 'bg-green-100 text-green-600', closed: 'bg-gray-100 text-gray-500',
};

export function SupportCaseDetail() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [supportCase, setSupportCase] = useState<SupportCase | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<{ path: string; name: string }[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const [c, msgs] = await Promise.all([supportApi.getCase(id), supportApi.getMessages(id)]);
      setSupportCase(c);
      setMessages(msgs);
      setLoading(false);
    })();
    const unsubscribe = supportApi.subscribeToCase(id, (msg) => {
      setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg]);
    });
    return unsubscribe;
  }, [id]);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }); }, [messages]);

  const handleAttach = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !user?.id) return;
    setUploading(true);
    try {
      const att = await supportApi.uploadAttachment(user.id, file);
      setPendingAttachments(prev => [...prev, att]);
    } catch (err: any) {
      toast.error(err?.message || 'Could not upload attachment');
    } finally {
      setUploading(false);
    }
  };

  const send = async () => {
    const text = input.trim();
    if ((!text && pendingAttachments.length === 0) || sending || !id || !user?.id) return;
    setSending(true);
    try {
      await supportApi.sendUserMessage(id, user.id, user.name || 'You', text || '(attachment)', pendingAttachments);
      setMessages(prev => [...prev, {
        id: `local-${Date.now()}`, case_id: id, sender_type: 'user', sender_id: user.id, sender_name: user.name || 'You',
        content: text || '(attachment)', attachments: pendingAttachments, is_internal_note: false, created_at: new Date().toISOString(),
      }]);
      setInput('');
      setPendingAttachments([]);
    } catch (err: any) {
      toast.error(err?.message || 'Could not send message');
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><Loader2 className="w-6 h-6 text-blue-400 animate-spin" /></div>;
  }
  if (!supportCase) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center text-sm text-gray-400">Case not found.</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <div className="bg-white border-b border-gray-100 sticky top-0 z-10 px-4 py-3">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <button onClick={() => navigate('/support/cases')} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100">
            <ArrowLeft className="w-4 h-4 text-gray-500" />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-black text-gray-900 truncate">{supportCase.subject}</p>
            <p className="text-xs text-gray-400">Case #{supportCase.case_number}</p>
          </div>
          <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-full shrink-0 ${STATUS_CLASS[supportCase.status]}`}>{STATUS_LABEL[supportCase.status]}</span>
        </div>
      </div>

      {supportCase.related_order_id && (
        <div className="max-w-lg mx-auto w-full px-4 pt-3">
          <button onClick={() => navigate('/my-orders')} className="w-full bg-white border border-gray-100 rounded-2xl px-4 py-3 flex items-center justify-between">
            <span className="text-xs text-gray-500">Related order #{supportCase.related_order_id}</span>
            <span className="text-xs font-bold text-blue-600 flex items-center gap-1">View Order <ExternalLink className="w-3 h-3" /></span>
          </button>
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3 max-w-lg mx-auto w-full">
        {messages.map(m => (
          <div key={m.id} className={`flex ${m.sender_type === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
              m.sender_type === 'user' ? 'bg-blue-600 text-white'
              : m.sender_type === 'system' ? 'bg-gray-100 text-gray-500 text-xs italic mx-auto'
              : 'bg-white border border-gray-100 text-gray-800'
            }`}>
              {m.sender_type !== 'user' && m.sender_type !== 'system' && (
                <p className="text-[10px] font-bold uppercase mb-0.5 opacity-60">{m.sender_type === 'ai' ? 'AI Assistant' : m.sender_name || 'Filmons Support'}</p>
              )}
              <p>{m.content}</p>
              {m.attachments?.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {m.attachments.map((a, i) => (
                    <span key={i} className="text-[10px] bg-black/10 rounded-full px-2 py-0.5 flex items-center gap-1"><Paperclip className="w-2.5 h-2.5" /> {a.name}</span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white border-t border-gray-100 px-4 py-3 sticky bottom-0">
        <div className="max-w-lg mx-auto">
          {pendingAttachments.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {pendingAttachments.map((a, i) => (
                <span key={i} className="text-[10px] bg-gray-100 text-gray-600 rounded-full px-2 py-1 flex items-center gap-1"><Paperclip className="w-2.5 h-2.5" /> {a.name}</span>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2">
            <input ref={fileInputRef} type="file" accept="image/*,.pdf" className="hidden" onChange={handleAttach} />
            <button onClick={() => fileInputRef.current?.click()} disabled={uploading} className="w-10 h-10 shrink-0 border border-gray-200 rounded-full flex items-center justify-center disabled:opacity-50">
              {uploading ? <Loader2 className="w-4 h-4 animate-spin text-gray-400" /> : <Paperclip className="w-4 h-4 text-gray-400" />}
            </button>
            <input
              value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') send(); }}
              placeholder="Write a message…"
              className="flex-1 border border-gray-200 rounded-full px-4 py-2.5 text-base outline-none focus:border-blue-400"
            />
            <button onClick={send} disabled={sending || (!input.trim() && !pendingAttachments.length)} className="w-10 h-10 shrink-0 bg-blue-600 text-white rounded-full flex items-center justify-center disabled:opacity-40">
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
