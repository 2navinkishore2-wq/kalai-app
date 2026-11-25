import React from 'react';
import ReactDOM from 'react-dom/client';
import './theme.css';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { initOfflineCache } from './lib/serviceWorker';

// Web/PWA: register the offline worker. Android: never register it, and clear
// one installed by an older APK so this APK's files are the ones that run.
initOfflineCache();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
