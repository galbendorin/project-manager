import React from 'react';
import { LEGAL_NAV_ITEMS, getLegalPage, LAST_UPDATED } from '../utils/legalContent';
import { COMPANY_NAME, PRODUCT_NAME } from '../utils/feedback';

function SectionContent({ section }) {
  return (
    <section className="rounded-[28px] border border-slate-200 bg-[#faf8f2] p-5 shadow-[0_18px_40px_-34px_rgba(15,23,42,0.28)]">
      <h2 className="text-lg font-semibold text-slate-950">{section.heading}</h2>

      {Array.isArray(section.paragraphs) && section.paragraphs.length > 0 && (
        <div className="mt-3 space-y-3">
          {section.paragraphs.map((paragraph) => (
            <p key={paragraph} className="text-sm leading-7 text-slate-600 sm:text-base">
              {paragraph}
            </p>
          ))}
        </div>
      )}

      {Array.isArray(section.listItems) && section.listItems.length > 0 && (
        <ul className="mt-3 space-y-2 text-sm leading-7 text-slate-600 sm:text-base">
          {section.listItems.map((item) => (
            <li key={item} className="flex gap-3">
              <span className="mt-2 h-1.5 w-1.5 rounded-full bg-teal-600" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )}

      {section.table && (
        <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
            <thead className="bg-slate-50">
              <tr>
                {section.table.columns.map((column) => (
                  <th key={column} className="px-4 py-3 font-semibold text-slate-700">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {section.table.rows.map((row) => (
                <tr key={row.join('|')} className="align-top">
                  {row.map((cell) => (
                    <td key={cell} className="px-4 py-3 text-slate-600">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {section.note && (
        <div className="mt-4 rounded-2xl border border-teal-100 bg-teal-50/70 px-4 py-3 text-sm leading-7 text-teal-900">
          {section.note}
        </div>
      )}
    </section>
  );
}

export default function LegalPage({ page = 'privacy' }) {
  const content = getLegalPage(page);

  return (
    <div style={{ fontFamily: "'Manrope', sans-serif" }} className="min-h-screen bg-[#f5efe6] text-slate-900">
      <div className="relative overflow-x-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div
            className="absolute inset-0 opacity-40"
            style={{
              backgroundImage:
                'linear-gradient(rgba(15,23,42,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(15,23,42,0.06) 1px, transparent 1px)',
              backgroundSize: '72px 72px',
            }}
          />
          <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-white/75 to-transparent" />
          <div className="absolute -left-24 top-28 h-72 w-72 rounded-full bg-teal-200/50 blur-3xl" />
          <div className="absolute right-[-7rem] top-20 h-80 w-80 rounded-full bg-amber-100/65 blur-3xl" />
          <div className="absolute bottom-[-8rem] left-1/3 h-96 w-96 rounded-full bg-emerald-100/45 blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
          <header className="rounded-[32px] border border-slate-200/85 bg-white/88 px-5 py-4 shadow-[0_24px_90px_-54px_rgba(15,23,42,0.42)] backdrop-blur">
            <div className="flex flex-col gap-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                <a
                  href="/"
                  className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950 text-lg font-extrabold text-white shadow-[0_18px_45px_-24px_rgba(15,23,42,0.9)] transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
                >
                  PM
                </a>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-teal-700">{PRODUCT_NAME}</p>
                  <div className="text-lg font-semibold text-slate-950 sm:text-xl">{content.title}</div>
                </div>
              </div>

              <a
                href="/"
                className="inline-flex items-center justify-center rounded-full border border-slate-300/80 bg-white/90 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
              >
                Back to {PRODUCT_NAME}
              </a>
            </div>

              <nav className="flex flex-wrap gap-2" aria-label="Legal pages">
                {LEGAL_NAV_ITEMS.map((item) => {
                  const active = item.id === page;
                  return (
                    <a
                      key={item.id}
                      href={item.href}
                      className={`rounded-full border px-3.5 py-2 text-sm font-semibold transition ${
                        active
                          ? 'border-slate-900 bg-slate-950 text-white'
                          : 'border-slate-200 bg-[#faf8f2] text-slate-600 hover:border-slate-300 hover:text-slate-950'
                      }`}
                    >
                      {item.label}
                    </a>
                  );
                })}
              </nav>
            </div>
          </header>

          <main className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
            <div className="rounded-[34px] border border-slate-200/85 bg-white/86 p-6 shadow-[0_36px_120px_-70px_rgba(15,23,42,0.4)] backdrop-blur sm:p-8">
              <div className="max-w-3xl">
                <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-teal-700">{content.eyebrow}</p>
                <h1
                  style={{ fontFamily: "'Fraunces', serif" }}
                  className="mt-3 text-4xl font-semibold tracking-[-0.03em] text-slate-950 sm:text-5xl"
                >
                  {content.title}
                </h1>
                <p className="mt-5 text-base leading-8 text-slate-600 sm:text-lg">{content.intro}</p>
                {content.summary && <p className="mt-4 text-sm leading-7 text-slate-500">{content.summary}</p>}
                <p className="mt-4 text-sm text-slate-400">Last updated: {LAST_UPDATED}</p>
              </div>

              <div className="mt-8 space-y-5">
                {content.sections.map((section) => (
                  <SectionContent key={section.heading} section={section} />
                ))}
              </div>

              <div className="mt-8 rounded-[24px] border border-slate-200 bg-slate-50/90 p-4 text-sm leading-7 text-slate-600">
                These launch materials are meant to match the live product more closely than the previous first-pass pages, but they still need a final legal review against the live deployment, billing setup, retention periods, and mailbox configuration before formal publication.
              </div>
            </div>

            <aside className="space-y-4">
              <div className="rounded-[30px] border border-slate-200/85 bg-white/90 p-5 shadow-[0_24px_70px_-48px_rgba(15,23,42,0.45)] backdrop-blur">
                <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">
                  {content.sidebar.title}
                </div>
                <div className="mt-4 space-y-3">
                  {content.sidebar.items.map((item) => (
                    <div key={item.label} className="rounded-2xl border border-slate-200 bg-[#faf8f2] px-4 py-3">
                      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">{item.label}</div>
                      {item.href ? (
                        <a href={item.href} className="mt-1 block text-sm font-medium text-slate-700 underline decoration-slate-300 underline-offset-4">
                          {item.value}
                        </a>
                      ) : (
                        <div className="mt-1 text-sm font-medium text-slate-700">{item.value}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-[30px] border border-slate-200/85 bg-slate-950 p-5 text-white shadow-[0_24px_70px_-48px_rgba(15,23,42,0.55)]">
                <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-teal-300">Practical note</div>
                <p className="mt-3 text-sm leading-7 text-slate-200">
                  Replace any remaining operational placeholders with live mailbox and company details before relying on these pages as a final public legal position.
                </p>
                <p className="mt-4 text-xs leading-6 text-slate-400">
                  Public company placeholder intentionally shown as <strong>{COMPANY_NAME}</strong>.
                </p>
              </div>
            </aside>
          </main>
        </div>
      </div>
    </div>
  );
}
