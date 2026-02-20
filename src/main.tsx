import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { BannerProvider, DialogProvider, ToastProvider } from './ui';
import './styles/globals.css';

window.addEventListener('error', (event) => {
  console.error('[Renderer] Unhandled error:', event.message, event.error);
  window.electronAPI?.reportRendererError?.({
    source: 'window.error',
    message: event.message,
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
    error: event.error instanceof Error
      ? { name: event.error.name, message: event.error.message, stack: event.error.stack }
      : String(event.error),
  });
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('[Renderer] Unhandled promise rejection:', event.reason);
  window.electronAPI?.reportRendererError?.({
    source: 'window.unhandledrejection',
    reason: event.reason instanceof Error
      ? { name: event.reason.name, message: event.reason.message, stack: event.reason.stack }
      : String(event.reason),
  });
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ToastProvider>
      <DialogProvider>
        <BannerProvider>
          <App />
        </BannerProvider>
      </DialogProvider>
    </ToastProvider>
  </React.StrictMode>
);
