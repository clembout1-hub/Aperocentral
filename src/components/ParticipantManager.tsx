import React, {useRef, useState} from 'react';
import {
  Bike,
  Car,
  Check,
  Footprints,
  Pencil,
  Plus,
  TrainFront,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import type {
  Participant,
  SharedGroupWithMembers,
  SupabaseProfile,
  TransportMode,
} from '../types/apero';
import {getModeLabel} from '../utils/geo';
import {AddressAutocompleteInput} from './AddressAutocompleteInput';

interface ParticipantManagerProps {
  participants: Participant[];
  isAuthenticated: boolean;
  currentUserProfile: SupabaseProfile | null;
  groups: SharedGroupWithMembers[];
  mapsReady: boolean;
  onUpsertParticipant: (participant: Participant) => void;
  onRemoveParticipant: (participantId: string) => void;
  onAddSelf: () => void;
  onLaunchGroup: (group: SharedGroupWithMembers) => void;
  onOpenGroupsModal: () => void;
}

const MODES: {id: TransportMode; label: string; icon: React.ComponentType<{className?: string}>}[] = [
  {id: 'TRANSIT', label: 'Métro/RER', icon: TrainFront},
  {id: 'BICYCLING', label: 'Vélo', icon: Bike},
  {id: 'WALKING', label: 'Marche', icon: Footprints},
  {id: 'DRIVING', label: 'Voiture', icon: Car},
];

const AVATAR_TONES = [
  'bg-[#0A84FF] text-white',
  'bg-[#30D158] text-black',
  'bg-[#FF9F0A] text-black',
  'bg-[#BF5AF2] text-white',
  'bg-[#64D2FF] text-black',
  'bg-[#FF375F] text-white',
];

export const ParticipantManager: React.FC<ParticipantManagerProps> = ({
  participants,
  isAuthenticated,
  currentUserProfile,
  groups,
  mapsReady,
  onUpsertParticipant,
  onRemoveParticipant,
  onAddSelf,
  onLaunchGroup,
  onOpenGroupsModal,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [coords, setCoords] = useState<{lat: number; lng: number} | null>(null);
  const [mode, setMode] = useState<TransportMode>('TRANSIT');
  const [formError, setFormError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(true);
  const nameInputRef = useRef<HTMLInputElement | null>(null);

  const resetFormToFresh = () => {
    setEditingId(null);
    setName('');
    setAddress('');
    setCoords(null);
    setMode('TRANSIT');
    setFormError(null);
  };

  const handleStartEdit = (p: Participant) => {
    setEditingId(p.id);
    setName(p.name);
    setAddress(p.address);
    setCoords({lat: p.lat, lng: p.lng});
    setMode(p.mode);
    setFormError(null);
    setShowForm(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = name.trim();
    if (!cleanName) {
      setFormError('Indique un prénom pour le groupe.');
      return;
    }
    if (!coords || !address.trim()) {
      setFormError('Sélectionne une adresse dans les suggestions Google Maps.');
      return;
    }

    const participant: Participant = {
      id: editingId || `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      name: cleanName,
      address: address.trim(),
      lat: coords.lat,
      lng: coords.lng,
      mode,
    };

    onUpsertParticipant(participant);
    resetFormToFresh();
    nameInputRef.current?.focus();
  };

  const isSelfAdded = Boolean(
    currentUserProfile &&
      participants.some(
        (p) =>
          p.id === `self_${currentUserProfile.id}` ||
          p.id === `member_${currentUserProfile.id}`
      )
  );

  return (
    <section
      aria-labelledby="participants-heading"
      className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4 backdrop-blur-xl transition-colors space-y-3.5"
    >
      {/* Quick Self-Add & Group Loader shown only when logged in to Supabase */}
      {isAuthenticated && currentUserProfile && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onAddSelf}
            className={`inline-flex min-h-[34px] items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold transition-colors whitespace-nowrap ${
              isSelfAdded
                ? 'border-[#30D158]/40 bg-[#30D158]/15 text-[#30D158]'
                : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] hover:border-[#0A84FF]/50 hover:text-[#0A84FF]'
            }`}
          >
            {isSelfAdded ? (
              <>
                <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>{currentUserProfile.username} ajouté</span>
              </>
            ) : (
              <span>+ M&apos;ajouter ({currentUserProfile.username})</span>
            )}
          </button>

          {groups.length > 0 ? (
            <div className="relative inline-flex items-center">
              <Users
                className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-[#0A84FF]"
                aria-hidden="true"
              />
              <select
                aria-label="Charger un groupe"
                value=""
                onChange={(e) => {
                  const selected = groups.find((g) => g.id === e.target.value);
                  if (selected) onLaunchGroup(selected);
                }}
                className="min-h-[34px] cursor-pointer appearance-none rounded-full border border-[#0A84FF]/40 bg-[#0A84FF]/12 pl-8 pr-6 py-1 text-xs font-semibold text-[#0A84FF] focus:border-[#0A84FF] focus:outline-none"
              >
                <option value="" disabled>
                  Charger un groupe…
                </option>
                {groups.map((grp) => (
                  <option key={grp.id} value={grp.id}>
                    {grp.name} ({grp.members.length})
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <button
              type="button"
              onClick={onOpenGroupsModal}
              className="inline-flex min-h-[34px] items-center gap-1 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-1 text-xs font-medium text-[var(--text-secondary)] hover:border-[#0A84FF]/50 hover:text-[#0A84FF] whitespace-nowrap"
            >
              <Users className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>Charger un groupe</span>
            </button>
          )}
        </div>
      )}

      {/* Section Header */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2
            id="participants-heading"
            className="text-base font-semibold tracking-tight text-[var(--text-primary)]"
          >
            Participants ({participants.length})
          </h2>
          <p className="text-xs text-[var(--text-secondary)]">
            {isAuthenticated
              ? 'Ajoute un participant ponctuel ou charge un groupe'
              : 'Ajoute les participants et leur mode de transport'}
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            if (showForm && editingId) {
              resetFormToFresh();
            } else {
              setShowForm((prev) => !prev);
            }
          }}
          className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full bg-[#0A84FF]/15 px-3 py-1.5 text-xs font-semibold text-[#0A84FF] transition-colors hover:bg-[#0A84FF]/25 whitespace-nowrap shrink-0"
        >
          {showForm ? (
            <>
              <X className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Masquer</span>
            </>
          ) : (
            <>
              <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Ajouter</span>
            </>
          )}
        </button>
      </div>

      {/* Clean Add / Edit Participant Form directly at top */}
      {showForm && (
        <form onSubmit={handleSubmit} className="space-y-3">
          {editingId && (
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#0A84FF]">
                Modifier {name || 'ce participant'}
              </span>
              <button
                type="button"
                onClick={resetFormToFresh}
                className="text-xs font-medium text-[#0A84FF] hover:opacity-80"
              >
                Nouveau
              </button>
            </div>
          )}

          <div className="divide-y divide-[var(--border-subtle)] rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 space-y-3">
            <div className="pb-3">
              <label
                htmlFor="participant-name"
                className="block text-[11px] font-medium text-[var(--text-secondary)]"
              >
                Prénom
              </label>
              <input
                ref={nameInputRef}
                id="participant-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Camille"
                maxLength={35}
                className="mt-1 min-h-[42px] w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] focus:border-[#0A84FF] focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="participant-address"
                className="block text-[11px] font-medium text-[var(--text-secondary)]"
              >
                Adresse de départ
              </label>
              <div className="mt-1">
                {mapsReady ? (
                  <AddressAutocompleteInput
                    value={address}
                    isSelectedCoordsValid={coords !== null}
                    onChangeText={(txt) => {
                      setAddress(txt);
                      setCoords(null);
                    }}
                    onSelectAddress={(selected) => {
                      setAddress(selected.address);
                      setCoords({lat: selected.lat, lng: selected.lng});
                      setFormError(null);
                    }}
                  />
                ) : (
                  <div className="flex min-h-[44px] items-center rounded-xl border border-[#FF9F0A]/30 bg-[#FF9F0A]/10 px-3 text-xs text-[#FF9F0A]">
                    Configure une clé Google Maps (engrenage en haut) pour activer la recherche.
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 4 transport modes */}
          <div>
            <span className="mb-1.5 block text-[11px] font-medium text-[var(--text-secondary)]">
              Mode de transport
            </span>
            <div
              role="radiogroup"
              aria-label="Mode de transport"
              className="grid grid-cols-4 gap-1 rounded-xl bg-[var(--bg-surface)] p-1"
            >
              {MODES.map((m) => {
                const Icon = m.icon;
                const active = mode === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setMode(m.id)}
                    className={`flex min-h-[40px] flex-col sm:flex-row items-center justify-center gap-1 rounded-lg px-1.5 py-1.5 text-[11px] font-semibold transition-all ${
                      active
                        ? 'bg-[#0A84FF] text-white shadow-sm'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span className="truncate">{m.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {formError && (
            <p role="alert" className="text-xs font-medium text-[#FF453A]">
              {formError}
            </p>
          )}

          <button
            type="submit"
            className="inline-flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-full bg-[#0A84FF] px-5 py-2 text-sm font-semibold text-white transition-all hover:bg-[#0A84FF]/90 active:scale-[0.98]"
          >
            {editingId ? (
              <>
                <Check className="h-4 w-4" aria-hidden="true" />
                <span>Mettre à jour</span>
              </>
            ) : (
              <>
                <Plus className="h-4 w-4" aria-hidden="true" />
                <span>Ajouter le participant</span>
              </>
            )}
          </button>
        </form>
      )}

      {/* Participant List */}
      {participants.length > 0 && (
        <ul className="divide-y divide-[var(--border-subtle)] overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
          {participants.map((p, idx) => {
            const isEditing = editingId === p.id;
            const avatarTone = AVATAR_TONES[idx % AVATAR_TONES.length];
            const initial = p.name.trim().charAt(0).toUpperCase() || '?';
            return (
              <li key={p.id} className="flex items-center justify-between gap-2 px-3 py-1.5">
                <button
                  type="button"
                  onClick={() => handleStartEdit(p)}
                  className={`flex min-h-[44px] flex-1 items-center gap-3 rounded-xl px-1.5 text-left transition-colors ${
                    isEditing ? 'bg-[#0A84FF]/15' : 'hover:bg-[var(--bg-surface-hover)]/40'
                  }`}
                >
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${avatarTone}`}
                    aria-hidden="true"
                  >
                    {initial}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 text-sm font-semibold text-[var(--text-primary)]">
                      <span className="truncate">{p.name}</span>
                      <span aria-hidden="true" className="text-[var(--text-secondary)]">
                        ·
                      </span>
                      <span className="text-xs font-medium text-[#0A84FF] whitespace-nowrap">
                        {getModeLabel(p.mode)}
                      </span>
                    </div>
                    <p className="truncate text-xs text-[var(--text-secondary)]">{p.address}</p>
                  </div>
                  <Pencil
                    className="h-3.5 w-3.5 shrink-0 text-[var(--text-secondary)]"
                    aria-hidden="true"
                  />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (editingId === p.id) resetFormToFresh();
                    onRemoveParticipant(p.id);
                  }}
                  aria-label={`Supprimer ${p.name}`}
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[var(--text-secondary)] transition-colors hover:bg-[#FF453A]/15 hover:text-[#FF453A]"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};
