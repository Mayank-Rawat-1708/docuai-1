import axios from 'axios'

const api = axios.create({
  baseURL: '/api/v1',
  headers: { 'Content-Type': 'application/json' },
})

// Attach token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Handle 401
api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

// ─── Auth ───────────────────────────────────────────────────────────────────
export const authApi = {
  register: (data: { email: string; username: string; password: string }) =>
    api.post('/auth/register', data),
  login: (data: { email: string; password: string }) =>
    api.post('/auth/login', data),
  me: () => api.get('/auth/me'),
}

// ─── Documents ──────────────────────────────────────────────────────────────
export const documentsApi = {
  upload: (file: File, onProgress?: (p: number) => void) => {
    const form = new FormData()
    form.append('file', file)
    return api.post('/documents/upload', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (e) => {
        if (onProgress && e.total) onProgress(Math.round((e.loaded * 100) / e.total))
      },
    })
  },
  list: () => api.get('/documents/'),
  get: (id: number) => api.get(`/documents/${id}`),
  delete: (id: number) => api.delete(`/documents/${id}`),
  streamUrl: (id: number) => `/api/v1/documents/${id}/stream`,
}

// ─── Chat ───────────────────────────────────────────────────────────────────
export const chatApi = {
  createSession: (data: { title?: string; document_ids?: number[] }) =>
    api.post('/chat/sessions', data),
  listSessions: () => api.get('/chat/sessions'),
  getSession: (id: number) => api.get(`/chat/sessions/${id}`),
  deleteSession: (id: number) => api.delete(`/chat/sessions/${id}`),
  sendMessageStream: async (
    sessionId: number,
    content: string,
    onChunk: (chunk: string) => void,
    onDone: (timestamps: any[]) => void
  ) => {
    const token = localStorage.getItem('token')
    const response = await fetch(`/api/v1/chat/sessions/${sessionId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ content, stream: true }),
    })

    const reader = response.body!.getReader()
    const decoder = new TextDecoder()

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const text = decoder.decode(value)
      const lines = text.split('\n')
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6))
            if (data.type === 'chunk') onChunk(data.content)
            if (data.type === 'done') onDone(data.timestamps || [])
          } catch {}
        }
      }
    }
  },
}

export default api
