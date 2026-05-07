import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Files, MessageSquare, Plus, PanelLeftClose, PanelLeft, Sparkles } from 'lucide-react'
import Sidebar from './Sidebar'
import UploadZone from '../upload/UploadZone'
import DocumentList from '../upload/DocumentList'
import ChatInterface from '../chat/ChatInterface'
import MediaPlayer from '../media/MediaPlayer'
import { useStore } from '../../store'
import { chatApi } from '../../services/api'
import toast from 'react-hot-toast'

type Panel = 'documents' | 'chat'

export default function AppLayout() {
  const [activePanel, setActivePanel] = useState<Panel>('documents')
  const [docPanelOpen, setDocPanelOpen] = useState(true)
  const { currentSession, setCurrentSession, addSession, selectedDocumentIds } = useStore()

  const handleNewChat = async () => {
    try {
      const res = await chatApi.createSession({
        title: 'New Chat',
        document_ids: selectedDocumentIds,
      })
      addSession(res.data)
      setCurrentSession(res.data)
      setActivePanel('chat')
    } catch {
      toast.error('Failed to create chat session')
    }
  }

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--bg-primary)' }}>
      {/* Left Sidebar - session history */}
      <Sidebar onNewChat={handleNewChat} />

      {/* Main content area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Document panel */}
        <AnimatePresence initial={false}>
          {docPanelOpen && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 320, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="flex-shrink-0 overflow-hidden"
              style={{ borderRight: '1px solid rgba(97,97,160,0.15)' }}
            >
              <div className="w-[320px] h-full flex flex-col">
                {/* Panel header */}
                <div className="px-4 py-3 flex items-center gap-2"
                  style={{ borderBottom: '1px solid rgba(97,97,160,0.15)' }}>
                  <Files className="w-4 h-4 text-glow" />
                  <span className="font-display font-semibold text-sm text-ink-200">Documents & Media</span>
                </div>

                <div className="flex-1 overflow-y-auto p-3 space-y-4">
                  <UploadZone onUploaded={() => {}} />
                  <div>
                    <p className="text-xs font-display font-semibold text-ink-500 uppercase tracking-wider mb-2 px-1">
                      Your Files
                    </p>
                    <DocumentList />
                  </div>
                </div>

                {/* Start chat button */}
                <div className="p-3" style={{ borderTop: '1px solid rgba(97,97,160,0.15)' }}>
                  <button
                    onClick={handleNewChat}
                    className="w-full btn-primary rounded-xl py-2.5 text-sm font-display font-medium flex items-center justify-center gap-2"
                  >
                    <MessageSquare className="w-4 h-4" />
                    Chat with{selectedDocumentIds.length > 0 ? ` ${selectedDocumentIds.length} Selected` : ' Documents'}
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Toggle doc panel */}
        <button
          onClick={() => setDocPanelOpen(!docPanelOpen)}
          className="absolute left-[260px] top-4 z-20 hidden md:flex w-6 h-6 items-center justify-center rounded-full text-ink-400 hover:text-glow transition-colors"
          style={{
            background: '#0d0d1f',
            border: '1px solid rgba(97,97,160,0.3)',
            left: docPanelOpen ? 'calc(260px + 320px)' : '260px',
            position: 'relative',
          }}
        />

        {/* Chat area */}
        <div className="flex-1 flex flex-col overflow-hidden relative">
          {/* Top bar */}
          <div className="h-12 flex items-center px-4 gap-3 flex-shrink-0"
            style={{ borderBottom: '1px solid rgba(97,97,160,0.15)' }}>
            <button
              onClick={() => setDocPanelOpen(!docPanelOpen)}
              className="text-ink-500 hover:text-glow transition-colors"
              title="Toggle document panel"
            >
              {docPanelOpen ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeft className="w-4 h-4" />}
            </button>
            <div className="h-4 w-px" style={{ background: 'rgba(97,97,160,0.2)' }} />
            {currentSession ? (
              <span className="text-sm text-ink-300 font-display">{currentSession.title || 'Chat'}</span>
            ) : (
              <span className="text-sm text-ink-500">Select or start a chat</span>
            )}
          </div>

          {currentSession ? (
            <div className="flex-1 overflow-hidden">
              <ChatInterface sessionId={currentSession.id} />
            </div>
          ) : (
            <EmptyState onNewChat={handleNewChat} />
          )}
        </div>
      </div>

      {/* Floating media player */}
      <MediaPlayer />
    </div>
  )
}

function EmptyState({ onNewChat }: { onNewChat: () => void }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
      >
        {/* Animated logo */}
        <div className="relative w-24 h-24 mx-auto mb-6">
          <div className="absolute inset-0 rounded-3xl opacity-20 blur-xl"
            style={{ background: 'linear-gradient(135deg, #6d28d9, #3b82f6)' }} />
          <div className="relative w-24 h-24 rounded-3xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #2a1d3e, #1a1a38)', border: '1px solid rgba(167,139,250,0.3)' }}>
            <Sparkles className="w-12 h-12 text-glow" />
          </div>
        </div>

        <h2 className="font-display text-2xl font-bold gradient-text mb-2">Welcome to DocuAI</h2>
        <p className="text-ink-400 text-sm max-w-md mb-8">
          Upload your PDFs, audio, and video files. Then start a conversation to extract insights, 
          get summaries, and discover key moments with timestamp navigation.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-lg mb-8">
          {[
            { icon: '📄', title: 'PDF Analysis', desc: 'Extract text, summarize, and Q&A' },
            { icon: '🎵', title: 'Audio Transcription', desc: 'Transcribe & find key moments' },
            { icon: '🎬', title: 'Video Intelligence', desc: 'Navigate with timestamps' },
          ].map((feature) => (
            <div key={feature.title} className="glass rounded-xl p-3 text-left">
              <div className="text-2xl mb-2">{feature.icon}</div>
              <p className="text-xs font-display font-semibold text-ink-200">{feature.title}</p>
              <p className="text-xs text-ink-500 mt-0.5">{feature.desc}</p>
            </div>
          ))}
        </div>

        <motion.button
          onClick={onNewChat}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          className="btn-primary px-6 py-3 rounded-xl font-display font-semibold flex items-center gap-2 mx-auto"
        >
          <Plus className="w-4 h-4" />
          Start New Chat
        </motion.button>
      </motion.div>
    </div>
  )
}
