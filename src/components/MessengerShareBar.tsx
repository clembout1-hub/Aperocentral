import React from 'react';
import {CalendarPlus, MessageCircle, Send, Share2} from 'lucide-react';

interface MessengerShareBarProps {
  whatsappLinkUrl: string;
  whatsappRecapUrl: string;
  onShareLink: () => void;
  onShareMessenger: () => void;
  onShareRecap: () => void;
  onAddCalendar: () => void;
  canCopyRecap: boolean;
}

export const MessengerShareBar: React.FC<MessengerShareBarProps> = ({
  whatsappLinkUrl,
  whatsappRecapUrl,
  onShareLink,
  onShareMessenger,
  onShareRecap,
  onAddCalendar,
  canCopyRecap,
}) => {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-white/10 bg-[#1C1C1E]/85 backdrop-blur-2xl">
      <div className="mx-auto flex max-w-7xl items-center gap-1.5 sm:gap-2 px-3 pt-2.5 pb-safe sm:px-6">
        <a
          href={whatsappLinkUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onShareLink}
          className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-full border border-white/15 bg-[#2C2C2E] px-2.5 sm:px-3.5 py-2 text-xs sm:text-sm font-semibold text-white transition-transform active:scale-[0.98] hover:bg-[#3A3A3C]"
        >
          <Share2 className="h-4 w-4 shrink-0 text-[#30D158]" aria-hidden="true" />
          <span className="truncate">WhatsApp</span>
        </a>

        <button
          type="button"
          onClick={onShareMessenger}
          className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-full bg-[#0084FF] px-2.5 sm:px-3.5 py-2 text-xs sm:text-sm font-semibold text-white shadow-[0_6px_18px_rgba(0,132,255,0.35)] transition-transform active:scale-[0.98] hover:bg-[#0073E6]"
        >
          <Send className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="truncate">Messenger</span>
        </button>

        {canCopyRecap ? (
          <a
            href={whatsappRecapUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onShareRecap}
            className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-full border border-[#0A84FF]/40 bg-[#0A84FF]/15 px-3 sm:px-4 py-2 text-xs sm:text-sm font-semibold text-[#0A84FF] transition-transform active:scale-[0.98] hover:bg-[#0A84FF]/25 whitespace-nowrap"
          >
            <MessageCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Récap</span>
          </a>
        ) : (
          <button
            type="button"
            disabled
            className="inline-flex min-h-[44px] cursor-not-allowed items-center justify-center gap-1.5 rounded-full border border-white/10 bg-[#2C2C2E]/40 px-3 sm:px-4 py-2 text-xs sm:text-sm font-semibold text-white/40 whitespace-nowrap"
          >
            <MessageCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Récap</span>
          </button>
        )}

        <button
          type="button"
          onClick={onAddCalendar}
          disabled={!canCopyRecap}
          aria-label="Ajouter à mon agenda (.ics)"
          title="Ajouter à mon agenda (.ics)"
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#30D158]/30 bg-[#30D158]/15 text-[#30D158] transition-transform active:scale-[0.98] hover:bg-[#30D158]/25 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <CalendarPlus className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
};
