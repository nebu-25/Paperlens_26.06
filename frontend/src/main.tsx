import './lib/domGuards';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './components/App';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import { installChunkLoadReloadPrompt } from './lib/chunkLoad';
import './styles.css';

installChunkLoadReloadPrompt();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>,
);
