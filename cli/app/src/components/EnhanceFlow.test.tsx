import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { EnhanceFlow } from './EnhanceFlow';
import { MOCK_SESSIONS } from '../mock-data';
import * as api from '../api';
import type { EnhancementResult } from '../api';

const MOCK_ENHANCEMENT_RESULT: EnhancementResult = {
  title: 'Refactor JWT middleware to support refresh tokens',
  context: 'Legacy auth used symmetric HS256 with single-token expiry.',
  developerTake: 'The tricky part was getting token rotation right.',
  skills: ['Node.js', 'JWT Security', 'Ed25519'],
  questions: [
    { text: 'Why did you choose this approach?', suggestedAnswer: 'It was the simplest path.' },
    { text: 'What problem were you solving?', suggestedAnswer: 'Maintainability.' },
    { text: 'What would you do differently?', suggestedAnswer: 'Write tests first.' },
  ],
  executionSteps: [
    { stepNumber: 1, title: 'Audit existing middleware', body: 'Identified legacy HS256 dependency.' },
    { stepNumber: 2, title: 'Switched to asymmetric signing', body: 'Implemented EdDSA.' },
  ],
};

function renderWithRoute(sessionId: string) {
  return render(
    <MemoryRouter initialEntries={[`/session/${sessionId}/enhance`]}>
      <Routes>
        <Route path="/session/:id/enhance" element={<EnhanceFlow sessions={MOCK_SESSIONS} />} />
        <Route path="/session/:id" element={<div>Detail Page</div>} />
        <Route path="/session/:id/edit" element={<div>Editor Page</div>} />
        <Route path="/" element={<div>Home</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('EnhanceFlow', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(api, 'enhanceSession').mockResolvedValue(MOCK_ENHANCEMENT_RESULT);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('shows 404 for unknown session', () => {
    renderWithRoute('nonexistent');
    expect(screen.getByText('Session not found')).toBeDefined();
  });

  it('renders breadcrumb', () => {
    renderWithRoute('ses-001');
    expect(screen.getByText('Browse')).toBeDefined();
    expect(screen.getByText('ENHANCE')).toBeDefined();
    expect(screen.getByText('Edit')).toBeDefined();
    expect(screen.getByText('Publish')).toBeDefined();
  });

  it('renders raw log panel', () => {
    renderWithRoute('ses-001');
    expect(screen.getByText('Raw session log')).toBeDefined();
    expect(screen.getByText('23 turns')).toBeDefined();
  });

  it('starts in analyzing phase', () => {
    renderWithRoute('ses-001');
    expect(screen.getByText(/Reading your session/)).toBeDefined();
  });

  it('shows AI feed lines progressively', () => {
    renderWithRoute('ses-001');

    // Initially no feed lines visible
    expect(screen.queryByText(/AI Logic Feed/)).toBeNull();

    // After 300ms, first line should appear
    act(() => { vi.advanceTimersByTime(300); });
    expect(screen.getByText('AI Logic Feed')).toBeDefined();
  });

  it('advances to questions phase after API returns', async () => {
    renderWithRoute('ses-001');

    // Flush the resolved promise
    await act(async () => { await vi.advanceTimersByTimeAsync(600); });

    expect(screen.getByText(/A few questions/)).toBeDefined();
  });

  it('renders 3 questions in questions phase', async () => {
    renderWithRoute('ses-001');
    await act(async () => { await vi.advanceTimersByTimeAsync(600); });

    const textareas = screen.getAllByRole('textbox');
    expect(textareas.length).toBe(3);
  });

  it('allows typing answers', async () => {
    renderWithRoute('ses-001');
    await act(async () => { await vi.advanceTimersByTimeAsync(600); });

    const textareas = screen.getAllByRole('textbox');
    fireEvent.change(textareas[0], { target: { value: 'My answer' } });
    expect((textareas[0] as HTMLTextAreaElement).value).toBe('My answer');
  });

  it('allows skipping questions', async () => {
    renderWithRoute('ses-001');
    await act(async () => { await vi.advanceTimersByTimeAsync(600); });

    const skipButtons = screen.getAllByText('Skip');
    fireEvent.click(skipButtons[0]);
    expect(screen.getByText('Unskip')).toBeDefined();
  });

  it('advances to streaming when continue clicked', async () => {
    renderWithRoute('ses-001');
    await act(async () => { await vi.advanceTimersByTimeAsync(600); });

    const continueBtn = screen.getByText('Continue');
    fireEvent.click(continueBtn);

    expect(screen.getByText(/Generating case study/)).toBeDefined();
  });

  it('streams items progressively in streaming phase', async () => {
    renderWithRoute('ses-001');
    await act(async () => { await vi.advanceTimersByTimeAsync(600); });

    fireEvent.click(screen.getByText('Continue'));

    // After 400ms, first item (title) should be visible
    act(() => { vi.advanceTimersByTime(400); });
    const visibleItems = document.querySelectorAll('.enhance-streaming__item--visible');
    expect(visibleItems.length).toBe(1);
  });

  it('advances to done phase after streaming completes', async () => {
    renderWithRoute('ses-001');
    await act(async () => { await vi.advanceTimersByTimeAsync(600); });

    fireEvent.click(screen.getByText('Continue'));

    // Result has: title + context + skills + 2 steps + take = 6 items, 6*400 + 500 = 2900ms
    act(() => { vi.advanceTimersByTime(3000); });

    expect(screen.getByText(/Case study ready/)).toBeDefined();
    expect(screen.getByText('Edit & Publish')).toBeDefined();
    expect(screen.getByText('Discard')).toBeDefined();
  });

  it('shows error state when enhancement API fails', async () => {
    vi.spyOn(api, 'enhanceSession').mockRejectedValue(new Error('API key missing'));
    renderWithRoute('ses-001');

    await act(async () => { await vi.advanceTimersByTimeAsync(600); });

    expect(screen.getByText('Enhancement failed')).toBeDefined();
    expect(screen.getByText('API key missing')).toBeDefined();
  });
});
