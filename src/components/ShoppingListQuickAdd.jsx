import React from 'react';

export default function ShoppingListQuickAdd({
  AddIcon,
  LoaderIcon,
  MicIcon,
  MicOffIcon,
  draftTitle,
  handleAddSubmit,
  interimText,
  isListening,
  isMobile,
  savingItems,
  selectedProject,
  setDraftTitle,
  startListening,
  stopListening,
  voiceMessage,
  voiceSupported,
}) {
  return (
    <form
      onSubmit={handleAddSubmit}
      className="pm-surface-soft mt-5 rounded-[28px] p-4 sm:p-5"
    >
      <div className="mb-4">
        <p className="pm-kicker">Quick add</p>
        <h3 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-slate-950">
          {isMobile ? 'Quick add groceries' : 'Add groceries by text or voice'}
        </h3>
        <p className="mt-1 text-sm text-slate-500">
          {isMobile ? 'Type or say a few items for the live list.' : 'Type one item, or say a few items out loud and let the list split them for you.'}
        </p>
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="min-w-0 flex-1">
          <input
            type="text"
            value={draftTitle}
            onChange={(event) => setDraftTitle(event.target.value)}
            placeholder="Milk, eggs, tomatoes..."
            className="pm-input w-full rounded-2xl px-4 py-3 text-base text-slate-900 placeholder-slate-400 sm:text-sm"
            autoComplete="off"
          />
        </div>
        <button
          type="button"
          onClick={isListening ? stopListening : startListening}
          disabled={!voiceSupported}
          className={`rounded-2xl border px-4 py-3 text-sm font-semibold transition ${
            isListening
              ? 'border-[var(--pm-accent)] bg-[var(--pm-accent-soft)] text-[var(--pm-accent-strong)]'
              : 'pm-subtle-button'
          } ${!voiceSupported ? 'cursor-not-allowed opacity-50' : ''}`}
        >
          <span className="inline-flex items-center gap-2">
            {isListening ? <MicOffIcon className="h-4 w-4" /> : <MicIcon className="h-4 w-4" />}
            {isListening ? 'Stop' : 'Voice'}
          </span>
        </button>
        <button
          type="submit"
          disabled={savingItems || !draftTitle.trim() || !selectedProject}
          className="pm-toolbar-primary rounded-2xl px-5 py-3 text-sm font-semibold text-white transition disabled:bg-slate-200 disabled:text-slate-400"
        >
          <span className="inline-flex items-center gap-2">
            {savingItems ? <LoaderIcon className="h-4 w-4 animate-spin" /> : <AddIcon className="h-4 w-4" />}
            Add
          </span>
        </button>
      </div>

      <div className="mt-3 flex flex-col gap-1 text-xs text-slate-500">
        <span>{interimText ? `Hearing: ${interimText}` : voiceMessage || 'Say “milk, eggs, bread” for a quick grocery add.'}</span>
        {!voiceSupported ? (
          <span>This browser does not expose speech recognition, so voice add is unavailable here.</span>
        ) : null}
      </div>
    </form>
  );
}
