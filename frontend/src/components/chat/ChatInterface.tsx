import React, { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Send, Sparkles, StopCircle, MessageSquare, Loader2, ChevronDown } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { chatApi } from '../../services/api'
import { useStore, Message } from '../../store'
import toast from 'react-hot-toast'
import TimestampBadge from './TimestampBadge'

interface Props {
  sessionId: number
}

export default function ChatInterface({ sessionId }: Props) {
  const { currentSession, addMessage, updateLastMessage, finalizeLastMessage, documents, selectedDocumentIds } = useStore()
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const abortRef = useRef(false)

  const messages = currentSession?.messages || []

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length, messages[messages.length - 1]?.content])

  const handleSend = async () => {
    if (!input.trim() || isStreaming) return

    const userMessage: Message = { role: 'user', content: input.trim() }
    addMessage(sessionId, userMessage)
    setInput('')
    setIsStreaming(true)
    abortRef.current = false

    // Add empty assistant message for streaming
    const streamMsg: Message = { role: 'assistant', content: '', isStreaming: true }
    addMessage(sessionId, streamMsg)

    try {
      await chatApi.sendMessageStream(
        sessionId,
        userMessage.content,
        (chunk) => {
          if (!abortRef.current) {
            updateLastMessage(sessionId, (currentSession?.messages?.slice(-1)[0]?.content || '') + chunk)
          }
        },
        (timestamps) => {
          finalizeLastMessage(sessionId, { relevant_timestamps: timestamps })
        }
      )
    } catch (err) {
      finalizeLastMessage(sessionId, { content: 'Sorry, I encountered an error. Please try again.' })
      toast.error('Failed to get response')
    } finally {
      setIsStreaming(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const adjustTextarea = () => {
    const ta = textareaRef.current
    if (ta) {
      ta.style.height = 'auto'
      ta.style.height = Math.min(ta.scrollHeight, 120) + 'px'
    }
  }

  const selectedDocs = documents.filter((d) => selectedDocumentIds.includes(d.id))

  return (
    <div className="flex flex-col h-full">
      {/* Document context banner */}
      {selectedDocs.length > 0 && (
        <div className="px-4 py-2 flex items-center gap-2 flex-wrap"
          style={{ borderBottom: '1px solid rgba(97,97,160,0.15)', background: 'rgba(109,40,217,0.05)' }}>
          <span className="text-xs text-ink-500">Analyzing:</span>
          {selectedDocs.map((d) => (
            <span key={d.id} className="text-xs px-2 py-0.5 rounded-full"
              style={{ background: 'rgba(109,40,217,0.2)', border: '1px solid rgba(167,139,250,0.2)', color: '#a78bfa' }}>
              {d.filename}
            </span>
          ))}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center h-full text-center py-16"
          >
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
              style={{ background: 'rgba(109,40,217,0.15)', border: '1px solid rgba(167,139,250,0.2)' }}>
              <MessageSquare className="w-8 h-8 text-glow" />
            </div>
            <h3 className="font-display font-semibold text-ink-200 text-lg">Ask about your documents</h3>
            <p className="text-sm text-ink-500 mt-2 max-w-sm">
              Select documents from the panel, then ask questions, request summaries, or find specific information.
            </p>
            <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-md w-full">
              {[
                'Summarize the main points',
                'What are the key findings?',
                'Find mentions of [topic]',
                'What happens at the beginning?',
              ].map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => { setInput(prompt); textareaRef.current?.focus() }}
                  className="text-left text-xs px-3 py-2.5 rounded-xl text-ink-300 hover:text-glow transition-all"
                  style={{ background: 'rgba(97,97,160,0.1)', border: '1px solid rgba(97,97,160,0.2)' }}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </motion.div>
        )}

        <AnimatePresence>
          {messages.map((msg, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {msg.role === 'assistant' && (
                <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                  style={{ background: 'linear-gradient(135deg, #6d28d9, #3a3a6e)' }}>
                  <Sparkles className="w-3.5 h-3.5 text-glow" />
                </div>
              )}

              <div className={`max-w-[85%] ${msg.role === 'user' ? 'max-w-[75%]' : ''}`}>
                <div className={`rounded-2xl px-4 py-3 ${
                  msg.role === 'user'
                    ? 'chat-user rounded-tr-sm'
                    : 'chat-assistant rounded-tl-sm'
                }`}>
                  {msg.role === 'user' ? (
                    <p className="text-sm text-ink-100 whitespace-pre-wrap">{msg.content}</p>
                  ) : (
                    <div className="prose-dark text-sm">
                      {msg.isStreaming && !msg.content ? (
                        <div className="flex gap-1 items-center h-5">
                          {[0, 1, 2].map((i) => (
                            <motion.div
                              key={i}
                              animate={{ y: [0, -4, 0] }}
                              transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.1 }}
                              className="w-1.5 h-1.5 bg-glow rounded-full"
                            />
                          ))}
                        </div>
                      ) : (
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                      )}
                    </div>
                  )}
                </div>

                {/* Timestamp badges */}
                {msg.relevant_timestamps && msg.relevant_timestamps.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {msg.relevant_timestamps.map((ts, j) => (
                      <TimestampBadge key={j} timestamp={ts} />
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4" style={{ borderTop: '1px solid rgba(97,97,160,0.15)' }}>
        <div className="relative flex items-end gap-2">
          <div className="flex-1 relative">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => { setInput(e.target.value); adjustTextarea() }}
              onKeyDown={handleKeyDown}
              placeholder="Ask a question about your documents..."
              rows={1}
              disabled={isStreaming}
              className="w-full resize-none rounded-2xl px-4 py-3 pr-12 text-sm text-ink-100 placeholder-ink-600 outline-none transition-all"
              style={{
                background: 'rgba(17,17,39,0.8)',
                border: '1px solid rgba(97,97,160,0.3)',
                minHeight: '48px',
                maxHeight: '120px',
              }}
              onFocus={(e) => { e.target.style.borderColor = 'rgba(167,139,250,0.5)' }}
              onBlur={(e) => { e.target.style.borderColor = 'rgba(97,97,160,0.3)' }}
            />
          </div>
          <motion.button
            onClick={isStreaming ? () => { abortRef.current = true; setIsStreaming(false) } : handleSend}
            disabled={!isStreaming && !input.trim()}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className={`w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 transition-all ${
              isStreaming
                ? 'bg-red-500/20 border border-red-500/30 text-red-400'
                : input.trim()
                  ? 'btn-primary'
                  : 'opacity-40 cursor-not-allowed'
            }`}
            style={!isStreaming && input.trim() ? {} : {
              background: 'rgba(97,97,160,0.1)',
              border: '1px solid rgba(97,97,160,0.2)',
              color: '#8888bb'
            }}
          >
            {isStreaming ? <StopCircle className="w-4 h-4" /> : <Send className="w-4 h-4" />}
          </motion.button>
        </div>
        <p className="text-xs text-ink-600 mt-1.5 text-center">
          Press Enter to send · Shift+Enter for newline
        </p>
      </div>
    </div>
  )
}
