import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import React from 'react'

// ─── Mock dependencies ──────────────────────────────────────────────────────
vi.mock('../services/api', () => ({
  authApi: {
    login: vi.fn(),
    register: vi.fn(),
    me: vi.fn(),
  },
  documentsApi: {
    list: vi.fn().mockResolvedValue({ data: [] }),
    upload: vi.fn(),
    get: vi.fn(),
    delete: vi.fn(),
    streamUrl: vi.fn((id: number) => `/api/v1/documents/${id}/stream`),
  },
  chatApi: {
    listSessions: vi.fn().mockResolvedValue({ data: [] }),
    createSession: vi.fn(),
    getSession: vi.fn(),
    deleteSession: vi.fn(),
    sendMessageStream: vi.fn(),
  },
  default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
}))

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
  Toaster: () => null,
}))

// ─── Store tests ────────────────────────────────────────────────────────────
import { useStore } from '../store'

describe('Zustand Store', () => {
  beforeEach(() => {
    useStore.setState({
      user: null,
      token: null,
      documents: [],
      sessions: [],
      currentSession: null,
      selectedDocumentIds: [],
      playingMedia: null,
    })
  })

  it('sets auth correctly', () => {
    const { setAuth } = useStore.getState()
    setAuth({ id: 1, email: 'test@test.com', username: 'test' }, 'mytoken')
    const state = useStore.getState()
    expect(state.user?.email).toBe('test@test.com')
    expect(state.token).toBe('mytoken')
  })

  it('clears auth', () => {
    useStore.setState({ user: { id: 1, email: 'a@b.com', username: 'a' }, token: 'tok' })
    useStore.getState().clearAuth()
    expect(useStore.getState().user).toBeNull()
    expect(useStore.getState().token).toBeNull()
  })

  it('adds and removes documents', () => {
    const doc = { id: 1, filename: 'test.pdf', file_type: 'pdf' as const, file_size: 1000,
      status: 'completed' as const, created_at: new Date().toISOString() }
    useStore.getState().addDocument(doc)
    expect(useStore.getState().documents).toHaveLength(1)
    useStore.getState().removeDocument(1)
    expect(useStore.getState().documents).toHaveLength(0)
  })

  it('updates document status', () => {
    const doc = { id: 2, filename: 'audio.mp3', file_type: 'audio' as const, file_size: 500,
      status: 'pending' as const, created_at: new Date().toISOString() }
    useStore.getState().addDocument(doc)
    useStore.getState().updateDocument(2, { status: 'completed' })
    const updated = useStore.getState().documents.find((d) => d.id === 2)
    expect(updated?.status).toBe('completed')
  })

  it('manages sessions', () => {
    const session = { id: 1, title: 'Test Chat', document_ids: [], created_at: new Date().toISOString() }
    useStore.getState().addSession(session)
    expect(useStore.getState().sessions).toHaveLength(1)
    useStore.getState().removeSession(1)
    expect(useStore.getState().sessions).toHaveLength(0)
  })

  it('sets current session', () => {
    const session = { id: 5, title: 'Active', document_ids: [1, 2], created_at: new Date().toISOString(), messages: [] }
    useStore.getState().setCurrentSession(session)
    expect(useStore.getState().currentSession?.id).toBe(5)
  })

  it('adds messages to current session', () => {
    const session = { id: 1, title: 'Chat', document_ids: [], created_at: new Date().toISOString(), messages: [] }
    useStore.getState().setCurrentSession(session)
    useStore.getState().addMessage(1, { role: 'user', content: 'Hello' })
    expect(useStore.getState().currentSession?.messages).toHaveLength(1)
  })

  it('streams message updates', () => {
    const session = { id: 1, title: 'Chat', document_ids: [], created_at: new Date().toISOString(), messages: [] }
    useStore.getState().setCurrentSession(session)
    useStore.getState().addMessage(1, { role: 'assistant', content: '', isStreaming: true })
    useStore.getState().updateLastMessage(1, 'Hello world')
    expect(useStore.getState().currentSession?.messages?.[0]?.content).toBe('Hello world')
  })

  it('finalizes streaming messages', () => {
    const session = { id: 1, title: 'Chat', document_ids: [], created_at: new Date().toISOString(), messages: [] }
    useStore.getState().setCurrentSession(session)
    useStore.getState().addMessage(1, { role: 'assistant', content: 'Response', isStreaming: true })
    useStore.getState().finalizeLastMessage(1, { relevant_timestamps: [] })
    expect(useStore.getState().currentSession?.messages?.[0]?.isStreaming).toBe(false)
  })

  it('manages selected document IDs', () => {
    useStore.getState().setSelectedDocumentIds([1, 2, 3])
    expect(useStore.getState().selectedDocumentIds).toEqual([1, 2, 3])
    useStore.getState().setSelectedDocumentIds([1])
    expect(useStore.getState().selectedDocumentIds).toHaveLength(1)
  })

  it('manages playing media', () => {
    useStore.getState().setPlayingMedia({ documentId: 5, startTime: 30.5 })
    expect(useStore.getState().playingMedia?.documentId).toBe(5)
    expect(useStore.getState().playingMedia?.startTime).toBe(30.5)
    useStore.getState().setPlayingMedia(null)
    expect(useStore.getState().playingMedia).toBeNull()
  })

  it('handles sidebar state', () => {
    useStore.getState().setSidebarOpen(false)
    expect(useStore.getState().sidebarOpen).toBe(false)
    useStore.getState().setSidebarOpen(true)
    expect(useStore.getState().sidebarOpen).toBe(true)
  })
})

