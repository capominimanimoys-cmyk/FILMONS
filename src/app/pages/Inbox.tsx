import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { AddPhotoAlternateRounded, AddRounded, ArrowBackIosNewRounded, AttachFileRounded, AttachMoneyRounded, CalendarMonthRounded, CameraAltRounded, CancelRounded, ChatBubbleRounded, CheckCircleRounded, CheckRounded, CloseRounded, ConstructionRounded, CreditCardRounded, DeleteRounded, DoneAllRounded, EditRounded, FavoriteRounded, GppBadRounded, GroupRounded, HourglassEmptyRounded, HowToRegRounded, ImageRounded, Inventory2Rounded, KeyboardArrowDownRounded, LocalOfferRounded, LocationOnRounded, MicOffRounded, MicRounded, MoreHorizRounded, MoreVertRounded, MusicNoteRounded, OpenInNewRounded, PaymentRounded, PersonAddRounded, PersonRemoveRounded, PhoneDisabledRounded, PhoneRounded, PhotoCameraRounded, PhotoLibraryRounded, PlayArrowRounded, PushPinRounded, ReplyRounded, ScheduleRounded, SearchRounded, SendRounded, SentimentSatisfiedRounded, StopRounded, VerifiedRounded, VideoLibraryRounded, VideocamOffRounded, VideocamRounded, VolumeUpRounded } from '../components/Icons';
import { useNavigate, Link, useSearchParams } from 'react-router';
import { useAuth } from '../context/AuthContext';
import { chatApi, authApi, dbRowToMsg, consumeDeletedConvRecord } from '../lib/api';
import * as notifs from '../lib/notifications';
import { notifyImmediateEmail } from '../lib/messageNotification';
import { supabase } from '../../lib/supabase';
import { projectId, publicAnonKey } from '/utils/supabase/info';
import { Conversation, ChatMessage, User, Post, Listing, PricingPackage } from '../types';
import { UserAvatar, AccountTypeBadge } from '../components/AccountTypeBadge';
import { toast } from 'sonner';
import {
  Send, ArrowLeft, MessageCircle, Search, Play, Heart, Music2,
  Image as ImageIcon, CalendarDays, Clock, Package, CheckCircle,
  XCircle, BadgeCheck, CreditCard, ExternalLink, X, DollarSign,
  ChevronDown, Camera, Wrench, Tag, Smile, Paperclip, Mic,
  MicOff, Phone, PhoneOff, Video, VideoOff, Square, Volume2, MapPin,
  UserCheck, UserX, ShieldAlert, CornerUpLeft, Pencil, Pin, Trash2,
  MoreHorizontal, Check, CheckCheck, SquarePen, Users, UserPlus, Plus,
  ImagePlus, Film, GalleryHorizontal,
} from 'lucide-react';

// MUI icons — filled/rounded, React Native feel

// ── Helpers ────────────────────────────────────────────────────────
function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function fmtDuration(s: number) {
  const m = Math.floor(s / 60).toString().padStart(2, '0');
  const sec = (s % 60).toString().padStart(2, '0');
  return `${m}:${sec}`;
}

function getListingKind(l: Listing): 'rental' | 'service' | 'sale' {
  if (l.listingType === 'service') return 'service';
  if (l.listingMode === 'sale') return 'sale';
  return 'rental';
}

function readHostListings(userId: string): Listing[] {
  try {
    const stored = localStorage.getItem('filmons_listings');
    const all: Listing[] = stored ? JSON.parse(stored) : [];
    return all.filter(l => l.userId === userId);
  } catch { return []; }
}

// ── Emoji Picker ───────────────────────────────────────────────────
const EMOJI_ROWS = [
  ['😀','😂','🤣','😍','🥰','😊','😎','🤔','😢','😡','🥹','😱','🤩','🥳','😏','😤','😴','🤯','🫡','🤗'],
  ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','❤️‍🔥','💔','💕','💞','💓','💖','💘','💝','🫶','💯','✨','🔥'],
  ['👍','👎','👏','🙏','🤝','✌️','🤞','💪','✋','🤙','👋','🤲','👌','🤌','🤏','🫵','☝️','🫱','🫲','🫸'],
  ['🎉','🎊','🏆','💎','🔑','📸','🎬','🎥','🎵','🎶','💰','🚀','⭐','🌟','💡','📱','💻','🎯','🎤','🎧'],
  ['🐶','🐱','🦁','🐻','🦊','🐨','🐸','🐵','🦋','🌸','🌹','🌻','🍕','🍔','🍦','☕','🍻','🎂','🍓','🌈'],
];

