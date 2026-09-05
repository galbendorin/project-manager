// Keep the initial session request from overwriting a newer auth event, and stop
// the offline fallback as soon as auth has resolved (including a signed-out user).
export const startAuthBootstrap = ({
  auth,
  onSession,
  onAuthStateChange,
  onError,
  onTimeout,
  timeoutMs = 4000,
}) => {
  let active = true;
  let receivedAuthEvent = false;
  const timeoutId = setTimeout(() => {
    if (active) onTimeout();
  }, timeoutMs);

  auth.getSession()
    .then(({ data: { session }, error }) => {
      if (!active || receivedAuthEvent) return;
      clearTimeout(timeoutId);
      if (error) onError(error);
      else onSession(session);
    })
    .catch((error) => {
      if (!active || receivedAuthEvent) return;
      clearTimeout(timeoutId);
      onError(error);
    });

  const { data: { subscription } } = auth.onAuthStateChange((event, session) => {
    if (!active) return;
    receivedAuthEvent = true;
    clearTimeout(timeoutId);
    onAuthStateChange(event, session);
  });

  return () => {
    active = false;
    clearTimeout(timeoutId);
    subscription.unsubscribe();
  };
};
