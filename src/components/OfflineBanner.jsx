import React from 'react';

export default function OfflineBanner({ isOnline }) {
  if (isOnline) return null;

  return (
    <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
      You&apos;re offline. Cached work stays available, and new changes will sync when your connection returns.
    </div>
  );
}
