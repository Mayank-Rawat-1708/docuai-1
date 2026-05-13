/**
 * FIX: api.ts — Render-compatible Axios API client
 * Changes vs original:
 *   1. BASE_URL reads from VITE_API_URL env var (must be set in Render frontend env)
 *   2. Axios interceptor adds auth token from localStorage automatically
 *   3. 401 interceptor clears token and redirects to /login (session expired)
 *   4. Request timeout set to 60s (OpenAI calls can be slow)
 *   5. Proper TypeScript types for all responses
 */
import axios, { AxiosError, AxiosInstance } from 'axios';

// FIX: This is set at BUILD TIME by Vite from the VITE_API_URL env var.
// In Render frontend service → Environment → add:
//   VITE_API_URL = https://your-backend-name.onrender.com
// Then redeploy. Without this, it falls back to localhost (broken in prod).
const BASE_URL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api/v1`
  : '/api/v1'; // fallback: relative URL (works if frontend and backend share same origin)

export const api: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 60_000, // 60s — OpenAI calls can be slow
  headers: { 'Content-Type': 'application/json' },
});

// ── Request interceptor — attach JWT token ────────────────────────────────────
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ── Response interceptor — handle auth errors ─────────────────────────────────
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      // Token expired or invalid — clear storage and redirect
      localStorage.removeItem('access_token');
      localStorage.removeItem('user');
      // Only redirect if not already on the login page
      if (!window.location.pathname.includes('/login')) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  },
);

// ── Types ─────────────────────────────────────────────────────────────────────
export interface User {
  id: number;
  email: string;
  username: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export interface Document {
  id: number;
  filename: string;
  file_type: 'pdf' | 'audio' | 'video';
  status: 'processing' | 'completed' | 'failed';
  summary?: string;
  timestamps?: Timestamp[];
  duration_seconds?: number;
  created_at: string;
}

export interface Timestamp {
  start: number;
  end: number;
  text: string;
  topic?: string;
}

export interface ChatSession {
  id: number;
  title: string;
  created_at: string;
  document_ids: number[];
}

export interface Message {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
  timestamps?: Timestamp[];
}

// ── Auth ──────────────────────────────────────────────────────────────────────
export const authApi = {
  login: async (email: string, password: string): Promise<AuthResponse> => {
    // FastAPI OAuth2 form — must be form-encoded, NOT JSON
    const form = new URLSearchParams({ username: email, password });
    const { data } = await api.post<AuthResponse>('/auth/login', form, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    localStorage.setItem('access_token', data.access_token);
    localStorage.setItem('user', JSON.stringify(data.user));
    return data;
  },

  register: async (
    email: string,
    password: string,
    username: string,
  ): Promise<AuthResponse> => {
    const { data } = await api.post<AuthResponse>('/auth/register', {
      email,
      password,
      username,
    });
    localStorage.setItem('access_token', data.access_token);
    localStorage.setItem('user', JSON.stringify(data.user));
    return data;
  },

  logout: () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('user');
  },

  me: async (): Promise<User> => {
    const { data } = await api.get<User>('/auth/me');
    return data;
  },
};

// ── Documents ─────────────────────────────────────────────────────────────────
export const documentsApi = {
  upload: async (
    file: File,
    onProgress?: (pct: number) => void,
  ): Promise<Document> => {
    const form = new FormData();
    form.append('file', file);
    const { data } = await api.post<Document>('/documents/upload', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 300_000, // 5 min for large files
      onUploadProgress: (evt) => {
        if (onProgress && evt.total) {
          onProgress(Math.round((evt.loaded / evt.total) * 100));
        }
      },
    });
    return data;
  },

  list: async (): Promise<Document[]> => {
    const { data } = await api.get<Document[]>('/documents/');
    return data;
  },

  get: async (id: number): Promise<Document> => {
    const { data } = await api.get<Document>(`/documents/${id}`);
    return data;
  },

  delete: async (id: number): Promise<void> => {
    await api.delete(`/documents/${id}`);
  },

  streamUrl: (id: number): string => `${BASE_URL}/documents/${id}/stream`,
};

// ── Chat ──────────────────────────────────────────────────────────────────────
export const chatApi = {
  createSession: async (
    title: string,
    documentIds: number[],
  ): Promise<ChatSession> => {
    const { data } = await api.post<ChatSession>('/chat/sessions', {
      title,
      document_ids: documentIds,
    });
    return data;
  },

  listSessions: async (): Promise<ChatSession[]> => {
    const { data } = await api.get<ChatSession[]>('/chat/sessions');
    return data;
  },

  getSession: async (id: number): Promise<ChatSession & { messages: Message[] }> => {
    const { data } = await api.get(`/chat/sessions/${id}`);
    return data;
  },

  deleteSession: async (id: number): Promise<void> => {
    await api.delete(`/chat/sessions/${id}`);
  },

  /**
   * Send a message with streaming (SSE).
   * onChunk is called with each text chunk as it arrives.
   * Returns the complete response + any referenced timestamps.
   */
  sendMessageStream: async (
    sessionId: number,
    content: string,
    onChunk: (chunk: string) => void,
  ): Promise<{ fullText: string; timestamps: Timestamp[] }> => {
    const token = localStorage.getItem('access_token');
    const url = `${BASE_URL}/chat/sessions/${sessionId}/messages`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: token ? `Bearer ${token}` : '',
      },
      body: JSON.stringify({ content, stream: true }),
    });

    if (!response.ok) {
      if (response.status === 401) {
        localStorage.removeItem('access_token');
        window.location.href = '/login';
      }
      throw new Error(`Chat error ${response.status}: ${response.statusText}`);
    }

    if (!response.body) throw new Error('No response body for streaming');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '';
    let timestamps: Timestamp[] = [];

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      const lines = decoder.decode(value, { stream: true }).split('\n');
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const parsed = JSON.parse(line.slice(6));
          if (parsed.type === 'chunk' && parsed.content) {
            fullText += parsed.content;
            onChunk(parsed.content);
          } else if (parsed.type === 'done') {
            timestamps = parsed.timestamps || [];
          } else if (parsed.type === 'error') {
            throw new Error(parsed.content);
          }
        } catch (e) {
          // ignore parse errors on incomplete chunks
        }
      }
    }

    return { fullText, timestamps };
  },

  /** Non-streaming fallback */
  sendMessage: async (
    sessionId: number,
    content: string,
  ): Promise<Message> => {
    const { data } = await api.post<Message>(
      `/chat/sessions/${sessionId}/messages`,
      { content, stream: false },
    );
    return data;
  },
};

export default api;
