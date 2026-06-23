import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Rocket, Crown, X, CheckCircle, Zap, Lock } from 'lucide-react';
import { fpApi, BOOST_OPTIONS } from '../lib/fpSystem';
import { toast } from 'sonner';

interface BoostModalProps {
  userId: string;
  isCreatorPlus: boolean;
  targetId: string;
  targetType: 'listing' | 'post';
  targetTitle: string;
  onClose: () => void;
  onBoosted?: () => void;
}

export function BoostModal({ userId, isCreatorPlus, targetId, targetType, targetTitle, onClose, onBoosted }: BoostModalProps) {
  const navigate = useNavigate();
  const [selected, setSelected] = useState<string | null>(null);
  const balance = fpApi.getBalance(userId);

  const handleBoost = () => {
    if (!selected) { toast.error('Choose a boost level'); return; }
    const result = fpApi.boostContent(userId, selected, targetId, targetType, targetTitle);
    if (!result.success) {
      if (result.error?.includes('Insufficient')) {
        toast.error('Not enough FP — buy more in your wallet', { action: { label: 'Buy FP', onClick: () => navigate('/wallet?tab=buy') } });
      } else {
        toast.error(result.error);
      }
      return;
    }
    const opt = BOOST_OPTIONS.find(o => o.id === selected)!;
    toast.success(`🚀 ${opt.label} applied for ${opt.days} days!`);
    onBoosted?.();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="bg-gradient-to-br from-orange-400 to-red-500 p-5 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Rocket className="w-5 h-5" />
              <h3 className="font-black text-lg">Boost</h3>
            </div>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-white/20 hover:bg-white/30">
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-orange-100 text-xs mt-1 truncate">"{targetTitle}"</p>
          <div className="flex items-center gap-2 mt-3">
            <Zap className="w-4 h-4 text-yellow-300" />
            <span className="font-black text-sm">{fpApi.fmt(balance)} FP available</span>
          </div>
        </div>

        {/* Options */}
        <div className="p-5 space-y-3">
          {!isCreatorPlus ? (
            <div className="text-center py-6 space-y-3">
              <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto">
                <Lock className="w-7 h-7 text-gray-400" />
              </div>
              <p className="font-bold text-gray-800">Creator+ Required</p>
              <p className="text-sm text-gray-500">Upgrade your account to access boosts.</p>
              <button onClick={() => { navigate('/verification'); onClose(); }}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-6 py-2.5 rounded-xl text-sm transition-colors">
                Upgrade now →
              </button>
            </div>
          ) : (
            <>
              {BOOST_OPTIONS.map(opt => {
                const canAfford = balance >= opt.fp;
                const isSelected = selected === opt.id;
                return (
                  <button key={opt.id} onClick={() => canAfford && setSelected(opt.id)}
                    className={`w-full flex items-center gap-3 p-4 rounded-2xl border-2 text-left transition-all ${
                      isSelected ? 'border-orange-400 bg-orange-50'
                      : canAfford ? 'border-gray-200 hover:border-orange-200'
                      : 'border-gray-100 opacity-50 cursor-not-allowed'
                    }`}>
                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
                      opt.id === 'b_featured' ? 'bg-gradient-to-br from-yellow-400 to-orange-500' : 'bg-orange-100'
                    }`}>
                      {opt.id === 'b_featured' ? <Crown className="w-5 h-5 text-white" /> : <Rocket className="w-5 h-5 text-orange-500" />}
                    </div>
                    <div className="flex-1">
                      <p className="font-bold text-gray-900 text-sm">{opt.label}</p>
                      <p className="text-xs text-gray-500">{opt.days} days · {opt.reach}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-black text-orange-500">{opt.fp} FP</p>
                      {!canAfford && <p className="text-[10px] text-red-400">Not enough FP</p>}
                    </div>
                    {isSelected && <CheckCircle className="w-5 h-5 text-orange-500 shrink-0" />}
                  </button>
                );
              })}

              <button onClick={handleBoost} disabled={!selected}
                className="w-full flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white font-black rounded-2xl py-3.5 transition-colors mt-1">
                <Rocket className="w-5 h-5" /> Apply Boost
              </button>

              <button onClick={() => { navigate('/wallet?tab=buy'); onClose(); }}
                className="w-full text-center text-xs text-blue-500 hover:text-blue-700 underline py-1">
                Need more FP? Buy FP →
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
