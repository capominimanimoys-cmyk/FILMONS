/**
 * /work/:applicationId — the single page every work notification opens.
 * Shows the shared WorkStatusCard in its full variant (timeline + payment
 * line). Only the paying client and the hired applicant ever see a record:
 * useWorkRecords() only loads rows where the signed-in user is one of them.
 */
import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ArrowLeft, Briefcase } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useWorkRecord, refreshWorkRecords } from '../lib/workApi';
import { WorkStatusCard } from '../components/work/WorkStatusCard';
import { FilmonsBrandLoader } from '../components/FilmonsLoader';

export function WorkRecord() {
  const { applicationId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { record, loading, loaded } = useWorkRecord(user?.id, applicationId);

  useEffect(() => { if (!user) navigate('/login'); }, [user, navigate]);
  // Arriving from a notification: make sure the newest state is shown.
  useEffect(() => { if (user?.id) refreshWorkRecords(user.id); }, [user?.id, applicationId]);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-2">
        <button onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/dashboard'))} aria-label="Back">
          <ArrowLeft className="w-5 h-5 text-gray-700" />
        </button>
        <h1 className="text-base font-bold text-gray-900">Work record</h1>
      </div>
      <div className="max-w-xl mx-auto px-4 py-5 space-y-4">
        {record ? (
          <>
            <WorkStatusCard record={record} variant="full" linkToRecord={false} />
            <p className="text-[11px] text-gray-400 text-center px-4">
              Work can be delivered outside FILMONS — no uploads needed. Payment stays pending until the client approves the work.
            </p>
          </>
        ) : loading || !loaded ? (
          <div className="flex justify-center py-16"><FilmonsBrandLoader size="md" label="Loading work record" /></div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center space-y-2">
            <Briefcase className="w-10 h-10 text-gray-200 mx-auto" />
            <p className="text-sm font-semibold text-gray-700">Work record not available</p>
            <p className="text-xs text-gray-400">It may not be a confirmed paid hire yet, or you're not part of it.</p>
            <button onClick={() => navigate('/dashboard')} className="mt-2 text-xs font-bold text-indigo-600">Go to dashboard</button>
          </div>
        )}
      </div>
    </div>
  );
}
