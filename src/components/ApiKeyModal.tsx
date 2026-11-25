import React, {useEffect, useState} from 'react';
import {ExternalLink, KeyRound, Trash2, X} from 'lucide-react';

interface ApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  customApiKey: string;
  envApiKeyPresent: boolean;
  onSaveKey: (key: string) => void;
}

export const ApiKeyModal: React.FC<ApiKeyModalProps> = ({
  isOpen,
  onClose,
  customApiKey,
  envApiKeyPresent,
  onSaveKey,
}) => {
  const [draftKey, setDraftKey] = useState(customApiKey);

  useEffect(() => {
    if (isOpen) {
      setDraftKey(customApiKey);
    }
  }, [isOpen, customApiKey]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveKey(draftKey.trim());
    onClose();
  };

  const handleClear = () => {
    setDraftKey('');
    onSaveKey('');
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[var(--bg-backdrop)] backdrop-blur-md p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="api-key-modal-title"
    >
      <div className="w-full max-w-md rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-card-strong)] p-5 shadow-2xl backdrop-blur-2xl">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#0A84FF]/15 text-[#0A84FF]">
              <KeyRound className="h-4 w-4" aria-hidden="true" />
            </div>
            <div>
              <h2
                id="api-key-modal-title"
                className="text-base font-semibold tracking-tight text-[var(--text-primary)]"
              >
                Clé Google Maps Platform
              </h2>
              <p className="text-xs text-[var(--text-secondary)]">
                Stockée uniquement dans le navigateur (localStorage)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer les paramètres"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label
              htmlFor="gmaps-api-key-input"
              className="block text-xs font-medium text-[var(--text-secondary)]"
            >
              Clé API personnalisée (Maps JS, Places New, Routes)
            </label>
            <input
              id="gmaps-api-key-input"
              type="password"
              autoComplete="off"
              value={draftKey}
              onChange={(e) => setDraftKey(e.target.value)}
              placeholder={envApiKeyPresent ? 'Clé par défaut active (saisir pour remplacer)' : 'AIzaSy...'}
              className="mt-1.5 min-h-[44px] w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-input)] px-3.5 py-2.5 font-mono text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] focus:border-[#0A84FF] focus:outline-none"
            />
            {envApiKeyPresent && !customApiKey && (
              <p className="mt-1.5 text-xs text-[#30D158]">
                Une clé d&apos;environnement (VITE_GOOGLE_MAPS_API_KEY) est déjà configurée.
              </p>
            )}
          </div>

          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 text-xs leading-relaxed text-[var(--text-secondary)]">
            Pour sécuriser votre clé en production, restreignez-la par référent HTTP et aux API autorisées via{' '}
            <a
              href="https://docs.cloud.google.com/api-keys/docs/add-restrictions-api-keys?utm_campaign=gmp_mcp_codeassist_v1_aistudio"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-medium text-[#0A84FF] underline hover:opacity-80"
            >
              la documentation Google Cloud
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </a>
            .
          </div>

          <div className="flex items-center justify-between gap-2 pt-1">
            {customApiKey ? (
              <button
                type="button"
                onClick={handleClear}
                className="inline-flex min-h-[42px] items-center gap-1.5 rounded-full border border-[#FF453A]/30 bg-[#FF453A]/15 px-4 py-2 text-xs font-semibold text-[#FF453A] hover:bg-[#FF453A]/25"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Effacer</span>
              </button>
            ) : (
              <span />
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="min-h-[42px] rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-2 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]"
              >
                Annuler
              </button>
              <button
                type="submit"
                className="min-h-[42px] rounded-full bg-[#0A84FF] px-5 py-2 text-sm font-semibold text-white hover:bg-[#0A84FF]/90"
              >
                Enregistrer
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
