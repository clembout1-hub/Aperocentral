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
        className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full border border-[#0A84FF]/35 bg-[#0A84FF]/15 px-3 py-1.5 text-xs font-semibold text-[#0A84FF] transition-colors hover:bg-[#0A84FF]/25 whitespace-nowrap shrink-0"
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
          className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full border border-white/10 bg-[#1C1C1E] px-3 py-1.5 text-xs font-medium text-white/90 transition-colors hover:bg-[#2C2C2E] whitespace-nowrap shrink-0"
        >
          <Download className="h-3.5 w-3.5 text-[#0A84FF]" aria-hidden="true" />
          <span>Installer</span>
        </button>

        {showIOSGuide && (
          <div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-md p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ios-install-title"
          >
            <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-[#1C1C1E]/95 p-5 shadow-2xl backdrop-blur-2xl">
              <div className="flex items-start justify-between gap-3">
                <h3 id="ios-install-title" className="text-lg font-semibold tracking-tight text-white">
                  Installer sur iPhone / iPad
                </h3>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  aria-label="Fermer"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#2C2C2E] text-[#8E8E93] hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <ol className="mt-3 space-y-2.5 text-sm text-[#8E8E93]">
                <li className="flex items-center gap-2.5">
                  <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#0A84FF]/20 text-xs font-semibold text-[#0A84FF]">
                    1
                  </span>
                  <span>
                    Appuie sur <Share className="mx-0.5 inline h-4 w-4 text-[#0A84FF]" />{' '}
                    <strong className="text-white">Partager</strong> dans Safari.
                  </span>
                </li>
                <li className="flex items-center gap-2.5">
                  <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#0A84FF]/20 text-xs font-semibold text-[#0A84FF]">
                    2
                  </span>
                  <span>
                    Touche <strong className="text-white">Sur l&apos;écran d&apos;accueil</strong>.
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
