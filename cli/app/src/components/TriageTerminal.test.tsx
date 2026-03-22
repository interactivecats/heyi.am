/**
 * Unit tests: TriageTerminal
 *
 * Tests the terminal-style progress display for the triage loading state.
 * Validates line rendering for each event type, variant classes, and
 * progressive output behavior.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TriageTerminal } from './ProjectUploadFlow';
import type { TriageEvent } from '../api';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderTerminal(events: TriageEvent[]) {
  return render(<TriageTerminal events={events} dirName="heyi-am" />);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TriageTerminal', () => {
  it('renders prompt line on empty events', () => {
    renderTerminal([]);
    expect(screen.getByText(/\$ heyiam triage/)).toBeTruthy();
  });

  it('renders scanning line for scanning event', () => {
    renderTerminal([{ type: 'scanning', total: 71 }]);
    expect(screen.getByText(/Loading session stats.*71 sessions/)).toBeTruthy();
  });

  it('renders hard floor passed lines', () => {
    renderTerminal([
      { type: 'scanning', total: 10 },
      { type: 'hard_floor', sessionId: 'abc12345', title: 'Build auth flow', passed: true },
    ]);
    expect(screen.getByText(/Build auth flow.*passed/)).toBeTruthy();
  });

  it('renders hard floor skipped lines with reason', () => {
    renderTerminal([
      { type: 'scanning', total: 10 },
      { type: 'hard_floor', sessionId: 'def67890', title: 'Quick fix', passed: false, reason: 'Too short' },
    ]);
    expect(screen.getByText(/Quick fix.*skipped.*Too short/)).toBeTruthy();
  });

  it('renders section headers for hard floor filter', () => {
    renderTerminal([
      { type: 'scanning', total: 10 },
      { type: 'hard_floor', sessionId: 'abc12345', title: 'Auth', passed: true },
    ]);
    expect(screen.getByText(/Hard floor filter/)).toBeTruthy();
  });

  it('renders signal extraction active line', () => {
    renderTerminal([
      { type: 'scanning', total: 5 },
      { type: 'hard_floor', sessionId: 'abc12345', title: 'Auth', passed: true },
      { type: 'extracting_signals', sessionId: 'abc12345', title: 'Auth' },
    ]);
    expect(screen.getByText(/Signal extraction/)).toBeTruthy();
    expect(screen.getByText(/Scanning Auth/)).toBeTruthy();
  });

  it('replaces active signal line when signals_done arrives', () => {
    renderTerminal([
      { type: 'scanning', total: 5 },
      { type: 'hard_floor', sessionId: 'abc12345', title: 'Auth', passed: true },
      { type: 'extracting_signals', sessionId: 'abc12345', title: 'Auth' },
      { type: 'signals_done', sessionId: 'abc12345' },
    ]);
    expect(screen.getByText(/abc12345.*signals extracted/)).toBeTruthy();
    expect(screen.queryByText(/Scanning Auth/)).toBeNull();
  });

  it('renders llm_ranking active line', () => {
    renderTerminal([
      { type: 'llm_ranking', sessionCount: 58 },
    ]);
    expect(screen.getByText(/AI ranking/)).toBeTruthy();
    expect(screen.getByText(/Sending 58 sessions to AI/)).toBeTruthy();
  });

  it('renders done event as completed ranking', () => {
    renderTerminal([
      { type: 'llm_ranking', sessionCount: 58 },
      { type: 'done', selected: 8, skipped: 50 },
    ]);
    expect(screen.getByText(/AI selected 8 sessions/)).toBeTruthy();
  });

  it('applies correct variant classes', () => {
    const { container } = renderTerminal([
      { type: 'scanning', total: 5 },
      { type: 'hard_floor', sessionId: 'abc12345', title: 'Auth', passed: true },
      { type: 'hard_floor', sessionId: 'def67890', title: 'Fix', passed: false, reason: 'Too short' },
    ]);

    const passed = container.querySelectorAll('.triage-terminal__line--passed');
    const skipped = container.querySelectorAll('.triage-terminal__line--skipped');
    expect(passed.length).toBeGreaterThanOrEqual(1);
    expect(skipped.length).toBeGreaterThanOrEqual(1);
  });

  it('has role="log" for accessibility', () => {
    renderTerminal([]);
    expect(screen.getByRole('log')).toBeTruthy();
  });

  it('renders scoring_fallback event', () => {
    renderTerminal([
      { type: 'scoring_fallback', sessionCount: 42 },
    ]);
    expect(screen.getByText(/Scoring 42 sessions/)).toBeTruthy();
  });

  it('renders hard floor summary when signals start', () => {
    renderTerminal([
      { type: 'scanning', total: 10 },
      { type: 'hard_floor', sessionId: 'a1', title: 'A', passed: true },
      { type: 'hard_floor', sessionId: 'a2', title: 'B', passed: true },
      { type: 'hard_floor', sessionId: 'a3', title: 'C', passed: false, reason: 'Too short' },
      { type: 'extracting_signals', sessionId: 'a1', title: 'A' },
    ]);
    expect(screen.getByText(/2 passed, 1 filtered/)).toBeTruthy();
  });
});
