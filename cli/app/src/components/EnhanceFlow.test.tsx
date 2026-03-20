import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { EnhanceFlow } from './EnhanceFlow';

function renderWithRoute(sessionId: string) {
  return render(
    <MemoryRouter initialEntries={[`/session/${sessionId}/enhance`]}>
      <Routes>
        <Route path="/session/:id/enhance" element={<EnhanceFlow />} />
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
  });

  afterEach(() => {
    vi.useRealTimers();
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

  it('advances to questions phase after analyzing', () => {
    renderWithRoute('ses-001');

    // Feed lines appear over ~1800ms (6 lines * 300ms), then 2000ms wait
    act(() => { vi.advanceTimersByTime(4000); });
    expect(screen.getByText(/A few questions/)).toBeDefined();
  });

  it('renders 3 questions in questions phase', () => {
    renderWithRoute('ses-001');
    act(() => { vi.advanceTimersByTime(4000); });

    const textareas = screen.getAllByRole('textbox');
    expect(textareas.length).toBe(3);
  });

  it('allows typing answers', () => {
    renderWithRoute('ses-001');
    act(() => { vi.advanceTimersByTime(4000); });

    const textareas = screen.getAllByRole('textbox');
    fireEvent.change(textareas[0], { target: { value: 'My answer' } });
    expect((textareas[0] as HTMLTextAreaElement).value).toBe('My answer');
  });

  it('allows skipping questions', () => {
    renderWithRoute('ses-001');
    act(() => { vi.advanceTimersByTime(4000); });

    const skipButtons = screen.getAllByText('Skip');
    fireEvent.click(skipButtons[0]);
    expect(screen.getByText('Unskip')).toBeDefined();
  });

  it('advances to streaming when continue clicked', () => {
    renderWithRoute('ses-001');
    act(() => { vi.advanceTimersByTime(4000); });

    const continueBtn = screen.getByText('Continue');
    fireEvent.click(continueBtn);

    expect(screen.getByText(/Generating case study/)).toBeDefined();
  });

  it('streams items progressively in streaming phase', () => {
    renderWithRoute('ses-001');
    act(() => { vi.advanceTimersByTime(4000); });

    fireEvent.click(screen.getByText('Continue'));

    // After 400ms, first item (title) should be visible
    act(() => { vi.advanceTimersByTime(400); });
    const visibleItems = document.querySelectorAll('.enhance-streaming__item--visible');
    expect(visibleItems.length).toBe(1);
  });

  it('advances to done phase after streaming completes', () => {
    renderWithRoute('ses-001');
    act(() => { vi.advanceTimersByTime(4000); });

    fireEvent.click(screen.getByText('Continue'));

    // Stream all items + 500ms buffer
    // ses-001 has: title + skills + 5 steps + take = 8 items, 8*400 + 500 = 3700ms
    act(() => { vi.advanceTimersByTime(4000); });

    expect(screen.getByText(/Case study ready/)).toBeDefined();
    expect(screen.getByText('Edit & Publish')).toBeDefined();
    expect(screen.getByText('Discard')).toBeDefined();
  });
});
