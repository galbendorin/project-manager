import React, { useState, useCallback, useEffect, lazy, Suspense } from 'react';
import { useAuth } from './contexts/AuthContext';
import { useCheckoutStatus, CheckoutToast } from './hooks/useCheckoutStatus.jsx';
import OfflineBanner from './components/OfflineBanner';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import { applyAccentTheme, loadAccentTheme, saveAccentTheme } from './utils/appearance';
import { clearLastProject, loadLastAppPath, loadLastProject, saveLastAppPath, saveLastProject } from './utils/navigationState';

const AuthPage = lazy(() => import('./components/AuthPage'));
const LegalPage = lazy(() => import('./components/LegalPage'));
const PublicPricingPage = lazy(() => import('./components/PublicPricingPage'));
const ProjectSelector = lazy(() => import('./components/ProjectSelector'));
const MainApp = lazy(() => import('./components/AppWorkspaceShell').then((module) => ({ default: module.MainApp })));
const AuthenticatedTrackShell = lazy(() => import('./components/AppWorkspaceShell').then((module) => ({ default: module.AuthenticatedTrackShell })));
const AuthenticatedShoppingShell = lazy(() => import('./components/AppWorkspaceShell').then((module) => ({ default: module.AuthenticatedShoppingShell })));

const normalizeAppPath = (value = '/') => {
  const normalized = String(value || '/').replace(/\/+$/, '');
  return normalized || '/';
};

const PageFallback = ({ label = 'Loading...' }) => (
  <div className="min-h-screen bg-gray-900 flex items-center justify-center">
    <div className="text-gray-400 text-lg">{label}</div>
  </div>
);

const renderLazyPage = (node, label) => (
  <Suspense fallback={<PageFallback label={label} />}>
    {node}
  </Suspense>
);

const getUserDisplayName = (user) => {
  const fullName = String(user?.user_metadata?.full_name || '').trim();
  if (fullName) return fullName;

  const localPart = String(user?.email || '').split('@')[0].trim();
  if (!localPart) return '';

  return localPart
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
};

function App() {
  const { user, loading: authLoading, signOut, isPasswordRecovery } = useAuth();
  const checkoutStatus = useCheckoutStatus();
  const isOnline = useOnlineStatus();
  const [currentProject, setCurrentProject] = useState(null);
  const [accentTheme, setAccentTheme] = useState(() => loadAccentTheme());
  const [currentPath, setCurrentPath] = useState(() => (
    typeof window !== 'undefined'
      ? normalizeAppPath(window.location.pathname === '/' ? loadLastAppPath() : window.location.pathname)
      : '/'
  ));

  useEffect(() => {
    applyAccentTheme(accentTheme);
    saveAccentTheme(accentTheme);
  }, [accentTheme]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const handlePopState = () => {
      setCurrentPath(normalizeAppPath(window.location.pathname));
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigateToPath = useCallback((path) => {
    const nextPath = normalizeAppPath(path);
    if (typeof window !== 'undefined' && normalizeAppPath(window.location.pathname) !== nextPath) {
      window.history.pushState({}, '', nextPath);
    }
    setCurrentPath(nextPath);
    saveLastAppPath(nextPath);
  }, []);

  useEffect(() => {
    if (!user || currentProject || currentPath !== '/') return;

    const savedProject = loadLastProject();
    if (!savedProject?.id) return;
    setCurrentProject(savedProject);
  }, [currentPath, currentProject, user]);

  if (currentPath === '/privacy') {
    return renderLazyPage(<LegalPage page="privacy" />, 'Loading policy...');
  }

  if (currentPath === '/terms') {
    return renderLazyPage(<LegalPage page="terms" />, 'Loading terms...');
  }

  if (currentPath === '/cookie-storage-notice' || currentPath === '/cookies') {
    return renderLazyPage(<LegalPage page="cookies" />, 'Loading notice...');
  }

  if (currentPath === '/privacy-requests') {
    return renderLazyPage(<LegalPage page="privacy-requests" />, 'Loading privacy requests...');
  }

  if (currentPath === '/subprocessors') {
    return renderLazyPage(<LegalPage page="subprocessors" />, 'Loading subprocessors...');
  }

  if (currentPath === '/pricing') {
    return renderLazyPage(<PublicPricingPage />, 'Loading pricing...');
  }

  if (authLoading) {
    return (
      <>
        <OfflineBanner isOnline={isOnline} />
        <PageFallback label="Loading..." />
        <CheckoutToast status={checkoutStatus} />
      </>
    );
  }

  if (!user || isPasswordRecovery) {
    return (
      <>
        <OfflineBanner isOnline={isOnline} />
        {renderLazyPage(<AuthPage />, 'Loading sign in...')}
        <CheckoutToast status={checkoutStatus} />
      </>
    );
  }

  if (!currentProject) {
    return (
      <>
        <OfflineBanner isOnline={isOnline} />
        {currentPath === '/track'
          ? renderLazyPage(
              <AuthenticatedTrackShell
                currentUserId={user.id}
                userEmail={user.email}
                onGoToProjects={() => navigateToPath('/')}
                onSignOut={signOut}
                accentTheme={accentTheme}
                onAccentThemeChange={setAccentTheme}
              />,
              'Loading Timesheet...'
            )
          : currentPath === '/shopping'
            ? renderLazyPage(
                <AuthenticatedShoppingShell
                  currentUserId={user.id}
                  userEmail={user.email}
                  onGoToProjects={() => navigateToPath('/')}
                  onSignOut={signOut}
                  accentTheme={accentTheme}
                  onAccentThemeChange={setAccentTheme}
                />,
                'Loading Shopping List...'
              )
            : renderLazyPage(
                <ProjectSelector
                  onSelectProject={(project) => {
                    setCurrentProject(project);
                    saveLastProject(project);
                    navigateToPath('/');
                  }}
                  onOpenTrack={() => navigateToPath('/track')}
                  onOpenShopping={() => navigateToPath('/shopping')}
                  accentTheme={accentTheme}
                  onAccentThemeChange={setAccentTheme}
                />,
                'Loading projects...'
              )}
        <CheckoutToast status={checkoutStatus} />
      </>
    );
  }

  return (
    <>
      <OfflineBanner isOnline={isOnline} />
      {renderLazyPage(
        <MainApp
          project={currentProject}
          currentUserId={user.id}
          currentUserName={getUserDisplayName(user)}
          accentTheme={accentTheme}
          onAccentThemeChange={setAccentTheme}
          isOnline={isOnline}
          onBackToProjects={() => {
            setCurrentProject(null);
            clearLastProject();
            navigateToPath('/');
          }}
        />,
        'Loading project...'
      )}
      <CheckoutToast status={checkoutStatus} />
    </>
  );
}

export default App;
