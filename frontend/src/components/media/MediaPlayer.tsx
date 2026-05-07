import React, { useRef, useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Play, Pause, Volume2, VolumeX, X, SkipBack, SkipForward, Maximize2 } from 'lucide-react'
import { useStore } from '../../store'
import { documentsApi } from '../../services/api'

export default function MediaPlayer() {
  const { playingMedia, setPlayingMedia, documents } = useStore()
  const audioRef = useRef<HTMLAudioElement | HTMLVideoElement | null>(null)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(1)
  const [muted, setMuted] = useState(false)

  const doc = documents.find((d) => d.id === playingMedia?.documentId)
  const isVideo = doc?.file_type === 'video'

  useEffect(() => {
    if (!playingMedia || !audioRef.current) return
    const el = audioRef.current as HTMLMediaElement
    el.currentTime = playingMedia.startTime
    el.play().then(() => setPlaying(true)).catch(() => {})
  }, [playingMedia?.startTime])

  const toggle = () => {
    const el = audioRef.current as HTMLMediaElement
    if (!el) return
    if (playing) { el.pause(); setPlaying(false) }
    else { el.play(); setPlaying(true) }
  }

  const handleTimeUpdate = () => {
    const el = audioRef.current as HTMLMediaElement
    if (!el) return
    setProgress(el.currentTime)
    setDuration(el.duration || 0)
  }

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = audioRef.current as HTMLMediaElement
    if (!el || !duration) return
    const rect = e.currentTarget.getBoundingClientRect()
    const ratio = (e.clientX - rect.left) / rect.width
    el.currentTime = ratio * duration
  }

  const formatTime = (s: number) => {
    if (!isFinite(s)) return '0:00'
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  const skip = (delta: number) => {
    const el = audioRef.current as HTMLMediaElement
    if (el) el.currentTime = Math.max(0, Math.min(duration, el.currentTime + delta))
  }

  if (!playingMedia || !doc) return null

  const src = documentsApi.streamUrl(doc.id)

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 100, opacity: 0 }}
        className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-full max-w-lg px-4"
      >
        <div className="media-player rounded-2xl p-4 shadow-2xl" style={{ boxShadow: '0 0 40px rgba(109,40,217,0.3)' }}>
          {/* Video element */}
          {isVideo && (
            <video
              ref={audioRef as React.RefObject<HTMLVideoElement>}
              src={src}
              className="w-full rounded-xl mb-3 max-h-48 object-contain bg-black"
              onTimeUpdate={handleTimeUpdate}
              onEnded={() => setPlaying(false)}
              muted={muted}
            />
          )}

          {/* Audio element */}
          {!isVideo && (
            <audio
              ref={audioRef as React.RefObject<HTMLAudioElement>}
              src={src}
              onTimeUpdate={handleTimeUpdate}
              onEnded={() => setPlaying(false)}
            />
          )}

          {/* Waveform visualization */}
          {!isVideo && (
            <div className="flex items-center justify-center gap-1 h-8 mb-3">
              {Array.from({ length: 20 }).map((_, i) => (
                <div
                  key={i}
                  className={`w-1 rounded-full transition-all ${playing ? 'waveform-bar' : ''}`}
                  style={{
                    height: playing ? undefined : '4px',
                    background: i / 20 < progress / duration
                      ? 'linear-gradient(to top, #6d28d9, #a78bfa)'
                      : 'rgba(97,97,160,0.3)',
                  }}
                />
              ))}
            </div>
          )}

          {/* Track info */}
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-ink-200 truncate flex-1 mr-4">{doc.filename}</p>
            <button onClick={() => setPlayingMedia(null)} className="text-ink-500 hover:text-ink-300">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Progress bar */}
          <div className="progress-bar h-1.5 cursor-pointer mb-3" onClick={seek}>
            <div className="progress-fill" style={{ width: duration ? `${(progress / duration) * 100}%` : '0%' }} />
          </div>

          {/* Time */}
          <div className="flex items-center justify-between mb-3 text-xs text-ink-500">
            <span>{formatTime(progress)}</span>
            <span>{formatTime(duration)}</span>
          </div>

          {/* Controls */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button onClick={() => setMuted(!muted)} className="text-ink-400 hover:text-glow">
                {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={muted ? 0 : volume}
                onChange={(e) => {
                  const v = parseFloat(e.target.value)
                  setVolume(v)
                  const el = audioRef.current as HTMLMediaElement
                  if (el) el.volume = v
                }}
                className="w-16 accent-purple-500"
              />
            </div>

            <div className="flex items-center gap-3">
              <button onClick={() => skip(-10)} className="text-ink-400 hover:text-glow">
                <SkipBack className="w-4 h-4" />
              </button>
              <motion.button
                onClick={toggle}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                className="w-10 h-10 rounded-full flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, #6d28d9, #4a4a8a)' }}
              >
                {playing ? <Pause className="w-4 h-4 text-white" /> : <Play className="w-4 h-4 text-white ml-0.5" />}
              </motion.button>
              <button onClick={() => skip(10)} className="text-ink-400 hover:text-glow">
                <SkipForward className="w-4 h-4" />
              </button>
            </div>

            <div className="w-24" /> {/* spacer */}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