// ─── Auth Page tests ────────────────────────────────────────────────────────
import AuthPage from '../components/layout/AuthPage'

const renderAuth = () => render(<BrowserRouter><AuthPage /></BrowserRouter>)

describe('AuthPage', () => {
  it('renders login form', () => {
    renderAuth()
    expect(screen.getByPlaceholderText('Email address')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Password')).toBeInTheDocument()
  })

  it('shows DocuAI branding', () => {
    renderAuth()
    expect(screen.getByText('DocuAI')).toBeInTheDocument()
  })

  it('switches to register mode', async () => {
    renderAuth()
    fireEvent.click(screen.getByText('Create Account'))
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Username')).toBeInTheDocument()
    })
  })

  it('switches back to login', async () => {
    renderAuth()
    fireEvent.click(screen.getByText('Create Account'))
    fireEvent.click(screen.getByText('Sign In'))
    await waitFor(() => {
      expect(screen.queryByPlaceholderText('Username')).not.toBeInTheDocument()
    })
  })

  it('toggles password visibility', () => {
    renderAuth()
    const input = screen.getByPlaceholderText('Password') as HTMLInputElement
    expect(input.type).toBe('password')
    // Find the toggle button (eye icon)
    const toggleBtn = input.parentElement?.querySelector('button')
    if (toggleBtn) {
      fireEvent.click(toggleBtn)
      expect(input.type).toBe('text')
    }
  })

  it('calls login API on submit', async () => {
    const { authApi } = await import('../services/api')
    vi.mocked(authApi.login).mockResolvedValueOnce({
      data: { access_token: 'tok', user: { id: 1, email: 'a@b.com', username: 'user' } }
    } as any)

    renderAuth()
    fireEvent.change(screen.getByPlaceholderText('Email address'), { target: { value: 'a@b.com' } })
    fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'password123' } })
    fireEvent.submit(screen.getByPlaceholderText('Email address').closest('form')!)
    await waitFor(() => expect(authApi.login).toHaveBeenCalled())
  })

  it('shows error on failed login', async () => {
    const { authApi } = await import('../services/api')
    vi.mocked(authApi.login).mockRejectedValueOnce({
      response: { data: { detail: 'Invalid credentials' } }
    })
    const toast = await import('react-hot-toast')

    renderAuth()
    fireEvent.change(screen.getByPlaceholderText('Email address'), { target: { value: 'bad@bad.com' } })
    fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'wrong' } })
    fireEvent.submit(screen.getByPlaceholderText('Email address').closest('form')!)
    await waitFor(() => expect(toast.default.error).toHaveBeenCalled())
  })
})

// ─── API Service tests ──────────────────────────────────────────────────────
describe('API Service', () => {
  it('constructs stream URL correctly', async () => {
    const { documentsApi } = await import('../services/api')
    expect(documentsApi.streamUrl(42)).toBe('/api/v1/documents/42/stream')
  })
})

// ─── Timestamp Badge tests ──────────────────────────────────────────────────
import TimestampBadge from '../components/chat/TimestampBadge'

describe('TimestampBadge', () => {
  it('renders nothing for PDF documents', () => {
    useStore.setState({
      documents: [{
        id: 1, filename: 'doc.pdf', file_type: 'pdf', file_size: 100,
        status: 'completed', created_at: new Date().toISOString()
      }]
    })
    const { container } = render(<BrowserRouter><TimestampBadge timestamp={{ document_id: 1, start_time: 10, text: 'test' }} /></BrowserRouter>)
    expect(container.firstChild).toBeNull()
  })

  it('renders play button for audio documents', () => {
    useStore.setState({
      documents: [{
        id: 2, filename: 'audio.mp3', file_type: 'audio', file_size: 100,
        status: 'completed', created_at: new Date().toISOString()
      }]
    })
    render(<BrowserRouter><TimestampBadge timestamp={{ document_id: 2, start_time: 65, text: 'test' }} /></BrowserRouter>)
    expect(screen.getByText('1:05')).toBeInTheDocument()
  })

  it('calls setPlayingMedia on click', () => {
    useStore.setState({
      documents: [{
        id: 3, filename: 'video.mp4', file_type: 'video', file_size: 100,
        status: 'completed', created_at: new Date().toISOString()
      }]
    })
    render(<BrowserRouter><TimestampBadge timestamp={{ document_id: 3, start_time: 30, text: 'test' }} /></BrowserRouter>)
    fireEvent.click(screen.getByRole('button'))
    expect(useStore.getState().playingMedia).toEqual({ documentId: 3, startTime: 30 })
  })
})
