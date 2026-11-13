import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import { api, type SessionUser } from '@/lib/api'
import { accessToken, supabase } from '@/lib/supabase'
import { setRefData } from '@/lib/engine'
import { toast } from '@/components/ui/overlay'

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 } },
  mutationCache: new MutationCache({ onError: (e) => toast.error('Could not save', e instanceof Error ? e.message : undefined) }),
})

const root = createRoot(document.getElementById('root')!)

// Opening the "reset password" email link signs the person in with a recovery session: ask for the new password first
let recovering = /type=(recovery|invite|magiclink|signup)/.test(window.location.hash)

async function showLogin(mode: 'signin' | 'newPassword' = 'signin', error?: string) {
  const { LoginPage } = await import('./features/auth/LoginPage')
  root.render(<StrictMode><LoginPage initialMode={mode} initialError={error} onSignedIn={() => { recovering = false; window.history.replaceState(null, '', window.location.pathname + window.location.search); void start() }} /></StrictMode>)
}

async function start() {
  if (!supabase) return showLogin()
  if (recovering) return showLogin('newPassword')
  if (!(await accessToken())) return showLogin()
  // Who is signed in, and may they use the app?
  let user: SessionUser
  try {
    user = await api.me()
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (/sign in|expired|blocked|not allowed|401|403/i.test(msg)) {
      await supabase.auth.signOut()
      return showLogin('signin', /blocked|not allowed/i.test(msg) ? msg : undefined)
    }
    return cannotReach(msg)
  }
  try {
    // The catalog and prices come from the database. They must be in place before any screen is loaded.
    setRefData(await api.refData())
  } catch (e) {
    return cannotReach(e instanceof Error ? e.message : String(e))
  }
  queryClient.setQueryData(['me'], user)
  const { default: App } = await import('./App')
  root.render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </QueryClientProvider>
    </StrictMode>,
  )
}

supabase?.auth.onAuthStateChange((event) => {
  if (event === 'PASSWORD_RECOVERY') { recovering = true; void start() }
})

function cannotReach(message: string) {
  root.render(
    <div style={{ padding: 32, fontFamily: 'Inter, system-ui, sans-serif' }}>
      <h1 style={{ fontSize: 18, fontWeight: 600 }}>Cannot reach the System Design API</h1>
      <p style={{ marginTop: 8, color: '#555' }}>{message}</p>
      <p style={{ marginTop: 8, color: '#555' }}>Start the API (npm run dev) and reload.</p>
    </div>,
  )
}

// A session that runs out mid-work brings the sign-in page back
let restarting = false
window.addEventListener('sd:signed-out', () => {
  if (restarting) return
  restarting = true
  queryClient.clear()
  void start().finally(() => { restarting = false })
})
void start()
