import React, { useState, useCallback, useEffect, lazy, Suspense } from 'react';
import { useAuth } from './contexts/AuthContext';
import { useCheckoutStatus, CheckoutToast } from './hooks/useCheckoutStatus.jsx';
import OfflineBanner from './components/OfflineBanner';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import { applyAccentTheme, loadAccentTheme, saveAccentTheme } from './utils/appearance';
import { clearLastProject, loadLastAppPath, loadLastProject, saveLastAppPath, saveLastProject } from './utils/navigationState';
import { readAppShortcutIntent } from './utils/appShortcutIntent';
import { activatePendingServiceWorker } from './utils/registerServiceWorker';

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

const getInitialAppPath = () => {
  if (typeof window === 'undefined') return '/';

  const pathname = normalizeAppPath(window.location.pathname);
  const shortcutIntent = readAppShortcutIntent(window.location.search);
  if (pathname === '/' && shortcutIntent) {
    return '/';
  }

  return pathname === '/' ? loadLastAppPath() : pathname;
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
  const [currentPath, setCurrentPath] = useState(() => getInitialAppPath());
  const [launchShortcut, setLaunchShortcut] = useState(() => (
    typeof window !== 'undefined' ? readAppShortcutIntent(window.location.search) : null
  ));
  const [updateReady, setUpdateReady] = useState(false);
  const [applyingUpdate, setApplyingUpdate] = useState(false);

  useEffect(() => {
    applyAccentTheme(accentTheme);
    saveAccentTheme(accentTheme);
  }, [accentTheme]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const handlePopState = () => {
      setCurrentPath(normalizeAppPath(window.location.pathname));
      setLaunchShortcut(readAppShortcutIntent(window.location.search));
    };

    const handleUpdateAvailable = () => {
      setUpdateReady(true);
    };

    const handleControllerChanged = () => {
      if (!applyingUpdate) return;
      window.location.reload();
    };

    window.addEventListener('popstate', handlePopState);
    window.addEventListener('pmworkspace:update-available', handleUpdateAvailable);
    window.addEventListener('pmworkspace:controller-changed', handleControllerChanged);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('pmworkspace:update-available', handleUpdateAvailable);
      window.removeEventListener('pmworkspace:controller-changed', handleControllerChanged);
    };
  }, [applyingUpdate]);

  const navigateToPath = useCallback((path) => {
    const nextPath = normalizeAppPath(path);
    if (typeof window !== 'undefined' && normalizeAppPath(window.location.pathname) !== nextPath) {
      window.history.pushState({}, '', nextPath);
    }
    setCurrentPath(nextPath);
    saveLastAppPath(nextPath);
  }, []);

  const openProjectSelector = useCallback(() => {
    setCurrentProject(null);
    clearLastProject();
    navigateToPath('/');
  }, [navigateToPath]);

  const handleApplyUpdate = useCallback(() => {
    setApplyingUpdate(true);
    const activated = activatePendingServiceWorker();
    if (!activated) {
      window.location.reload();
      return;
    }

    window.setTimeout(() => {
      window.location.reload();
    }, 2500);
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
                onGoToProjects={openProjectSelector}
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
                  onGoToProjects={openProjectSelector}
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
      {updateReady ? (
        <div className="fixed inset-x-4 bottom-4 z-[70] flex justify-center">
          <div className="flex max-w-xl items-center gap-3 rounded-2xl border border-indigo-200 bg-white px-4 py-3 shadow-[0_18px_40px_rgba(15,23,42,0.16)]">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-slate-950">Update ready</div>
              <div className="text-xs text-slate-600">
                A new version of PM Workspace is available.
              </div>
            </div>
            <button
              type="button"
              onClick={handleApplyUpdate}
              className="whitespace-nowrap rounded-xl bg-[var(--pm-accent)] px-3 py-2 text-xs font-semibold text-white transition hover:brightness-95"
            >
              {applyingUpdate ? 'Updating…' : 'Update now'}
            </button>
          </div>
        </div>
      ) : null}
      {renderLazyPage(
        <MainApp
          project={currentProject}
          currentUserId={user.id}
          currentUserName={getUserDisplayName(user)}
          accentTheme={accentTheme}
          onAccentThemeChange={setAccentTheme}
          isOnline={isOnline}
          launchShortcut={currentPath === '/' ? launchShortcut : null}
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
