import React, { useCallback, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { motion, AnimatePresence } from 'framer-motion'
import { Upload, FileText, Music, Video, X, Check, Loader2, AlertCircle } from 'lucide-react'
import { documentsApi } from '../../services/api'
import { useStore } from '../../store'
import toast from 'react-hot-toast'

const ACCEPT = {
  'application/pdf': ['.pdf'],
  'audio/mpeg': ['.mp3'],
  'audio/wav': ['.wav'],
  'audio/mp4': ['.m4a'],
  'audio/ogg': ['.ogg'],
  'video/mp4': ['.mp4'],
  'video/quicktime': ['.mov'],
  'video/webm': ['.webm'],
  'video/x-msvideo': ['.avi'],
}

interface UploadItem {
  file: File
  progress: number
  status: 'uploading' | 'done' | 'error'
  error?: string
}

interface Props {
  onUploaded?: () => void
}

export default function UploadZone({ onUploaded }: Props) {
  const addDocument = useStore((s) => s.addDocument)
  const [uploads, setUploads] = useState<Record<string, UploadItem>>({})

  const onDrop = useCallback(async (files: File[]) => {
    for (const file of files) {
      const key = `${file.name}-${Date.now()}`
      setUploads((prev) => ({
        ...prev,
        [key]: { file, progress: 0, status: 'uploading' },
      }))

      try {
        const res = await documentsApi.upload(file, (progress) => {
          setUploads((prev) => ({
            ...prev,
            [key]: { ...prev[key], progress },
          }))
        })

        addDocument(res.data.document)
        setUploads((prev) => ({ ...prev, [key]: { ...prev[key], status: 'done', progress: 100 } }))
        toast.success(`${file.name} uploaded! Processing in background...`)
        onUploaded?.()

        // Remove after 3s
        setTimeout(() => {
          setUploads((prev) => {
            const n = { ...prev }
            delete n[key]
            return n
          })
        }, 3000)
      } catch (err: any) {
        setUploads((prev) => ({
          ...prev,
          [key]: { ...prev[key], status: 'error', error: err.response?.data?.detail || 'Upload failed' },
        }))
        toast.error(`Failed to upload ${file.name}`)
      }
    }
  }, [addDocument, onUploaded])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPT,
    multiple: true,
    maxSize: 100 * 1024 * 1024,
  })

  const activeUploads = Object.entries(uploads)

  return (
    <div className="space-y-3">
      <div
        {...getRootProps()}
        className={`upload-zone rounded-2xl p-8 text-center cursor-pointer transition-all ${isDragActive ? 'active' : ''}`}
      >
        <input {...getInputProps()} />
        <motion.div
          animate={{ scale: isDragActive ? 1.05 : 1 }}
          className="flex flex-col items-center gap-3"
        >
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
            style={{ background: 'rgba(109,40,217,0.15)', border: '1px solid rgba(167,139,250,0.2)' }}>
            <Upload className="w-6 h-6 text-glow" />
          </div>
          <div>
            <p className="font-display font-semibold text-ink-200 text-sm">
              {isDragActive ? 'Drop files here' : 'Upload Documents & Media'}
            </p>
            <p className="text-xs text-ink-500 mt-1">PDF, MP3, WAV, MP4, MOV, WEBM up to 100MB</p>
          </div>
          <div className="flex gap-2 mt-1">
            {[
              { icon: FileText, label: 'PDF', color: '#ef4444' },
              { icon: Music, label: 'Audio', color: '#3b82f6' },
              { icon: Video, label: 'Video', color: '#8b5cf6' },
            ].map(({ icon: Icon, label, color }) => (
              <span key={label} className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full"
                style={{ background: `${color}15`, border: `1px solid ${color}30`, color }}>
                <Icon className="w-3 h-3" />
                {label}
              </span>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Upload progress */}
      <AnimatePresence>
        {activeUploads.map(([key, item]) => (
          <motion.div
            key={key}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="glass rounded-xl p-3 flex items-center gap-3"
          >
            <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(97,97,160,0.2)' }}>
              {getFileIcon(item.file.type)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-ink-200 truncate font-medium">{item.file.name}</p>
              {item.status === 'uploading' && (
                <div className="mt-1.5 progress-bar h-1.5 w-full">
                  <div className="progress-fill" style={{ width: `${item.progress}%` }} />
                </div>
              )}
              {item.status === 'error' && (
                <p className="text-xs text-red-400 mt-0.5">{item.error}</p>
              )}
            </div>
            <div className="flex-shrink-0">
              {item.status === 'uploading' && <Loader2 className="w-4 h-4 text-ink-400 animate-spin" />}
              {item.status === 'done' && <Check className="w-4 h-4 text-acid" />}
              {item.status === 'error' && <AlertCircle className="w-4 h-4 text-red-400" />}
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}

function getFileIcon(mimeType: string) {
  if (mimeType.startsWith('audio')) return <Music className="w-4 h-4 text-blue-400" />
  if (mimeType.startsWith('video')) return <Video className="w-4 h-4 text-purple-400" />
  return <FileText className="w-4 h-4 text-red-400" />
}
