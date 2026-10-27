import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import StagingBar, { isStagingBuild } from './components/StagingBar.jsx';
import './i18n/index.js';
import './index.css';
import { startErrorReports } from './lib/errorReports.js';
import { installStaleChunkReload } from './lib/version.js';

installStaleChunkReload();
// Crash reports, when the build was given VITE_SENTRY_DSN; otherwise nothing at all.
startErrorReports();

// The do-nothing service worker that lets browsers offer "Install" (see public/sw.js). It never caches anything.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
      {isStagingBuild && <StagingBar />}
    </BrowserRouter>
  </React.StrictMode>,
);
