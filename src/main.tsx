// ============================================================
// PrismPane — Application Entry Point
// ============================================================

import React from 'react';
import ReactDOM from 'react-dom/client';
import '@tabler/core/dist/css/tabler.min.css';
import App from './App';
import './style.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);