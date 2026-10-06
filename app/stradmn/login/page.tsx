'use client'

import React, { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import { useStore } from '@/context/StoreContext'
import { ShieldCheck, Loader2, Eye, EyeOff } from 'lucide-react'

export const dynamic = 'force-dynamic'

function AdminLoginContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()
  const { settings } = useStore()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [forgotMode, setForgotMode] = useState(false)
  const [resetSent, setResetSent] = useState(false)

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setErrorMessage('')
    try {
      await fetch('/api/customer/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'forgot-password', email: email.toLowerCase().trim() })
      })
      setResetSent(true)
    } catch {
      setErrorMessage('Could not send the reset email. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const errorParam = searchParams.get('error')
    if (errorParam === 'suspended') {
      setErrorMessage('Your staff account is currently suspended. Please contact the store owner.')
    } else if (errorParam === 'unauthorized') {
      setErrorMessage('You do not have permission to access the management portal.')
    }
  }, [searchParams])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setErrorMessage('')

    try {
      const cleanEmail = email.toLowerCase().trim()
      const { data, error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      })

      if (error) {
        throw error
      }

      const user = data.user
      if (!user) {
        throw new Error('Authentication failed.')
      }

      // Staff access is decided server-side (staff_members table only)
      const accessRes = await fetch('/api/admin/me', { cache: 'no-store' })
      if (accessRes.ok) {
        router.push('/stradmn')
        router.refresh()
        return
      }

      const accessJson = await accessRes.json().catch(() => ({}))
      await supabase.auth.signOut()
      setErrorMessage(accessJson.error || 'Access denied. This account does not have dashboard access permissions.')
      setLoading(false)

    } catch (err: any) {
      console.error(err)
      setErrorMessage(err.message || 'Invalid login credentials.')
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8 bg-slate-900 p-8 rounded-2xl border border-slate-800 shadow-2xl">
        <div className="text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand-500/10 text-brand-400 border border-brand-500/20 shadow-inner">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {settings.logo_url ? (
              <img src={settings.logo_url} alt="" className="h-9 w-9 rounded-full object-cover" />
            ) : (
              <ShieldCheck className="h-7 w-7" />
            )}
          </div>
          <h2 className="mt-5 text-center text-2xl font-extrabold tracking-tight text-white">
            {settings.store_name} Management
          </h2>
          <p className="mt-1.5 text-xs text-slate-400">
            Sign in to manage catalog, inventory, settings, and orders.
          </p>
        </div>

        <form onSubmit={forgotMode ? handleForgot : handleLogin} className="mt-6 space-y-5">
          <div className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Email Address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@example.com"
                className="w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3.5 py-2.5 text-sm text-white outline-none placeholder:text-slate-500 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10 transition-all"
              />
            </div>

            {!forgotMode && (
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => { setForgotMode(true); setResetSent(false); setErrorMessage('') }}
                  className="text-xs font-semibold text-brand-400 hover:text-brand-300"
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-lg border border-slate-700 bg-slate-800/80 pl-3.5 pr-10 py-2.5 text-sm text-white outline-none placeholder:text-slate-500 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10 transition-all font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 p-1"
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          )}
          </div>

          {forgotMode && resetSent && (
            <p className="text-xs font-semibold text-emerald-300 text-center bg-emerald-950/50 p-2.5 rounded border border-emerald-800/50">
              If this email has an account, a reset link is on its way. Check your inbox and spam folder.
            </p>
          )}

          {errorMessage && (
            <p className="text-xs font-semibold text-red-400 text-center bg-red-950/50 p-2.5 rounded border border-red-800/50">
              {errorMessage}
            </p>
          )}

          <div>
            <button
              type="submit"
              disabled={loading}
              className="group relative flex w-full justify-center rounded-lg bg-brand-600 px-4 py-3 text-sm font-bold text-white shadow-md hover:bg-brand-500 disabled:bg-slate-800 disabled:text-slate-500 focus:outline-none transition-all duration-200"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {forgotMode ? 'Sending...' : 'Verifying...'}
                </>
              ) : (
                forgotMode ? 'Email me a reset link' : 'Sign In to Dashboard'
              )}
            </button>
            {forgotMode && (
              <button
                type="button"
                onClick={() => { setForgotMode(false); setErrorMessage('') }}
                className="mt-3 w-full text-center text-xs font-semibold text-slate-400 hover:text-slate-200"
              >
                Back to sign in
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}

export default function AdminLoginPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
        <Loader2 className="h-8 w-8 animate-spin text-brand-500" />
      </div>
    }>
      <AdminLoginContent />
    </Suspense>
  )
}
