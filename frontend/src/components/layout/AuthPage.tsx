import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, Mail, Lock, User, ArrowRight, Eye, EyeOff } from 'lucide-react'
import toast from 'react-hot-toast'
import { authApi } from '../../services/api'
import { useStore } from '../../store'

export default function AuthPage() {
  const navigate = useNavigate()
  const setAuth = useStore((s) => s.setAuth)
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [form, setForm] = useState({ email: '', username: '', password: '' })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const res = mode === 'login'
        ? await authApi.login({ email: form.email, password: form.password })
        : await authApi.register(form)
      setAuth(res.data.user, res.data.access_token)
      toast.success(mode === 'login' ? 'Welcome back!' : 'Account created!')
      navigate('/app')
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-ink-950 flex items-center justify-center relative overflow-hidden">
      {/* Background effects */}
      <div className="absolute inset-0 bg-grid-pattern opacity-30" />
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-spark-500/10 rounded-full blur-3xl" />
      <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl" />

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative z-10 w-full max-w-md px-6"
      >
        {/* Logo */}
        <div className="text-center mb-10">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 200, delay: 0.1 }}
            className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4"
            style={{ background: 'linear-gradient(135deg, #6d28d9, #3a3a6e)', boxShadow: '0 0 30px rgba(109,40,217,0.4)' }}
          >
            <Sparkles className="w-8 h-8 text-glow" />
          </motion.div>
          <h1 className="font-display text-3xl font-bold gradient-text">DocuAI</h1>
          <p className="text-ink-300 mt-1 text-sm">Intelligent Document & Media Analysis</p>
        </div>

        {/* Card */}
        <div className="glass-bright rounded-2xl p-8">
          {/* Tab switcher */}
          <div className="flex rounded-xl overflow-hidden mb-8 p-1" style={{ background: 'rgba(7,7,15,0.5)' }}>
            {(['login', 'register'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all duration-200 font-display ${
                  mode === m
                    ? 'bg-spark-500 text-white shadow-lg'
                    : 'text-ink-300 hover:text-white'
                }`}
              >
                {m === 'login' ? 'Sign In' : 'Create Account'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <AnimatePresence>
              {mode === 'register' && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                >
                  <InputField
                    icon={<User className="w-4 h-4" />}
                    placeholder="Username"
                    value={form.username}
                    onChange={(v) => setForm({ ...form, username: v })}
                    required
                  />
                </motion.div>
              )}
            </AnimatePresence>

            <InputField
              icon={<Mail className="w-4 h-4" />}
              placeholder="Email address"
              type="email"
              value={form.email}
              onChange={(v) => setForm({ ...form, email: v })}
              required
            />

            <div className="relative">
              <InputField
                icon={<Lock className="w-4 h-4" />}
                placeholder="Password"
                type={showPassword ? 'text' : 'password'}
                value={form.password}
                onChange={(v) => setForm({ ...form, password: v })}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400 hover:text-glow"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            <motion.button
              type="submit"
              disabled={loading}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="w-full btn-primary rounded-xl py-3 font-display font-semibold flex items-center justify-center gap-2 mt-2"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  {mode === 'login' ? 'Sign In' : 'Create Account'}
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </motion.button>
          </form>

          {/* Demo credentials hint */}
          <p className="text-center text-xs text-ink-500 mt-4">
            Demo: create a free account to get started
          </p>
        </div>
      </motion.div>
    </div>
  )
}

function InputField({
  icon, placeholder, type = 'text', value, onChange, required,
}: {
  icon: React.ReactNode
  placeholder: string
  type?: string
  value: string
  onChange: (v: string) => void
  required?: boolean
}) {
  return (
    <div className="relative">
      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400">{icon}</div>
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className="w-full pl-10 pr-4 py-3 rounded-xl text-sm text-ink-100 placeholder-ink-500 outline-none transition-all"
        style={{
          background: 'rgba(7,7,15,0.6)',
          border: '1px solid rgba(97,97,160,0.3)',
        }}
        onFocus={(e) => {
          e.target.style.borderColor = 'rgba(167,139,250,0.6)'
          e.target.style.boxShadow = '0 0 0 3px rgba(167,139,250,0.1)'
        }}
        onBlur={(e) => {
          e.target.style.borderColor = 'rgba(97,97,160,0.3)'
          e.target.style.boxShadow = 'none'
        }}
      />
    </div>
  )
}
