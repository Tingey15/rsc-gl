import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
// Self-hosted UI font (no external font service).
import '@fontsource-variable/inter';
import './styles.css';

// StrictMode mounts everything twice in development, which would distort the
// benchmark's timings; the benchmark page opts out when loaded directly.
const strict = !window.location.pathname.startsWith('/benchmark');
createRoot(document.getElementById('root')!).render(
  strict ? (
    <StrictMode>
      <App />
    </StrictMode>
  ) : (
    <App />
  ),
);
