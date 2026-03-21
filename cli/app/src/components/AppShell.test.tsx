import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppShell } from './AppShell.tsx';

describe('AppShell', () => {
  it('renders children in the main content area', () => {
    render(
      <AppShell>
        <p>Main content here</p>
      </AppShell>,
    );
    expect(screen.getByText('Main content here')).toBeInTheDocument();
  });

  it('renders the heyi.am logo', () => {
    render(
      <AppShell>
        <div />
      </AppShell>,
    );
    expect(screen.getByText('heyi.am')).toBeInTheDocument();
  });

  it('renders a settings button', () => {
    render(
      <AppShell>
        <div />
      </AppShell>,
    );
    expect(screen.getByRole('button', { name: /settings/i })).toBeInTheDocument();
  });

  it('does not render back button when onBack is not provided', () => {
    render(
      <AppShell>
        <div />
      </AppShell>,
    );
    expect(screen.queryByRole('button', { name: /go back/i })).not.toBeInTheDocument();
  });

  it('renders back button when onBack is provided', () => {
    render(
      <AppShell onBack={() => {}}>
        <div />
      </AppShell>,
    );
    expect(screen.getByRole('button', { name: /go back/i })).toBeInTheDocument();
  });

  it('calls onBack when back button is clicked', async () => {
    const handleBack = vi.fn();
    const user = userEvent.setup();
    render(
      <AppShell onBack={handleBack}>
        <div />
      </AppShell>,
    );
    await user.click(screen.getByRole('button', { name: /go back/i }));
    expect(handleBack).toHaveBeenCalledOnce();
  });

  it('renders title when provided', () => {
    render(
      <AppShell title="Browse Sessions">
        <div />
      </AppShell>,
    );
    expect(screen.getByText('Browse Sessions')).toBeInTheDocument();
  });

  it('does not render title element when title is not provided', () => {
    const { container } = render(
      <AppShell>
        <div />
      </AppShell>,
    );
    expect(container.querySelector('.app-header__title')).not.toBeInTheDocument();
  });

  it('does not render sidebar by default', () => {
    render(
      <AppShell>
        <div />
      </AppShell>,
    );
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  });

  it('renders sidebar when showSidebar is true', () => {
    render(
      <AppShell showSidebar sidebarContent={<p>Project list</p>}>
        <div />
      </AppShell>,
    );
    expect(screen.getByRole('complementary')).toBeInTheDocument();
    expect(screen.getByText('Project list')).toBeInTheDocument();
  });

  it('does not render bottom bar by default', () => {
    const { container } = render(
      <AppShell>
        <div />
      </AppShell>,
    );
    expect(container.querySelector('.app-bottom-bar')).not.toBeInTheDocument();
  });

  it('renders bottom bar when provided', () => {
    render(
      <AppShell bottomBar={<button type="button">Enhance with AI</button>}>
        <div />
      </AppShell>,
    );
    expect(screen.getByRole('button', { name: /enhance with ai/i })).toBeInTheDocument();
  });

  it('uses semantic landmark roles', () => {
    render(
      <AppShell showSidebar sidebarContent={<div />}>
        <div />
      </AppShell>,
    );
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.getByRole('complementary')).toBeInTheDocument();
  });

  it('renders auth status indicator', () => {
    render(
      <AppShell>
        <div />
      </AppShell>,
    );
    expect(screen.getByLabelText('Not authenticated')).toBeInTheDocument();
  });
});
