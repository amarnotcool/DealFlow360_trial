import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import App from './App';
import { AuthProvider } from './context/AuthContext';
import { PortalAuthProvider } from './context/PortalAuthContext';
import './index.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element #root not found');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <PortalAuthProvider>
          <App />
        </PortalAuthProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
