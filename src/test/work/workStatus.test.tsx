import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

const authState: { user: { id: string } | null } = { user: null };
vi.mock('../../app/context/AuthContext', () => ({ useAuth: () => authState }));
vi.mock('../../lib/supabase', () => ({ supabase: {} }));
const submitWork = vi.fn().mockResolvedValue({ success: true, transaction: null });
const approveWork = vi.fn().mockResolvedValue({ success: true, transaction: null });
vi.mock('../../app/lib/applicationApi', () => ({
  applicationApi: { submitWork: (...a: any[]) => submitWork(...a), approveWork: (...a: any[]) => approveWork(...a), reportProblem: vi.fn() },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { getWorkStage, workStatusLabel, getWorkRole, WorkRecord } from '../../app/lib/workApi';
import { WorkStatusCard } from '../../app/components/work/WorkStatusCard';

const CLIENT = 'client-1';
const APPLICANT = 'applicant-1';

function record(over: Partial<WorkRecord> = {}): WorkRecord {
  return {
    id: 't1', applicationId: 'app-1', listingId: 'l1', orderId: 'OPP-t1', conversationId: 'c1',
    clientId: CLIENT, applicantId: APPLICANT, clientName: 'Casey Client', clientAvatar: null,
    applicantName: 'Alex Applicant', applicantAvatar: null,
    opportunityTitle: 'Music video DP', opportunityImage: null,
    agreedAmount: 500, applicantEarnings: 460, currency: 'CAD',
    workStatus: 'in_progress', releaseStatus: 'held',
    fundedAt: null, submittedAt: null, approvedAt: null, approvalMethod: null, problemReported: false,
    ...over,
  };
}

function renderAs(userId: string, r: WorkRecord) {
  authState.user = { id: userId };
  return render(<MemoryRouter><WorkStatusCard record={r} /></MemoryRouter>);
}

describe('shared work status', () => {
  it('maps every stage to the agreed labels for both roles', () => {
    const cases: [WorkRecord['workStatus'], WorkRecord['releaseStatus'], string, string][] = [
      ['in_progress', 'held', 'Work in progress', 'Work in progress'],
      ['marked_complete_by_worker', 'held', 'Awaiting client approval', 'Awaiting your approval'],
      ['completed', 'processing', 'Work approved · Payment processing', 'Work approved · Payment processing'],
      ['completed', 'available', 'Available in your FILMONS wallet', 'Payment released'],
    ];
    for (const [workStatus, releaseStatus, applicant, client] of cases) {
      const stage = getWorkStage({ workStatus, releaseStatus });
      expect(workStatusLabel(stage, 'applicant')).toBe(applicant);
      expect(workStatusLabel(stage, 'client')).toBe(client);
    }
  });

  it('never shows wallet availability while the release is still processing', () => {
    const stage = getWorkStage({ workStatus: 'completed', releaseStatus: 'processing' });
    expect(workStatusLabel(stage, 'applicant')).not.toMatch(/Available/);
  });

  it('only recognises the paying client and the hired applicant', () => {
    expect(getWorkRole(record(), CLIENT)).toBe('client');
    expect(getWorkRole(record(), APPLICANT)).toBe('applicant');
    expect(getWorkRole(record(), 'someone-else')).toBeNull();
  });
});

describe('WorkStatusCard', () => {
  beforeEach(() => { submitWork.mockClear(); approveWork.mockClear(); });

  it('shows title, other user, agreed amount and status on every card', () => {
    renderAs(CLIENT, record());
    expect(screen.getByText('Music video DP')).toBeInTheDocument();
    expect(screen.getByText('Alex Applicant')).toBeInTheDocument();
    expect(screen.getByText(/\$500\.00/)).toBeInTheDocument();
    expect(screen.getByText('Work in progress')).toBeInTheDocument();
  });

  it('applicant: confirms before marking work as submitted', async () => {
    renderAs(APPLICANT, record());
    fireEvent.click(screen.getByRole('button', { name: 'Mark work as submitted' }));
    expect(await screen.findByText('Have you delivered the agreed work?')).toBeInTheDocument();
    expect(screen.getByText(/You do not need to upload files to FILMONS/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Mark as submitted' }));
    await waitFor(() => expect(submitWork).toHaveBeenCalledWith('app-1', APPLICANT));
  });

  it('client: no approve button until the work is submitted', () => {
    renderAs(CLIENT, record());
    expect(screen.queryByRole('button', { name: /Approve work/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Message applicant/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /View opportunity/ })).toBeInTheDocument();
  });

  it('client: approve after submission, with Message applicant and Report a problem beside it', async () => {
    renderAs(CLIENT, record({ workStatus: 'marked_complete_by_worker' }));
    expect(screen.getByText('Awaiting your approval')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Report a problem/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Approve work/ }));
    expect(await screen.findByText('Approve this work?')).toBeInTheDocument();
    expect(screen.getByText(/Confirm that Alex Applicant has completed the agreed work/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Approve and release payment' }));
    await waitFor(() => expect(approveWork).toHaveBeenCalledWith('app-1', CLIENT));
  });

  it('applicant cannot approve; sees status only while awaiting approval', () => {
    renderAs(APPLICANT, record({ workStatus: 'marked_complete_by_worker' }));
    expect(screen.getByText('Awaiting client approval')).toBeInTheDocument();
    expect(screen.queryAllByRole('button').map(b => b.textContent)).not.toContain('Approve work');
    expect(screen.queryByRole('button', { name: 'Mark work as submitted' })).toBeNull();
  });

  it('removes all action buttons after approval', () => {
    renderAs(CLIENT, record({ workStatus: 'completed', releaseStatus: 'processing' }));
    expect(screen.getByText('Work approved · Payment processing')).toBeInTheDocument();
    const labels = screen.queryAllByRole('button').map(b => b.textContent || '');
    expect(labels.some(l => /Approve|Message applicant|Report a problem/.test(l))).toBe(false);
  });

  it('renders nothing for someone who is not part of the hire', () => {
    const { container } = renderAs('someone-else', record());
    expect(container).toBeEmptyDOMElement();
  });
});
