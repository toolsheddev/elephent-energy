import { useState } from 'react'
import { Button } from '@/components/ui/core'
import { Input } from '@/components/ui/form'
import { supabase } from '@/lib/supabase'

type Mode = 'signin' | 'forgot' | 'newPassword'

/** Sign-in through Supabase Auth: sign in, request a reset email, and set a new password from the email link.
 *  Form on the left, the Elephant mark on the right; the right panel uses the logo's own background (#26283a) so the image has no visible edge. */
export function LoginPage({ initialMode = 'signin', initialError, onSignedIn }: { initialMode?: Mode; initialError?: string; onSignedIn: () => void }) {
  const [mode, setMode] = useState<Mode>(initialMode)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [error, setError] = useState(initialError ?? '')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setError(''); setNotice('')
    try { await fn() } catch (e) { setError(e instanceof Error ? e.message : String(e)) } finally { setBusy(false) }
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const sb = supabase
    if (!sb) return
    if (mode === 'signin') {
      void run(async () => {
        const { error: err } = await sb.auth.signInWithPassword({ email: email.trim(), password })
        if (err) throw new Error(err.message === 'Invalid login credentials' ? 'Wrong email or password.' : err.message)
        onSignedIn()
      })
    } else if (mode === 'forgot') {
      void run(async () => {
        const { error: err } = await sb.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/` })
        if (err) throw new Error(err.message)
        setNotice('If that email has an account, a link to set a new password is on its way.')
      })
    } else {
      void run(async () => {
        if (password.length < 8) throw new Error('Use at least 8 characters.')
        if (password !== password2) throw new Error('The two passwords do not match.')
        const { error: err } = await sb.auth.updateUser({ password })
        if (err) throw new Error(err.message)
        onSignedIn()
      })
    }
  }

  const title = mode === 'signin' ? 'System Design' : mode === 'forgot' ? 'Reset your password' : 'Choose a password'
  const intro = mode === 'signin' ? 'Sign in with your work email to design and price systems.'
    : mode === 'forgot' ? 'Enter your work email and we will send you a link to set a new password.'
      : 'Choose the password you will use to sign in.'

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4 py-8">
      <div className="grid w-full max-w-[880px] overflow-hidden rounded-xl border border-line bg-surface md:min-h-[520px] md:grid-cols-2">
        <form onSubmit={submit} noValidate className="flex flex-col justify-center px-8 py-10 sm:px-12">
          <p className="text-[12.5px] font-semibold uppercase tracking-wider text-brand-700">Elephant Energy</p>
          <h1 className="mt-1 text-[24px] font-extrabold leading-tight tracking-tight">{title}</h1>
          <p className="mt-1.5 text-[14px] text-ink-3">{intro}</p>

          {!supabase ? (
            <p role="alert" className="mt-8 rounded-md bg-warn-bg px-3 py-2 text-[13px] text-warn">
              Sign-in is not set up: add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to the environment and rebuild.
            </p>
          ) : (
            <div className="mt-8 space-y-4">
              {mode !== 'newPassword' && (
                <Input label="Work email" type="email" autoComplete="username" autoFocus required value={email} onChange={(e) => setEmail(e.target.value)} className="h-10" />
              )}
              {mode === 'signin' && (
                <Input label="Password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className="h-10" />
              )}
              {mode === 'newPassword' && (
                <>
                  <Input label="New password" type="password" autoComplete="new-password" autoFocus required value={password} onChange={(e) => setPassword(e.target.value)} className="h-10" />
                  <Input label="Repeat new password" type="password" autoComplete="new-password" required value={password2} onChange={(e) => setPassword2(e.target.value)} className="h-10" />
                </>
              )}
              {error && <p role="alert" className="rounded-md bg-bad-bg px-3 py-2 text-[13px] text-bad">{error}</p>}
              {notice && <p role="status" className="rounded-md bg-ok-bg px-3 py-2 text-[13px] text-ok">{notice}</p>}
              <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy}
                disabled={mode === 'signin' ? !email || !password : mode === 'forgot' ? !email : !password || !password2}>
                {mode === 'signin' ? 'Sign in' : mode === 'forgot' ? 'Send link' : 'Save password'}
              </Button>
              {mode === 'signin' && (
                <button type="button" onClick={() => { setMode('forgot'); setError(''); setNotice('') }} className="cursor-pointer text-[13px] font-semibold text-brand-700 hover:underline">Forgot password?</button>
              )}
              {mode === 'forgot' && (
                <button type="button" onClick={() => { setMode('signin'); setError(''); setNotice('') }} className="cursor-pointer text-[13px] font-semibold text-brand-700 hover:underline">Back to sign in</button>
              )}
            </div>
          )}

          <p className="mt-6 text-[12.5px] text-ink-3">No account? Ask an admin to invite you.</p>
        </form>

        <div className="relative hidden items-center justify-center bg-[#26283a] md:flex">
          <img src="/image.png" alt="Elephant Energy" width={447} height={447} className="w-[78%] max-w-[360px]" />
        </div>
      </div>
    </div>
  )
}
