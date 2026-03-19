import React from 'react';
import ReactDOM from 'react-dom/client';
import { AuthProvider } from './contexts/AuthContext';
import { PlanProvider } from './contexts/PlanContext';
import App from './App';
import './styles/index.css';

const applyStandaloneClass = () => {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const isStandalone =
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.navigator?.standalone === true;
  document.documentElement.classList.toggle('standalone-web-app', Boolean(isStandalone));
};

applyStandaloneClass();
window.addEventListener('DOMContentLoaded', applyStandaloneClass, { once: true });

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <PlanProvider>
        <App />
      </PlanProvider>
    </AuthProvider>
  </React.StrictMode>
);
