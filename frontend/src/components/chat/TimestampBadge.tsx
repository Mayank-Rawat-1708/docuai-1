import React from 'react'
import { Play, Clock } from 'lucide-react'
import { useStore } from '../../store'

interface Props {
  timestamp: {
    document_id: number
    start_time: number
    end_time?: number
    text: string
  }
}

export default function TimestampBadge({ timestamp }: Props) {
  const setPlayingMedia = useStore((s) => s.setPlayingMedia)
  const documents = useStore((s) => s.documents)
  const doc = documents.find((d) => d.id === timestamp.document_id)

  if (!doc || doc.file_type === 'pdf') return null

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  return (
    <button
      onClick={() => setPlayingMedia({ documentId: timestamp.document_id, startTime: timestamp.start_time })}
      className="timestamp-chip flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-xl"
      title={timestamp.text}
    >
      <Play className="w-3 h-3" />
      <Clock className="w-3 h-3" />
      <span>{formatTime(timestamp.start_time)}</span>
      {timestamp.end_time && <span className="text-acid/60">→ {formatTime(timestamp.end_time)}</span>}
      <span className="ml-0.5 text-acid/80 max-w-[100px] truncate">{doc.filename}</span>
    </button>
  )
}
