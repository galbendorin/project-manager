import React, { useCallback, useEffect, useRef, useState } from 'react';

const messageFor = cause => ({
  LEGACY_SOURCE_CHANGED: 'This older draft changed. Any copy already saved remains in Saved drafts. Refresh and review the text again.',
  LEGACY_REVIEW_REQUIRED: 'Some of these groceries already have a submission. Check your list and pending additions before adding anything again.',
  JOURNAL_DRAFT_RETIRED: 'This text was already submitted. Check your list and pending additions.',
  JOURNAL_DRAFT_EXISTS: 'A saved copy already exists with different details. Check Saved drafts.',
}[cause?.code] || 'Older drafts could not be checked or saved. Their original copies are kept. Refresh and retry.');

export default function ShoppingLegacyDraftReview({ recovery, projectId, projectName, onOpen, onAccepted }) {
  const [snapshot, setSnapshot] = useState(null), [selected, setSelected] = useState('');
  const [error, setError] = useState(''), [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false), [checked, setChecked] = useState(false), [destination, setDestination] = useState('');
  const active = useRef(false), request = useRef(0), flight = useRef(false);
  const latest = useRef(recovery); latest.current = recovery;
  const current = useCallback(() => active.current && latest.current === recovery && recovery.isCurrent(), [recovery]);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const refresh = useCallback(async () => {
    const ticket = ++request.current;
    try {
      const next = await recovery.scan(projectId);
      if (!current() || ticket !== request.current) return;
      setSnapshot(next); setError('');
    } catch (cause) {
      if (current() && ticket === request.current && cause?.code !== 'JOURNAL_OWNER_CHANGED') {
        setSnapshot(null); setError(messageFor(cause));
      }
    }
  }, [projectId, recovery, current]);
  useEffect(() => {
    void refresh();
    const changed = () => { setChecked(false); setDestination(''); void refresh(); };
    window.addEventListener('storage', changed);
    return () => window.removeEventListener('storage', changed);
  }, [refresh]);
  const candidates = snapshot?.candidates.filter(item => item.status !== 'accepted') || [];
  const candidate = candidates.find(item => item.key === selected);
  const acceptedCount = snapshot?.candidates.filter(item => item.status === 'accepted').length || 0;
  const act = async () => {
    if (!candidate || !checked || flight.current || candidate.status !== 'review') return;
    flight.current = true; setBusy(true); setError(''); setMessage('');
    try {
      if (candidate.kind === 'plaintext') {
        const result = await recovery.createFromPlaintext(projectId, candidate, destination);
        if (!current()) return;
        onOpen(result.draftId);
        setMessage(result.state === 'accepted' ? 'This copy was already submitted. Check pending additions.' : 'Opened a new draft above. Check its details before tapping Add.');
      } else {
        await recovery.acceptStructured(projectId, candidate);
        if (!current()) return;
        // Acceptance is durable before wake; a failed wake is not new input.
        try { void Promise.resolve(onAccepted()).catch(() => {}); } catch { /* Main retry remains available. */ }
        setMessage('Submission recorded. Check pending additions for progress or changes.');
      }
      setChecked(false); setDestination(''); await refresh();
    } catch (cause) {
      if (current() && cause?.code !== 'JOURNAL_OWNER_CHANGED') setError(messageFor(cause));
    } finally { flight.current = false; if (current()) setBusy(false); }
  };
  if (!error && !message && !candidates.length && !snapshot?.unreadable && !acceptedCount) return null;
  return <details className="mt-3 rounded-2xl border border-slate-200 bg-white p-4">
    <summary className="cursor-pointer text-sm font-medium text-slate-800">Review older drafts{candidates.length ? ` (${candidates.length})` : ''}</summary>
    <p className="mt-2 text-sm text-slate-600">Older versions are kept on this device. They may overlap with groceries you already added.</p>
    <button type="button" className="pm-subtle-button mt-3 min-h-11 rounded-xl px-3 py-2 text-sm" disabled={busy} onClick={() => { setChecked(false); setDestination(''); void refresh(); }}>Refresh older drafts</button>
    {error && <p role="alert" className="mt-2 text-sm text-rose-700">{error}</p>}
    {message && <p role="status" className="mt-2 text-sm text-slate-700">{message}</p>}
    {snapshot?.unreadable > 0 && <p role="alert" className="mt-2 text-sm text-amber-800">{snapshot.unreadable} older record(s) could not be read. Their copies have been preserved.</p>}
    {acceptedCount > 0 && <p className="mt-2 text-sm text-slate-600">{acceptedCount} older version(s) already submitted. Check your list and pending additions.</p>}
    {candidates.length > 0 && <label className="mt-3 block text-sm text-slate-700">Older draft
      <select className="pm-input mt-1 w-full rounded-xl p-3" value={candidate?.key || ''} disabled={busy}
        onChange={event => { setSelected(event.target.value); setChecked(false); setDestination(''); setMessage(''); }}>
        <option value="">Choose text to review</option>
        {candidates.map(item => <option key={item.key} value={item.key}>{item.reference}: {item.text.slice(0, 75)}</option>)}
      </select>
    </label>}
    {candidate && <div className="mt-3 space-y-3 text-sm text-slate-700">
      <label className="block">Saved text<textarea readOnly className="pm-input mt-1 w-full rounded-xl p-3" rows={3} value={candidate.text}/></label>
      {candidate.kind === 'structured' && <ul className="list-inside list-disc break-words">
        {candidate.items.map(item => <li key={item.operationId}>{item.title}{item.quantityValue != null ? ` — ${item.quantityValue} ${item.quantityUnit || ''}` : ''}</li>)}
      </ul>}
      {candidate.status === 'conflict' ? <p role="alert" className="text-amber-800">Some items overlap with another submission or have conflicting details. Check your list and pending additions; this version cannot be added again here.</p> : <>
        {candidate.kind === 'plaintext' ? <>
          <p>This text has no saved list or submission history. Opening it creates new input; it cannot prove which groceries were already added.</p>
          <label className="block">List for this text<select className="pm-input mt-1 w-full rounded-xl p-3" value={destination} disabled={busy} onChange={event => setDestination(event.target.value)}>
            <option value="">Choose a list</option><option value={projectId}>{projectName}</option>
          </select></label>
          <p className="text-slate-500">To use another list, switch lists first and review the text there.</p>
        </> : <p>Submit these saved details to {projectName}. You can edit or cancel them in pending additions afterward.</p>}
        <label className="flex items-start gap-3 py-2"><input type="checkbox" className="mt-1 h-5 w-5 shrink-0" checked={checked} disabled={busy} onChange={event => setChecked(event.target.checked)}/>
          I checked my current list; these groceries still need adding.</label>
        <button type="button" className="pm-subtle-button min-h-11 rounded-xl px-3 py-2 font-medium" disabled={busy || !checked || (candidate.kind === 'plaintext' && destination !== projectId)} onClick={() => void act()}>
          {busy ? 'Checking saved details…' : candidate.kind === 'plaintext' ? 'Open as new draft' : 'Submit saved groceries'}
        </button>
      </>}
    </div>}
  </details>;
}
