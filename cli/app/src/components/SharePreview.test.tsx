import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SharePreview } from './SharePreview';
import { MOCK_SESSIONS } from '../mock-data';
import type { Session } from '../types';

const fullSession = MOCK_SESSIONS[0]; // ses-001, has all fields

const minimalSession: Session = {
  id: 'min-001',
  title: 'Minimal session',
  date: '2026-03-20T10:00:00Z',
  durationMinutes: 10,
  turns: 5,
  linesOfCode: 42,
  status: 'draft',
  projectName: 'test',
  rawLog: ['> hello'],
};

describe('SharePreview', () => {
  it('renders title', () => {
    render(<SharePreview session={fullSession} />);
    expect(screen.getByText(fullSession.title)).toBeDefined();
  });

  it('renders session ref when present', () => {
    render(<SharePreview session={fullSession} />);
    expect(screen.getByText('REF_AUTH_042')).toBeDefined();
  });

  it('does not render session ref when absent', () => {
    render(<SharePreview session={minimalSession} />);
    expect(screen.queryByText(/REF_/)).toBeNull();
  });

  it('renders stats grid with duration, turns, tool calls, LOC', () => {
    render(<SharePreview session={fullSession} />);
    expect(screen.getByText('47m')).toBeDefined();
    expect(screen.getByText('23')).toBeDefined();
    expect(screen.getByText('90')).toBeDefined(); // toolCalls
    expect(screen.getByText('312')).toBeDefined();
    expect(screen.getByText('Duration')).toBeDefined();
    expect(screen.getByText('Turns')).toBeDefined();
    expect(screen.getByText('Tool Calls')).toBeDefined();
    expect(screen.getByText('LOC')).toBeDefined();
  });

  it('renders developer take when present', () => {
    render(<SharePreview session={fullSession} />);
    expect(screen.getByText('The Developer Take')).toBeDefined();
    expect(screen.getByText(/token rotation right/)).toBeDefined();
  });

  it('does not render developer take when absent', () => {
    render(<SharePreview session={minimalSession} />);
    expect(screen.queryByText('The Developer Take')).toBeNull();
  });

  it('renders skills chips', () => {
    render(<SharePreview session={fullSession} />);
    expect(screen.getByText('Node.js')).toBeDefined();
    expect(screen.getByText('JWT Security')).toBeDefined();
    expect(screen.getByText('Ed25519')).toBeDefined();
  });

  it('does not render skills section when absent', () => {
    render(<SharePreview session={minimalSession} />);
    expect(screen.queryByText('Node.js')).toBeNull();
  });

  it('renders execution path steps', () => {
    render(<SharePreview session={fullSession} />);
    expect(screen.getByText('Audit existing middleware')).toBeDefined();
    expect(screen.getByText('Production Rollout')).toBeDefined();
    expect(screen.getByText('01')).toBeDefined();
    expect(screen.getByText('05')).toBeDefined();
  });

  it('renders files changed collapsible', () => {
    render(<SharePreview session={fullSession} />);
    expect(screen.getByText(/Files Changed \(5\)/)).toBeDefined();
    expect(screen.getByText('src/middleware/auth.ts')).toBeDefined();
  });

  it('renders tool breakdown collapsible', () => {
    render(<SharePreview session={fullSession} />);
    expect(screen.getByText('Tool Breakdown')).toBeDefined();
    expect(screen.getByText('Read')).toBeDefined();
    expect(screen.getByText('28')).toBeDefined();
  });

  it('renders session timeline collapsible', () => {
    render(<SharePreview session={fullSession} />);
    expect(screen.getByText('Session Timeline')).toBeDefined();
    expect(screen.getByText('14:02:11')).toBeDefined();
  });

  it('handles minimal session without optional fields', () => {
    render(<SharePreview session={minimalSession} />);
    expect(screen.getByText('Minimal session')).toBeDefined();
    expect(screen.getByText('10m')).toBeDefined();
    expect(screen.queryByText('Tool Breakdown')).toBeNull();
    expect(screen.queryByText('Session Timeline')).toBeNull();
    expect(screen.queryByText(/Files Changed/)).toBeNull();
  });
});
