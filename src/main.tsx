import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import LegalPage from './components/LegalPage.tsx';
import './index.css';

// Lightweight path-based routing for the standalone legal pages. They render on
// their own (no app logic) so they work as real, linkable URLs — required for
// the Google OAuth consent screen and to look legit to users.
const path = window.location.pathname.replace(/\/+$/, '');
let page = <App />;
if (path === '/privacidad' || path === '/privacy') {
  page = <LegalPage type="privacy" />;
} else if (path === '/terminos' || path === '/terms') {
  page = <LegalPage type="terms" />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {page}
  </StrictMode>,
);
