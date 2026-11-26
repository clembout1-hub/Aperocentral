import React from 'react';
import {Calendar, FolderHeart, Plus, Trash2, Users, X} from 'lucide-react';
import type {SavedSessionRecord} from '../types/apero';
import {formatFrenchDateTime} from '../utils/geo';

interface SessionsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  sessions: SavedSessionRecord[];
  activeSessionId: string;
  onSelectSession: (record: SavedSessionRecord) => void;
  onCreateNewSession: () => void;
  onDeleteSession: (sessionId: string) => void;
}

export const SessionsDrawer: React.FC<SessionsDrawerProps> = ({
  isOpen,
  onClose,
  sessions,
  activeSessionId,
  onSelectSession,
  onCreateNewSession,
  onDeleteSession,
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[var(--bg-backdrop)] backdrop-blur-md p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sessions-drawer-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-t-3xl sm:rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-card-strong)] p-5 shadow-2xl backdrop-blur-2xl max-h-[82vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#0A84FF]/15 text-[#0A84FF]">
              <FolderHeart className="h-4 w-4" aria-hidden="true" />
            </span>
            <div>
              <h2
                id="sessions-drawer-title"
                className="text-base font-semibold tracking-tight text-[var(--text-primary)]"
              >
                Mes soirées ({sessions.length})
              </h2>
              <p className="text-xs text-[var(--text-secondary)]">
                Sauvegardées automatiquement sur cet appareil
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer Mes soirées"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <button
          type="button"
          onClick={() => {
            onCreateNewSession();
            onClose();
          }}
          className="mt-4 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-full bg-[#0A84FF] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-[#0A84FF]/90 active:scale-[0.98]"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          <span>Nouvelle soirée</span>
        </button>

        <div className="mt-4 flex-1 overflow-y-auto space-y-2 pr-0.5">
          {sessions.length === 0 ? (
            <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 text-center text-xs text-[var(--text-secondary)]">
              Aucune soirée sauvegardée pour l&apos;instant. Ajoute des participants pour mémoriser
              automatiquement cette sortie.
            </div>
          ) : (
            sessions.map((record) => {
              const isActive = record.id === activeSessionId;
              const pCount = record.session.participants.length;

              return (
                <div
                  key={record.id}
                  className={`flex items-center justify-between gap-2 rounded-2xl border p-3 transition-colors ${
                    isActive
                      ? 'border-[#0A84FF] bg-[#0A84FF]/12'
                      : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-[var(--border-strong)]'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      onSelectSession(record);
                      onClose();
                    }}
                    className="min-w-0 flex-1 text-left"
                  >
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold text-[var(--text-primary)]">
                        {record.session.title || 'Apéro de la Team'}
                      </span>
                      {isActive && (
                        <span className="shrink-0 rounded-full bg-[#0A84FF] px-2 py-0.5 text-[10px] font-bold text-white">
                          Active
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-[var(--text-secondary)]">
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="h-3 w-3" aria-hidden="true" />
                        <span>{formatFrenchDateTime(record.session.dateTime)}</span>
                      </span>
                      <span className="inline-flex items-center gap-1 tabular-nums">
                        <Users className="h-3 w-3" aria-hidden="true" />
                        <span>
                          {pCount} ami{pCount > 1 ? 's' : ''}
                        </span>
                      </span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => onDeleteSession(record.id)}
                    aria-label={`Supprimer la soirée ${record.session.title}`}
                    title="Supprimer cette soirée"
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--text-secondary)] transition-colors hover:bg-[#FF453A]/15 hover:text-[#FF453A]"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
