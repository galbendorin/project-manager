import React from 'react';
import { createRoot } from 'react-dom/client';
import { AuthProvider } from '../../../src/contexts/AuthContext';
import { PlanProvider } from '../../../src/contexts/PlanContext';
import App from '../../../src/App';
import '../../../src/styles/index.css';
import { clearCachedOfflineUser } from '../../../src/utils/offlineState';
import { signIn, resolveAccess } from './environment';

const restart = (restore = false) => {
  // Synthetic localhost storage only. Never point this fixture at a backend.
  clearCachedOfflineUser('q07-synthetic-owner');
  localStorage.setItem('pmworkspace:last-path:v1', JSON.stringify('/shopping'));
  window.location.href = restore ? '/' : '/shopping';
};
createRoot(document.getElementById('fixture-controls')).render(
  <div className="flex flex-wrap gap-2 p-4">
    <button onClick={signIn}>Resolve sign-in</button>
    <button onClick={() => resolveAccess(true)}>Allow tools</button>
    <button onClick={() => resolveAccess(false)}>Deny tools</button>
    <button onClick={() => restart()}>Restart direct launch</button>
    <button onClick={() => restart(true)}>Restart Home Screen launch</button>
  </div>
);
createRoot(document.getElementById('root')).render(
  <React.StrictMode><AuthProvider><PlanProvider><App /></PlanProvider></AuthProvider></React.StrictMode>
);