function EmojiPicker({ onSelect, onClose }: { onSelect: (e: string) => void; onClose: () => void }) {
  return (
    <div className="absolute bottom-full mb-2 left-0 bg-white rounded-2xl shadow-2xl border border-gray-100 p-3 z-50 w-72">
      <div className="space-y-1.5">
        {EMOJI_ROWS.map((row, ri) => (
          <div key={ri} className="flex gap-1 flex-wrap">
            {row.map(emoji => (
              <button key={emoji} type="button"
                onClick={() => { onSelect(emoji); onClose(); }}
                className="w-9 h-9 flex items-center justify-center text-xl rounded-lg hover:bg-gray-100 transition-colors">
                {emoji}
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Media Bubble ───────────────────────────────────────────────────
function MediaBubble({ msg, isOwn }: { msg: ChatMessage; isOwn: boolean }) {
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  const toggleAudio = () => {
    if (!audioRef.current) return;
    if (playing) { audioRef.current.pause(); setPlaying(false); }
    else { audioRef.current.play(); setPlaying(true); }
  };

  if (msg.mediaType === 'image') {
    return (
      <div className="max-w-[220px]">
        <img src={msg.mediaUrl} alt="sent image" className="rounded-2xl w-full object-cover max-h-72 block" />
        {msg.content && <p className={`text-xs mt-1 px-1 ${isOwn ? 'text-blue-100' : 'text-gray-500'}`}>{msg.content}</p>}
      </div>
    );
  }
  if (msg.mediaType === 'video') {
    return (
      <div className="max-w-[220px]">
        <video src={msg.mediaUrl} controls className="rounded-2xl w-full object-cover max-h-72 block" />
        {msg.content && <p className={`text-xs mt-1 px-1 ${isOwn ? 'text-blue-100' : 'text-gray-500'}`}>{msg.content}</p>}
      </div>
    );
  }
  if (msg.mediaType === 'audio') {
    return (
      <div className={`flex items-center gap-2 px-3 py-2.5 rounded-2xl ${isOwn ? 'bg-blue-600' : 'bg-white border border-gray-200'}`}>
        <audio ref={audioRef} src={msg.mediaUrl} onEnded={() => setPlaying(false)} className="hidden" />
        <button onClick={toggleAudio} className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${isOwn ? 'bg-white/20 hover:bg-white/30' : 'bg-blue-600 hover:bg-blue-700'}`}>
          {playing
            ? <Square className={`w-3.5 h-3.5 ${isOwn ? 'text-white' : 'text-white'}`} />
            : <Play className={`w-3.5 h-3.5 ml-0.5 ${isOwn ? 'text-white' : 'text-white'}`} />}
        </button>
        <div className="flex items-center gap-1 flex-1">
          {[...Array(20)].map((_, i) => (
            <div key={i} className={`rounded-full w-0.5 ${isOwn ? 'bg-white/60' : 'bg-blue-400'}`}
              style={{ height: `${8 + Math.sin(i * 0.8) * 8}px` }} />
          ))}
        </div>
        <Volume2 className={`w-3.5 h-3.5 shrink-0 ${isOwn ? 'text-white/70' : 'text-gray-400'}`} />
      </div>
    );
  }
  return null;
}

// ── Shared Post Bubble ─────────────────────────────────────────────
function SharedPostBubble({ post, isOwn }: { post: Post; isOwn: boolean }) {
  const arr = (v: any): string[] => Array.isArray(v) ? v : (typeof v === 'string' && v ? [v] : []);
  const safeImgs = arr(post.images);
  const safeVids = arr(post.videos);
  const safeAuds = arr(post.audios);
  const hasImage = safeImgs.length > 0;
  const hasVideo = safeVids.length > 0;
  const hasAudio = safeAuds.length > 0;
  return (
    <Link to="/feed" className={`block w-56 rounded-2xl overflow-hidden border shadow-sm hover:opacity-90 transition-opacity ${isOwn ? 'border-blue-300 bg-blue-50' : 'border-gray-200 bg-white'}`}>
      {hasImage && <img src={safeImgs[0]} alt="shared" className="w-full h-32 object-cover" />}
      {!hasImage && hasVideo && (
        <div className="relative w-full h-32 bg-gray-900 flex items-center justify-center">
          <video src={safeVids[0]} className="w-full h-full object-cover opacity-70" />
          <PlayArrowRounded sx={{fontSize:32,color:"white"}} />
        </div>
      )}
      {!hasImage && !hasVideo && hasAudio && (
        <div className="w-full h-20 bg-gradient-to-br from-purple-100 to-blue-100 flex items-center justify-center">
          <MusicNoteRounded sx={{fontSize:32}} />
        </div>
      )}
      {!hasImage && !hasVideo && !hasAudio && (
        <div className="w-full h-16 bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
          <ImageIcon className="w-6 h-6 text-gray-400" />
        </div>
      )}
      <div className="p-2.5">
        <div className="flex items-center gap-1.5 mb-1">
          <UserAvatar user={{ name: post.userName, avatar: post.userAvatar, id: post.userId }} size={18} />
          <span className="text-xs font-semibold text-gray-700 truncate">{post.userName}</span>
        </div>
        {post.content && <p className="text-xs text-gray-600 line-clamp-2 leading-relaxed">{post.content}</p>}
        <div className="flex items-center gap-2 mt-1.5 text-gray-400">
          <span className="flex items-center gap-0.5 text-[11px]"><FavoriteRounded sx={{fontSize:12}} /> {(post.likes || []).length}</span>
          <span className="text-[11px]">{timeAgo(post.createdAt)}</span>
        </div>
      </div>
    </Link>
  );
}

// ── Rental Request Bubble ─────────────────────────────────────────
function RentalRequestBubble({
  msg, isOwn, conversationId, onStatusChange, hostUser,
}: {
  msg: ChatMessage;
  isOwn: boolean;
  conversationId: string;
  onStatusChange: (payMsg?: ChatMessage, status?: 'accepted' | 'declined') => void;
  hostUser: import('../types').User | null;
}) {
  const req = msg.rentalRequest!;
  const isSale = req.listingMode === 'sale' || req.durationType === 'purchase';
  const [localStatus, setLocalStatus] = useState<string>(req.status || 'pending');
  const [acting, setActing] = useState(false);

  useEffect(() => { setLocalStatus(req.status || 'pending'); }, [req.status]);

  const statusColor = ({
    pending:  'bg-amber-50 border-amber-200',
    accepted: 'bg-green-50 border-green-200',
    declined: 'bg-red-50 border-red-200',
  } as Record<string, string>)[localStatus] || 'bg-amber-50 border-amber-200';

  const statusBadge = ({
    pending:  <span className="text-xs font-semibold text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full">Pending</span>,
    accepted: <span className="text-xs font-semibold text-green-600 bg-green-100 px-2 py-0.5 rounded-full flex items-center gap-1"><CheckCircleRounded sx={{fontSize:12}} /> Approved</span>,
    declined: <span className="text-xs font-semibold text-red-600 bg-red-100 px-2 py-0.5 rounded-full flex items-center gap-1"><CancelRounded sx={{fontSize:12}} /> Declined</span>,
  } as Record<string, React.ReactNode>)[localStatus];

  const listingForLocation = useMemo(() => {
    try { const ls: any[] = JSON.parse(localStorage.getItem('filmons_listings') || '[]'); return ls.find(l => l.id === req.listingId) || null; } catch { return null; }
  }, [req.listingId]);
  const fullAddress = listingForLocation
    ? [listingForLocation.streetAddress, listingForLocation.city, listingForLocation.province, listingForLocation.postalCode].filter(Boolean).join(', ')
    : null;

  const handleAccept = async () => {
    if (acting || localStatus !== 'pending') return;
    setActing(true);
    setLocalStatus('accepted');
    chatApi.updateRentalRequestStatus(conversationId, msg.id, 'accepted');

    // Mark the rented dates as unavailable so others can't book them
    if (req.listingId && req.startDate && req.duration && !isSale) {
      const newUnavail: string[] = [];
      for (let i = 0; i < req.duration; i++) {
        const d = new Date(req.startDate);
        d.setDate(d.getDate() + i);
        newUnavail.push(d.toISOString().split('T')[0]);
      }
      // Fetch existing unavailable dates and merge
      supabase.from('listings').select('metadata').eq('id', req.listingId).single()
        .then(({ data }) => {
          const meta = (data?.metadata as any) || {};
          const existing: string[] = Array.isArray(meta.unavailableDates) ? meta.unavailableDates : [];
          const merged = [...new Set([...existing, ...newUnavail])];
          return supabase.from('listings').update({
            metadata: { ...meta, unavailableDates: merged }
          }).eq('id', req.listingId);
        }).catch(() => {});
    }

    if (hostUser) {
      const listings: any[] = (() => { try { return JSON.parse(localStorage.getItem('filmons_listings') || '[]'); } catch { return []; } })();
      const listing = listings.find((l: any) => l.id === req.listingId);
      const isSaleReq = req.listingMode === 'sale' || req.durationType === 'purchase';
      let amount = 0;
      if (req.selectedPackage?.price) amount = req.selectedPackage.price * (isSaleReq ? 1 : req.duration);
      else if (listing?.price) amount = listing.price * (isSaleReq ? 1 : req.duration);
      const durLabel  = isSaleReq ? 'Purchase' : `${req.duration} ${req.duration === 1 ? req.durationType.replace('s', '') : req.durationType}`;
      const dateLabel = isSaleReq ? '' : new Date(req.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const pkgLabel  = req.selectedPackage ? ` · ${req.selectedPackage.name || req.selectedPackage.tier}` : '';
      const payMsg = chatApi.sendPaymentRequest(conversationId, hostUser.id, hostUser.name, hostUser.avatar, {
        amount, description: `${req.listingTitle}${pkgLabel} – ${durLabel}${dateLabel ? ' starting ' + dateLabel : ''}`,
        listingId: req.listingId, listingTitle: req.listingTitle, listingType: req.listingType,
        listingMode: listing?.listingMode ?? 'rent', startDate: req.startDate, duration: req.duration, durationType: req.durationType,
      });
      toast.success('Request approved! Payment request sent 💳');
      onStatusChange(payMsg, 'accepted');
    } else {
      toast.success('Request approved!');
      onStatusChange(undefined, 'accepted');
    }
  };

  const handleDecline = async () => {
    if (acting || localStatus !== 'pending') return;
    setActing(true);
    setLocalStatus('declined');
    chatApi.updateRentalRequestStatus(conversationId, msg.id, 'declined');
    if (hostUser) {
      const denyMsg = chatApi.buildTextMessage(
        conversationId, hostUser.id, hostUser.name, hostUser.avatar,
        `Your ${req.durationType === 'purchase' ? 'purchase' : req.listingType === 'service' ? 'service' : 'rental'} request for "${req.listingTitle}" has been declined.`
      );
      const conv = chatApi.getConversation(conversationId);
      if (conv) {
        chatApi.sendMessageToDB(conversationId, denyMsg, conv.participantIds ?? [], false, null).catch(() => {});
        chatApi.addMessage(conversationId, denyMsg);
      }
    }
    onStatusChange(undefined, 'declined');
    toast.info('Request declined. User has been notified.');
  };

  return (
    <div className={`w-64 rounded-2xl border-2 overflow-hidden shadow-sm ${statusColor}`}>
      <div className={`px-3 py-2 flex items-center gap-2 ${localStatus === 'accepted' ? 'bg-green-600' : localStatus === 'declined' ? 'bg-red-500' : 'bg-blue-600'}`}>
        <Inventory2Rounded sx={{fontSize:16,color:'white'}} />
        <span className="text-xs font-bold text-white uppercase tracking-wide">
          {req.listingType === 'service' ? 'Service Request' : isSale ? 'Purchase Request' : 'Rental Request'}
        </span>
        {localStatus !== 'pending' && (
          <span className="ml-auto text-[10px] font-black text-white/90 uppercase">
            {localStatus === 'accepted' ? '✓ Approved' : '✗ Declined'}
          </span>
        )}
      </div>
      <div className="px-3 py-3 space-y-2">
        <p className="text-sm font-semibold text-gray-800 line-clamp-2">{req.listingTitle}</p>
        {req.selectedPackage && (
          <div className="flex items-center gap-1.5 text-xs text-gray-600 bg-white/70 rounded-lg px-2 py-1.5">
            <VerifiedRounded sx={{fontSize:12,color:"#3b82f6"}} />
            <span className="font-semibold truncate">{req.selectedPackage.name || req.selectedPackage.tier}</span>
            <span className="text-gray-400 ml-auto shrink-0">${req.selectedPackage.price}/hr</span>
          </div>
        )}
        {!isSale && (
          <>
            <div className="flex items-center gap-1.5 text-xs text-gray-600">
              <CalendarMonthRounded sx={{fontSize:12,color:"#3b82f6"}} />
              <span>{new Date(req.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-gray-600">
              <ScheduleRounded sx={{fontSize:12,color:"#3b82f6"}} />
              <span>{req.duration} {req.duration === 1 ? req.durationType.replace('s', '') : req.durationType}</span>
            </div>
          </>
        )}
        {fullAddress && (
          <div className="flex items-start gap-1.5 text-xs text-gray-600 bg-white/70 rounded-lg px-2 py-1.5">
            <LocationOnRounded sx={{fontSize:12,color:"#3b82f6"}} />
            <span className="leading-snug">{fullAddress}</span>
          </div>
        )}
        {req.message && <p className="text-xs text-gray-500 bg-white/60 rounded-lg px-2 py-1.5 italic line-clamp-3">"{req.message}"</p>}
        <div className="pt-1">{statusBadge}</div>

        {/* Host: approve/decline — only when pending, blocked after action */}
        {localStatus === 'pending' && !isOwn && (
          <div className="flex gap-2 pt-1">
            <button onClick={handleDecline} disabled={acting}
              className="flex-1 flex items-center justify-center gap-1 text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg py-1.5 transition-colors disabled:opacity-50 disabled:pointer-events-none">
              <CancelRounded sx={{fontSize:12}} /> Decline
            </button>
            <button onClick={handleAccept} disabled={acting}
              className="flex-1 flex items-center justify-center gap-1 text-xs font-semibold text-green-700 bg-green-50 hover:bg-green-100 border border-green-200 rounded-lg py-1.5 transition-colors disabled:opacity-50 disabled:pointer-events-none">
              <CheckCircleRounded sx={{fontSize:12}} /> Accept
            </button>
          </div>
        )}

        {/* Sender: see host decision */}
        {localStatus !== 'pending' && isOwn && (
          <div className={`text-xs font-semibold text-center py-1.5 rounded-lg ${localStatus === 'accepted' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
            {localStatus === 'accepted' ? '✓ Host approved your request' : '✗ Host declined your request'}
          </div>
        )}
      </div>
    </div>
  );
}
// ── Payment Request Bubble ─────────────────────────────────────────
const KIND_STYLES = {
  rental:  { label: 'Rental',  cls: 'bg-blue-100 text-blue-700',    Icon: Wrench },
  service: { label: 'Service', cls: 'bg-purple-100 text-purple-700', Icon: Camera },
  sale:    { label: 'Sale',    cls: 'bg-orange-100 text-orange-700', Icon: Tag },
};

function PaymentRequestBubble({ msg, isOwn, conversationId, onStatusChange }: { msg: ChatMessage; isOwn: boolean; conversationId: string; onStatusChange: () => void }) {
  const navigate = useNavigate();
  const pay = msg.paymentRequest!;
  const isPaid = pay.status === 'paid';
  const kind = pay.listingType === 'service' ? 'service' : pay.listingMode === 'sale' ? 'sale' : 'rental';
  const { label: kindLabel, cls: kindCls } = KIND_STYLES[kind as keyof typeof KIND_STYLES];
  const checkoutUrl = `/checkout?conv=${conversationId}&msg=${msg.id}`;

  // Look up listing for full location
  const payListing = useMemo(() => {
    if (!pay.listingId) return null;
    try { const ls: any[] = JSON.parse(localStorage.getItem('filmons_listings') || '[]'); return ls.find(l => l.id === pay.listingId) || null; } catch { return null; }
  }, [pay.listingId]);
  const payAddress = payListing
    ? [payListing.streetAddress, payListing.city, payListing.province, payListing.postalCode].filter(Boolean).join(', ')
    : null;

  return (
    <div className={`w-64 rounded-2xl border-2 overflow-hidden shadow-sm ${isPaid ? 'bg-green-50 border-green-200' : 'bg-white border-blue-200'}`}>
      <div className={`px-3 py-2 flex items-center gap-2 ${isPaid ? 'bg-green-600' : 'bg-blue-700'}`}>
        <CreditCardRounded sx={{fontSize:16,color:"white"}} />
        <span className="text-xs font-bold text-white uppercase tracking-wide">Payment Request</span>
        {isPaid && <span className="ml-auto text-[10px] font-bold text-green-100 bg-green-500/60 px-1.5 py-0.5 rounded-full">PAID</span>}
      </div>
      <div className="px-3 pt-3 pb-2 space-y-2">
        {pay.listingTitle && (
          <div className="flex items-center gap-1.5">
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${kindCls}`}>{kindLabel}</span>
            <span className="text-xs font-semibold text-gray-700 truncate">{pay.listingTitle}</span>
          </div>
        )}
        {(pay.startDate || pay.duration) && (
          <div className="bg-gray-50 rounded-lg px-2 py-1.5 space-y-1">
            {pay.startDate && (
              <div className="flex items-center gap-1.5 text-xs text-gray-600">
                <CalendarMonthRounded sx={{fontSize:12,color:"#3b82f6"}} />
                <span>{new Date(pay.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
              </div>
            )}
            {pay.duration && pay.durationType && (
              <div className="flex items-center gap-1.5 text-xs text-gray-600">
                <ScheduleRounded sx={{fontSize:12,color:"#3b82f6"}} />
                <span>{pay.duration} {pay.duration === 1 ? pay.durationType.replace('s', '') : pay.durationType}</span>
              </div>
            )}
          </div>
        )}
        <div className="flex items-baseline gap-1">
          <span className="text-2xl font-black text-gray-900">${(pay.amount ?? 0).toLocaleString()}</span>
          <span className="text-xs text-gray-400">CAD</span>
        </div>
        {payAddress && (
          <div className="flex items-start gap-1.5 text-xs text-gray-600 bg-gray-50 rounded-lg px-2 py-1.5">
            <LocationOnRounded sx={{fontSize:12,color:"#3b82f6"}} />
            <span className="leading-snug">{payAddress}</span>
          </div>
        )}
        <p className="text-xs text-gray-600 leading-relaxed">{pay.description}</p>
        {pay.paymentMethod && (
          <div className="flex items-center gap-1.5 text-xs text-gray-500 bg-gray-50 rounded-lg px-2 py-1.5">
            <span>💳</span><span className="font-semibold">{pay.paymentMethod}</span>
          </div>
        )}
        {pay.deliveryOption && (
          <div className="flex items-center gap-1.5 text-xs text-gray-500 bg-gray-50 rounded-lg px-2 py-1.5">
            <span>{pay.deliveryOption === 'delivery' ? '🚚' : '📍'}</span>
            <span className="font-semibold capitalize">{pay.deliveryOption}</span>
          </div>
        )}
        {isPaid ? (
          <div className="flex items-center gap-1.5 text-xs font-semibold text-green-600 pt-1"><CheckCircleRounded sx={{fontSize:18}} /> Payment confirmed</div>
        ) : isOwn ? (
          <span className="text-xs text-amber-600 font-semibold bg-amber-50 px-2 py-0.5 rounded-full inline-block">Awaiting payment</span>
        ) : (
          <button
            onClick={() => navigate(checkoutUrl)}
            className="w-full flex items-center justify-center gap-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl py-2.5 mt-1 transition-colors shadow-sm">
            <CreditCardRounded sx={{fontSize:12}} /> Go to Checkout
          </button>
        )}
      </div>
    </div>
  );
}

// ── Listing Card ───────────────────────────────────────────────────
function ListingCard({ listing, selected, onSelect }: { listing: Listing; selected: boolean; onSelect: () => void }) {
  const thumb = listing.image || listing.images?.[0];
  const kind = getListingKind(listing);
  const { label, cls, Icon } = KIND_STYLES[kind];
  return (
    <button type="button" onClick={onSelect}
      className={`w-full flex items-center gap-3 p-2.5 rounded-xl border-2 transition-all text-left ${selected ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white hover:border-blue-200 hover:bg-gray-50'}`}>
      <div className="w-11 h-11 rounded-lg overflow-hidden bg-gray-100 shrink-0 flex items-center justify-center">
        {thumb ? <img src={thumb} alt={listing.title} className="w-full h-full object-cover" /> : <Inventory2Rounded sx={{fontSize:20,color:"#9ca3af"}} />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-800 truncate">{listing.title}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5 ${cls}`}>
            <Icon className="w-2.5 h-2.5" /> {label}
          </span>
          <span className="text-xs text-gray-400">${listing.price}{kind === 'rental' ? '/day' : kind === 'service' ? '/hr' : ''}</span>
        </div>
      </div>
      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${selected ? 'border-blue-500 bg-blue-500' : 'border-gray-300'}`}>
        {selected && <CheckCircleRounded sx={{fontSize:12,color:"white"}} />}
      </div>
    </button>
  );
}

// ── New Conversation Modal ─────────────────────────────────────────
function NewConversationModal({ user, onClose, onStart }: {
  user: User;
  onClose: () => void;
  onStart: (targetUser: User) => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [section, setSection] = useState<'suggested' | 'search'>('suggested');

  // Suggested: friends (mutual follows) + followers
  const cache: Record<string, User> = (() => { try { return JSON.parse(localStorage.getItem('filmons_users_cache') || '{}'); } catch { return {}; } })();
  const following = Array.isArray(user.following) ? user.following : [];
  const followers = Array.isArray(user.followers) ? user.followers : [];
  const friends   = following.filter(id => followers.includes(id));
  const onlyFollowers = followers.filter(id => !following.includes(id));
  const onlyFollowing = following.filter(id => !followers.includes(id));

  const toUser = (id: string): User | null => {
    const c = cache[id];
    if (!c) return null;
    return { id: c.id, name: c.name || c.username || 'User', username: c.username, avatar: c.avatar, accountType: c.accountType } as User;
  };

  // Search all Filmons users
  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    setLoading(true);
    const q = query.toLowerCase();
    const timer = setTimeout(async () => {
      try {
        const { data } = await supabase
          .from('profiles')
          .select('id, name, username, avatar_url, account_type')
          .or(`name.ilike.%${q}%,username.ilike.%${q}%`)
          .neq('id', user.id)
          .limit(20);
        setResults((data || []).map((p: any) => ({
          id: p.id, name: p.name || p.username || 'User',
          username: p.username, avatar: p.avatar_url, accountType: p.account_type,
        } as User)));
      } catch { setResults([]); }
      setLoading(false);
    }, 350);
    return () => clearTimeout(timer);
  }, [query]);

  const UserRow = ({ u, label }: { u: User; label?: string }) => (
    <button
      onClick={() => onStart(u)}
      className="flex items-center gap-3 w-full px-4 py-3 hover:bg-gray-50 active:bg-gray-100 transition-colors text-left"
    >
      <div className="w-10 h-10 rounded-full overflow-hidden bg-gradient-to-br from-blue-400 to-purple-600 flex items-center justify-center shrink-0">
        {u.avatar
          ? <img src={u.avatar} alt="" className="w-full h-full object-cover" />
          : <span className="text-white text-sm font-bold">{u.name?.[0] || '?'}</span>
        }
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900 truncate">{u.name}</p>
        {u.username && <p className="text-xs text-gray-400 truncate">@{u.username}</p>}
      </div>
      {label && <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full shrink-0">{label}</span>}
      <SendRounded sx={{fontSize:16,color:"#3b82f6"}} />
    </button>
  );

  return (
    <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-4" onClick={onClose}>
      <div className="bg-white w-full md:max-w-md rounded-t-3xl md:rounded-3xl shadow-2xl overflow-hidden max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <EditRounded sx={{fontSize:20,color:"#2563eb"}} />
            <h2 className="text-base font-bold text-gray-900">New Conversation</h2>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors">
            <CloseRounded sx={{fontSize:18,color:"#6b7280"}} />
          </button>
        </div>

        {/* Search */}
        <div className="px-4 py-3 border-b border-gray-100">
          <div className="flex items-center gap-2 bg-gray-100 rounded-xl px-3 py-2.5">
            <SearchRounded sx={{fontSize:18,color:"#9ca3af",flexShrink:0}} />
            <input
              autoFocus
              value={query}
              onChange={e => { setQuery(e.target.value); setSection('search'); if (!e.target.value) setSection('suggested'); }}
              placeholder="Search all Filmons users…"
              className="flex-1 bg-transparent text-sm text-gray-700 placeholder-gray-400 outline-none"
            />
            {query && <button onClick={() => { setQuery(''); setSection('suggested'); }}><CloseRounded sx={{fontSize:12,color:"#9ca3af"}} /></button>}
          </div>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto">
          {section === 'search' ? (
            loading
              ? <div className="flex items-center justify-center py-12"><div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
              : results.length === 0
                ? <p className="text-center text-gray-400 text-sm py-12">No users found for "{query}"</p>
                : results.map(u => <UserRow key={u.id} u={u} />)
          ) : (
            <>
              {/* Friends (mutual) */}
              {friends.length > 0 && toUser(friends[0]) && (
                <div>
                  <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-50">
                    <GroupRounded sx={{fontSize:12,color:"#3b82f6"}} />
                    <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Friends</span>
                  </div>
                  {friends.map(id => toUser(id)).filter(Boolean).map(u => <UserRow key={u!.id} u={u!} label="Friend" />)}
                </div>
              )}

              {/* Followers */}
              {onlyFollowers.length > 0 && toUser(onlyFollowers[0]) && (
                <div>
                  <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-50">
                    <PersonAddRounded sx={{fontSize:12,color:"#a855f7"}} />
                    <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Followers</span>
                  </div>
                  {onlyFollowers.map(id => toUser(id)).filter(Boolean).map(u => <UserRow key={u!.id} u={u!} label="Follower" />)}
                </div>
              )}

              {/* Following */}
              {onlyFollowing.length > 0 && toUser(onlyFollowing[0]) && (
                <div>
                  <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-50">
                    <HowToRegRounded sx={{fontSize:12,color:"#22c55e"}} />
                    <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Following</span>
                  </div>
                  {onlyFollowing.map(id => toUser(id)).filter(Boolean).map(u => <UserRow key={u!.id} u={u!} label="Following" />)}
                </div>
              )}

              {/* Empty state */}
              {friends.length === 0 && onlyFollowers.length === 0 && onlyFollowing.length === 0 && (
                <div className="flex flex-col items-center justify-center py-14 px-6 text-center">
                  <div className="w-14 h-14 rounded-full bg-blue-50 flex items-center justify-center mb-3">
                    <SearchRounded sx={{fontSize:28,color:"#60a5fa"}} />
                  </div>
                  <p className="text-sm font-semibold text-gray-700 mb-1">Search for someone</p>
                  <p className="text-xs text-gray-400">Type a name above to find any Filmons user</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Request Payment Modal ──────────────────────────────────────────

function RequestPaymentModal({ conversationId, user, activeConv, onClose, onSent }: {
  conversationId: string; user: User; activeConv: Conversation; onClose: () => void; onSent: (msg: ChatMessage) => void;
}) {
  const [selectedListing, setSelectedListing] = useState<Listing | null>(null);
  const [selectedPkg, setSelectedPkg] = useState<PricingPackage | null>(null);
  const [pkgRate, setPkgRate] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');

  const [startDate, setStartDate] = useState('');
  const [duration, setDuration] = useState('1');
  const [loading, setLoading] = useState(false);

  const kind = selectedListing ? getListingKind(selectedListing) : null;
  const isRental  = kind === 'rental';
  const isService = kind === 'service';
  const isSale    = kind === 'sale';
  const showDateDuration = isRental || isService;
  const servicePackages  = isService && selectedListing?.pricingPackages?.length
    ? selectedListing.pricingPackages
    : [];

  // Accepted rental-request listing IDs in this conversation (customer messages)
  const acceptedRequestListingIds = new Set(
    activeConv.messages
      .filter(m => m.type === 'rental_request' && m.rentalRequest?.status === 'accepted' && m.senderId !== user.id)
      .map(m => m.rentalRequest!.listingId)
  );

  // All host listings from localStorage — always authoritative source
  const allHostListings = readHostListings(user.id);
  // Split: listings that have an accepted request in this chat vs all others
  const conversationListings = allHostListings.filter(l => acceptedRequestListingIds.has(l.id));
  const otherListings        = allHostListings.filter(l => !acceptedRequestListingIds.has(l.id));

  // Recalculate amount when duration / pkgRate change
  useEffect(() => {
    if (!selectedListing || isSale) return;
    const d = parseInt(duration) || 1;
    if (isService && pkgRate) {
      setAmount(((parseFloat(pkgRate) || 0) * d).toFixed(2).replace(/\.00$/, ''));
    } else if (!isService) {
      setAmount(((selectedListing.price || 0) * d).toString());
    }
  }, [duration, pkgRate, selectedListing]);

  const handleSelectPkg = (pkg: PricingPackage) => {
    if (selectedPkg?.tier === pkg.tier) { setSelectedPkg(null); setPkgRate(''); setAmount(''); return; }
    setSelectedPkg(pkg);
    setPkgRate(pkg.price.toString());
    setDescription(`${pkg.name || pkg.tier} — ${selectedListing?.title || ''}`);
    const d = parseInt(duration) || 1;
    setAmount((pkg.price * d).toString());
  };

  const handleSelectListing = (listing: Listing) => {
    if (selectedListing?.id === listing.id) {
      setSelectedListing(null); setAmount(''); setDescription(''); setDuration('1'); setStartDate('');
      setSelectedPkg(null); setPkgRate('');
      return;
    }
    setSelectedListing(listing);
    setSelectedPkg(null); setPkgRate('');
    const k = getListingKind(listing);
    // Try to prefill from an accepted rental request in this conversation
    const matchedMsg = activeConv.messages.find(
      m => m.type === 'rental_request' && m.rentalRequest?.listingId === listing.id && m.rentalRequest.status === 'accepted' && m.senderId !== user.id
    );
    if (matchedMsg?.rentalRequest) {
      const req = matchedMsg.rentalRequest;
      setStartDate(req.startDate ? req.startDate.split('T')[0] : '');
      setDuration(req.duration.toString());
      const rate = req.selectedPackage?.price ?? listing.price ?? 0;
      setAmount((rate * req.duration).toString());
      setDescription(`${listing.title} – ${req.duration} ${req.durationType}`);
    } else {
      const d = parseInt(duration) || 1;
      setAmount(listing.price && k !== 'service' ? (listing.price * (k === 'sale' ? 1 : d)).toString() : '');
      setDescription(k === 'service' ? '' : listing.title);
      setStartDate('');
      setDuration('1');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedListing) { toast.error('Select a listing'); return; }
    if (isService && servicePackages.length > 0 && !selectedPkg) { toast.error('Select a pricing plan'); return; }
    const num = parseFloat(amount);
    if (!num || num <= 0) { toast.error('Enter a valid amount'); return; }
    if (!description.trim()) { toast.error('Add a description'); return; }
    if (showDateDuration && !startDate) { toast.error('Select a start date'); return; }
    setLoading(true);
    try {
      const msg = chatApi.sendPaymentRequest(conversationId, user.id, user.name, user.avatar, {
        amount: num, description: description.trim(),
        listingId: selectedListing.id, listingTitle: selectedListing.title,
        listingType: selectedListing.listingType, listingMode: selectedListing.listingMode,
        startDate: showDateDuration ? startDate : undefined,
        duration: showDateDuration ? (parseInt(duration) || 1) : undefined,
        durationType: showDateDuration ? (isService ? 'hours' : 'days') : undefined,
      });
      toast.success('Payment request sent!');
      onSent(msg); onClose();
    } catch { toast.error('Failed to send'); } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full sm:w-[440px] bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center"><PaymentRounded sx={{fontSize:20,color:"white"}} /></div>
            <div>
              <h2 className="text-base font-bold text-gray-900">Request Payment</h2>
              <p className="text-xs text-gray-400">Send a payment request to your client</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400"><CloseRounded sx={{fontSize:16}} /></button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

          {/* ── 1. Listing Selector ── */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">For which listing? <span className="text-red-400">*</span></label>
            {allHostListings.length === 0 ? (
              <div className="space-y-2">
                <div className="text-xs text-gray-400 bg-gray-50 rounded-xl px-3 py-3 border border-gray-200">No listings found. Create a listing first.</div>
                <a href="/create-listing" target="_blank" rel="noopener noreferrer"
                  className="flex items-center justify-center gap-1.5 w-full text-xs font-semibold text-blue-600 border border-blue-200 bg-blue-50 hover:bg-blue-100 rounded-xl py-2 transition-colors">
                  + List New Item
                </a>
              </div>
            ) : (
              <div className="space-y-2 max-h-52 overflow-y-auto pr-0.5">
                {conversationListings.length > 0 && (
                  <>
                    <p className="text-[11px] font-semibold text-blue-500 uppercase tracking-wide px-0.5">From this conversation</p>
                    {conversationListings.map(l => <ListingCard key={l.id} listing={l} selected={selectedListing?.id === l.id} onSelect={() => handleSelectListing(l)} />)}
                  </>
                )}
                {otherListings.length > 0 && (
                  <>
                    {conversationListings.length > 0 && <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide px-0.5 pt-1">Your other listings</p>}
                    {conversationListings.length === 0 && <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide px-0.5">Your listings</p>}
                    {otherListings.map(l => <ListingCard key={l.id} listing={l} selected={selectedListing?.id === l.id} onSelect={() => handleSelectListing(l)} />)}
                  </>
                )}
                <a href="/create-listing" target="_blank" rel="noopener noreferrer"
                  className="flex items-center justify-center gap-1.5 w-full text-xs font-semibold text-blue-600 border border-dashed border-blue-300 bg-blue-50 hover:bg-blue-100 rounded-xl py-2 transition-colors">
                  + List New Item
                </a>
              </div>
            )}
          </div>

          {/* ── 2. Pricing Plans (service only) ── */}
          {isService && servicePackages.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Pricing Plan <span className="text-red-400">*</span>
              </label>
              <div className="space-y-2">
                {servicePackages.map(pkg => {
                  const isSel = selectedPkg?.tier === pkg.tier;
                  return (
                    <button key={pkg.tier} type="button" onClick={() => handleSelectPkg(pkg)}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left ${isSel ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-blue-200 hover:bg-gray-50'}`}>
                      <div className={`w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center transition-all ${isSel ? 'border-blue-500 bg-blue-500' : 'border-gray-300'}`}>
                        {isSel && <div className="w-2 h-2 rounded-full bg-white" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-800">{pkg.name || pkg.tier}</p>
                        {pkg.description && <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{pkg.description}</p>}
                      </div>
                      <span className={`text-sm font-bold shrink-0 ${isSel ? 'text-blue-600' : 'text-gray-600'}`}>${pkg.price}/hr</span>
                    </button>
                  );
                })}
              </div>

              {/* Editable rate when package is selected */}
              {selectedPkg && (
                <div className="mt-3 p-3 bg-blue-50 rounded-xl border border-blue-200">
                  <label className="block text-xs font-semibold text-blue-700 mb-1.5">
                    Rate for this request <span className="font-normal text-blue-500">(CAD/hr — adjust if needed)</span>
                  </label>
                  <div className="flex items-center gap-2 bg-white border border-blue-300 rounded-lg px-3 py-2 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100 transition-all">
                    <AttachMoneyRounded sx={{fontSize:16,color:"#60a5fa"}} />
                    <input type="number" min="0" step="0.01" value={pkgRate}
                      onChange={e => setPkgRate(e.target.value)}
                      className="flex-1 bg-transparent text-sm font-bold text-gray-900 outline-none"
                      placeholder={selectedPkg.price.toString()} />
                    <span className="text-xs text-blue-400 shrink-0 font-semibold">CAD/hr</span>
                  </div>
                  <p className="text-[11px] text-blue-500 mt-1.5">
                    Total = <strong>${((parseFloat(pkgRate) || 0) * (parseInt(duration) || 1)).toLocaleString()} CAD</strong> for {duration || 1} {parseInt(duration) === 1 ? 'hour' : 'hours'}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ── 3. Date & Duration (rental / service only) ── */}
          {showDateDuration && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Start Date</label>
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} min={new Date().toISOString().split('T')[0]}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all" required />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Duration <span className="normal-case text-gray-400 font-normal">({isService ? 'hours' : 'days'})</span></label>
                <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100 transition-all">
                  <ScheduleRounded sx={{fontSize:16,color:"#9ca3af"}} />
                  <input type="number" min="1" max={isService ? 24 : 365} value={duration} onChange={e => setDuration(e.target.value)}
                    className="flex-1 bg-transparent text-sm font-bold text-gray-900 outline-none" />
                </div>
              </div>
            </div>
          )}

          {/* ── 4. Amount ── */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Amount (CAD)</label>
            <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100 transition-all">
              <AttachMoneyRounded sx={{fontSize:16,color:"#9ca3af"}} />
              <input type="number" min="1" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00"
                className="flex-1 bg-transparent text-lg font-bold text-gray-900 outline-none placeholder-gray-300" required />
              {showDateDuration && selectedListing && (
                <span className="text-xs text-gray-400 shrink-0">
                  {isService && selectedPkg
                    ? `$${pkgRate || selectedPkg.price}/hr × ${duration || 1}`
                    : `$${selectedListing.price}/day × ${duration || 1}`}
                </span>
              )}
            </div>
          </div>

          {/* ── 5. Description ── */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Description</label>
            <input type="text" value={description} onChange={e => setDescription(e.target.value)} placeholder="e.g. Full Day Videography – Brand Film Shoot"
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all placeholder-gray-300" required />
          </div>

          <button type="submit" disabled={loading || !selectedListing || (isService && servicePackages.length > 0 && !selectedPkg) || (isSale && !amount)}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-sm rounded-xl py-3 transition-colors">
            <CreditCardRounded sx={{fontSize:16}} />
            {loading ? 'Sending…' : 'Send Payment Request'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Call Screen ────────────────────────────────────────────────────
function CallScreen({ caller, callee, onEnd }: { caller: User; callee: User; onEnd: () => void }) {
  const [status, setStatus] = useState<'calling' | 'connected' | 'ended'>('calling');
  const [seconds, setSeconds] = useState(0);
  const [muted, setMuted] = useState(false);
  const [videoOff, setVideoOff] = useState(true);

  useEffect(() => {
    // Simulate connection after 3s
    const t = setTimeout(() => setStatus('connected'), 3000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (status !== 'connected') return;
    const t = setInterval(() => setSeconds(s => s + 1), 1000);
    return () => clearInterval(t);
  }, [status]);

  const handleEnd = () => { setStatus('ended'); setTimeout(onEnd, 600); };

  return (
    <div className="fixed inset-0 z-[100] bg-gray-900 flex flex-col items-center justify-center">
      {/* Background blur circles */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-blue-600/20 rounded-full blur-3xl animate-pulse" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-blue-400/20 rounded-full blur-2xl animate-pulse" style={{ animationDelay: '0.5s' }} />
      </div>

      <div className="relative flex flex-col items-center gap-6 text-center z-10">
        {/* Ring animation */}
        {status === 'calling' && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            {[1, 2, 3].map(i => (
              <div key={i} className="absolute rounded-full border-2 border-white/20 animate-ping"
                style={{ width: `${80 + i * 40}px`, height: `${80 + i * 40}px`, animationDelay: `${i * 0.3}s`, animationDuration: '2s' }} />
            ))}
          </div>
        )}

        {/* Avatar */}
        <div className="w-24 h-24 rounded-full overflow-hidden ring-4 ring-white/30 shadow-2xl">
          {callee.avatar
            ? <img src={callee.avatar} alt={callee.name} className="w-full h-full object-cover" />
            : <div className="w-full h-full bg-blue-600 flex items-center justify-center text-3xl font-bold text-white">{callee.name[0]}</div>
          }
        </div>

        <div>
          <h2 className="text-2xl font-bold text-white">{callee.name}</h2>
          <p className="text-sm text-white/60 mt-1">
            {status === 'calling' ? 'Calling…' : status === 'connected' ? fmtDuration(seconds) : 'Call ended'}
          </p>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-6 mt-4">
          <button onClick={() => setMuted(m => !m)}
            className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors ${muted ? 'bg-red-500' : 'bg-white/20 hover:bg-white/30'}`}>
            {muted ? <MicOffRounded sx={{fontSize:24,color:"white"}} /> : <MicRounded sx={{fontSize:24,color:"white"}} />}
          </button>
          <button onClick={handleEnd}
            className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center transition-colors shadow-lg">
            <PhoneDisabledRounded sx={{fontSize:28,color:"white"}} />
          </button>
          <button onClick={() => setVideoOff(v => !v)}
            className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors ${!videoOff ? 'bg-blue-500' : 'bg-white/20 hover:bg-white/30'}`}>
            {videoOff ? <VideocamOffRounded sx={{fontSize:24,color:"white"}} /> : <VideocamRounded sx={{fontSize:24,color:"white"}} />}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Conv action bottom sheet (mobile long-press) ──────────────────────────────
function ConvActionSheet({ conv, currentUserId, onClose, onPin, onMute, onArchive, onDelete }: {
  conv: Conversation; currentUserId: string; onClose: () => void;
  onPin?: () => void; onMute?: () => void; onArchive?: () => void; onDelete?: () => void;
}) {
  const otherId = conv.participantIds.find(id => id !== currentUserId) || '';
  const other   = authApi.getUserByIdSync(otherId);
  return (
    <div className="fixed inset-0 z-[200] flex items-end justify-center" onMouseDown={onClose} onTouchEnd={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" />
      <div
        className="relative w-full max-w-lg bg-white rounded-t-3xl shadow-2xl overflow-hidden"
        style={{ animation: 'slideUp .22s cubic-bezier(.25,.46,.45,.94)' }}
        onMouseDown={e => e.stopPropagation()}
        onTouchEnd={e => e.stopPropagation()}
      >
        <div className="flex justify-center pt-3 pb-1"><div className="w-10 h-1 bg-gray-200 rounded-full" /></div>
        <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-100">
          <UserAvatar user={other || { name: otherId, id: otherId }} size={44} />
          <div className="min-w-0">
            <p className="font-bold text-gray-900 truncate">{other?.name || 'Unknown'}</p>
            {conv.lastMessagePreview && <p className="text-xs text-gray-400 truncate">{conv.lastMessagePreview}</p>}
          </div>
        </div>
        <div className="py-2">
          {onPin && (
            <button onClick={() => { onPin(); onClose(); }} className="w-full flex items-center gap-4 px-5 py-4 hover:bg-gray-50 active:bg-gray-100 transition-colors text-left">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0"><PushPinRounded sx={{fontSize:20}} /></div>
              <span className="text-sm font-semibold text-gray-800">{conv.isPinned ? 'Unpin conversation' : 'Pin conversation'}</span>
            </button>
          )}
          {onMute && (
            <button onClick={() => { onMute(); onClose(); }} className="w-full flex items-center gap-4 px-5 py-4 hover:bg-gray-50 active:bg-gray-100 transition-colors text-left">
              <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center shrink-0"><span className="text-lg leading-none">{conv.isMuted ? '🔔' : '🔕'}</span></div>
              <span className="text-sm font-semibold text-gray-800">{conv.isMuted ? 'Unmute notifications' : 'Mute notifications'}</span>
            </button>
          )}
          {onArchive && (
            <button onClick={() => { onArchive(); onClose(); }} className="w-full flex items-center gap-4 px-5 py-4 hover:bg-gray-50 active:bg-gray-100 transition-colors text-left">
              <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center shrink-0"><span className="text-lg leading-none">📁</span></div>
              <span className="text-sm font-semibold text-gray-800">Archive conversation</span>
            </button>
          )}
          <div className="mx-5 h-px bg-gray-100 my-1" />
          {onDelete && (
            <button onClick={() => { onDelete(); onClose(); }} className="w-full flex items-center gap-4 px-5 py-4 hover:bg-red-50 active:bg-red-100 transition-colors text-left">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0"><DeleteRounded sx={{fontSize:20,color:"#dc2626"}} /></div>
              <span className="text-sm font-semibold text-red-700">Delete for everyone</span>
            </button>
          )}
        </div>
        <div className="pb-8" />
      </div>
    </div>
  );
}

// ── Message action bottom sheet (mobile long-press) ───────────────────────────
function MsgActionSheet({ msg, currentUserId, onClose, onReply, onEdit, onPin, onDeleteForMe, onDeleteForAll }: {
  msg: ChatMessage; currentUserId: string; onClose: () => void;
  onReply: () => void; onEdit: () => void; onPin: () => void;
  onDeleteForMe: () => void; onDeleteForAll: () => void;
}) {
  const isOwn   = msg.senderId === currentUserId;
  const preview = msg.type === 'media'
    ? (msg.mediaType === 'audio' ? '🎤 Voice message' : msg.mediaType === 'video' ? '🎬 Video' : '📷 Photo')
    : msg.type === 'post' ? '📎 Shared a post'
    : (msg.content || '');
  return (
    <div className="fixed inset-0 z-[200] flex items-end justify-center" onMouseDown={onClose} onTouchEnd={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" />
      <div
        className="relative w-full max-w-lg bg-white rounded-t-3xl shadow-2xl overflow-hidden"
        style={{ animation: 'slideUp .22s cubic-bezier(.25,.46,.45,.94)' }}
        onMouseDown={e => e.stopPropagation()}
        onTouchEnd={e => e.stopPropagation()}
      >
        <div className="flex justify-center pt-3 pb-1"><div className="w-10 h-1 bg-gray-200 rounded-full" /></div>
        <div className="px-5 py-3 border-b border-gray-100">
          <div className={`inline-block px-3.5 py-2 rounded-2xl text-sm max-w-full ${isOwn ? 'bg-blue-100 text-blue-900' : 'bg-gray-100 text-gray-800'}`}>
            <span className="line-clamp-2">{preview.slice(0, 120)}{preview.length > 120 ? '…' : ''}</span>
          </div>
        </div>
        <div className="py-2">
          <button onClick={() => { onReply(); onClose(); }} className="w-full flex items-center gap-4 px-5 py-4 hover:bg-gray-50 active:bg-gray-100 transition-colors text-left">
            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center shrink-0"><ReplyRounded sx={{fontSize:20,color:"#2563eb"}} /></div>
            <span className="text-sm font-semibold text-gray-800">Reply</span>
          </button>
          {isOwn && msg.type === 'text' && (
            <button onClick={() => { onEdit(); onClose(); }} className="w-full flex items-center gap-4 px-5 py-4 hover:bg-gray-50 active:bg-gray-100 transition-colors text-left">
              <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center shrink-0"><EditRounded sx={{fontSize:20,color:"#4b5563"}} /></div>
              <span className="text-sm font-semibold text-gray-800">Edit message</span>
            </button>
          )}
          <button onClick={() => { onPin(); onClose(); }} className="w-full flex items-center gap-4 px-5 py-4 hover:bg-gray-50 active:bg-gray-100 transition-colors text-left">
            <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0"><PushPinRounded sx={{fontSize:20}} /></div>
            <span className="text-sm font-semibold text-gray-800">{msg.isPinned ? 'Unpin message' : 'Pin message'}</span>
          </button>
          <div className="mx-5 h-px bg-gray-100 my-1" />
          <button onClick={() => { onDeleteForMe(); onClose(); }} className="w-full flex items-center gap-4 px-5 py-4 hover:bg-gray-50 active:bg-gray-100 transition-colors text-left">
            <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center shrink-0"><DeleteRounded sx={{fontSize:20,color:"#6b7280"}} /></div>
            <span className="text-sm font-semibold text-gray-700">Delete for me</span>
          </button>
          {isOwn && (
            <button onClick={() => { onDeleteForAll(); onClose(); }} className="w-full flex items-center gap-4 px-5 py-4 hover:bg-red-50 active:bg-red-100 transition-colors text-left">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0"><DeleteRounded sx={{fontSize:20,color:"#dc2626"}} /></div>
              <span className="text-sm font-semibold text-red-700">Delete for everyone</span>
            </button>
          )}
        </div>
        <div className="pb-8" />
      </div>
    </div>
  );
}

// ── Conversation Row ───────────────────────────────────────────────────────────
function ConvRow({
  conv, currentUserId, isActive, onClick, isRequest, onLongPress,
  onArchive, onMute, onPin, onDelete,
}: {
  conv: Conversation; currentUserId: string; isActive: boolean; onClick: () => void;
  isRequest?: boolean; onLongPress?: () => void;
  onArchive?: () => void; onMute?: () => void; onPin?: () => void; onDelete?: () => void;
}) {
  const [showMenu, setShowMenu] = useState(false);
  const menuRef   = useRef<HTMLDivElement>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdMoved = useRef(false);

  const otherId = conv.participantIds.find(id => id !== currentUserId) || '';
  const other   = authApi.getUserByIdSync(otherId);
  const last    = conv.messages[conv.messages.length - 1];
  const unread  = conv.unreadCount ?? conv.messages.filter(m => m.senderId !== currentUserId && !m.read).length;
  const lastPreview = conv.lastMessagePreview ||
    (!last ? '' :
      last.type === 'post'            ? '📎 Shared a post' :
      last.type === 'rental_request'  ? '📋 Rental request' :
      last.type === 'payment_request' ? '💳 Payment request' :
      last.type === 'media'
        ? (last.mediaType === 'audio' ? '🎤 Voice message' : last.mediaType === 'video' ? '🎬 Video' : '📷 Photo')
        : (last.content || ''));
  const lastTime = conv.lastMessageAt || last?.createdAt;

  // Close desktop menu on outside click
  useEffect(() => {
    if (!showMenu) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowMenu(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showMenu]);

  // ── Long-press detection (mobile hold = 500 ms) ──────────────────────────
  const startHold = () => {
    holdMoved.current = false;
    holdTimer.current = setTimeout(() => {
      if (!holdMoved.current) {
        try { navigator.vibrate(40); } catch {}
        onLongPress?.();
      }
    }, 500);
  };
  const cancelHold = () => {
    if (holdTimer.current) { clearTimeout(holdTimer.current); holdTimer.current = null; }
  };
  const markMoved = () => { holdMoved.current = true; cancelHold(); };

  return (
    <div
      className={`relative flex items-center gap-3 px-4 py-3 group/row cursor-pointer select-none ${isActive ? 'bg-blue-50 border-r-2 border-blue-500' : 'bg-white hover:bg-gray-50 active:bg-gray-100'}`}
      onTouchStart={startHold}
      onTouchMove={markMoved}
      onTouchEnd={cancelHold}
      onTouchCancel={cancelHold}
      onClick={onClick}
    >
      {/* Unread dot — left edge indicator */}
      <div className="shrink-0 w-2 flex items-center justify-center">
        {unread > 0 && !conv.isMuted && (
          <div className="w-2 h-2 rounded-full bg-blue-500" />
        )}
      </div>

      {/* Avatar + request/pin badge */}
      <div className="relative shrink-0">
        <UserAvatar user={other || { name: otherId, id: otherId }} size={44} />
        {isRequest && (
          <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-amber-500 rounded-full flex items-center justify-center">
            <GppBadRounded sx={{fontSize:8,color:"white"}} />
          </span>
        )}
        {conv.isPinned && !isRequest && (
          <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-white border border-gray-200 rounded-full flex items-center justify-center">
            <PushPinRounded sx={{fontSize:8,color:"#f59e0b"}} />
          </span>
        )}
      </div>

      {/* Name + preview */}
      <div className="flex-1 min-w-0">
        {/* Row 1: name (left) + timestamp (right) */}
        <div className="flex items-center justify-between mb-0.5">
          <span className={`text-sm truncate flex-1 mr-2 ${unread > 0 ? 'font-bold text-gray-900' : 'font-medium text-gray-800'} ${conv.isMuted ? 'opacity-60' : ''}`}>
            {other?.name || 'Unknown'}
          </span>
          <div className="shrink-0 flex items-center gap-1">
            {conv.isMuted && <span title="Muted" className="text-[11px] opacity-50">🔕</span>}
            <span className={`text-[11px] ${unread > 0 && !conv.isMuted ? 'text-blue-500 font-semibold' : 'text-gray-400'}`}>
              {lastTime && timeAgo(lastTime)}
            </span>
          </div>
        </div>
        {/* Row 2: preview (left) + unread badge (right) */}
        <div className="flex items-center justify-between gap-2">
          <p className={`text-xs truncate flex-1 ${unread > 0 && !conv.isMuted ? 'text-gray-900 font-semibold' : 'text-gray-500 font-normal'}`}>
            {lastPreview || (isRequest ? 'Message request' : '')}
          </p>
          {unread > 0 && !conv.isMuted && (
            <span className="shrink-0 min-w-[20px] h-5 bg-blue-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1.5">
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </div>
        {isRequest && <p className="text-[10px] text-amber-600 font-semibold mt-0.5">Message request</p>}
      </div>

      {/* Desktop ⋯ button — hover only, hidden on pure touch screens */}
      <div className="relative shrink-0 hidden-on-touch">
        <button
          onClick={e => { e.stopPropagation(); setShowMenu(v => !v); }}
          className="opacity-0 group-hover/row:opacity-100 transition-opacity w-7 h-7 flex items-center justify-center rounded-full bg-white shadow border border-gray-200 text-gray-400 hover:text-gray-600"
        >
          <MoreHorizRounded sx={{fontSize:12}} />
        </button>
        {showMenu && (
          <div ref={menuRef} className="absolute right-0 top-8 z-50 bg-white rounded-2xl shadow-2xl border border-gray-100 py-1.5 min-w-[168px]">
            <button onClick={e => { e.stopPropagation(); onPin?.(); setShowMenu(false); }} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50">
              <PushPinRounded sx={{fontSize:16,color:"#f59e0b"}} /> {conv.isPinned ? 'Unpin' : 'Pin'}
            </button>
            <button onClick={e => { e.stopPropagation(); onMute?.(); setShowMenu(false); }} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50">
              <span className="w-4">{conv.isMuted ? '🔔' : '🔕'}</span> {conv.isMuted ? 'Unmute' : 'Mute'}
            </button>
            <button onClick={e => { e.stopPropagation(); onArchive?.(); setShowMenu(false); }} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50">
              <span className="w-4">📁</span> Archive
            </button>
            <div className="h-px bg-gray-100 my-1" />
            <button onClick={e => { e.stopPropagation(); onDelete?.(); setShowMenu(false); }} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50">
              <DeleteRounded sx={{fontSize:16,color:"#ef4444"}} /> Delete for everyone
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Inbox ─────────────────────────────────────────────────────
export function Inbox() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [showSidebar, setShowSidebar] = useState(true);
  const [showNewConv, setShowNewConv] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [showCallScreen, setShowCallScreen] = useState(false);
  const [inboxTab, setInboxTab] = useState<'messages' | 'requests'>('messages');
  const [serverLoaded, setServerLoaded] = useState(false);
  const [archivedConvs, setArchivedConvs]   = useState<Conversation[]>([]);
  const [showArchived, setShowArchived]       = useState(false);
  const [loadingArchived, setLoadingArchived] = useState(false);
  const [deleteConfirm, setDeleteConfirm]     = useState<string | null>(null);
  const [convActionSheet, setConvActionSheet] = useState<Conversation | null>(null);
  const [msgActionSheet, setMsgActionSheet]   = useState<ChatMessage | null>(null);

  // ── Delete conversation ─────────────────────────────────────────────────────
  async function handleDeleteConversation(convId: string) {
    try {
      // Send a system message so both parties see what happened
      const conv = conversations.find(c => c.id === convId);
      if (conv) {
        const sysMsg: ChatMessage = {
          id:          `sys-del-${Date.now()}`,
          senderId:    'system',
          senderName:  'System',
          type:        'system' as any,
          content:     `🗑️ ${user!.name} deleted this conversation for everyone. All messages have been removed.`,
          createdAt:   new Date().toISOString(),
          read:        true,
        };
        // Persist to DB so other party sees it
        await chatApi.sendMessageToDB(convId, sysMsg, conv.participantIds, false, null).catch(() => {});
        // Brief delay so they can see the message before we hide the conv
        await new Promise(r => setTimeout(r, 400));
      }

      setConversations(prev => prev.filter(c => c.id !== convId));
      if (activeId === convId) { setActiveId(null); setShowSidebar(true); }
      setDeleteConfirm(null);

      await chatApi.deleteForUser(convId, user!.id);
      // Delete all messages from DB, then mark conversation deleted
      await supabase.from('messages').delete().eq('conversation_id', convId);
      supabase.from('conversations')
        .update({ deleted_for_everyone: true, updated_at: new Date().toISOString() })
        .eq('id', convId).then(() => {}).catch(() => {});

      toast('Conversation deleted for everyone', { icon: '🗑️' });
    } catch (err) {
      console.error('[Inbox] handleDeleteConversation failed:', err);
      toast.error('Failed to delete conversation');
    }
  }
  // ── Message long-press refs (shared across all bubbles) ───────────────────
  const msgHoldTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const msgHoldMoved  = useRef(false);

  // ── Real-time & advanced features ────────────────────────────────────────
  const [replyingTo, setReplyingTo]       = useState<ChatMessage | null>(null);
  const [typingUsers, setTypingUsers]     = useState<Set<string>>(new Set());
  const [editingMsg, setEditingMsg]       = useState<{ msgId: string; content: string } | null>(null);
  const [msgMenu, setMsgMenu]             = useState<{ msg: ChatMessage; x: number; y: number } | null>(null);
  const [pinnedMsgs, setPinnedMsgs]       = useState<ChatMessage[]>([]);
  const [showMsgSearch, setShowMsgSearch] = useState(false);
  const [msgSearch, setMsgSearch]         = useState('');
  const [msgSearchResults, setMsgSearchResults] = useState<ChatMessage[]>([]);
  const [msgStatuses, setMsgStatuses]     = useState<Record<string, string>>({});
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Populate user cache on mount so getUserByIdSync works in ConvRow
  useEffect(() => {
    authApi.getAllUsers().catch(() => {});
  }, []);

  const loadArchived = useCallback(async () => {
    if (!user) return;
    setLoadingArchived(true);
    try {
      const archived = await chatApi.fetchArchivedConversations(user.id);
      setArchivedConvs(archived);
    } catch (e) {
      console.warn('loadArchived error:', e);
    } finally {
      setLoadingArchived(false);
    }
  }, [user]);

  const handleToggleArchived = () => {
    if (!showArchived) loadArchived();
    setShowArchived(v => !v);
  };

  // ── Message bubble long-press ─────────────────────────────────────────────
  const handleMsgTouchStart = (msg: ChatMessage) => () => {
    msgHoldMoved.current = false;
    if (msgHoldTimer.current) clearTimeout(msgHoldTimer.current);
    msgHoldTimer.current = setTimeout(() => {
      if (!msgHoldMoved.current) {
        try { navigator.vibrate(40); } catch {}
        setMsgActionSheet(msg);
      }
    }, 500);
  };
  const handleMsgTouchMove = () => {
    msgHoldMoved.current = true;
    if (msgHoldTimer.current) { clearTimeout(msgHoldTimer.current); msgHoldTimer.current = null; }
  };
  const handleMsgTouchEnd = () => {
    if (msgHoldTimer.current) { clearTimeout(msgHoldTimer.current); msgHoldTimer.current = null; }
  };

  const loadConversations = useCallback(async () => {
    loadedConvIds.current.clear();
    if (!user) return;

    try {
      // Only load from Supabase conversations table — no localStorage fallback
      const fromServer = await chatApi.fetchConversationsDB(user.id, true);

      // Resolve participant names asynchronously
      const cache: Record<string, any> = (() => {
        try { return JSON.parse(localStorage.getItem('filmons_users_cache') || '{}'); } catch { return {}; }
      })();
      const missingIds = [...new Set(fromServer.flatMap((c: Conversation) => c.participantIds || []))]
        .filter((id: string) => id !== user.id && !cache[id]);
      if (missingIds.length > 0) {
        Promise.allSettled(missingIds.map((id: string) => authApi.getUserById(id)))
          .then(results => {
            const updated = { ...cache };
            results.forEach(r => { if (r.status === 'fulfilled' && r.value) updated[r.value.id] = r.value; });
            localStorage.setItem('filmons_users_cache', JSON.stringify(updated));
            setConversations(p => [...p]);
          }).catch(() => {});
      }

      setConversations(prev => {
        // Guard: never wipe good state with an empty server result (throttle fallback or race)
        if (!fromServer.length && prev.length) return prev;

        // Build a map of existing conv state (may have full message history from fetchMessages)
        const prevMap = new Map(prev.map(c => [c.id, c]));

        const final = fromServer.map((c: Conversation) => {
          const prevConv = prevMap.get(c.id);
          if (!prevConv) return c;

          // Preserve richer message history from React state.
          // fetchConversationsDB now fetches all messages, but React state may have
          // optimistic (unsent) messages not yet committed to DB.
          const prevMsgs   = prevConv.messages || [];
          const serverMsgs = c.messages || [];
          const prevIds    = new Set(prevMsgs.map((m: ChatMessage) => m.id));
          // Only add server messages not already in prev (new arrivals from another device/tab)
          const serverOnly = serverMsgs.filter((m: ChatMessage) => !prevIds.has(m.id));

          const merged = [...prevMsgs, ...serverOnly].sort((a: ChatMessage, b: ChatMessage) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          );

          return { ...c, messages: merged };
        });

        return final.sort((a: Conversation, b: Conversation) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        );
      });
    } catch (e) {
      console.warn('loadConversations error:', e);
    } finally {
      setServerLoaded(true);
    }
  }, [user]);

  useEffect(() => { if (!user) { navigate('/login'); return; } loadConversations(); }, [user]);

  // ── Typing indicator: Supabase Realtime broadcast (ephemeral — NOT stored) ─
  useEffect(() => {
    if (!activeId || !user) return;
    const ch = supabase
      .channel(`typing_${activeId}`)
      .on('broadcast', { event: 'typing' }, ({ payload }: any) => {
        if (payload.userId === user.id) return;
        setTypingUsers(prev => { const n = new Set(prev); n.add(payload.userId); return n; });
        setTimeout(() => setTypingUsers(prev => { const n = new Set(prev); n.delete(payload.userId); return n; }), 3000);
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [activeId, user]);

  const broadcastTyping = useCallback(() => {
    if (!activeId || !user) return;
    supabase.channel(`typing_${activeId}`).send({
      type: 'broadcast', event: 'typing',
      payload: { userId: user.id, convId: activeId },
    });
  }, [activeId, user]);

  // ── Load pinned messages when conversation changes ───────────────────────
  useEffect(() => {
    if (!activeId) { setPinnedMsgs([]); return; }
    chatApi.getPinnedMessages(activeId).then(setPinnedMsgs).catch(() => {});
  }, [activeId]);

  // ── Fetch seen statuses for own messages ────────────────────────────────
  useEffect(() => {
    if (!activeId || !user) return;
    const conv = conversations.find(c => c.id === activeId);
    if (!conv) return;
    const ownIds = conv.messages.filter(m => m.senderId === user.id).map(m => m.id);
    if (!ownIds.length) return;
    chatApi.getMessageStatuses(activeId, ownIds).then(statuses => {
      setMsgStatuses(prev => {
        const next = { ...prev };
        statuses.forEach(s => { next[s.messageId] = s.status; });
        return next;
      });
    }).catch(() => {});
  }, [activeId, conversations, user]);

  // ── Realtime: detect when WE are added to a brand-new conversation ───────────
  // `conversation_participants` INSERT fires the instant User B's `createConvOnServer`
  // (or the auto-upsert in the message route) adds our user_id as a participant.
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`inbox_msgs_${user.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        async (payload: any) => {
          const convId = payload.new?.conversation_id;
          if (!convId) return;

          // If payload incomplete (REPLICA IDENTITY not FULL), fetch full row
          let rawRow = payload.new;
          if (!rawRow.metadata || !rawRow.sender_id || !rawRow.type) {
            const { data } = await supabase
              .from('messages').select('*').eq('id', rawRow.id).single().catch(() => ({ data: null })) as any;
            if (data) rawRow = data;
          }
          const newMsg = dbRowToMsg(rawRow);
          if (newMsg.rentalRequest && !newMsg.rentalRequest.status) {
            newMsg.rentalRequest = { status: 'pending', ...newMsg.rentalRequest };
          }

          setConversations(prev => {
            const conv = prev.find(c => c.id === convId);
            if (!conv) {
              // New conv — fetch it and resolve participant names immediately
              supabase.from('conversations')
                .select('id, participants, updated_at, created_at, is_request, requested_by')
                .eq('id', convId).single()
                .then(async ({ data: row }) => {
                  if (!row) return;
                  const parts: string[] = Array.isArray(row.participants) ? row.participants
                    : typeof row.participants === 'string' && row.participants.startsWith('{')
                      ? row.participants.slice(1,-1).split(',').map((s: string) => s.trim().replace(/^"|"$/g,''))
                      : [];
                  // Cache sender name from message so name shows immediately
                  if (newMsg.senderId && newMsg.senderName) {
                    try {
                      const c = JSON.parse(localStorage.getItem('filmons_users_cache') || '{}');
                      if (!c[newMsg.senderId]) {
                        c[newMsg.senderId] = { id: newMsg.senderId, name: newMsg.senderName, avatar: newMsg.senderAvatar };
                        localStorage.setItem('filmons_users_cache', JSON.stringify(c));
                      }
                    } catch {}
                  }
                  // Fetch profiles for unknown participants
                  try {
                    const cNow = JSON.parse(localStorage.getItem('filmons_users_cache') || '{}');
                    const toFetch = parts.filter(id => id !== user?.id && !cNow[id]);
                    if (toFetch.length) {
                      const { data: profs } = await supabase.from('profiles')
                        .select('id, name, username, avatar_url').in('id', toFetch).catch(() => ({ data: null })) as any;
                      if (profs) {
                        profs.forEach((p: any) => { cNow[p.id] = { id: p.id, name: p.name || p.username || 'User', avatar: p.avatar_url }; });
                        localStorage.setItem('filmons_users_cache', JSON.stringify(cNow));
                      }
                    }
                  } catch {}
                  setConversations(p => [{
                    id: String(row.id), participantIds: parts, participantProfiles: [],
                    isRequest: row.is_request ?? false, requestedBy: row.requested_by ?? null,
                    updatedAt: row.updated_at ?? new Date().toISOString(),
                    messages: [newMsg], unreadCount: 1,
                  }, ...p.filter(c => c.id !== convId)]);

                  // Email for new message requests (brand-new conv arriving via Realtime)
                  if (newMsg.senderId !== user?.id && user && convId !== activeId) {
                    notifyImmediateEmail({
                      receiverId:     user.id,
                      receiverEmail:  user.email || '',
                      receiverName:   user.name  || 'User',
                      senderName:     newMsg.senderName || 'Someone',
                      senderId:       newMsg.senderId || '',
                      messageText:    newMsg.content || '',
                      conversationId: convId,
                      isRequest:      row.is_request ?? false,
                    });
                  }
                }).catch(() => loadConversations());
              return prev;
            }
            if (conv.messages.some(m => m.id === newMsg.id)) return prev;
            const updated = {
              ...conv, messages: [...conv.messages, newMsg],
              updatedAt: newMsg.createdAt,
            };
            return [updated, ...prev.filter(c => c.id !== convId)];
          });

          if (convId === activeId) {
            setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
          }

          // Email notification: receiver only, and not when the conversation is already open
          if (newMsg.senderId && newMsg.senderId !== user?.id && user && convId !== activeId) {
            notifyImmediateEmail({
              receiverId:     user.id,
              receiverEmail:  user.email || '',
              receiverName:   user.name  || 'User',
              senderName:     newMsg.senderName || 'Someone',
              senderId:       newMsg.senderId,
              messageText:    newMsg.content || '',
              conversationId: convId,
              isRequest:      false,
            });
          }
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, loadConversations]);

  // ── Fallback poll: keeps sidebar metadata (unread count, last-msg preview)
  //    fresh for conversations that are NOT currently open. ──────────────────
  useEffect(() => {
    if (!user) return;
    // Poll only every 3 minutes and only when tab is visible
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') loadConversations();
    }, 15_000);
    return () => clearInterval(interval);
  }, [user, loadConversations]);

  // ── Open conversation from URL param (?conv=<id> or ?with=<userId>) ──
  useEffect(() => {
    const convId  = searchParams.get('conv');
    const withUid = searchParams.get('with');

    // ?conv=<id>: open a specific conversation by ID
    if (convId) {
      const found = conversations.find(c => c.id === convId);
      if (found) {
        setActiveId(convId);
        setShowSidebar(false);
      } else if (serverLoaded) {
        // Server has loaded but conv isn't in state — try server first.
        // If it's genuinely gone (deleted), fall back to finding an existing
        // conversation with the same other participant, or open inbox root.
        chatApi.fetchConversationById(convId).then(conv => {
          if (conv) {
            setConversations(prev =>
              prev.some(c => c.id === convId) ? prev : [{ ...conv, messages: conv.messages ?? [] }, ...prev]
            );
            setActiveId(convId);
            setShowSidebar(false);
          } else {
            // Conversation was deleted — find a live conversation with the same person
            // by checking the ?with= fallback or scanning existing conversations.
            const withFallback = searchParams.get('with');
            if (withFallback && user) {
              const liveConv = conversations.find(c =>
                c.participantIds.includes(user.id) && c.participantIds.includes(withFallback)
              );
              if (liveConv) {
                setActiveId(liveConv.id);
                setShowSidebar(false);
              } else {
                // No live conv exists yet — open inbox root so user can start fresh
                setActiveId(null);
                setShowSidebar(true);
                toast('That conversation no longer exists. Start a new one below.', { icon: '💬', duration: 4000 });
              }
            } else {
              setActiveId(null);
              setShowSidebar(true);
              toast('That conversation no longer exists.', { icon: '💬', duration: 3000 });
            }
          }
        }); // errors are swallowed inside fetchConversationById itself
      }
      return;
    }

    // ?with=<userId>: find or create conv with that user (fallback when no conversationId)
    if (withUid && user && serverLoaded) {
      const existing = conversations.find(c =>
        c.participantIds.includes(user.id) && c.participantIds.includes(withUid)
      );
      if (existing) {
        setActiveId(existing.id);
        setShowSidebar(false);
      } else {
        // Server-side get-or-create: returns canonical UUID, prevents duplicate convs,
        // and guarantees the conversations + conversation_participants rows exist in DB.
        chatApi.getOrCreateDB(user.id, withUid)
          .then(conv => {
            setConversations(prev =>
              prev.some(c => c.id === conv.id) ? prev : [{ ...conv, messages: [] }, ...prev]
            );
            setActiveId(conv.id);
            setShowSidebar(false);
          })
          .catch(() => {
            // Network down — fall back to a local-only placeholder
            const fallback = chatApi.getOrCreate(user.id, withUid);
            setConversations(prev =>
              prev.some(c => c.id === fallback.id) ? prev : [fallback, ...prev]
            );
            setActiveId(fallback.id);
            setShowSidebar(false);
          });
      }
    }
  }, [searchParams, conversations, serverLoaded, user]);

  // ── Realtime: stream new messages into the active conversation ───────────────
  // Supabase postgres_changes listens to the WAL, so messages written by the
  // edge function (npm:postgres) OR direct Supabase inserts fire these events
  // instantly — no polling needed.  dbRowToMsg is imported from api.ts.
  useEffect(() => {
    if (!activeId || !user) return;

    const ch = supabase
      .channel(`inbox_messages_${activeId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages',
          filter: `conversation_id=eq.${activeId}` },
        (payload: any) => {
          const newMsg = dbRowToMsg(payload.new);
          setConversations(prev => prev.map(c => {
            if (c.id !== activeId) return c;
            // Skip if we already have it (optimistic message from sender's own write)
            if (c.messages.some(m => m.id === newMsg.id)) return c;
            return { ...c, messages: [...c.messages, newMsg], updatedAt: newMsg.createdAt };
          }));
          setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
        },
      )
      .subscribe((status: string) => {
        if (status === 'SUBSCRIBED') {
          console.log('[Inbox] realtime subscribed for conv', activeId);
        }
      });

    return () => { supabase.removeChannel(ch); };
  }, [activeId, user]);

  const activeConv = conversations.find(c => c.id === activeId) || null;
  const otherUserId = activeConv?.participantIds.find(id => id !== user?.id) || '';
  const otherUser = otherUserId ? authApi.getUserByIdSync(otherUserId) : null;

  // Mutual follow check for calling
  const canCall = !!(user && otherUser &&
    user.following?.includes(otherUser.id) &&
    otherUser.following?.includes(user.id));

  // Track which conversations have been fully loaded from server
  const loadedConvIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!activeConv || !user) return;
    chatApi.markAsRead(activeConv.id, user.id);
    // Clear unread indicators in component state immediately (markAsRead only writes localStorage)
    setConversations(prev => prev.map(c =>
      c.id !== activeConv.id ? c :
      { ...c, unreadCount: 0, messages: c.messages.map(m => m.senderId !== user.id ? { ...m, read: true } : m) }
    ));

    // Only fetch from server on first open OR if no messages loaded yet
    // This prevents optimistic messages from being wiped on tab switch
    // but ensures new conversations (like shared posts) load their messages
    const hasMessages = activeConv.messages.length > 0;
    if (loadedConvIds.current.has(activeConv.id) && hasMessages) return;
    loadedConvIds.current.add(activeConv.id);

    chatApi.fetchMessages(activeConv.id).then(msgs => {
      setConversations(prev => prev.map(c => {
        if (c.id !== activeConv.id) return c;
        // Empty response means edge function failed — keep what we have
        if (!msgs.length && c.messages.length > 0) return c;
        const serverIds = new Set(msgs.map((m: ChatMessage) => m.id));
        const pending = c.messages.filter(m =>
          !serverIds.has(m.id) && (m.id.startsWith('opt-') || /^\d{13}-/.test(m.id))
        );
        return { ...c, messages: [...msgs, ...pending] };
      }));
    }).catch(e => console.warn('fetchMessages error:', e));

    // Poll every 8s as fallback when Realtime misses messages
    const pollId = setInterval(() => {
      chatApi.fetchMessages(activeConv.id).then(msgs => {
        setConversations(prev => prev.map(c => {
          if (c.id !== activeConv.id) return c;
          const serverIds = new Set(msgs.map((m: ChatMessage) => m.id));
          const hasNew = msgs.some((m: ChatMessage) => !c.messages.find(x => x.id === m.id));
          if (!hasNew) return c;
          const pending = c.messages.filter(m => !serverIds.has(m.id) && (m.id.startsWith('opt-') || /^\d{13}-/.test(m.id)));
          return { ...c, messages: [...msgs, ...pending] };
        }));
      }).catch(() => {});
    }, 8_000);
    return () => clearInterval(pollId);
  }, [activeId]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [activeConv?.messages.length]);

  // ── Helper: append a sent message to state without touching the DB or localStorage ──
  const appendMsg = useCallback((convId: string, msg: ChatMessage) => {
    setConversations(prev => prev.map(c =>
      c.id !== convId ? c : {
        ...c,
        messages: c.messages.some(m => m.id === msg.id)
          ? c.messages  // already there (realtime duplication guard)
          : [...c.messages, msg],
        updatedAt: msg.createdAt,
      }
    ));
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
  }, []);

  // ── Edit submit ──────────────────────────────────────────────────────────
  const handleEditSubmit = async () => {
    if (!editingMsg || !activeId) return;
    const { msgId, content } = editingMsg;
    setEditingMsg(null);
    setConversations(prev => prev.map(c =>
      c.id !== activeId ? c : { ...c, messages: c.messages.map(m =>
        m.id === msgId ? { ...m, content, editedAt: new Date().toISOString() } : m
      )}
    ));
    await chatApi.editMessage(activeId, msgId, content).catch(e => { console.error('[Inbox] edit failed:', e); toast.error('Edit failed'); });
  };

  // ── Context menu handlers ────────────────────────────────────────────────
  const openMsgMenu = (e: React.MouseEvent, msg: ChatMessage) => {
    e.preventDefault(); e.stopPropagation();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setMsgMenu({ msg, x: r.left, y: r.bottom + 4 });
  };
  const handleMenuReply      = () => { if (msgMenu) { setReplyingTo(msgMenu.msg); setMsgMenu(null); } };
  const handleMenuEdit       = () => { if (msgMenu && user && msgMenu.msg.senderId === user.id) { setEditingMsg({ msgId: msgMenu.msg.id, content: msgMenu.msg.content || '' }); setMsgMenu(null); } };
  const handleMenuPin        = async () => {
    if (!msgMenu || !activeId) return;
    const { msg } = msgMenu; const newPinned = !msg.isPinned; setMsgMenu(null);
    setConversations(prev => prev.map(c => c.id !== activeId ? c : { ...c, messages: c.messages.map(m => m.id === msg.id ? { ...m, isPinned: newPinned } : m) }));
    await chatApi.pinMessage(activeId, msg.id, newPinned).catch(() => {});
    chatApi.getPinnedMessages(activeId).then(setPinnedMsgs).catch(() => {});
    toast(newPinned ? 'Message pinned 📌' : 'Message unpinned');
  };
  const handleMenuDeleteForMe  = async () => {
    if (!msgMenu || !activeId || !user) return;
    const { msg } = msgMenu; setMsgMenu(null);
    setConversations(prev => prev.map(c => c.id !== activeId ? c : { ...c, messages: c.messages.filter(m => m.id !== msg.id) }));
    await chatApi.deleteMessageForMe(activeId, msg.id, user.id).catch(() => {});
  };
  const handleMenuDeleteForAll = async () => {
    if (!msgMenu || !activeId || !user) return;
    const { msg } = msgMenu;
    if (msg.senderId !== user.id) { toast.error("You can only delete your own messages for everyone"); return; }
    setMsgMenu(null);
    setConversations(prev => prev.map(c => c.id !== activeId ? c : { ...c, messages: c.messages.filter(m => m.id !== msg.id) }));
    await chatApi.deleteMessageForAll(activeId, msg.id).catch(() => {});
  };
  const handleMsgSearch = async (q: string) => {
    setMsgSearch(q);
    if (!q.trim() || !activeId) { setMsgSearchResults([]); return; }
    const r = await chatApi.searchMessages(activeId, q);
    setMsgSearchResults(r);
  };

  const isSendingRef = useRef(false);

  const handleSend = async () => {
    if (!user || !activeConv || !message.trim()) return;
    if (isSendingRef.current) return;
    isSendingRef.current = true;
    const content = message.trim();
    setMessage('');
    setReplyingTo(null);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

    // ── Check if this conversation was previously deleted ─────────────────
    // If so, spin up a brand-new conversation and inject a system notice first.
    const recipientId = activeConv.participantIds.find(id => id !== user.id);
    const deletedRecord = recipientId
      ? consumeDeletedConvRecord(user.id, recipientId)
      : null;

    let targetConvId = activeConv.id;
    let targetParticipants = activeConv.participantIds;

    if (deletedRecord) {
      // Create a real new conversation in DB via RPC (gets a proper UUID)
      try {
        const newConv = await chatApi.getOrCreateDB(user.id, recipientId!);
        const freshConv: Conversation = {
          id: newConv.id,
          participantIds: activeConv.participantIds,
          messages: [],
          updatedAt: new Date().toISOString(),
          isRequest: false,
          requestedBy: null,
        };
        setConversations(prev => {
          const without = prev.filter(c => c.id !== activeConv.id && c.id !== newConv.id);
          return [freshConv, ...without];
        });
        setActiveId(newConv.id);
        targetConvId = newConv.id;
        targetParticipants = activeConv.participantIds;
      } catch {
        // Fallback to temp ID if DB fails
        const freshId = crypto.randomUUID();
        const freshConv: Conversation = {
          id: freshId,
          participantIds: activeConv.participantIds,
          messages: [],
          updatedAt: new Date().toISOString(),
          isRequest: false,
          requestedBy: null,
        };
        setConversations(prev => [freshConv, ...prev.filter(c => c.id !== activeConv.id)]);
        setActiveId(freshId);
        targetConvId = freshId;
        targetParticipants = activeConv.participantIds;
      }
    }

    // Build the real message for the optimistic UI update
    const tempMsg: ChatMessage = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      conversationId: targetConvId,
      senderId: user.id,
      senderName: user.name,
      senderAvatar: user.avatar,
      type: 'text',
      content,
      replyTo: replyingTo?.id,
      createdAt: new Date().toISOString(),
      read: false,
    };
    appendMsg(targetConvId, tempMsg);

    // Fire-and-forget — message already shown optimistically
    chatApi.sendMessageToDB(
      targetConvId, tempMsg,
      targetParticipants,
      false,
      null,
    ).then(() => {
      isSendingRef.current = false;
      if (recipientId) {
        notifs.push(recipientId, {
          type: 'message',
          fromUserId:     user.id,
          fromUserName:   user.name,
          fromUserAvatar: user.avatar,
          conversationId: targetConvId,
          commentContent: content.slice(0, 100),
        });
      }
    }).catch((e: any) => {
      isSendingRef.current = false;
      console.error('[Inbox] send error:', e?.message || e);
      toast.error('Failed to send — please try again');
      setConversations(prev => prev.map(c =>
        c.id !== targetConvId ? c : { ...c, messages: c.messages.filter(m => m.id !== tempMsg.id) }
      ));
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeConv || !user) return;
    const isVideo = file.type.startsWith('video/');
    const isImage = file.type.startsWith('image/');
    if (!isVideo && !isImage) { toast.error('Only images and videos supported'); return; }
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      const tempMsg: ChatMessage = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        conversationId: activeConv.id,
        senderId: user.id,
        senderName: user.name,
        senderAvatar: user.avatar,
        type: 'media',
        mediaUrl: dataUrl,
        mediaType: isVideo ? 'video' : 'image',
        createdAt: new Date().toISOString(),
        read: false,
      };
      appendMsg(activeConv.id, tempMsg);
      try {
        chatApi.sendMessageToDB(activeConv.id, tempMsg, activeConv.participantIds, activeConv.isRequest ?? false, activeConv.requestedBy ?? null);
      } catch (e) { console.error('[Inbox] file send failed:', e); toast.error('Failed to send file'); }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const startRecording = async () => {
    if (!activeConv || !user) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/ogg';
      const recorder = new MediaRecorder(stream, { mimeType });
      audioChunksRef.current = [];
      recorder.ondataavailable = e => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        const reader = new FileReader();
        reader.onload = async () => {
          const tempMsg: ChatMessage = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            conversationId: activeConv.id,
            senderId: user.id,
            senderName: user.name,
            senderAvatar: user.avatar,
            type: 'media',
            mediaUrl: reader.result as string,
            mediaType: 'audio',
            createdAt: new Date().toISOString(),
            read: false,
          };
          appendMsg(activeConv.id, tempMsg);
          try {
            chatApi.sendMessageToDB(activeConv.id, tempMsg, activeConv.participantIds, activeConv.isRequest ?? false, activeConv.requestedBy ?? null);
          } catch (e) { console.error('[Inbox] audio send failed:', e); toast.error('Failed to send audio'); }
        };
        reader.readAsDataURL(blob);
        stream.getTracks().forEach(t => t.stop());
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setRecordingSeconds(0);
      recordingTimerRef.current = setInterval(() => setRecordingSeconds(s => s + 1), 1000);
    } catch {
      toast.error('Microphone access denied');
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current = null;
    setIsRecording(false);
    if (recordingTimerRef.current) { clearInterval(recordingTimerRef.current); recordingTimerRef.current = null; }
    setRecordingSeconds(0);
  };

  const filteredConvs = conversations.filter(c => {
    if (!search.trim()) return true;
    const oid = c.participantIds.find(id => id !== user?.id) || '';
    const other = authApi.getUserByIdSync(oid);
    return other?.name?.toLowerCase().includes(search.toLowerCase());
  });

  // Separate requests (I'm the recipient) from regular messages
  const requestConvs = filteredConvs.filter(c => c.isRequest && c.requestedBy !== user?.id);
  const regularConvs = filteredConvs.filter(c => !c.isRequest || c.requestedBy === user?.id);
  const requestCount = requestConvs.length;
  const totalUnread  = regularConvs.reduce((sum, c) => sum + (c.unreadCount ?? 0), 0);

  // Unread conversations float to the top; within each group sort by most recent activity
  const sortByUnreadThenRecent = (a: typeof filteredConvs[0], b: typeof filteredConvs[0]) => {
    const aU = (a.unreadCount ?? 0) > 0 ? 1 : 0;
    const bU = (b.unreadCount ?? 0) > 0 ? 1 : 0;
    if (aU !== bU) return bU - aU;
    return (b.updatedAt || '').localeCompare(a.updatedAt || '');
  };
  const displayedConvs = (inboxTab === 'requests' ? requestConvs : regularConvs)
    .slice()
    .sort(sortByUnreadThenRecent);

  // Is the active conversation a pending request directed at me?
  const isActiveRequest = !!(activeConv?.isRequest && activeConv?.requestedBy !== user?.id);

  const handleAcceptRequest = async () => {
    if (!activeConv) return;
    // Update DB directly — set is_request = false, keep same conversation (no new thread)
    try {
      await supabase
        .from('conversations')
        .update({ is_request: false, updated_at: new Date().toISOString() })
        .eq('id', activeConv.id);
    } catch (e) {
      console.warn('acceptRequest DB update failed:', e);
    }
    chatApi.acceptRequest(activeConv.id);
    // Optimistic state update — same conv, just flip is_request
    setConversations(prev => prev.map(c =>
      c.id === activeConv.id ? { ...c, isRequest: false } : c
    ));
    toast.success('Message request accepted!');
  };

  const handleDeclineRequest = async () => {
    if (!activeConv) return;
    // Soft-delete: mark deleted for everyone in DB
    try {
      await supabase
        .from('conversations')
        .update({ deleted_for_everyone: true, updated_at: new Date().toISOString() })
        .eq('id', activeConv.id);
    } catch {}
    chatApi.deleteForUser(activeConv.id, user!.id).catch(() => {});
    setConversations(prev => prev.filter(c => c.id !== activeConv.id));
    setActiveId(null);
    setShowSidebar(true);
    toast('Request declined', { icon: '🚫' });
  };

  const handleBlockRequester = () => {
    if (!activeConv) return;
    const requesterId = activeConv.requestedBy || '';
    chatApi.blockUser(activeConv.id, requesterId);
    setActiveId(null);
    setShowSidebar(true);
    loadConversations();
    toast('User blocked', { icon: '🚫', description: 'This person can no longer message you.' });
  };

  // ── Seed demo payment request ────────────────────────────────────
  const seedDemoPayment = () => {
    if (!user) return;
    const DEMO_ID = 'demo-user-filmons-001';
    const LISTING_ID = 'demo-listing-filmons-001';
    const now = new Date().toISOString();

    // 1. Ensure demo user exists
    const users: any[] = JSON.parse(localStorage.getItem('filmons_users') || '[]');
    if (!users.find((u: any) => u.id === DEMO_ID)) {
      users.push({
        id: DEMO_ID, name: 'Alex Rivera', username: 'alexrivera',
        email: 'alex@filmons.demo', phone: '+15141234567',
        bio: 'Professional cinematographer & gear rental host 🎬 Based in Montréal.',
        avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&h=200&fit=crop',
        accountMode: 'business', accountCategory: 'Videographer',
        isVerified: true, verificationStatus: 'approved',
        followers: [user.id], following: [user.id], createdAt: now,
      });
      localStorage.setItem('filmons_users', JSON.stringify(users));
    }

    // 2. Ensure demo listing exists (owned by demo user, with payment methods)
    const listings: any[] = JSON.parse(localStorage.getItem('filmons_listings') || '[]');
    if (!listings.find((l: any) => l.id === LISTING_ID)) {
      listings.push({
        id: LISTING_ID, userId: DEMO_ID,
        title: 'Sony FX3 Full-Frame Cinema Camera',
        description: 'Professional cinema camera rental. Includes 2 batteries, charger, and CFexpress card.',
        tags: ['camera', 'sony', 'cinema', '4k'], price: 150, city: 'Montréal, QC',
        image: 'https://images.unsplash.com/photo-1616763355548-1b606f439f86?w=600&h=400&fit=crop',
        images: ['https://images.unsplash.com/photo-1616763355548-1b606f439f86?w=600&h=400&fit=crop'],
        listingType: 'gear', listingMode: 'rent',
        paymentMethods: ['Card (Visa/Mastercard)', 'PayPal', 'E-Transfer', 'Cash'],
        deliveryOptions: ['pickup', 'delivery'],
        requirements: 'Valid ID required. $200 security deposit (returned on safe return).',
        cancellation: 'Free cancellation up to 24h before pickup.',
        createdAt: now,
      });
      localStorage.setItem('filmons_listings', JSON.stringify(listings));
    }

    // 3. Find or create conversation
    const convs: any[] = JSON.parse(localStorage.getItem('filmons_conversations') || '[]');
    let conv = convs.find((c: any) =>
      c.participantIds.includes(DEMO_ID) && c.participantIds.includes(user.id)
    );
    const msgId = `demo-pay-msg-${Date.now()}`;
    const convId = conv?.id || `demo-conv-${Date.now()}`;
    const paymentMsg = {
      id: msgId, senderId: DEMO_ID, senderName: 'Alex Rivera',
      senderAvatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&h=200&fit=crop',
      type: 'payment_request',
      paymentRequest: {
        amount: 450,
        description: 'Sony FX3 Rental – 3 days (Apr 10–12)',
        listingId: LISTING_ID, listingTitle: 'Sony FX3 Full-Frame Cinema Camera',
        listingType: 'gear', listingMode: 'rent',
        startDate: new Date(Date.now() + 6 * 24 * 3600 * 1000).toISOString(),
        duration: 3, durationType: 'days', status: 'pending',
      },
      createdAt: now, read: false,
    };
    if (conv) {
      conv.messages.push(paymentMsg);
      conv.updatedAt = now;
    } else {
      conv = {
        id: convId, participantIds: [DEMO_ID, user.id],
        messages: [
          {
            id: `demo-msg-1-${Date.now()}`, senderId: DEMO_ID,
            senderName: 'Alex Rivera',
            senderAvatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&h=200&fit=crop',
            type: 'text',
            content: "Hey! I've accepted your rental request for the Sony FX3. I've sent over a payment request — please complete checkout when you're ready 📸",
            createdAt: new Date(Date.now() - 120000).toISOString(), read: false,
          },
          paymentMsg,
        ],
        updatedAt: now,
      };
      convs.push(conv);
    }
    localStorage.setItem('filmons_conversations', JSON.stringify(convs));
    toast.success('Demo payment request ready!');
    loadConversations();
    setTimeout(() => { setActiveId(conv.id); setShowSidebar(false); }, 200);
  };

  // ── Seed demo service request FROM Alex Rivera TO you (as host) ──
  const seedDemoServiceRequest = () => {
    if (!user) return;
    const DEMO_ID   = 'demo-user-filmons-001';
    const DEMO_NAME = 'Alex Rivera';
    const DEMO_AVT  = 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&h=200&fit=crop';
    const SVC_LISTING_ID = 'demo-svc-listing-001';
    const now = new Date().toISOString();

    // 1. Ensure Alex Rivera exists
    const users: any[] = JSON.parse(localStorage.getItem('filmons_users') || '[]');
    if (!users.find((u: any) => u.id === DEMO_ID)) {
      users.push({
        id: DEMO_ID, name: DEMO_NAME, username: 'alexrivera',
        email: 'alex@filmons.demo', phone: '+15141234567',
        bio: 'Professional cinematographer & gear rental host 🎬 Based in Montréal.',
        avatar: DEMO_AVT,
        accountMode: 'business', accountCategory: 'Videographer',
        isVerified: true, verificationStatus: 'approved',
        followers: [user.id], following: [user.id], createdAt: now,
      });
      localStorage.setItem('filmons_users', JSON.stringify(users));
    }

    // 2. Ensure a demo service listing owned by YOU exists
    const listings: any[] = JSON.parse(localStorage.getItem('filmons_listings') || '[]');
    let myServiceListing = listings.find((l: any) => l.userId === user.id && l.listingType === 'service');
    if (!myServiceListing) {
      myServiceListing = listings.find((l: any) => l.id === SVC_LISTING_ID);
      if (!myServiceListing) {
        myServiceListing = {
          id: SVC_LISTING_ID, userId: user.id,
          title: 'Full-Day Photo & Video Production',
          description: 'Complete production service: shooting, directing, and light editing included.',
          tags: ['photography', 'video', 'production', 'creative'],
          price: 200, city: 'Montréal, QC',
          image: 'https://images.unsplash.com/photo-1542038374869-8afe6c0c3a26?w=600&h=400&fit=crop',
          images: ['https://images.unsplash.com/photo-1542038374869-8afe6c0c3a26?w=600&h=400&fit=crop'],
          listingType: 'service', listingMode: 'rent',
          pricingPackages: [
            { tier: 'basic',    name: 'Half Day',   price: 200, description: '4-hour shoot session' },
            { tier: 'standard', name: 'Full Day',   price: 350, description: '8-hour shoot + basic edit' },
            { tier: 'premium',  name: 'Pro Bundle', price: 600, description: '2-day shoot + full edit + delivery' },
          ],
          acceptedPaymentMethods: ['E-Transfer', 'Card (Visa/Mastercard)', 'Cash'],
          fulfilmentOptions: ['In-Person'],
          createdAt: now,
        };
        listings.push(myServiceListing);
        localStorage.setItem('filmons_listings', JSON.stringify(listings));
      }
    }

    const selectedPackage = myServiceListing?.pricingPackages?.[1] || { tier: 'standard', name: 'Full Day', price: 350 };
    const startDate = new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString();

    // 3. Find or create conversation with Alex Rivera
    const convs: any[] = JSON.parse(localStorage.getItem('filmons_conversations') || '[]');
    let conv = convs.find((c: any) =>
      c.participantIds.includes(DEMO_ID) && c.participantIds.includes(user.id)
    );
    const convId = conv?.id || `demo-conv-svc-${Date.now()}`;

    const greetMsg = {
      id: `demo-svc-greet-${Date.now()}`,
      senderId: DEMO_ID, senderName: DEMO_NAME, senderAvatar: DEMO_AVT,
      type: 'text',
      content: `Hey! I came across your production service and I'd love to book it for an upcoming project. Sending you a service request now 🎬`,
      createdAt: new Date(Date.now() - 90000).toISOString(), read: false,
    };

    const reqMsg = {
      id: `demo-svc-req-${Date.now()}`,
      senderId: DEMO_ID, senderName: DEMO_NAME, senderAvatar: DEMO_AVT,
      type: 'rental_request',
      rentalRequest: {
        listingId:    myServiceListing.id,
        listingTitle: myServiceListing.title,
        listingType:  'service',
        startDate,
        duration:     8,
        durationType: 'hours',
        message:      'I need a professional team for a brand shoot. Would love the Full Day package!',
        selectedPackage,
        status:       'pending',
      },
      createdAt: new Date(Date.now() - 30000).toISOString(), read: false,
    };

    if (conv) {
      conv.messages = conv.messages.filter((m: any) => !String(m.id).startsWith('demo-svc-'));
      conv.messages.push(greetMsg, reqMsg);
      conv.updatedAt = now;
    } else {
      conv = { id: convId, participantIds: [DEMO_ID, user.id], messages: [greetMsg, reqMsg], updatedAt: now };
      convs.push(conv);
    }
    localStorage.setItem('filmons_conversations', JSON.stringify(convs));
    toast.success('Demo service request received! 📋');
    loadConversations();
    setTimeout(() => { setActiveId(convId); setShowSidebar(false); }, 200);
  };

  // ── Simulate Alex Rivera (demo buyer) paying a request YOU sent ──
  const seedDemoPaymentConfirmed = () => {
    if (!user) return;
    const DEMO_ID = 'demo-user-filmons-001';
    const DEMO_AVATAR = 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&h=200&fit=crop';
    const now = new Date().toISOString();

    // 1. Ensure Alex Rivera (demo buyer) exists
    const users: any[] = JSON.parse(localStorage.getItem('filmons_users') || '[]');
    if (!users.find((u: any) => u.id === DEMO_ID)) {
      users.push({
        id: DEMO_ID, name: 'Alex Rivera', username: 'alexrivera',
        email: 'alex@filmons.demo', phone: '+15141234567',
        bio: 'Professional cinematographer & gear rental host 🎬 Based in Montréal.',
        avatar: DEMO_AVATAR, accountMode: 'business', accountCategory: 'Videographer',
        isVerified: true, verificationStatus: 'approved',
        followers: [user.id], following: [user.id], createdAt: now,
      });
      localStorage.setItem('filmons_users', JSON.stringify(users));
    }

    // 2. Pick one of the current user's listings to attach to the request
    const allListings: any[] = JSON.parse(localStorage.getItem('filmons_listings') || '[]');
    const myListing = allListings.find((l: any) => l.userId === user.id);
    const listingTitle = myListing?.title ?? 'Creative Services Package';
    const listingId    = myListing?.id    ?? 'generic';
    const listingType  = myListing?.listingType ?? 'service';
    const listingMode  = myListing?.listingMode ?? 'rent';

    // 3. Payment request bubble — senderId is YOU (the host/seller who sent the request)
    const paidPaymentMsg: any = {
      id: `demo-paid-msg-${Date.now()}`,
      senderId: user.id,
      senderName: user.name,
      senderAvatar: user.avatar ?? '',
      type: 'payment_request',
      paymentRequest: {
        amount: 450,
        description: `Payment request for "${listingTitle}" – 3 days (Apr 10–12)`,
        listingId, listingTitle, listingType, listingMode,
        startDate: new Date(Date.now() + 6 * 24 * 3600 * 1000).toISOString(),
        duration: 3, durationType: 'days',
        // Alex has already paid
        status: 'paid', paymentMethod: 'E-Transfer', deliveryOption: 'pickup',
      },
      createdAt: new Date(Date.now() - 4 * 60 * 1000).toISOString(),
      read: true,
    };

    // 4. Alex Rivera's "I've paid" reply (he's the buyer confirming)
    const confirmTextMsg: any = {
      id: `demo-confirm-msg-${Date.now()}`,
      senderId: DEMO_ID,
      senderName: 'Alex Rivera',
      senderAvatar: DEMO_AVATAR,
      type: 'text',
      content: "✅ Just sent the E-Transfer — $450 CAD on its way to you! Super excited, let me know the pickup details whenever you're ready 🙌",
      createdAt: now,
      read: false,
    };

    // 5. Find or create the conversation
    const convs: any[] = JSON.parse(localStorage.getItem('filmons_conversations') || '[]');
    let conv = convs.find((c: any) =>
      c.participantIds.includes(DEMO_ID) && c.participantIds.includes(user.id)
    );

    if (conv) {
      // Update or append the payment_request sent by the current user
      const payIdx = conv.messages.findIndex(
        (m: any) => m.type === 'payment_request' && m.senderId === user.id
      );
      if (payIdx > -1) {
        conv.messages[payIdx] = paidPaymentMsg;
      } else {
        // Also remove any payment_request from Alex so there's no duplicate
        conv.messages = conv.messages.filter((m: any) => m.type !== 'payment_request');
        conv.messages.push(paidPaymentMsg);
      }
      conv.messages = conv.messages.filter(
        (m: any) => !String(m.id).startsWith('demo-confirm-msg-')
      );
      conv.messages.push(confirmTextMsg);
      conv.updatedAt = now;
    } else {
      conv = {
        id: `demo-conv-${Date.now()}`,
        participantIds: [DEMO_ID, user.id],
        messages: [
          {
            id: `demo-msg-open-${Date.now()}`,
            senderId: DEMO_ID, senderName: 'Alex Rivera', senderAvatar: DEMO_AVATAR,
            type: 'text',
            content: "Hey! Really interested in renting — can you send me a payment request when ready? 📸",
            createdAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
            read: true,
          },
          paidPaymentMsg,
          confirmTextMsg,
        ],
        updatedAt: now,
      };
      convs.push(conv);
    }

    localStorage.setItem('filmons_conversations', JSON.stringify(convs));
    toast.success('Alex Rivera has confirmed payment! 🎉');
    loadConversations();
    setTimeout(() => { setActiveId(conv.id); setShowSidebar(false); }, 200);
  };

  if (!user) return null;

  const acceptedRequest = activeConv?.messages.find(m => m.type === 'rental_request' && m.rentalRequest?.status === 'accepted');
  const isHostInConv = !!acceptedRequest && acceptedRequest.senderId !== user.id;

  const typingLabel = (() => {
    if (!typingUsers.size) return null;
    const names = [...typingUsers].map(uid => authApi.getUserByIdSync(uid)?.name?.split(' ')[0] || 'Someone').join(', ');
    return `${names} ${typingUsers.size === 1 ? 'is' : 'are'} typing…`;
  })();

  const lastOwnMsgId = (() => {
    if (!activeConv || !user) return null;
    const own = activeConv.messages.filter(m => m.senderId === user.id);
    return own[own.length - 1]?.id ?? null;
  })();

  return (
    <div className="h-screen flex flex-col bg-gray-50" onClick={() => { setMsgMenu(null); setShowEmojiPicker(false); }}>
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-200 shrink-0">
        <button onClick={() => { if (!showSidebar) { setShowSidebar(true); setActiveId(null); } else navigate(-1); }}
          className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-600">
          <ArrowBackIosNewRounded sx={{fontSize:18}} />
        </button>
        <h1 className="text-lg font-bold text-gray-900">
          {activeConv && otherUser && !showSidebar
            ? otherUser.name
            : totalUnread > 0 ? `Inbox (${totalUnread})` : 'Inbox'}
        </h1>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div className={`relative flex flex-col border-r border-gray-200 bg-white ${showSidebar ? 'flex w-full md:w-80 shrink-0' : 'hidden md:flex md:w-80 shrink-0'}`}>
          <div className="px-3 py-3 border-b border-gray-100 space-y-2">
            {/* Title + compose button */}
            <div className="flex items-center justify-between px-1 mb-1">
              <h2 className="text-base font-bold text-gray-900">
                {totalUnread > 0 ? `Inbox (${totalUnread})` : 'Inbox'}
              </h2>
              <button
                onClick={() => setShowNewConv(true)}
                title="New conversation"
                className="w-8 h-8 flex items-center justify-center rounded-full bg-blue-600 hover:bg-blue-700 transition-colors shadow-sm"
              >
                <EditRounded sx={{fontSize:18,color:"white"}} />
              </button>
            </div>
            <div className="flex items-center gap-2 bg-gray-100 rounded-xl px-3 py-2">
              <SearchRounded sx={{fontSize:18,color:"#9ca3af",flexShrink:0}} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search conversations…"
                className="flex-1 bg-transparent text-sm text-gray-700 placeholder-gray-400 outline-none" />
            </div>
            {/* Messages / Requests tabs */}
            <div className="flex bg-gray-100 rounded-xl p-0.5">
              <button
                onClick={() => setInboxTab('messages')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-bold transition-all ${inboxTab === 'messages' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}
              >
                <ChatBubbleRounded sx={{fontSize:12}} /> Messages
              </button>
              <button
                onClick={() => setInboxTab('requests')}
                className={`flex-1 relative flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-bold transition-all ${inboxTab === 'requests' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}
              >
                <GppBadRounded sx={{fontSize:12}} /> Requests
                {requestCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 bg-amber-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center px-1">
                    {requestCount > 99 ? '99+' : requestCount}
                  </span>
                )}
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {displayedConvs.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full py-16 px-6 text-center">
                <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center mb-4">
                  {inboxTab === 'requests'
                    ? <GppBadRounded sx={{fontSize:32}} />
                    : <ChatBubbleRounded sx={{fontSize:32,color:"#60a5fa"}} />}
                </div>
                <p className="text-sm font-semibold text-gray-700 mb-1">
                  {inboxTab === 'requests' ? 'No message requests' : 'No messages yet'}
                </p>
                <p className="text-xs text-gray-400 mb-5">
                  {inboxTab === 'requests'
                    ? "People who message you without following you back will appear here."
                    : search ? 'No conversations match.' : 'Start a conversation from a user profile.'}
                </p>
              </div>
            ) : (
              <>
                {inboxTab === 'requests' && (
                  <div className="px-4 py-2.5 bg-amber-50 border-b border-amber-100">
                    <p className="text-xs text-amber-700 font-medium">
                      💬 These people messaged you without following you. Accept to chat, or decline to remove.
                    </p>
                  </div>
                )}
                {/* ── Delete confirm overlay ─────────────────────────── */}
                {deleteConfirm && (() => {
                  const target = conversations.find(c => c.id === deleteConfirm)
                    || archivedConvs.find(c => c.id === deleteConfirm);
                  const otherId = target?.participantIds.find(id => id !== user.id) || '';
                  const other = authApi.getUserByIdSync(otherId);
                  return (
                    <div className="absolute inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm">
                      <div className="w-full sm:w-80 bg-white rounded-t-3xl sm:rounded-2xl p-6 shadow-2xl m-0 sm:m-4">
                        <div className="flex flex-col items-center text-center mb-5">
                          <div className="w-14 h-14 bg-red-50 rounded-2xl flex items-center justify-center mb-3">
                            <DeleteRounded sx={{fontSize:28,color:"#ef4444"}} />
                          </div>
                          <h3 className="text-base font-bold text-gray-900 mb-1">Delete conversation?</h3>
                          <p className="text-sm text-gray-500 leading-relaxed">
                            This will permanently delete your conversation with <span className="font-semibold text-gray-700">{other?.name || 'this person'}</span> for both sides. This cannot be undone.
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setDeleteConfirm(null)}
                            className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => {
                              if (deleteConfirm) {
                                handleDeleteConversation(deleteConfirm);
                                setDeleteConfirm(null);
                              }
                            }}
                            className="flex-1 py-3 rounded-xl bg-red-600 hover:bg-red-700 text-sm font-semibold text-white transition-colors shadow-sm"
                              >
                            Delete for everyone
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {displayedConvs.map(conv => (
                  <ConvRow key={conv.id} conv={conv} currentUserId={user.id} isActive={conv.id === activeId}
                    isRequest={inboxTab === 'requests'}
                    onClick={() => { setActiveId(conv.id); setShowSidebar(false); }}
                    onLongPress={() => setConvActionSheet(conv)}
                    onPin={() => {
                      const pinned = !conv.isPinned;
                      setConversations(prev => prev.map(c => c.id === conv.id ? { ...c, isPinned: pinned } : c));
                      chatApi.pinConversation(conv.id, user.id, pinned);
                      toast(pinned ? 'Conversation pinned 📌' : 'Conversation unpinned');
                    }}
                    onMute={() => {
                      const muted = !conv.isMuted;
                      setConversations(prev => prev.map(c => c.id === conv.id ? { ...c, isMuted: muted } : c));
                      chatApi.muteConversation(conv.id, user.id, muted);
                      toast(muted ? 'Notifications muted 🔕' : 'Notifications unmuted 🔔');
                    }}
                    onArchive={() => {
                      setConversations(prev => prev.filter(c => c.id !== conv.id));
                      if (activeId === conv.id) { setActiveId(null); setShowSidebar(true); }
                      chatApi.archiveConversation(conv.id, user.id, true);
                      setArchivedConvs(prev => [{ ...conv, isArchived: true }, ...prev]);
                      toast('Conversation archived 📁');
                    }}
                    onDelete={() => setDeleteConfirm(conv.id)}
                  />
                ))}

                {/* ── Archived section ───────────────────────────────── */}
                {inboxTab === 'messages' && (
                  <div className="border-t border-gray-100 mt-1">
                    <button
                      onClick={handleToggleArchived}
                      className="w-full flex items-center justify-between px-4 py-3 text-xs font-semibold text-gray-500 hover:bg-gray-50 transition-colors"
                    >
                      <span className="flex items-center gap-2">
                        <span className="text-base leading-none">📁</span>
                        Archived
                        {archivedConvs.length > 0 && (
                          <span className="bg-gray-200 text-gray-600 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                            {archivedConvs.length}
                          </span>
                        )}
                      </span>
                      <ChevronDown className={`w-4 h-4 transition-transform ${showArchived ? 'rotate-180' : ''}`} />
                    </button>

                    {showArchived && (
                      <div className="bg-gray-50/60">
                        {loadingArchived ? (
                          <div className="flex items-center justify-center py-8">
                            <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                          </div>
                        ) : archivedConvs.length === 0 ? (
                          <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
                            <span className="text-3xl mb-2">📭</span>
                            <p className="text-xs text-gray-400 font-medium">No archived conversations</p>
                          </div>
                        ) : (
                          archivedConvs.map(conv => {
                            const otherId = conv.participantIds.find(id => id !== user.id) || '';
                            const other = authApi.getUserByIdSync(otherId);
                            const last = conv.messages[conv.messages.length - 1];
                            const preview = conv.lastMessagePreview || last?.content || '';
                            return (
                              <div key={conv.id} className="relative group/arch flex items-center gap-3 px-4 py-3 hover:bg-gray-100 transition-colors cursor-pointer border-b border-gray-100 last:border-0"
                                onClick={() => { setActiveId(conv.id); setShowSidebar(false); }}>
                                <div className="relative shrink-0 opacity-70">
                                  <UserAvatar user={other || { name: otherId, id: otherId }} size={40} />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between mb-0.5">
                                    <span className="text-sm font-semibold text-gray-600 truncate">{other?.name || 'Unknown'}</span>
                                    <span className="text-[10px] text-gray-400">Archived</span>
                                  </div>
                                  {preview && <p className="text-xs text-gray-400 truncate">{preview}</p>}
                                </div>
                                {/* Unarchive + delete actions */}
                                <div className="flex items-center gap-1 opacity-0 group-hover/arch:opacity-100 transition-opacity shrink-0">
                                  <button
                                    onClick={e => {
                                      e.stopPropagation();
                                      setArchivedConvs(prev => prev.filter(c => c.id !== conv.id));
                                      setConversations(prev => [{ ...conv, isArchived: false }, ...prev]);
                                      chatApi.unarchiveConversation(conv.id, user.id);
                                      toast('Moved back to inbox');
                                    }}
                                    title="Unarchive"
                                    className="w-7 h-7 flex items-center justify-center rounded-full bg-blue-100 hover:bg-blue-200 text-blue-600 transition-colors"
                                  >
                                    <span className="text-sm">📥</span>
                                  </button>
                                  <button
                                    onClick={e => { e.stopPropagation(); setDeleteConfirm(conv.id); }}
                                    title="Delete for everyone"
                                    className="w-7 h-7 flex items-center justify-center rounded-full bg-red-100 hover:bg-red-200 text-red-600 transition-colors"
                                  >
                                    <DeleteRounded sx={{fontSize:12}} />
                                  </button>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Thread */}
        <div className={`flex flex-col flex-1 overflow-hidden ${showSidebar ? 'hidden md:flex' : 'flex'}`}>
          {!activeConv ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-6">
              <div className="w-20 h-20 rounded-full bg-blue-50 flex items-center justify-center mb-4"><ChatBubbleRounded sx={{fontSize:40,color:"#60a5fa"}} /></div>
              <p className="text-base font-semibold text-gray-700 mb-1">Select a conversation</p>
              <p className="text-sm text-gray-400">Choose a conversation from the left to start chatting.</p>
            </div>
          ) : (
            <>
              {/* Request banner — shown to the recipient of a pending request */}
              {isActiveRequest && (
                <div className="px-4 py-4 bg-amber-50 border-b-2 border-amber-200 shrink-0">
                  <div className="flex items-start gap-3 mb-3">
                    <GppBadRounded sx={{fontSize:20,color:"#f59e0b"}} />
                    <div>
                      <p className="text-sm font-bold text-amber-800">Message Request</p>
                      <p className="text-xs text-amber-700 mt-0.5">
                        <span className="font-semibold">{authApi.getUserByIdSync(activeConv.requestedBy || '')?.name || 'Someone'}</span> sent you a message request. Read it above, then decide:
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={handleAcceptRequest}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-colors shadow-sm">
                      <HowToRegRounded sx={{fontSize:12}} /> Accept
                    </button>
                    <button onClick={handleDeclineRequest}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 text-xs font-bold rounded-xl transition-colors">
                      <CloseRounded sx={{fontSize:12}} /> Delete
                    </button>
                    <button onClick={handleBlockRequester}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-white border border-red-200 text-red-600 hover:bg-red-50 text-xs font-bold rounded-xl transition-colors">
                      <PersonRemoveRounded sx={{fontSize:12}} /> Block
                    </button>
                  </div>
                </div>
              )}

              {/* Sender banner — shown to the person who initiated the request */}
              {activeConv?.isRequest && activeConv?.requestedBy === user?.id && (
                <div className="px-4 py-3 bg-blue-50 border-b border-blue-100 shrink-0 flex items-center gap-2">
                  <HourglassEmptyRounded sx={{fontSize:16,color:"#3b82f6"}} />
                  <p className="text-xs text-blue-700">
                    Waiting for <span className="font-semibold">{otherUser?.name || 'them'}</span> to accept your message request.
                  </p>
                </div>
              )}

              {/* Thread header */}
              <div className="flex items-center justify-between gap-3 px-4 py-3 bg-white border-b border-gray-200 shrink-0">
                <div className="flex items-center gap-3">
                  {otherUser && (
                    <>
                      <Link to={`/host/${otherUser.id}`}><UserAvatar user={otherUser} size={38} /></Link>
                      <div>
                        <Link to={`/host/${otherUser.id}`} className="text-sm font-bold text-gray-900 hover:text-blue-600 transition-colors">{otherUser.name}</Link>
                        {otherUser.accountType && <div className="mt-0.5"><AccountTypeBadge type={otherUser.accountType} size="sm" /></div>}
                      </div>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={e => { e.stopPropagation(); setShowMsgSearch(v => !v); setMsgSearch(''); setMsgSearchResults([]); }}
                    className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500" title="Search messages">
                    <SearchRounded sx={{fontSize:16}} />
                  </button>
                  {canCall && (
                    <button onClick={() => setShowCallScreen(true)}
                      className="w-9 h-9 flex items-center justify-center rounded-full bg-green-100 hover:bg-green-200 text-green-700 transition-colors"
                      title="Call">
                      <PhoneRounded sx={{fontSize:16}} />
                    </button>
                  )}
                  {isHostInConv && (user?.accountType === 'business' || user?.accountMode === 'business') && (
                    <button onClick={() => setShowPaymentModal(true)}
                      className="flex items-center gap-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-xl transition-colors">
                      <CreditCardRounded sx={{fontSize:12}} /> Request Payment
                    </button>
                  )}
                </div>
              </div>

              {/* Message search bar */}
              {showMsgSearch && (
                <div className="px-4 py-2 border-b border-gray-100 bg-white shrink-0">
                  <div className="flex items-center gap-2 bg-gray-100 rounded-xl px-3 py-2">
                    <SearchRounded sx={{fontSize:18,color:"#9ca3af",flexShrink:0}} />
                    <input autoFocus value={msgSearch} onChange={e => handleMsgSearch(e.target.value)}
                      placeholder="Search in conversation…"
                      className="flex-1 bg-transparent text-sm text-gray-700 placeholder-gray-400 outline-none" />
                    {msgSearch && <button onClick={() => { setMsgSearch(''); setMsgSearchResults([]); }} className="text-gray-400 hover:text-gray-600"><CloseRounded sx={{fontSize:12}} /></button>}
                  </div>
                  {msgSearchResults.length > 0 && (
                    <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
                      {msgSearchResults.map(m => (
                        <div key={m.id} className="px-2 py-1.5 rounded-lg bg-gray-50 text-xs text-gray-700 truncate">
                          <span className="font-semibold text-gray-500">{authApi.getUserByIdSync(m.senderId)?.name || 'User'}: </span>
                          {m.content}
                        </div>
                      ))}
                    </div>
                  )}
                  {msgSearch && !msgSearchResults.length && (
                    <p className="mt-1.5 text-xs text-gray-400 px-1">No messages match.</p>
                  )}
                </div>
              )}

              {/* Pinned messages banner */}
              {pinnedMsgs.length > 0 && (
                <div className="px-4 py-2 bg-amber-50 border-b border-amber-200 shrink-0 flex items-center gap-2">
                  <PushPinRounded sx={{fontSize:12}} />
                  <p className="text-xs text-amber-800 font-medium truncate flex-1">
                    {pinnedMsgs[0].content || 'Pinned message'}
                    {pinnedMsgs.length > 1 && <span className="text-amber-600 ml-1"> +{pinnedMsgs.length - 1} more</span>}
                  </p>
                </div>
              )}

              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
                {activeConv.messages.length === 0 && (
                  <div className="text-center py-10"><p className="text-sm text-gray-400">No messages yet. Say hello! 👋</p></div>
                )}
                {activeConv.messages.map(msg => {
                  const isOwn = msg.senderId === user.id;
                  if (msg.deletedFor?.[user.id]) return null;

                  // ── System notice (e.g. "previous conversation was deleted") ──
                  if ((msg.type as string) === 'system') {
                    return (
                      <div key={msg.id} className="flex justify-center my-3 px-4">
                        <div className="flex items-center gap-2 bg-gray-100 text-gray-500 text-xs px-4 py-2 rounded-full max-w-xs text-center leading-snug">
                          <span>🗑️</span>
                          <span>{msg.content}</span>
                        </div>
                      </div>
                    );
                  }
                  const replyMsg = msg.replyTo ? activeConv.messages.find(m => m.id === msg.replyTo) ?? null : null;
                  const isLastOwn = isOwn && msg.id === lastOwnMsgId;
                  const seenStatus = isOwn ? msgStatuses[msg.id] : undefined;

                  return (
                    <div
                      key={msg.id}
                      className={`flex ${isOwn ? 'justify-end' : 'justify-start'} group`}
                      onTouchStart={handleMsgTouchStart(msg)}
                      onTouchMove={handleMsgTouchMove}
                      onTouchEnd={handleMsgTouchEnd}
                      onTouchCancel={handleMsgTouchEnd}
                    >
                      <div className={`flex items-end gap-2 max-w-[75%] ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
                        {!isOwn && <UserAvatar user={{ name: msg.senderName, avatar: msg.senderAvatar, id: msg.senderId }} size={28} />}
                        <div>
                          {/* Reply preview */}
                          {replyMsg && (
                            <div className={`mb-0.5 px-2 py-1 rounded-lg border-l-2 border-blue-400 bg-blue-50/80 text-xs text-gray-500 max-w-[200px] truncate ${isOwn ? 'ml-auto' : ''}`}>
                              <span className="font-semibold text-blue-600">{authApi.getUserByIdSync(replyMsg.senderId)?.name || 'User'}: </span>
                              {replyMsg.content || '📎 Media'}
                            </div>
                          )}

                          {/* Pin indicator */}
                          {msg.isPinned && <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'} mb-0.5`}><PushPinRounded sx={{fontSize:12,color:"#f59e0b"}} /></div>}

                          {/* Bubble + context trigger */}
                          <div className="relative">
                            {msg.type === 'media' ? (
                              <MediaBubble msg={msg} isOwn={isOwn} />
                            ) : msg.type === 'post' && msg.sharedPost ? (
                              <div>
                                {msg.content && <div className={`mb-1.5 px-3 py-2 rounded-2xl text-sm ${isOwn ? 'bg-blue-600 text-white rounded-br-sm' : 'bg-white text-gray-800 rounded-bl-sm border border-gray-200'}`}>{msg.content}</div>}
                                <SharedPostBubble post={msg.sharedPost} isOwn={isOwn} />
                              </div>
                            ) : msg.type === 'rental_request' && msg.rentalRequest ? (
                            <RentalRequestBubble msg={msg} isOwn={isOwn} conversationId={activeConv.id}
                              onStatusChange={(payMsg, status = 'accepted') => {
                                if (payMsg) {
                                  appendMsg(activeConv.id, payMsg);
                                  chatApi.sendMessageToDB(
                                    activeConv.id, payMsg,
                                    activeConv.participantIds,
                                    activeConv.isRequest ?? false,
                                    activeConv.requestedBy ?? null,
                                  ).catch(e => console.error('[Inbox] rental auto-payment DB write failed:', e));
                                }
                                setConversations(prev => prev.map(c =>
                                  c.id !== activeConv.id ? c : {
                                    ...c,
                                    messages: c.messages.map(m =>
                                      m.id === msg.id && m.rentalRequest
                                        ? { ...m, rentalRequest: { ...m.rentalRequest, status } }
                                        : m
                                    ),
                                  }
                                ));
                              }}
                              hostUser={user} />
                          ) : msg.type === 'payment_request' && msg.paymentRequest ? (
                            <PaymentRequestBubble msg={msg} isOwn={isOwn} conversationId={activeConv.id} onStatusChange={loadConversations} />
                          ) : editingMsg?.msgId === msg.id ? (
                            /* Inline edit */
                            <div className="flex items-center gap-2 bg-white border-2 border-blue-400 rounded-2xl px-3 py-2 min-w-[180px]">
                              <input autoFocus value={editingMsg.content}
                                onChange={e => setEditingMsg({ ...editingMsg, content: e.target.value })}
                                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleEditSubmit(); } if (e.key === 'Escape') setEditingMsg(null); }}
                                className="flex-1 text-sm text-gray-800 outline-none bg-transparent" />
                              <button onClick={handleEditSubmit} className="text-blue-600 hover:text-blue-700"><CheckRounded sx={{fontSize:16}} /></button>
                              <button onClick={() => setEditingMsg(null)} className="text-gray-400"><CloseRounded sx={{fontSize:16}} /></button>
                            </div>
                          ) : (
                            <div className={`px-3.5 py-2 rounded-2xl text-sm leading-relaxed ${isOwn ? 'bg-blue-600 text-white rounded-br-sm' : 'bg-white text-gray-800 rounded-bl-sm border border-gray-100 shadow-sm'}`}>
                              {msg.content}
                              {msg.editedAt && <span className="ml-1.5 text-[10px] opacity-60 italic">edited</span>}
                            </div>
                          )}

                          {/* Context menu trigger */}
                          <button onClick={e => openMsgMenu(e, msg)}
                            className={`absolute top-0 ${isOwn ? '-left-7' : '-right-7'} opacity-0 group-hover:opacity-100 transition-opacity w-6 h-6 flex items-center justify-center rounded-full bg-white shadow border border-gray-200 text-gray-400 hover:text-gray-600 z-10`}>
                            <MoreHorizRounded sx={{fontSize:12}} />
                          </button>
                          </div>

                          {/* Timestamp + delivery indicator */}
                          <div className={`flex items-center gap-1 mt-0.5 ${isOwn ? 'justify-end' : 'justify-start'}`}>
                            <span className="text-[10px] text-gray-400">{timeAgo(msg.createdAt)}</span>
                            {isOwn && (
                              seenStatus === 'seen'
                                ? <DoneAllRounded sx={{fontSize:12,color:"#3b82f6"}} />
                                : seenStatus === 'delivered'
                                  ? <DoneAllRounded sx={{fontSize:12,color:"#9ca3af"}} />
                                  : <CheckRounded sx={{fontSize:12}} />
                            )}
                          </div>

                          {/* "Seen" label under last own message */}
                          {isLastOwn && seenStatus === 'seen' && otherUser && (
                            <div className="flex justify-end mt-0.5">
                              <div className="flex items-center gap-1">
                                <UserAvatar user={otherUser} size={12} />
                                <span className="text-[10px] text-blue-500 font-medium">Seen</span>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* Typing indicator */}
                {typingLabel && (
                  <div className="flex justify-start">
                    <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-2xl px-3 py-2 shadow-sm">
                      <div className="flex gap-0.5">
                        {[0,1,2].map(i => <div key={i} className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: `${i*0.15}s` }} />)}
                      </div>
                      <span className="text-xs text-gray-500 italic">{typingLabel}</span>
                    </div>
                  </div>
                )}

                <div ref={bottomRef} />
              </div>

              {/* Input area — hidden for pending requests (must accept first) */}
              <div className={`px-4 py-3 bg-white border-t border-gray-200 shrink-0 ${isActiveRequest ? 'opacity-40 pointer-events-none select-none' : ''}`}
                title={isActiveRequest ? 'Accept the request to start chatting' : undefined}
              >
                {/* Reply preview bar */}
                {replyingTo && (
                  <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-xl px-3 py-2 mb-2">
                    <ReplyRounded sx={{fontSize:12,color:"#3b82f6"}} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-blue-600 truncate">Replying to {authApi.getUserByIdSync(replyingTo.senderId)?.name || 'User'}</p>
                      <p className="text-xs text-gray-500 truncate">{replyingTo.content || '📎 Media'}</p>
                    </div>
                    <button onClick={() => setReplyingTo(null)} className="shrink-0 text-gray-400 hover:text-gray-600"><CloseRounded sx={{fontSize:12}} /></button>
                  </div>
                )}

                {/* Voice recording indicator */}
                {isRecording && (
                  <div className="flex items-center gap-3 px-3 py-2 mb-2 bg-red-50 rounded-xl border border-red-200">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse shrink-0" />
                    <span className="text-xs font-semibold text-red-600 flex-1">Recording… {fmtDuration(recordingSeconds)}</span>
                    <button onClick={stopRecording} className="text-xs font-bold text-red-600 hover:text-red-800 flex items-center gap-1">
                      <MicOffRounded sx={{fontSize:12}} /> Send
                    </button>
                    <button onClick={() => { mediaRecorderRef.current?.stop(); setIsRecording(false); if (recordingTimerRef.current) clearInterval(recordingTimerRef.current); }}
                      className="text-xs text-red-400 hover:text-red-600">Cancel</button>
                  </div>
                )}

                <div className="relative flex items-end gap-2">
                  {/* Emoji picker */}
                  {showEmojiPicker && (
                    <EmojiPicker
                      onSelect={e => setMessage(m => m + e)}
                      onClose={() => setShowEmojiPicker(false)}
                    />
                  )}

                  {/* Left buttons */}
                  <div className="flex items-center gap-1 shrink-0 pb-1.5 relative">
                    {/* + Attach button */}
                    <button
                      type="button"
                      onClick={() => { setShowAttachMenu(v => !v); setShowEmojiPicker(false); }}
                      className={`w-9 h-9 flex items-center justify-center rounded-full transition-all duration-200 ${showAttachMenu ? 'bg-blue-600 text-white rotate-45' : 'text-gray-400 hover:bg-gray-100'}`}
                    >
                      <AddRounded sx={{fontSize:22}} />
                    </button>

                    {/* Emoji button */}
                    <button type="button" onClick={() => { setShowEmojiPicker(v => !v); setShowAttachMenu(false); }}
                      className={`w-9 h-9 flex items-center justify-center rounded-full transition-colors ${showEmojiPicker ? 'bg-blue-100 text-blue-600' : 'text-gray-400 hover:bg-gray-100'}`}>
                      <SentimentSatisfiedRounded sx={{fontSize:22}} />
                    </button>

                    {/* Attach menu popup */}
                    {showAttachMenu && (
                      <div className="absolute bottom-12 left-0 z-50">
                        <div className="fixed inset-0 -z-10" onClick={() => setShowAttachMenu(false)} />
                        <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden w-56" style={{animation:'slideUp .18s ease-out'}}>
                          <button type="button" onClick={() => { setShowAttachMenu(false); const i=document.createElement('input');i.type='file';i.accept='image/*';i.multiple=true;i.onchange=(e)=>{const fs=(e.target as HTMLInputElement).files;if(fs&&fileInputRef.current){const dt=new DataTransfer();Array.from(fs).forEach(f=>dt.items.add(f));fileInputRef.current.files=dt.files;fileInputRef.current.dispatchEvent(new Event('change',{bubbles:true}));}}; i.click();}} className="flex items-center gap-3 w-full px-4 py-3.5 hover:bg-gray-50 transition-colors text-left">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-pink-500 to-rose-500 flex items-center justify-center shadow-sm"><PhotoLibraryRounded sx={{fontSize:20,color:"white"}} /></div>
                            <div><p className="text-sm font-semibold text-gray-800">Photo</p><p className="text-xs text-gray-400">Share from gallery</p></div>
                          </button>
                          <div className="h-px bg-gray-100 mx-4" />
                          <button type="button" onClick={() => { setShowAttachMenu(false); const i=document.createElement('input');i.type='file';i.accept='video/*';i.onchange=(e)=>{const f=(e.target as HTMLInputElement).files?.[0];if(f&&fileInputRef.current){const dt=new DataTransfer();dt.items.add(f);fileInputRef.current.files=dt.files;fileInputRef.current.dispatchEvent(new Event('change',{bubbles:true}));}}; i.click();}} className="flex items-center gap-3 w-full px-4 py-3.5 hover:bg-gray-50 transition-colors text-left">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-sm"><VideoLibraryRounded sx={{fontSize:20,color:"white"}} /></div>
                            <div><p className="text-sm font-semibold text-gray-800">Video</p><p className="text-xs text-gray-400">Share a video clip</p></div>
                          </button>
                          <div className="h-px bg-gray-100 mx-4" />
                          <button type="button" onClick={() => { setShowAttachMenu(false); const i=document.createElement('input');i.type='file';i.accept='image/*';(i as any).capture='environment';i.onchange=(e)=>{const f=(e.target as HTMLInputElement).files?.[0];if(f&&fileInputRef.current){const dt=new DataTransfer();dt.items.add(f);fileInputRef.current.files=dt.files;fileInputRef.current.dispatchEvent(new Event('change',{bubbles:true}));}}; i.click();}} className="flex items-center gap-3 w-full px-4 py-3.5 hover:bg-gray-50 transition-colors text-left">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center shadow-sm"><CameraAltRounded sx={{fontSize:20,color:"white"}} /></div>
                            <div><p className="text-sm font-semibold text-gray-800">Camera</p><p className="text-xs text-gray-400">Take a photo now</p></div>
                          </button>
                          {(user?.accountType === 'business' || user?.accountMode === 'business') && (<>
                            <div className="h-px bg-gray-100 mx-4" />
                            <button type="button" onClick={() => { setShowAttachMenu(false); setShowPaymentModal(true); }} className="flex items-center gap-3 w-full px-4 py-3.5 hover:bg-gray-50 transition-colors text-left">
                              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shadow-sm"><PaymentRounded sx={{fontSize:20,color:"white"}} /></div>
                              <div><p className="text-sm font-semibold text-gray-800">Payment Request</p><p className="text-xs text-gray-400">Request money for a listing</p></div>
                            </button>
                          </>)}
                        </div>
                        <style>{`@keyframes slideUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}`}</style>
                      </div>
                    )}
                    <input ref={fileInputRef} type="file" accept="image/*,video/*" className="hidden" onChange={handleFileChange} />
                  </div>

                                    {/* Text area */}
                  <div className="flex-1 flex items-end bg-gray-100 rounded-2xl px-3 py-2 min-h-[42px]">
                    <textarea value={message}
                      onChange={e => {
                        setMessage(e.target.value);
                        broadcastTyping();
                        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
                        if (activeConv && user) chatApi.saveDraft(activeConv.id, user.id, e.target.value);
                      }}
                      onKeyDown={handleKeyDown}
                      placeholder="Type a message…" rows={1}
                      className="flex-1 bg-transparent text-sm text-gray-800 placeholder-gray-400 outline-none resize-none max-h-28 leading-relaxed" />
                  </div>

                  {/* Right: mic or send */}
                  <div className="shrink-0 pb-1">
                    {message.trim() ? (
                      <button onClick={handleSend}
                        className="w-10 h-10 flex items-center justify-center rounded-full bg-blue-600 hover:bg-blue-700 text-white transition-colors">
                        <SendRounded sx={{fontSize:18}} />
                      </button>
                    ) : (
                      <button type="button" onMouseDown={startRecording}
                        className={`w-10 h-10 flex items-center justify-center rounded-full transition-colors ${isRecording ? 'bg-red-500 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-500'}`}>
                        <MicRounded sx={{fontSize:22}} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Modals */}
      {showNewConv && user && (
        <NewConversationModal
          user={user}
          onClose={() => setShowNewConv(false)}
          onStart={async (targetUser) => {
            setShowNewConv(false);
            try {
              const conv = await chatApi.getOrCreateDB(user.id, targetUser.id);
              // Add to conversations if not already there
              setConversations(prev => {
                if (prev.find(c => c.id === conv.id)) return prev;
                return [conv, ...prev];
              });
              setActiveId(conv.id);
              setShowSidebar(false);
              // Cache the target user so their name shows
              try {
                const c = JSON.parse(localStorage.getItem('filmons_users_cache') || '{}');
                c[targetUser.id] = targetUser;
                localStorage.setItem('filmons_users_cache', JSON.stringify(c));
              } catch {}
            } catch (e) {
              toast.error('Could not open conversation');
            }
          }}
        />
      )}

      {showPaymentModal && activeConv && (
        <RequestPaymentModal conversationId={activeConv.id} user={user} activeConv={activeConv}
          onClose={() => setShowPaymentModal(false)}
          onSent={(msg) => {
            appendMsg(activeConv.id, msg);
            // Ensure the conv + message are persisted with correct participants
            chatApi.sendMessageToDB(
              activeConv.id, msg,
              activeConv.participantIds,
              activeConv.isRequest ?? false,
              activeConv.requestedBy ?? null,
            ).catch(e => console.error('[Inbox] payment request DB write failed:', e));
          }} />
      )}
      {showCallScreen && otherUser && (
        <CallScreen caller={user} callee={otherUser} onEnd={() => setShowCallScreen(false)} />
      )}

      {/* ── Conv action bottom sheet (mobile long-press) ── */}
      {convActionSheet && (
        <ConvActionSheet
          conv={convActionSheet}
          currentUserId={user.id}
          onClose={() => setConvActionSheet(null)}
          onPin={() => {
            const c = convActionSheet;
            const pinned = !c.isPinned;
            setConversations(prev => prev.map(x => x.id === c.id ? { ...x, isPinned: pinned } : x));
            chatApi.pinConversation(c.id, user.id, pinned);
            toast(pinned ? 'Conversation pinned 📌' : 'Conversation unpinned');
          }}
          onMute={() => {
            const c = convActionSheet;
            const muted = !c.isMuted;
            setConversations(prev => prev.map(x => x.id === c.id ? { ...x, isMuted: muted } : x));
            chatApi.muteConversation(c.id, user.id, muted);
            toast(muted ? 'Notifications muted 🔕' : 'Notifications unmuted 🔔');
          }}
          onArchive={() => {
            const c = convActionSheet;
            setConversations(prev => prev.filter(x => x.id !== c.id));
            if (activeId === c.id) { setActiveId(null); setShowSidebar(true); }
            chatApi.archiveConversation(c.id, user.id, true);
            setArchivedConvs(prev => [{ ...c, isArchived: true }, ...prev]);
            toast('Conversation archived 📁');
          }}
          onDelete={() => {
            setDeleteConfirm(convActionSheet.id);
          }}
        />
      )}

      {/* ── Msg action bottom sheet (mobile long-press) ── */}
      {msgActionSheet && activeId && (
        <MsgActionSheet
          msg={msgActionSheet}
          currentUserId={user.id}
          onClose={() => setMsgActionSheet(null)}
          onReply={() => setReplyingTo(msgActionSheet)}
          onEdit={() => {
            if (msgActionSheet.senderId === user.id)
              setEditingMsg({ msgId: msgActionSheet.id, content: msgActionSheet.content || '' });
          }}
          onPin={async () => {
            const msg = msgActionSheet;
            const newPinned = !msg.isPinned;
            setConversations(prev => prev.map(c => c.id !== activeId ? c : {
              ...c, messages: c.messages.map(m => m.id === msg.id ? { ...m, isPinned: newPinned } : m),
            }));
            await chatApi.pinMessage(activeId, msg.id, newPinned).catch(() => {});
            chatApi.getPinnedMessages(activeId).then(setPinnedMsgs).catch(() => {});
            toast(newPinned ? 'Message pinned 📌' : 'Message unpinned');
          }}
          onDeleteForMe={async () => {
            const msg = msgActionSheet;
            setConversations(prev => prev.map(c => c.id !== activeId ? c : {
              ...c, messages: c.messages.filter(m => m.id !== msg.id),
            }));
            await chatApi.deleteMessageForMe(activeId, msg.id, user.id).catch(() => {});
          }}
          onDeleteForAll={async () => {
            const msg = msgActionSheet;
            if (msg.senderId !== user.id) { toast.error('You can only delete your own messages for everyone'); return; }
            setConversations(prev => prev.map(c => c.id !== activeId ? c : {
              ...c, messages: c.messages.filter(m => m.id !== msg.id),
            }));
            await chatApi.deleteMessageForAll(activeId, msg.id).catch(() => {});
          }}
        />
      )}

      {/* ── Message context menu (desktop) ── */}
      {msgMenu && (
        <div
          onClick={e => e.stopPropagation()}
          style={{
            position: 'fixed',
            top:  Math.min(msgMenu.y, window.innerHeight - 240),
            left: Math.min(msgMenu.x, window.innerWidth - 180),
            zIndex: 9999,
          }}
          className="bg-white rounded-2xl shadow-2xl border border-gray-100 py-1.5 min-w-[168px] overflow-hidden"
        >
          <button onClick={handleMenuReply}
            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
            <ReplyRounded sx={{fontSize:16,color:"#3b82f6"}} /> Reply
          </button>
          {msgMenu.msg.senderId === user?.id && (
            <button onClick={handleMenuEdit}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
              <EditRounded sx={{fontSize:16,color:"#6b7280"}} /> Edit
            </button>
          )}
          <button onClick={handleMenuPin}
            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
            <PushPinRounded sx={{fontSize:16,color:"#f59e0b"}} /> {msgMenu.msg.isPinned ? 'Unpin' : 'Pin'}
          </button>
          <div className="h-px bg-gray-100 my-1" />
          <button onClick={handleMenuDeleteForMe}
            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-600 hover:bg-gray-50 transition-colors">
            <DeleteRounded sx={{fontSize:16,color:"#9ca3af"}} /> Delete for me
          </button>
          {msgMenu.msg.senderId === user?.id && (
            <button onClick={handleMenuDeleteForAll}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors">
              <DeleteRounded sx={{fontSize:16,color:"#ef4444"}} /> Delete for everyone
            </button>
          )}
        </div>
      )}
    </div>
  );
}