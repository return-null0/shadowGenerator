import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import ShadowGenerator from './ShadowCompositor.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ShadowGenerator/>
  </StrictMode>,
)
