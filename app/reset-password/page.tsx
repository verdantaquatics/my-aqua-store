'use client'

import React, { useEffect, useState, Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { KeyRound, Loader2, Eye, EyeOff, CheckCircle2, AlertCircle } from 'lucide-react'
import { createClient } from '@/utils/supabase/client'
import { useStore } from '@/context/StoreContext'
import { useLanguage } from '@/context/LanguageContext'

const MIN_PASSWORD_LENGTH = 6

function ResetPasswordContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()
  const { settings } = useStore()
  const { isBangla } = useLanguage()

  const [checking, setChecking] = useState(true)
  const [hasSession, setHasSession] = useState(false)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const linkExpired = searchParams.get('error') === 'expired'

  // The email link signs the user in (via /auth/confirm) before landing here
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setHasSession(Boolean(data.user))
      setChecking(false)
    })
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg('')

    if (password.length < MIN_PASSWORD_LENGTH) {
      setErrorMsg(isBangla ? `পাসওয়ার্ড কমপক্ষে ${MIN_PASSWORD_LENGTH} অক্ষরের হতে হবে।` : `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`)
      return
    }
    if (password !== confirm) {
      setErrorMsg(isBangla ? 'দুটি পাসওয়ার্ড মিলছে না।' : 'The two passwords do not match.')
      return
    }

    setSaving(true)
    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      setErrorMsg(error.message || 'Could not update your password. Please request a new link.')
      setSaving(false)
      return
    }

    setDone(true)
    // Staff go to the dashboard, customers to their account
    const staffCheck = await fetch('/api/admin/me', { cache: 'no-store' }).catch(() => null)
    setTimeout(() => {
      router.push(staffCheck?.ok ? '/stradmn' : '/account')
      router.refresh()
    }, 1500)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-md bg-white p-8 rounded-2xl border border-slate-200 shadow-sm space-y-6">
        <div className="text-center space-y-2">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-600">
            <KeyRound className="h-6 w-6" />
          </div>
          <h1 className="text-lg font-black text-slate-950">
            {isBangla ? 'নতুন পাসওয়ার্ড সেট করুন' : 'Set a new password'}
          </h1>
          <p className="text-xs text-slate-500">{settings.store_name}</p>
        </div>

        {checking ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-6 w-6 animate-spin text-brand-600" />
          </div>
        ) : done ? (
          <div className="flex items-center gap-2 p-4 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl text-sm font-semibold">
            <CheckCircle2 className="h-5 w-5 flex-shrink-0" />
            <span>{isBangla ? 'পাসওয়ার্ড পরিবর্তন হয়েছে। আপনাকে নিয়ে যাওয়া হচ্ছে...' : 'Password updated. Taking you to your account...'}</span>
          </div>
        ) : !hasSession ? (
          <div className="space-y-4 text-center">
            <div className="flex items-start gap-2 p-4 bg-amber-50 text-amber-800 border border-amber-200 rounded-xl text-xs font-semibold text-left">
              <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <span>
                {linkExpired
                  ? (isBangla ? 'এই রিসেট লিংকটির মেয়াদ শেষ বা আগেই ব্যবহৃত হয়েছে।' : 'This reset link has expired or was already used.')
                  : (isBangla ? 'পাসওয়ার্ড রিসেট করতে ইমেইলের লিংকটি খুলুন।' : 'Open the link from your password reset email to continue.')}
              </span>
            </div>
            <p className="text-xs text-slate-500">
              {isBangla ? 'নতুন লিংক পেতে আবার "পাসওয়ার্ড ভুলে গেছেন?" ব্যবহার করুন।' : 'Request a new link with "Forgot password?" on the sign-in screen.'}
            </p>
            <div className="flex justify-center gap-3 text-xs font-bold">
              <Link href="/" className="text-brand-600 hover:text-brand-700">{isBangla ? 'হোম' : 'Store home'}</Link>
              <span className="text-slate-300">|</span>
              <Link href="/stradmn/login" className="text-slate-500 hover:text-slate-700">{isBangla ? 'স্টাফ লগইন' : 'Staff sign in'}</Link>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600 uppercase">
                {isBangla ? 'নতুন পাসওয়ার্ড' : 'New password'}
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 pr-10 text-sm outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600 uppercase">
                {isBangla ? 'পাসওয়ার্ড নিশ্চিত করুন' : 'Confirm new password'}
              </label>
              <input
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10"
              />
            </div>

            {errorMsg && (
              <p className="text-xs font-semibold text-red-600 bg-red-50 border border-red-200 rounded-lg p-2.5">{errorMsg}</p>
            )}

            <button
              type="submit"
              disabled={saving}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-3 text-sm font-bold text-white shadow-md hover:bg-brand-500 disabled:bg-slate-400 transition"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {isBangla ? 'পাসওয়ার্ড সংরক্ষণ করুন' : 'Save new password'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordContent />
    </Suspense>
  )
}
