import React, { useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';

// AuthProvider and its durable draft owner stay mounted above this boundary.
// Account-owned providers and views start fresh for each accepted sign-in,
// including sign-out/sign-in to the same account before React renders again.
export default function AccountAppBoundary({ children }) {
  const { user, shoppingDraftScope } = useAuth();
  const owner = useRef({ userId: user?.id || null, scope: shoppingDraftScope, epoch: 0 });
  const userId = user?.id || null;
  if (owner.current.userId !== userId || owner.current.scope !== shoppingDraftScope) {
    owner.current = { userId, scope: shoppingDraftScope, epoch: owner.current.epoch + 1 };
  }

  return <React.Fragment key={owner.current.epoch}>{children}</React.Fragment>;
}
