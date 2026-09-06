import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import App from './App';
import { AuthProvider } from './context/AuthContext';
import { NavProvider } from './context/NavContext';
import { PortalAuthProvider } from './context/PortalAuthContext';
import './index.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element #root not found');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    {/* Opt in to the React Router v7 behaviours now, so the console stays clean
        and the upgrade is a no-op. */}
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AuthProvider>
        <PortalAuthProvider>
          <NavProvider>
            <App />
          </NavProvider>
        </PortalAuthProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
