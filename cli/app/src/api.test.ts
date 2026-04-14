import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchAuthStatus, pollDeviceAuth } from './api'

afterEach(() => {
  vi.restoreAllMocks()
})

/**
 * These tests pin down the one invariant every display site in the app
 * relies on: whatever the server returns, `username` in the resolved
 * AuthStatus is always lowercase. Without this, a `@{auth.username}`
 * render (Settings, PublishReview embed snippet, PreviewPane) could leak
 * mixed-case from Phoenix straight into the UI.
 */
describe('api — auth status username normalization', () => {
  it('fetchAuthStatus lowercases the server-returned username', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ authenticated: true, username: 'Ben' }),
    })
    vi.stubGlobal('fetch', mockFetch)

    const result = await fetchAuthStatus()
    expect(result).toEqual({ authenticated: true, username: 'ben' })
  })

  it('fetchAuthStatus leaves already-lowercase usernames alone', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ authenticated: true, username: 'ben-cates' }),
    })
    vi.stubGlobal('fetch', mockFetch)

    const result = await fetchAuthStatus()
    expect(result.username).toBe('ben-cates')
  })

  it('fetchAuthStatus returns unauthenticated on network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('boom')))
    const result = await fetchAuthStatus()
    expect(result).toEqual({ authenticated: false })
  })

  it('pollDeviceAuth lowercases the returned username', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ authenticated: true, username: 'BEN' }),
    })
    vi.stubGlobal('fetch', mockFetch)

    const result = await pollDeviceAuth('dev_code_123')
    expect(result.username).toBe('ben')
  })
})
