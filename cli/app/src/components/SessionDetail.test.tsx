import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { SessionDetail } from './SessionDetail';
import { MOCK_SESSIONS } from '../mock-data';

function renderWithRoute(sessionId: string, hasApiKey = true) {
  return render(
    <MemoryRouter initialEntries={[`/session/${sessionId}`]}>
      <Routes>
        <Route
          path="/session/:id"
          element={<SessionDetail hasApiKey={hasApiKey} sessions={MOCK_SESSIONS} />}
        />
        <Route path="/session/:id/enhance" element={<div>Enhance Page</div>} />
        <Route path="/session/:id/edit" element={<div>Editor Page</div>} />
        <Route path="/settings" element={<div>Settings Page</div>} />
        <Route path="/" element={<div>Home</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('SessionDetail', () => {
  it('renders session title in stats', () => {
    renderWithRoute('ses-001');
    expect(screen.getByText('47m')).toBeDefined();
    expect(screen.getByText('23')).toBeDefined();
    expect(screen.getByText('312')).toBeDefined();
  });

  it('renders context when present', () => {
    renderWithRoute('ses-001');
    expect(screen.getByText('Context')).toBeDefined();
    expect(screen.getByText(/Legacy auth used symmetric/)).toBeDefined();
  });

  it('renders skills chips', () => {
    renderWithRoute('ses-001');
    expect(screen.getByText('Node.js')).toBeDefined();
    expect(screen.getByText('JWT Security')).toBeDefined();
  });

  it('renders execution path', () => {
    renderWithRoute('ses-001');
    expect(screen.getByText('Audit existing middleware')).toBeDefined();
    expect(screen.getByText('Production Rollout')).toBeDefined();
  });

  it('renders collapsible tool breakdown', () => {
    renderWithRoute('ses-001');
    expect(screen.getByText('Tool Breakdown')).toBeDefined();
  });

  it('renders collapsible turn timeline', () => {
    renderWithRoute('ses-001');
    expect(screen.getByText('Turn Timeline')).toBeDefined();
  });

  it('renders collapsible files changed', () => {
    renderWithRoute('ses-001');
    expect(screen.getByText(/Files Changed \(5\)/)).toBeDefined();
  });

  it('renders action buttons', () => {
    renderWithRoute('ses-001');
    expect(screen.getByText('Enhance with AI')).toBeDefined();
    expect(screen.getByText('Edit & Publish')).toBeDefined();
  });

  it('shows 404 for unknown session', () => {
    renderWithRoute('nonexistent-id');
    expect(screen.getByText('Session not found')).toBeDefined();
  });

  it('shows API key error when enhance clicked without key', () => {
    renderWithRoute('ses-001', false);
    const enhanceBtn = screen.getByText('Enhance with AI');
    fireEvent.click(enhanceBtn);
    expect(screen.getByText(/API key required/)).toBeDefined();
    expect(screen.getByText('Go to Settings')).toBeDefined();
    expect(screen.getByText('publish without enhancement')).toBeDefined();
  });

  it('does not show API key error by default', () => {
    renderWithRoute('ses-001');
    expect(screen.queryByText(/API key required/)).toBeNull();
  });

  it('does not show API key error when key is present and enhance clicked', () => {
    renderWithRoute('ses-001', true);
    const enhanceBtn = screen.getByText('Enhance with AI');
    fireEvent.click(enhanceBtn);
    expect(screen.queryByText(/API key required/)).toBeNull();
  });
});
