import React, { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { FileText, Music, Video, Trash2, ChevronDown, ChevronUp, Clock, Check, Square } from 'lucide-react'
import { documentsApi } from '../../services/api'
import { useStore, Document } from '../../store'
import { formatDistanceToNow } from 'date-fns'
import toast from 'react-hot-toast'

interface Props {
  onDocumentSelect?: (id: number) => void
}

export default function DocumentList({ onDocumentSelect }: Props) {
  const { documents, setDocuments, removeDocument, updateDocument, selectedDocumentIds, setSelectedDocumentIds } = useStore()
  const [expandedDoc, setExpandedDoc] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    documentsApi.list().then((r) => {
      setDocuments(r.data)
      setLoading(false)
    }).catch(() => setLoading(false))

    // Poll for processing docs
    const poll = setInterval(async () => {
      const processingDocs = documents.filter((d) => d.status === 'processing' || d.status === 'pending')
      for (const doc of processingDocs) {
        try {
          const r = await documentsApi.get(doc.id)
          if (r.data.status !== doc.status) updateDocument(doc.id, r.data)
        } catch {}
      }
    }, 5000)

    return () => clearInterval(poll)
  }, [documents.length])

  const handleDelete = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation()
    if (!confirm('Delete this document?')) return
    try {
      await documentsApi.delete(id)
      removeDocument(id)
      setSelectedDocumentIds(selectedDocumentIds.filter((i) => i !== id))
      toast.success('Document deleted')
    } catch { toast.error('Failed to delete') }
  }

  const toggleSelect = (id: number) => {
    setSelectedDocumentIds(
      selectedDocumentIds.includes(id)
        ? selectedDocumentIds.filter((i) => i !== id)
        : [...selectedDocumentIds, id]
    )
  }

  if (loading) return (
    <div className="space-y-2">
      {[1, 2, 3].map((i) => (
        <div key={i} className="shimmer h-16 rounded-xl" />
      ))}
    </div>
  )

  if (documents.length === 0) return (
    <div className="text-center py-8">
      <div className="w-12 h-12 rounded-2xl mx-auto mb-3 flex items-center justify-center"
        style={{ background: 'rgba(97,97,160,0.1)', border: '1px solid rgba(97,97,160,0.2)' }}>
        <FileText className="w-6 h-6 text-ink-500" />
      </div>
      <p className="text-sm text-ink-500">No documents yet</p>
      <p className="text-xs text-ink-600 mt-1">Upload PDFs, audio, or video files above</p>
    </div>
  )

  return (
    <div className="space-y-2">
      {selectedDocumentIds.length > 0 && (
        <p className="text-xs text-ink-400 px-1">
          {selectedDocumentIds.length} document{selectedDocumentIds.length > 1 ? 's' : ''} selected for chat
        </p>
      )}
      <AnimatePresence>
        {documents.map((doc) => (
          <motion.div
            key={doc.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="glass rounded-xl overflow-hidden"
          >
            <div
              className="p-3 flex items-center gap-3 cursor-pointer hover:bg-white/5 transition-colors"
              onClick={() => setExpandedDoc(expandedDoc === doc.id ? null : doc.id)}
            >
              {/* Select checkbox */}
              <button
                onClick={(e) => { e.stopPropagation(); toggleSelect(doc.id) }}
                className={`flex-shrink-0 w-5 h-5 rounded flex items-center justify-center transition-all ${
                  selectedDocumentIds.includes(doc.id)
                    ? 'bg-spark-500 border-spark-500'
                    : 'border border-ink-600 hover:border-glow'
                }`}
              >
                {selectedDocumentIds.includes(doc.id) && <Check className="w-3 h-3 text-white" />}
              </button>

              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: getDocBg(doc.file_type) }}>
                <DocIcon type={doc.file_type} />
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-ink-100 truncate">{doc.filename}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <StatusBadge status={doc.status} />
                  <span className="text-xs text-ink-600">
                    {formatDistanceToNow(new Date(doc.created_at), { addSuffix: true })}
                  </span>
                  {doc.duration_seconds && (
                    <span className="flex items-center gap-1 text-xs text-ink-500">
                      <Clock className="w-3 h-3" />
                      {formatDuration(doc.duration_seconds)}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={(e) => handleDelete(e, doc.id)}
                  className="p-1.5 rounded-lg text-ink-600 hover:text-red-400 hover:bg-red-400/10 transition-all"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
                {expandedDoc === doc.id
                  ? <ChevronUp className="w-4 h-4 text-ink-500" />
                  : <ChevronDown className="w-4 h-4 text-ink-500" />
                }
              </div>
            </div>

            {/* Expanded: summary + timestamps */}
            <AnimatePresence>
              {expandedDoc === doc.id && doc.status === 'completed' && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="px-3 pb-3 pt-1 space-y-3"
                    style={{ borderTop: '1px solid rgba(97,97,160,0.15)' }}>
                    {doc.summary && (
                      <div>
                        <p className="text-xs font-display font-semibold text-ink-400 uppercase tracking-wide mb-1.5">Summary</p>
                        <p className="text-xs text-ink-300 leading-relaxed line-clamp-4">{doc.summary}</p>
                      </div>
                    )}
                    {doc.timestamps && doc.timestamps.length > 0 && (
                      <div>
                        <p className="text-xs font-display font-semibold text-ink-400 uppercase tracking-wide mb-1.5">Topics</p>
                        <div className="flex flex-wrap gap-1.5">
                          {getUniqueTopics(doc.timestamps).slice(0, 8).map((t, i) => (
                            <TopicChip key={i} topic={t} docId={doc.id} timestamps={doc.timestamps!} />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}

function TopicChip({ topic, docId, timestamps }: { topic: string; docId: number; timestamps: any[] }) {
  const setPlayingMedia = useStore((s) => s.setPlayingMedia)
  const ts = timestamps.find((t) => t.topic === topic)

  return (
    <button
      onClick={() => ts && setPlayingMedia({ documentId: docId, startTime: ts.start })}
      className="timestamp-chip text-xs px-2 py-1 rounded-full"
    >
      {topic}
    </button>
  )
}

function getUniqueTopics(timestamps: any[]) {
  const seen = new Set<string>()
  return timestamps.filter((t) => {
    if (seen.has(t.topic)) return false
    seen.add(t.topic)
    return true
  }).map((t) => t.topic)
}

function DocIcon({ type }: { type: string }) {
  if (type === 'audio') return <Music className="w-4 h-4 text-blue-400" />
  if (type === 'video') return <Video className="w-4 h-4 text-purple-400" />
  return <FileText className="w-4 h-4 text-red-400" />
}

function getDocBg(type: string) {
  if (type === 'audio') return 'rgba(59,130,246,0.15)'
  if (type === 'video') return 'rgba(139,92,246,0.15)'
  return 'rgba(239,68,68,0.15)'
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    pending: '#6b7280',
    processing: '#f59e0b',
    completed: '#00ff88',
    failed: '#ef4444',
  }
  return (
    <span className="flex items-center gap-1 text-xs" style={{ color: colors[status] || '#6b7280' }}>
      <span className={`status-dot ${status}`} />
      {status}
    </span>
  )
}

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}
