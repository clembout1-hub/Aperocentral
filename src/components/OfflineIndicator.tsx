import React from 'react';
import {WifiOff} from 'lucide-react';
import {useOnlineStatus} from '../hooks/useOnlineStatus';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      className="fixed top-[88px] left-1/2 z-40 -translate-x-1/2 flex items-center gap-2 rounded-full border border-[#FF9F0A]/35 bg-[var(--bg-card-strong)] px-3.5 py-1.5 text-xs font-medium text-[#FF9F0A] shadow-lg backdrop-blur-xl whitespace-nowrap"
    >
      <WifiOff className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>Hors ligne — session locale affichée</span>
    </div>
  );
};
