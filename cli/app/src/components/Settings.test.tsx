import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { Settings } from './Settings';

function renderSettings() {
  return render(
    <MemoryRouter initialEntries={['/settings']}>
      <Settings />
    </MemoryRouter>,
  );
}

describe('Settings', () => {
  it('renders settings page with all sections', () => {
    renderSettings();
    expect(screen.getByText('API Configuration')).toBeInTheDocument();
    expect(screen.getByText('Authentication')).toBeInTheDocument();
    expect(screen.getByText('Machine Identity')).toBeInTheDocument();
  });

  it('renders API key input', () => {
    renderSettings();
    const input = screen.getByLabelText('Anthropic API Key');
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute('type', 'password');
    expect(input).toHaveAttribute('placeholder', 'sk-ant-...');
  });

  it('toggles API key visibility between password and text', async () => {
    const user = userEvent.setup();
    renderSettings();
    const input = screen.getByLabelText('Anthropic API Key');
    const toggleBtn = screen.getByRole('button', { name: /show api key/i });

    expect(input).toHaveAttribute('type', 'password');

    await user.click(toggleBtn);
    expect(input).toHaveAttribute('type', 'text');

    const hideBtn = screen.getByRole('button', { name: /hide api key/i });
    await user.click(hideBtn);
    expect(input).toHaveAttribute('type', 'password');
  });

  it('renders auth status as not connected by default', () => {
    renderSettings();
    expect(screen.getByText('Not connected')).toBeInTheDocument();
    const badge = screen.getByText('Not connected');
    expect(badge.className).toContain('badge--draft');
  });

  it('shows "heyiam login" command when not connected', () => {
    renderSettings();
    expect(screen.getByText(/heyiam login/)).toBeInTheDocument();
  });

  it('renders machine token section', () => {
    renderSettings();
    expect(screen.getByText('Machine Token')).toBeInTheDocument();
    expect(screen.getByText('ed25519:a4f2...8b3c')).toBeInTheDocument();
    expect(screen.getByText('SHA256:kR7x...Qm4w')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Used for cryptographic signing of published sessions',
      ),
    ).toBeInTheDocument();
  });

  it('back button navigates to home', () => {
    renderSettings();
    const backBtn = screen.getByRole('button', { name: /go back/i });
    expect(backBtn).toBeInTheDocument();
  });

  it('renders section labels with label class', () => {
    const { container } = renderSettings();
    const labels = container.querySelectorAll('.label');
    const labelTexts = Array.from(labels).map((el) => el.textContent);
    expect(labelTexts).toContain('API Configuration');
    expect(labelTexts).toContain('Authentication');
    expect(labelTexts).toContain('Machine Identity');
  });

  it('renders help text for API key', () => {
    renderSettings();
    expect(
      screen.getByText(
        'Used for AI enhancement. Stored locally, never sent to our servers.',
      ),
    ).toBeInTheDocument();
  });

  it('shows em dash for username when not connected', () => {
    renderSettings();
    expect(screen.getByText('\u2014')).toBeInTheDocument();
  });

  it('renders title in app shell header', () => {
    renderSettings();
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });
});
