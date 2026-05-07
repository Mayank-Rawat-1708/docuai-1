import React, { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { MessageSquare, Plus, Trash2, Sparkles, LogOut, ChevronLeft, ChevronRight, Settings, Files } from 'lucide-react'
import { useStore } from '../../store'
import { chatApi } from '../../services/api'
import { formatDistanceToNow } from 'date-fns'
import toast from 'react-hot-toast'

interface Props {
  onNewChat: () => void
}

export default function Sidebar({ onNewChat }: Props) {
  const { sidebarOpen, setSidebarOpen, sessions, currentSession, setCurrentSession,
    removeSession, clearAuth, user, setSessions } = useStore()

  useEffect(() => {
    chatApi.listSessions().then((r) => setSessions(r.data)).catch(() => {})
  }, [])

  const handleSelectSession = async (id: number) => {
    try {
      const r = await chatApi.getSession(id)
      setCurrentSession(r.data)
    } catch { toast.error('Failed to load chat') }
  }

  const handleDeleteSession = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation()
    await chatApi.deleteSession(id)
    removeSession(id)
    toast.success('Chat deleted')
  }

  return (
    <motion.div
      animate={{ width: sidebarOpen ? 260 : 0 }}
      transition={{ duration: 0.3, ease: 'easeInOut' }}
      className="relative flex-shrink-0 overflow-hidden"
      style={{ borderRight: '1px solid rgba(97,97,160,0.15)' }}
    >
      <div className="w-[260px] h-full flex flex-col" style={{ background: 'rgba(7,7,15,0.8)' }}>
        {/* Header */}
        <div className="p-4 flex items-center gap-3" style={{ borderBottom: '1px solid rgba(97,97,160,0.15)' }}>
          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, #6d28d9, #3a3a6e)' }}>
            <Sparkles className="w-4 h-4 text-glow" />
          </div>
          <span className="font-display font-bold text-white text-sm">DocuAI</span>
        </div>

        {/* New Chat Button */}
        <div className="p-3">
          <button
            onClick={onNewChat}
            className="w-full btn-primary rounded-xl py-2.5 text-sm font-display font-medium flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4" />
            New Chat
          </button>
        </div>

        {/* Sessions */}
        <div className="flex-1 overflow-y-auto px-2 pb-2">
          <p className="text-xs font-display font-semibold text-ink-500 uppercase tracking-wider px-2 py-2">
            Recent Chats
          </p>
          <AnimatePresence>
            {sessions.map((session) => (
              <motion.div
                key={session.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                onClick={() => handleSelectSession(session.id)}
                className={`sidebar-item p-2.5 mb-1 cursor-pointer flex items-center gap-2 group ${
                  currentSession?.id === session.id ? 'active' : ''
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5 text-ink-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-ink-200 truncate">{session.title || 'New Chat'}</p>
                  <p className="text-xs text-ink-500">
                    {formatDistanceToNow(new Date(session.created_at), { addSuffix: true })}
                  </p>
                </div>
                <button
                  onClick={(e) => handleDeleteSession(e, session.id)}
                  className="opacity-0 group-hover:opacity-100 text-ink-500 hover:text-red-400 transition-opacity"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </motion.div>
            ))}
          </AnimatePresence>

          {sessions.length === 0 && (
            <p className="text-xs text-ink-600 text-center mt-4 px-2">
              Start a new chat to analyze your documents
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 space-y-1" style={{ borderTop: '1px solid rgba(97,97,160,0.15)' }}>
          <div className="sidebar-item p-2.5 flex items-center gap-2.5">
            <div className="w-6 h-6 rounded-full bg-spark-600 flex items-center justify-center text-xs font-bold text-white">
              {user?.username?.[0]?.toUpperCase()}
            </div>
            <span className="text-sm text-ink-300 truncate flex-1">{user?.username}</span>
          </div>
          <button
            onClick={clearAuth}
            className="sidebar-item w-full p-2.5 flex items-center gap-2.5 text-left"
          >
            <LogOut className="w-3.5 h-3.5 text-ink-500" />
            <span className="text-sm text-ink-400">Sign Out</span>
          </button>
        </div>
      </div>

      {/* Toggle button */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="absolute -right-3 top-6 z-10 w-6 h-6 rounded-full flex items-center justify-center text-ink-400 hover:text-glow transition-colors"
        style={{ background: '#0d0d1f', border: '1px solid rgba(97,97,160,0.3)' }}
      >
        {sidebarOpen ? <ChevronLeft className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
      </button>
    </motion.div>
  )
}
