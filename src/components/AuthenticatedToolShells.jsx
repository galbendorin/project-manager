import React, { lazy } from 'react';
import AuthenticatedMiniToolShell from './AuthenticatedMiniToolShell';

const TimesheetView = lazy(() => import('./TimesheetView'));
const ShoppingListView = lazy(() => import('./ShoppingListView'));
const MealPlannerView = lazy(() => import('./MealPlannerView'));
const BabyView = lazy(() => import('./BabyView'));
const HabitsView = lazy(() => import('./HabitsView'));
const WeightTrackerView = lazy(() => import('./WeightTrackerView'));
const ItilQuizView = lazy(() => import('./ItilQuizView'));

export function AuthenticatedTrackShell({
  currentUserId,
  userEmail,
  onGoToProjects,
  onSignOut,
  accentTheme,
  onAccentThemeChange,
}) {
  return (
    <AuthenticatedMiniToolShell
      accentTheme={accentTheme}
      fallbackLabel="Loading Timesheet..."
      onAccentThemeChange={onAccentThemeChange}
      onGoToProjects={onGoToProjects}
      onSignOut={onSignOut}
      title="Timesheet"
      userEmail={userEmail}
    >
      <TimesheetView currentUserId={currentUserId} />
    </AuthenticatedMiniToolShell>
  );
}

export function AuthenticatedShoppingShell({
  currentUserId,
  userEmail,
  onGoToProjects,
  onSignOut,
  accentTheme,
  onAccentThemeChange,
}) {
  return (
    <AuthenticatedMiniToolShell
      accentTheme={accentTheme}
      fallbackLabel="Loading Shopping List..."
      onAccentThemeChange={onAccentThemeChange}
      onGoToProjects={onGoToProjects}
      onSignOut={onSignOut}
      title="Shopping List"
      userEmail={userEmail}
    >
      <ShoppingListView currentUserId={currentUserId} />
    </AuthenticatedMiniToolShell>
  );
}

export function AuthenticatedMealPlannerShell({
  currentUserId,
  userEmail,
  onGoToProjects,
  onSignOut,
  accentTheme,
  onAccentThemeChange,
}) {
  return (
    <AuthenticatedMiniToolShell
      accentTheme={accentTheme}
      fallbackLabel="Loading Meal Planner..."
      onAccentThemeChange={onAccentThemeChange}
      onGoToProjects={onGoToProjects}
      onSignOut={onSignOut}
      title="Meal Planner"
      userEmail={userEmail}
    >
      <MealPlannerView currentUserId={currentUserId} currentUserEmail={userEmail} />
    </AuthenticatedMiniToolShell>
  );
}

export function AuthenticatedBabyShell({
  currentUserId,
  userEmail,
  onGoToProjects,
  onSignOut,
  accentTheme,
  onAccentThemeChange,
}) {
  return (
    <AuthenticatedMiniToolShell
      accentTheme={accentTheme}
      fallbackLabel="Loading Baby..."
      onAccentThemeChange={onAccentThemeChange}
      onGoToProjects={onGoToProjects}
      onSignOut={onSignOut}
      title="Baby"
      userEmail={userEmail}
    >
      <BabyView currentUserId={currentUserId} />
    </AuthenticatedMiniToolShell>
  );
}

export function AuthenticatedHabitsShell({
  currentUserId,
  userEmail,
  onGoToProjects,
  onSignOut,
  accentTheme,
  onAccentThemeChange,
}) {
  return (
    <AuthenticatedMiniToolShell
      accentTheme={accentTheme}
      fallbackLabel="Loading Habits..."
      onAccentThemeChange={onAccentThemeChange}
      onGoToProjects={onGoToProjects}
      onSignOut={onSignOut}
      title="Habits"
      userEmail={userEmail}
    >
      <HabitsView currentUserId={currentUserId} />
    </AuthenticatedMiniToolShell>
  );
}

export function AuthenticatedWeightShell({
  currentUserId,
  userEmail,
  onGoToProjects,
  onSignOut,
  accentTheme,
  onAccentThemeChange,
}) {
  return (
    <AuthenticatedMiniToolShell
      accentTheme={accentTheme}
      fallbackLabel="Loading Weight Tracker..."
      onAccentThemeChange={onAccentThemeChange}
      onGoToProjects={onGoToProjects}
      onSignOut={onSignOut}
      title="Weight Tracker"
      userEmail={userEmail}
    >
      <WeightTrackerView currentUserId={currentUserId} />
    </AuthenticatedMiniToolShell>
  );
}

export function AuthenticatedItilQuizShell({
  currentUserId,
  userEmail,
  onGoToProjects,
  onSignOut,
  accentTheme,
  onAccentThemeChange,
}) {
  return (
    <AuthenticatedMiniToolShell
      accentTheme={accentTheme}
      fallbackLabel="Loading ITIL Quiz..."
      onAccentThemeChange={onAccentThemeChange}
      onGoToProjects={onGoToProjects}
      onSignOut={onSignOut}
      title="ITIL Foundation Quiz"
      userEmail={userEmail}
    >
      <ItilQuizView currentUserId={currentUserId} />
    </AuthenticatedMiniToolShell>
  );
}
