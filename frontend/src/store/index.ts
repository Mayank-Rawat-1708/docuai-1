import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface User {
  id: number
  email: string
  username: string
}

export interface Document {
  id: number
  filename: string
  file_type: 'pdf' | 'audio' | 'video'
  file_size: number
  status: 'pending' | 'processing' | 'completed' | 'failed'
  summary?: string
  duration_seconds?: number
  timestamps?: Array<{ start: number; end: number; text: string; topic: string }>
  created_at: string
}

export interface Message {
  id?: number
  role: 'user' | 'assistant'
  content: string
  sources?: Array<{ document_id: number; source: string }>
  relevant_timestamps?: Array<{
    document_id: number
    start_time: number
    end_time: number
    text: string
  }>
  created_at?: string
  isStreaming?: boolean
}

export interface ChatSession {
  id: number
  title: string
  document_ids: number[]
  created_at: string
  messages?: Message[]
}

interface AppStore {
  // Auth
  user: User | null
  token: string | null
  setAuth: (user: User, token: string) => void
  clearAuth: () => void

  // Documents
  documents: Document[]
  setDocuments: (docs: Document[]) => void
  addDocument: (doc: Document) => void
  updateDocument: (id: number, updates: Partial<Document>) => void
  removeDocument: (id: number) => void

  // Chat
  sessions: ChatSession[]
  currentSession: ChatSession | null
  setSessions: (sessions: ChatSession[]) => void
  setCurrentSession: (session: ChatSession | null) => void
  addSession: (session: ChatSession) => void
  removeSession: (id: number) => void
  addMessage: (sessionId: number, message: Message) => void
  updateLastMessage: (sessionId: number, content: string) => void
  finalizeLastMessage: (sessionId: number, data: Partial<Message>) => void

  // UI
  sidebarOpen: boolean
  setSidebarOpen: (open: boolean) => void
  selectedDocumentIds: number[]
  setSelectedDocumentIds: (ids: number[]) => void
  playingMedia: { documentId: number; startTime: number } | null
  setPlayingMedia: (media: { documentId: number; startTime: number } | null) => void
}

export const useStore = create<AppStore>()(
  persist(
    (set, get) => ({
      // Auth
      user: null,
      token: null,
      setAuth: (user, token) => {
        localStorage.setItem('token', token)
        set({ user, token })
      },
      clearAuth: () => {
        localStorage.removeItem('token')
        localStorage.removeItem('user')
        set({ user: null, token: null, sessions: [], currentSession: null, documents: [] })
      },

      // Documents
      documents: [],
      setDocuments: (docs) => set({ documents: docs }),
      addDocument: (doc) => set((s) => ({ documents: [doc, ...s.documents] })),
      updateDocument: (id, updates) =>
        set((s) => ({
          documents: s.documents.map((d) => (d.id === id ? { ...d, ...updates } : d)),
        })),
      removeDocument: (id) =>
        set((s) => ({ documents: s.documents.filter((d) => d.id !== id) })),

      // Chat
      sessions: [],
      currentSession: null,
      setSessions: (sessions) => set({ sessions }),
      setCurrentSession: (session) => set({ currentSession: session }),
      addSession: (session) => set((s) => ({ sessions: [session, ...s.sessions] })),
      removeSession: (id) =>
        set((s) => ({
          sessions: s.sessions.filter((s) => s.id !== id),
          currentSession: s.currentSession?.id === id ? null : s.currentSession,
        })),
      addMessage: (sessionId, message) =>
        set((s) => ({
          currentSession:
            s.currentSession?.id === sessionId
              ? { ...s.currentSession, messages: [...(s.currentSession.messages || []), message] }
              : s.currentSession,
        })),
      updateLastMessage: (sessionId, content) =>
        set((s) => {
          if (s.currentSession?.id !== sessionId) return s
          const msgs = [...(s.currentSession.messages || [])]
          if (msgs.length > 0) {
            msgs[msgs.length - 1] = { ...msgs[msgs.length - 1], content }
          }
          return { currentSession: { ...s.currentSession, messages: msgs } }
        }),
      finalizeLastMessage: (sessionId, data) =>
        set((s) => {
          if (s.currentSession?.id !== sessionId) return s
          const msgs = [...(s.currentSession.messages || [])]
          if (msgs.length > 0) {
            msgs[msgs.length - 1] = { ...msgs[msgs.length - 1], ...data, isStreaming: false }
          }
          return { currentSession: { ...s.currentSession, messages: msgs } }
        }),

      // UI
      sidebarOpen: true,
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      selectedDocumentIds: [],
      setSelectedDocumentIds: (ids) => set({ selectedDocumentIds: ids }),
      playingMedia: null,
      setPlayingMedia: (media) => set({ playingMedia: media }),
    }),
    {
      name: 'docuai-store',
      partialize: (s) => ({ user: s.user, token: s.token }),
    }
  )
)
