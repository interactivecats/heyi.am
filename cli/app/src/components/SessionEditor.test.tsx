import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SessionEditor } from './SessionEditor';
import { MOCK_SESSIONS } from '../mock-data';

const session = MOCK_SESSIONS[0]; // ses-001, status 'published', has all fields

function renderEditor() {
  return render(
    <MemoryRouter>
      <SessionEditor session={session} />
    </MemoryRouter>,
  );
}

describe('SessionEditor', () => {
  it('renders session title in input', () => {
    renderEditor();
    const input = screen.getByLabelText('Session title') as HTMLInputElement;
    expect(input.value).toBe(session.title);
  });

  it('renders raw log panel with line numbers', () => {
    renderEditor();
    expect(screen.getByText('Raw Session Digest')).toBeDefined();
    // Check line numbers exist via class
    const lineNums = document.querySelectorAll('.raw-log__line-num');
    expect(lineNums.length).toBe(session.rawLog.length);
    expect(lineNums[0].textContent).toBe('1');
    // Check first raw log line content
    expect(screen.getByText(session.rawLog[0])).toBeDefined();
  });

  it('renders execution path steps as editable inputs', () => {
    renderEditor();
    const steps = session.executionPath!;
    for (let i = 0; i < steps.length; i++) {
      const input = screen.getByLabelText(`Step ${i + 1} title`) as HTMLInputElement;
      expect(input.value).toBe(steps[i].title);
    }
  });

  it('renders skill chips with remove buttons', () => {
    renderEditor();
    const skills = session.skills!;
    for (const skill of skills) {
      expect(screen.getByText(skill)).toBeDefined();
      expect(screen.getByLabelText(`Remove ${skill}`)).toBeDefined();
    }
  });

  it('shows Your Take textarea with char count', () => {
    renderEditor();
    const textarea = screen.getByLabelText('Your Take') as HTMLTextAreaElement;
    expect(textarea.value).toBe(session.developerTake);
    const expectedCount = `${session.developerTake!.length} / 500`;
    expect(screen.getByText(expectedCount)).toBeDefined();
  });

  it('can edit title', () => {
    renderEditor();
    const input = screen.getByLabelText('Session title') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'New title' } });
    expect(input.value).toBe('New title');
  });

  it('can reorder execution steps (up/down)', () => {
    renderEditor();
    const steps = session.executionPath!;

    // Move second step up
    const moveUpBtn = screen.getByLabelText('Move step 2 up');
    fireEvent.click(moveUpBtn);

    // After moving, the first input should contain what was step 2's title
    const firstInput = screen.getByLabelText('Step 1 title') as HTMLInputElement;
    expect(firstInput.value).toBe(steps[1].title);
  });

  it('can edit a step title inline', () => {
    renderEditor();
    const input = screen.getByLabelText('Step 1 title') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Updated step title' } });
    expect(input.value).toBe('Updated step title');
  });

  it('can delete a step', () => {
    renderEditor();
    const steps = session.executionPath!;
    const deleteBtn = screen.getByLabelText('Delete step 1');
    fireEvent.click(deleteBtn);
    // After deleting, step 1 should now contain what was step 2
    const firstInput = screen.getByLabelText('Step 1 title') as HTMLInputElement;
    expect(firstInput.value).toBe(steps[1].title);
  });

  it('can remove a skill chip', () => {
    renderEditor();
    const firstSkill = session.skills![0];
    const removeBtn = screen.getByLabelText(`Remove ${firstSkill}`);
    fireEvent.click(removeBtn);
    expect(screen.queryByText(firstSkill)).toBeNull();
  });

  it('shows progress breadcrumb', () => {
    renderEditor();
    expect(screen.getByText('Your Input')).toBeDefined();
    expect(screen.getByText('AI Enhancement')).toBeDefined();
    expect(screen.getByText(/Review/)).toBeDefined();
  });

  it('shows enhanced status for published session', () => {
    renderEditor();
    expect(screen.getByText(/Ready to publish/)).toBeDefined();
  });

  it('shows draft status for draft session', () => {
    const draftSession = MOCK_SESSIONS[1]; // ses-002, status 'draft'
    render(
      <MemoryRouter>
        <SessionEditor session={draftSession} />
      </MemoryRouter>,
    );
    expect(screen.getByText('Draft')).toBeDefined();
  });

  it('shows source info with date and duration', () => {
    renderEditor();
    expect(screen.getByText('Source: Claude Code')).toBeDefined();
    expect(screen.getByText(`${session.durationMinutes}min`)).toBeDefined();
  });

  it('enforces character limit on Your Take', () => {
    renderEditor();
    const textarea = screen.getByLabelText('Your Take') as HTMLTextAreaElement;
    const longText = 'a'.repeat(501);
    fireEvent.change(textarea, { target: { value: longText } });
    // Should keep old value since 501 > 500
    expect(textarea.value).toBe(session.developerTake);
  });

  it('renders context textarea', () => {
    renderEditor();
    const contextArea = screen.getByLabelText('Context') as HTMLTextAreaElement;
    expect(contextArea.value).toBe(session.context);
  });

  it('renders + Add button for skills', () => {
    renderEditor();
    expect(screen.getByText('+ Add')).toBeDefined();
  });

  it('adds a skill via inline input', () => {
    renderEditor();
    // Click + Add to reveal input
    fireEvent.click(screen.getByText('+ Add'));
    const input = screen.getByLabelText('New skill name') as HTMLInputElement;
    expect(input).toBeDefined();
    // Type and press Enter
    fireEvent.change(input, { target: { value: 'GraphQL' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByText('GraphQL')).toBeDefined();
    // Input should be hidden again, + Add button back
    expect(screen.getByText('+ Add')).toBeDefined();
  });
});
