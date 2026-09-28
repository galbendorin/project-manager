/* global document, window */
// Included only by the dedicated Q04 preview build. No account/storage inspection.
(() => {
  const panel = document.createElement('details');
  panel.style.cssText = 'margin:10px;padding:12px;border:1px solid #9ca3af;border-radius:12px;background:#fff;color:#111';
  const heading = document.createElement('summary');
  heading.textContent = 'Q04 update check';
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Check update';
  button.style.cssText = 'min-height:44px;margin:10px 0;padding:8px 16px;border:1px solid #555;border-radius:8px;background:#fff;color:#111';
  const log = document.createElement('pre');
  log.setAttribute('aria-label', 'Q04 update results');
  log.setAttribute('aria-live', 'polite');
  log.style.cssText = 'white-space:pre-wrap;overflow-wrap:anywhere;font-size:14px';
  panel.append(heading, button, log);
  document.body.prepend(panel);
  const lines = [];
  const record = (value) => { lines.push(value); log.textContent = lines.slice(-18).join('\n'); };
  const state = (registration) => {
    record(`Controller: ${navigator.serviceWorker.controller?.state || 'none'}`);
    record(`Active: ${registration?.active?.state || 'none'}; waiting: ${registration?.waiting?.state || 'none'}; installing: ${registration?.installing?.state || 'none'}`);
  };
  const watched = new WeakSet();
  const watchWorker = (worker) => {
    if (!worker || watched.has(worker)) return;
    watched.add(worker);
    worker.addEventListener('statechange', () => record(`New worker: ${worker.state}`));
  };
  const within = async (promise) => {
    let timer;
    try {
      return await Promise.race([promise, new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Timed out')), 12000);
      })]);
    } finally { clearTimeout(timer); }
  };
  window.addEventListener('pmworkspace:update-available', () => record('App received update-available event.'));
  button.addEventListener('click', async () => {
    button.disabled = true;
    lines.length = 0;
    record(`Page: candidate 4; mode: ${navigator.standalone || window.matchMedia('(display-mode: standalone)').matches ? 'Home Screen' : 'browser'}`);
    record(`Online: ${navigator.onLine}; secure: ${window.isSecureContext}`);
    try {
      if (!('serviceWorker' in navigator)) { record('Service workers unavailable.'); return; }
      const registration = await within(navigator.serviceWorker.getRegistration());
      state(registration);
      const abort = new AbortController();
      const timer = setTimeout(() => abort.abort(), 12000);
      try {
        const response = await fetch('/sw.js', { cache: 'no-store', redirect: 'manual', signal: abort.signal });
        const type = response.headers.get('content-type') || 'unknown';
        record(`Worker response: ${response.status}; ${response.type}; ${type}`);
        if (response.ok && /(?:java|ecma)script/i.test(type)) {
          const source = await response.text();
          const version = source.match(/const PRECACHE_VERSION = ["']([a-f0-9]+)["']/)?.[1];
          record(`Server worker version: ${version || 'unrecognised'}`);
        }
      } catch (error) { record(`Worker fetch failed: ${error.name}`); }
      finally { clearTimeout(timer); }
      if (!registration) { record('No registration for this page.'); return; }
      watchWorker(registration.installing);
      if (!watched.has(registration)) {
        watched.add(registration);
        registration.addEventListener('updatefound', () => { record('Update found.'); watchWorker(registration.installing); });
      }
      record('Requesting update check…');
      try { await within(registration.update()); record('Update check returned.'); }
      catch (error) { record(`Update check failed: ${error.message === 'Timed out' ? 'Timed out' : error.name}`); }
      state(registration);
    } catch (error) { record(`Check failed: ${error.message === 'Timed out' ? 'Timed out' : error.name}`); }
    finally { button.disabled = false; }
  });
})();
