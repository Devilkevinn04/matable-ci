import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.tsx';
import './index.css';

try {
  window.localStorage.removeItem('matable_registration_links');
} catch {
  // Storage may be unavailable in restricted browser contexts.
}

if ('serviceWorker' in navigator) {
  const isLocalDevelopment = ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);

  window.addEventListener('load', () => {
    if (isLocalDevelopment) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        registrations.forEach((registration) => registration.unregister());
      });
      if ('caches' in window) {
        caches.keys().then((cacheNames) => {
          cacheNames.filter((name) => name.startsWith('matable-ci-')).forEach((name) => caches.delete(name));
        });
      }
      return;
    }

    navigator.serviceWorker
      .register('/sw.js')
      .catch((error) => {
        console.warn('Service worker registration failed:', error);
      });
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
