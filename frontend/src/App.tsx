
import { lazy, Suspense } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { LandingPage } from './pages/LandingPage'

const RouteStudio = lazy(() =>
  import('./pages/RouteStudio').then(module => ({
    default: module.RouteStudio,
  }))
)

function StudioLoading() {
  return (
    <div
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '16px',
        background: '#071D20',
        color: '#AEE033',
        fontFamily: 'sans-serif',
      }}
    >
      <div
        style={{
          width: '36px',
          height: '36px',
          border: '2px solid #2F6467',
          borderTopColor: '#AEE033',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }}
      />

      <span
        style={{
          fontSize: '11px',
          fontWeight: 600,
          letterSpacing: '0.18em',
        }}
      >
        PREPARING YOUR ROUTE STUDIO
      </span>

      <style>
        {`@keyframes spin {
          to { transform: rotate(360deg); }
        }`}
      </style>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />

        <Route
          path="/studio"
          element={
            <Suspense fallback={<StudioLoading />}>
              <RouteStudio />
            </Suspense>
          }
        />
      </Routes>
    </BrowserRouter>
  )
}
