import React from 'react';
import { LEGAL_NAV_ITEMS } from '../utils/legalContent';
import { PRIVACY_EMAIL, SUPPORT_EMAIL } from '../utils/feedback';

const FOOTER_LINKS = [
  ...LEGAL_NAV_ITEMS,
  { id: 'support', label: SUPPORT_EMAIL, href: `mailto:${SUPPORT_EMAIL}` },
  { id: 'privacy-email', label: PRIVACY_EMAIL, href: `mailto:${PRIVACY_EMAIL}` },
];

export default function AuthenticatedFooter({
  compact = false,
  note = '',
  className = '',
}) {
  return (
    <footer
      className={`border-t border-slate-200 bg-white/92 backdrop-blur ${compact ? 'px-5 py-4' : 'px-4 py-5 sm:px-6'} ${className}`.trim()}
    >
      <div className={`mx-auto ${compact ? 'max-w-none' : 'max-w-7xl'}`}>
        {note ? (
          <p className={`text-center ${compact ? 'text-[11px]' : 'text-xs'} text-slate-400`}>
            {note}
          </p>
        ) : null}

        <div className={`flex flex-wrap items-center justify-center gap-x-4 gap-y-2 ${note ? 'mt-3' : ''} text-xs text-slate-500`}>
          {FOOTER_LINKS.map((link) => (
            <a
              key={link.id}
              href={link.href}
              className="font-medium transition-colors hover:text-slate-900"
            >
              {link.label}
            </a>
          ))}
        </div>
      </div>
    </footer>
  );
}
