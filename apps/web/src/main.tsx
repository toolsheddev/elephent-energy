import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import { api } from '@/lib/api'
import { setRefData } from '@/lib/engine'
import { toast } from '@/components/ui/overlay'

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 } },
  mutationCache: new MutationCache({ onError: (e) => toast.error('Could not save', e instanceof Error ? e.message : undefined) }),
})

const root = createRoot(document.getElementById('root')!)

async function start() {
  try {
    // The catalog and prices come from the database. They must be in place before any screen is loaded.
    setRefData(await api.refData())
  } catch (e) {
    root.render(
      <div style={{ padding: 32, fontFamily: 'Inter, system-ui, sans-serif' }}>
        <h1 style={{ fontSize: 18, fontWeight: 600 }}>Cannot reach the System Design API</h1>
        <p style={{ marginTop: 8, color: '#555' }}>{e instanceof Error ? e.message : String(e)}</p>
        <p style={{ marginTop: 8, color: '#555' }}>Start the database and API (npm run db:start, then npm run api) and reload.</p>
      </div>,
    )
    return
  }
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
void start()
