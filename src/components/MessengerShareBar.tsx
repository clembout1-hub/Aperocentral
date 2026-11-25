import React, {useEffect, useState} from 'react';
import {createPortal} from 'react-dom';
import {
  CalendarPlus,
  Check,
  Copy,
  MessageCircle,
  Send,
  Share2,
  X,
} from 'lucide-react';
import {buildWhatsAppUrl} from '../utils/geo';

export type ShareSheetMode = 'vote' | 'recap';

interface MessengerShareBarProps {
  voteMessage: string;
  recapMessage: string | null;
  shareUrl: string;
  canCopyRecap: boolean;
  onSyncUrl: () => void;
  onCopyText: (text: string, toastMessage: string) => void;
  onTriggerMessenger: (text: string, shareUrl: string) => void;
  onAddCalendar: () => void;
}

export const MessengerShareBar: React.FC<MessengerShareBarProps> = ({
  voteMessage,
  recapMessage,
  shareUrl,
  canCopyRecap,
  onSyncUrl,
  onCopyText,
  onTriggerMessenger,
  onAddCalendar,
}) => {
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [sheetMode, setSheetMode] = useState<ShareSheetMode>('vote');
  const [justCopied, setJustCopied] = useState(false);

  const openActionSheet = () => {
    onSyncUrl();
    setSheetMode(canCopyRecap && recapMessage ? 'recap' : 'vote');
    setJustCopied(false);
    setIsSheetOpen(true);
  };

  useEffect(() => {
    if (!isSheetOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsSheetOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isSheetOpen]);

  useEffect(() => {
    if (!justCopied) return;
    const timer = window.setTimeout(() => setJustCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [justCopied]);

  const isRecapMissing = sheetMode === 'recap' && (!canCopyRecap || !recapMessage);
  const activeMessage =
    sheetMode === 'recap' ? recapMessage || '' : voteMessage;

  const handleCopyAction = () => {
    if (isRecapMissing || !activeMessage) return;
    onSyncUrl();
    onCopyText(
      activeMessage,
      sheetMode === 'recap'
        ? 'Récapitulatif copié !'
        : 'Lien de vote copié !'
    );
    setJustCopied(true);
  };

  const handleMessengerAction = () => {
    if (isRecapMissing || !activeMessage) return;
    onTriggerMessenger(activeMessage, shareUrl);
  };

  const handleWhatsAppAction = () => {
    onSyncUrl();
  };

  const actionSheetModal =
    isSheetOpen && typeof document !== 'undefined'
      ? createPortal(
          <div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[var(--bg-backdrop)] backdrop-blur-md p-0 sm:p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="share-sheet-title"
            onClick={() => setIsSheetOpen(false)}
          >
            <div
              className="w-full sm:max-w-md rounded-t-[28px] sm:rounded-[28px] border-t sm:border border-[var(--border-strong)] bg-[var(--bg-card-strong)] px-4 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl backdrop-blur-2xl animate-[fadeIn_160ms_ease-out]"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Mobile grab indicator */}
              <div className="mx-auto mb-2.5 h-1.5 w-10 rounded-full bg-[var(--handle-color)] sm:hidden" />

              {/* Header */}
              <div className="flex items-center justify-between gap-2">
                <h2
                  id="share-sheet-title"
                  className="text-base font-semibold tracking-tight text-[var(--text-primary)]"
                >
                  Partager avec le groupe
                </h2>
                <button
                  type="button"
                  onClick={() => setIsSheetOpen(false)}
                  aria-label="Fermer"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[var(--bg-surface)] text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Quick Mode Selector */}
              <div
                role="tablist"
                aria-label="Type de message à partager"
                className="mt-3 grid grid-cols-2 gap-1 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-1"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={sheetMode === 'vote'}
                  onClick={() => {
                    setSheetMode('vote');
                    setJustCopied(false);
                  }}
                  className={`min-h-[40px] rounded-lg px-2.5 py-1.5 text-center transition-all ${
                    sheetMode === 'vote'
                      ? 'bg-[#0A84FF] text-white shadow-sm'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <span className="block text-xs font-semibold whitespace-nowrap">
                    Lien de vote
                  </span>
                  <span
                    className={`block text-[10px] whitespace-nowrap ${
                      sheetMode === 'vote' ? 'text-white/85' : 'text-[var(--text-secondary)]'
                    }`}
                  >
                    Inviter les amis
                  </span>
                </button>

                <button
                  type="button"
                  role="tab"
                  aria-selected={sheetMode === 'recap'}
                  onClick={() => {
                    setSheetMode('recap');
                    setJustCopied(false);
                  }}
                  className={`min-h-[40px] rounded-lg px-2.5 py-1.5 text-center transition-all ${
                    sheetMode === 'recap'
                      ? 'bg-[#0A84FF] text-white shadow-sm'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <span className="block text-xs font-semibold whitespace-nowrap">
                    Récapitulatif final
                  </span>
                  <span
                    className={`block text-[10px] whitespace-nowrap ${
                      sheetMode === 'recap' ? 'text-white/85' : 'text-[var(--text-secondary)]'
                    }`}
                  >
                    Bar gagnant + trajets
                  </span>
                </button>
              </div>

              {/* Message Preview */}
              <div className="mt-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3">
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-[11px] font-medium text-[var(--text-secondary)]">
                    Aperçu du message prêt à partir
                  </span>
                </div>
                {isRecapMissing ? (
                  <p className="py-2 text-xs leading-relaxed text-[var(--text-secondary)]">
                    Lance d&apos;abord une recherche de bars pour générer le récapitulatif final avec le bar gagnant et les temps de trajet de chacun.
                  </p>
                ) : (
                  <pre className="max-h-32 overflow-y-auto whitespace-pre-wrap break-words font-sans text-xs leading-relaxed text-[var(--text-primary)]">
                    {activeMessage}
                  </pre>
                )}
              </div>

              {/* 3 Clear Send Actions */}
              <div className="mt-3.5 space-y-2">
                {isRecapMissing ? (
                  <button
                    type="button"
                    disabled
                    className="flex min-h-[46px] w-full cursor-not-allowed items-center justify-center gap-2 rounded-full bg-[#30D158]/40 px-4 py-2.5 text-sm font-semibold text-black/50"
                  >
                    <MessageCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>Envoyer sur WhatsApp</span>
                  </button>
                ) : (
                  <a
                    href={buildWhatsAppUrl(activeMessage)}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={handleWhatsAppAction}
                    className="flex min-h-[46px] w-full items-center justify-center gap-2 rounded-full bg-[#30D158] px-4 py-2.5 text-sm font-semibold text-black shadow-[0_6px_18px_rgba(48,209,88,0.28)] transition-transform active:scale-[0.98] hover:bg-[#30D158]/90"
                  >
                    <MessageCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>Envoyer sur WhatsApp</span>
                  </a>
                )}

                <button
                  type="button"
                  disabled={isRecapMissing}
                  onClick={handleMessengerAction}
                  className="flex min-h-[46px] w-full items-center justify-center gap-2 rounded-full bg-[#0084FF] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_6px_18px_rgba(0,132,255,0.35)] transition-transform active:scale-[0.98] hover:bg-[#0073E6] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <Send className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>Envoyer sur Messenger</span>
                </button>

                <button
                  type="button"
                  disabled={isRecapMissing}
                  onClick={handleCopyAction}
                  className={`flex min-h-[46px] w-full items-center justify-center gap-2 rounded-full border px-4 py-2.5 text-sm font-semibold transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 ${
                    justCopied
                      ? 'border-[#30D158]/50 bg-[#30D158]/15 text-[#30D158]'
                      : 'border-white/10 bg-[#2C2C2E] text-white hover:bg-[#3A3A3C]'
                  }`}
                >
                  {justCopied ? (
                    <>
                      <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span>Copié !</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span>Copier le message / lien</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <div className="shrink-0 border-t border-[var(--border-subtle)] bg-[var(--bg-card-strong)]/95 backdrop-blur-xl transition-colors lg:rounded-b-[28px]">
        <div className="flex items-center gap-2 px-3.5 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={openActionSheet}
            className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-full bg-[#0A84FF] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_6px_20px_rgba(10,132,255,0.35)] transition-transform active:scale-[0.98] hover:bg-[#0A84FF]/90"
          >
            <Share2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Partager / Récap</span>
          </button>

          <button
            type="button"
            onClick={onAddCalendar}
            disabled={!canCopyRecap}
            aria-label="Ajouter à mon agenda (.ics)"
            title="Ajouter à mon agenda (.ics)"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] transition-transform active:scale-[0.98] hover:border-[#30D158]/50 hover:text-[#30D158] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <CalendarPlus className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      {actionSheetModal}
    </>
  );
};
