import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { installMockApiIfNeeded } from './lib/mockApi';
import './styles/global.css';

// Only takes effect when running via `npm run dev:renderer` (plain browser tab, no
// Electron preload present) — used solely for visual QA against the mockups.
installMockApiIfNeeded();

const container = document.getElementById('root');
if (!container) throw new Error('Root container not found');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>
);
