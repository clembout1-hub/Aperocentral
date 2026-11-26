import React, {useState} from 'react';
import {Download, Share, X} from 'lucide-react';
import {usePWAInstall} from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC = () => {
  const {isInstallable, isInstalled, isIOS, install} = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={() => void install()}
        className="inline-flex min-h-[34px] items-center gap-1 rounded-full border border-[#0A84FF]/40 bg-[#0A84FF]/15 px-2.5 py-1 text-xs font-semibold text-[#0A84FF] transition-colors hover:bg-[#0A84FF]/25 whitespace-nowrap shrink-0"
      >
        <Download className="h-3.5 w-3.5" aria-hidden="true" />
        <span>Installer</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className="inline-flex min-h-[34px] items-center gap-1 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5 py-1 text-xs font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-surface-hover)] whitespace-nowrap shrink-0"
        >
          <Download className="h-3.5 w-3.5 text-[#0A84FF]" aria-hidden="true" />
          <span>Installer</span>
        </button>

        {showIOSGuide && (
          <div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[var(--bg-backdrop)] backdrop-blur-md p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ios-install-title"
            onClick={() => setShowIOSGuide(false)}
          >
            <div
              className="w-full max-w-sm rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-card-strong)] p-5 shadow-2xl backdrop-blur-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3">
                <h3
                  id="ios-install-title"
                  className="text-lg font-semibold tracking-tight text-[var(--text-primary)]"
                >
                  Installer sur iPhone / iPad
                </h3>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  aria-label="Fermer"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <ol className="mt-3 space-y-2.5 text-sm text-[var(--text-secondary)]">
                <li className="flex items-start gap-2.5">
                  <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#0A84FF]/20 text-xs font-semibold text-[#0A84FF]">
                    1
                  </span>
                  <span>
                    Appuie sur l&apos;icône{' '}
                    <Share className="mx-0.5 inline h-4 w-4 text-[#0A84FF]" aria-hidden="true" />{' '}
                    <strong className="text-[var(--text-primary)]">Partager</strong> en bas de Safari.
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#0A84FF]/20 text-xs font-semibold text-[#0A84FF]">
                    2
                  </span>
                  <span>
                    Choisis{' '}
                    <strong className="text-[var(--text-primary)]">
                      &laquo; Sur l&apos;écran d&apos;accueil &raquo;
                    </strong>
                    .
                  </span>
                </li>
              </ol>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="mt-5 min-h-[44px] w-full rounded-full bg-[#0A84FF] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#0A84FF]/90"
              >
                Compris
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
