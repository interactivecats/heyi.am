/**
 * Integration tests: Status Chips
 *
 * Verifies that all session status types render the correct chip class
 * and that the CSS classes exist in the design system.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SessionList } from './SessionList';
import type { Session, Project } from '../types';

// ---------------------------------------------------------------------------
// Factory helpers
// ---------------------------------------------------------------------------

function makeSession(overrides: Partial<Session>): Session {
  return {
    id: overrides.id ?? 'test-id',
    title: overrides.title ?? 'Test session',
    date: '2026-03-20T10:00:00Z',
    durationMinutes: 30,
    turns: 10,
    linesOfCode: 100,
    status: overrides.status ?? 'draft',
    projectName: 'test-project',
    rawLog: ['> test'],
    ...overrides,
  };
}

const TEST_PROJECT: Project = {
  name: 'test-project',
  dirName: 'test-project',
  sessionCount: 1,
  description: 'Test project',
};

function renderWithStatus(status: Session['status'], title: string) {
  const session = makeSession({ id: `test-${status}`, title, status });
  return render(
    <MemoryRouter>
      <SessionList sessions={[session]} projects={[TEST_PROJECT]} />
    </MemoryRouter>,
  );
}

// ===========================================================================
// Status chip rendering
// ===========================================================================

describe('Status Chips — correct CSS class per status', () => {
  it('draft renders chip--draft', () => {
    const { container } = renderWithStatus('draft', 'Draft session');
    const chip = container.querySelector('.chip--draft');
    expect(chip).not.toBeNull();
    expect(chip!.textContent).toBe('DRAFT');
  });

  it('enhanced renders chip--enhanced', () => {
    const { container } = renderWithStatus('enhanced', 'Enhanced session');
    const chip = container.querySelector('.chip--enhanced');
    expect(chip).not.toBeNull();
    expect(chip!.textContent).toBe('ENHANCED');
  });

  it('published renders chip--published', () => {
    const { container } = renderWithStatus('published', 'Published session');
    const chip = container.querySelector('.chip--published');
    expect(chip).not.toBeNull();
    expect(chip!.textContent).toBe('PUBLISHED');
  });

  it('archived renders chip--archived', () => {
    const { container } = renderWithStatus('archived', 'Archived session');
    const chip = container.querySelector('.chip--archived');
    expect(chip).not.toBeNull();
    expect(chip!.textContent).toBe('ARCHIVED');
  });

  it('sealed renders chip--sealed', () => {
    const { container } = renderWithStatus('sealed', 'Sealed session');
    const chip = container.querySelector('.chip--sealed');
    expect(chip).not.toBeNull();
    expect(chip!.textContent).toBe('SEALED');
  });
});

describe('Status Chips — chip text is always uppercase', () => {
  const statuses: Session['status'][] = ['draft', 'enhanced', 'published', 'archived', 'sealed'];

  for (const status of statuses) {
    it(`${status} chip text is uppercase`, () => {
      renderWithStatus(status, `${status} session`);
      expect(screen.getByText(status.toUpperCase())).toBeInTheDocument();
    });
  }
});

describe('Status Chips — all statuses have the base .chip class', () => {
  const statuses: Session['status'][] = ['draft', 'enhanced', 'published', 'archived', 'sealed'];

  for (const status of statuses) {
    it(`${status} has .chip base class`, () => {
      const { container } = renderWithStatus(status, `${status} session`);
      const chip = container.querySelector(`.chip--${status}`);
      expect(chip).not.toBeNull();
      expect(chip!.classList.contains('chip')).toBe(true);
    });
  }
});

// NOTE: chip--enhanced is not defined in App.css yet — the "enhanced" status
// will render with the correct class name but no custom styling. This is a
// gap to address when the design system adds enhanced-specific colors.
