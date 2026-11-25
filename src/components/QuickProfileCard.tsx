import React, {useRef, useState} from 'react';
import {
  Bike,
  Briefcase,
  Car,
  Check,
  Footprints,
  Home,
  Pencil,
  TrainFront,
  UserCheck,
  X,
} from 'lucide-react';
import type {SavedPlaceSpot, TransportMode, UserProfile} from '../types/apero';
import {getModeLabel, isAddressMatchingSpot} from '../utils/geo';
import {AddressAutocompleteInput} from './AddressAutocompleteInput';
import {FavoriteSpotIcon} from './FavoriteSpotIcon';

interface QuickProfileCardProps {
  profile: UserProfile;
  mapsReady: boolean;
  activeDepartureAddress: string;
  activeDepartureCoords: {lat: number; lng: number} | null;
  onSaveProfile: (profile: UserProfile) => void;
  onJoinFromProfile: (spotType: 'home' | 'work') => void;
}

const MODES: {id: TransportMode; label: string; icon: React.ComponentType<{className?: string}>}[] = [
  {id: 'TRANSIT', label: 'Métro/RER', icon: TrainFront},
  {id: 'BICYCLING', label: 'Vélo', icon: Bike},
  {id: 'WALKING', label: 'Marche', icon: Footprints},
  {id: 'DRIVING', label: 'Voiture', icon: Car},
];

export const QuickProfileCard: React.FC<QuickProfileCardProps> = ({
  profile,
  mapsReady,
  activeDepartureAddress,
  activeDepartureCoords,
  onSaveProfile,
  onJoinFromProfile,
}) => {
  const hasSavedProfile = Boolean(profile.name.trim() && (profile.home || profile.work));
  const [isEditing, setIsEditing] = useState(!hasSavedProfile);
  const [draftName, setDraftName] = useState(profile.name);
  const [draftHome, setDraftHome] = useState<SavedPlaceSpot | null>(profile.home);
  const [draftHomeText, setDraftHomeText] = useState(profile.home?.address || '');
  const [draftWork, setDraftWork] = useState<SavedPlaceSpot | null>(profile.work);
  const [draftWorkText, setDraftWorkText] = useState(profile.work?.address || '');
  const [draftMode, setDraftMode] = useState<TransportMode>(profile.preferredMode);
  const [error, setError] = useState<string | null>(null);
  const focusTargetRef = useRef<'home' | 'work' | null>(null);

  const openEditor = (focusField?: 'home' | 'work') => {
    setDraftName(profile.name);
    setDraftHome(profile.home);
    setDraftHomeText(profile.home?.address || '');
    setDraftWork(profile.work);
    setDraftWorkText(profile.work?.address || '');
    setDraftMode(profile.preferredMode);
    setError(null);
    focusTargetRef.current = focusField || null;
    setIsEditing(true);

    if (focusField) {
      window.setTimeout(() => {
        const targetId = focusField === 'home' ? 'profile-home-input' : 'profile-work-input';
        const el = document.getElementById(targetId) as HTMLInputElement | null;
        el?.focus();
        el?.select();
      }, 60);
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = draftName.trim();
    if (!cleanName) {
      setError('Indique ton prénom pour enregistrer ton profil.');
      return;
    }
    if (!draftHome && !draftWork) {
      setError('Sélectionne au moins une adresse (Maison ou Travail) dans les suggestions.');
      return;
    }

    onSaveProfile({
      name: cleanName,
      home: draftHome,
      work: draftWork,
      preferredMode: draftMode,
    });
    setError(null);
    setIsEditing(false);
  };

  const isHomeActive = isAddressMatchingSpot(
    activeDepartureAddress,
    activeDepartureCoords,
    profile.home
  );
  const isWorkActive = isAddressMatchingSpot(
    activeDepartureAddress,
    activeDepartureCoords,
    profile.work
  );

  return (
    <section
      aria-labelledby="quick-profile-heading"
      className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4 backdrop-blur-xl transition-colors"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#0A84FF]/15 text-[#0A84FF]">
            <UserCheck className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2
              id="quick-profile-heading"
              className="text-sm font-semibold tracking-tight text-[var(--text-primary)] truncate"
            >
              Mon profil rapide
              {profile.name ? ` · ${profile.name}` : ''}
            </h2>
            <p className="text-[11px] text-[var(--text-secondary)] truncate">
              {hasSavedProfile
                ? `Départ en 1 tap · ${getModeLabel(profile.preferredMode)}`
                : 'Enregistre Maison & Travail sur ce téléphone'}
            </p>
          </div>
        </div>

        {hasSavedProfile && (
          <button
            type="button"
            onClick={() => (isEditing ? setIsEditing(false) : openEditor())}
            aria-label={isEditing ? 'Fermer le profil' : 'Modifier mon profil rapide'}
            title={isEditing ? 'Fermer' : 'Modifier'}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
          >
            {isEditing ? <X className="h-4 w-4" /> : <Pencil className="h-3.5 w-3.5" />}
          </button>
        )}
      </div>

      {/* 1-Tap Quick Launch Buttons when profile is saved and not editing */}
      {!isEditing && hasSavedProfile && (
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {profile.home ? (
            <div
              className={`flex min-h-[54px] items-stretch overflow-hidden rounded-2xl border transition-all ${
                isHomeActive
                  ? 'bg-[#0A84FF] text-white border-[#0A84FF] shadow-[0_0_16px_rgba(10,132,255,0.45)] font-semibold'
                  : 'dark:bg-[#2C2C2E]/80 dark:text-[#8E8E93] dark:border-white/10 bg-[#E5E5EA]/85 text-[#636366] border-black/10'
              }`}
            >
              <button
                type="button"
                aria-pressed={isHomeActive}
                onClick={() => onJoinFromProfile('home')}
                className="flex min-w-0 flex-1 items-center gap-2.5 px-3 py-2 text-left transition-transform active:scale-[0.98]"
              >
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors ${
                    isHomeActive
                      ? 'bg-white/20 text-white'
                      : 'dark:bg-white/10 dark:text-[#8E8E93] bg-black/5 text-[#636366]'
                  }`}
                >
                  <FavoriteSpotIcon type="home" filled={isHomeActive} className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className={`flex items-center gap-1 text-xs ${
                      isHomeActive
                        ? 'font-semibold text-white'
                        : 'font-medium dark:text-[#E5E5EA] text-[#1C1C1E]'
                    }`}
                  >
                    <span className="truncate">Maison</span>
                    {isHomeActive && (
                      <Check className="h-3.5 w-3.5 shrink-0 stroke-[2.75]" aria-hidden="true" />
                    )}
                  </span>
                  <span
                    className={`block truncate text-[11px] font-normal ${
                      isHomeActive ? 'text-white/85' : 'dark:text-[#8E8E93] text-[#636366]'
                    }`}
                  >
                    {profile.home.address}
                  </span>
                </span>
              </button>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  openEditor('home');
                }}
                aria-label="Modifier l'adresse Maison"
                title="Modifier l'adresse Maison"
                className={`inline-flex w-10 shrink-0 items-center justify-center border-l transition-colors ${
                  isHomeActive
                    ? 'border-white/20 text-white/85 hover:bg-white/15 hover:text-white'
                    : 'dark:border-white/10 border-black/10 dark:text-[#8E8E93] text-[#636366] hover:text-[var(--text-primary)]'
                }`}
              >
                <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => openEditor('home')}
              className="flex min-h-[54px] items-center gap-3 rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--bg-surface)] px-3.5 py-2.5 text-left text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              <Home className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>Ajouter mon adresse Maison</span>
            </button>
          )}

          {profile.work ? (
            <div
              className={`flex min-h-[54px] items-stretch overflow-hidden rounded-2xl border transition-all ${
                isWorkActive
                  ? 'bg-[#0A84FF] text-white border-[#0A84FF] shadow-[0_0_16px_rgba(10,132,255,0.45)] font-semibold'
                  : 'dark:bg-[#2C2C2E]/80 dark:text-[#8E8E93] dark:border-white/10 bg-[#E5E5EA]/85 text-[#636366] border-black/10'
              }`}
            >
              <button
                type="button"
                aria-pressed={isWorkActive}
                onClick={() => onJoinFromProfile('work')}
                className="flex min-w-0 flex-1 items-center gap-2.5 px-3 py-2 text-left transition-transform active:scale-[0.98]"
              >
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors ${
                    isWorkActive
                      ? 'bg-white/20 text-white'
                      : 'dark:bg-white/10 dark:text-[#8E8E93] bg-black/5 text-[#636366]'
                  }`}
                >
                  <FavoriteSpotIcon type="work" filled={isWorkActive} className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className={`flex items-center gap-1 text-xs ${
                      isWorkActive
                        ? 'font-semibold text-white'
                        : 'font-medium dark:text-[#E5E5EA] text-[#1C1C1E]'
                    }`}
                  >
                    <span className="truncate">Travail</span>
                    {isWorkActive && (
                      <Check className="h-3.5 w-3.5 shrink-0 stroke-[2.75]" aria-hidden="true" />
                    )}
                  </span>
                  <span
                    className={`block truncate text-[11px] font-normal ${
                      isWorkActive ? 'text-white/85' : 'dark:text-[#8E8E93] text-[#636366]'
                    }`}
                  >
                    {profile.work.address}
                  </span>
                </span>
              </button>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  openEditor('work');
                }}
                aria-label="Modifier l'adresse Travail"
                title="Modifier l'adresse Travail"
                className={`inline-flex w-10 shrink-0 items-center justify-center border-l transition-colors ${
                  isWorkActive
                    ? 'border-white/20 text-white/85 hover:bg-white/15 hover:text-white'
                    : 'dark:border-white/10 border-black/10 dark:text-[#8E8E93] text-[#636366] hover:text-[var(--text-primary)]'
                }`}
              >
                <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => openEditor('work')}
              className="flex min-h-[54px] items-center gap-3 rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--bg-surface)] px-3.5 py-2.5 text-left text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              <Briefcase className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>Ajouter mon adresse Travail</span>
            </button>
          )}
        </div>
      )}

      {/* Editable Profile Form */}
      {isEditing && (
        <form
          onSubmit={handleSave}
          className="mt-3 space-y-3 border-t border-[var(--border-subtle)] pt-3"
        >
          <div>
            <label
              htmlFor="profile-name-input"
              className="block text-[11px] font-medium text-[var(--text-secondary)]"
            >
              Mon prénom
            </label>
            <input
              id="profile-name-input"
              type="text"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              placeholder="Ex: Clem"
              maxLength={35}
              className="mt-1 min-h-[42px] w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] focus:border-[#0A84FF] focus:outline-none"
            />
          </div>

          <div className="space-y-2.5">
            <div>
              <label
                htmlFor="profile-home-input"
                className="flex items-center gap-1.5 text-[11px] font-medium text-[var(--text-secondary)]"
              >
                <Home className="h-3 w-3 text-[#0A84FF]" aria-hidden="true" />
                <span>Maison</span>
              </label>
              <div className="mt-1">
                {mapsReady ? (
                  <AddressAutocompleteInput
                    inputId="profile-home-input"
                    value={draftHomeText}
                    isSelectedCoordsValid={draftHome !== null}
                    placeholder="Adresse de ta maison…"
                    onChangeText={(txt) => {
                      setDraftHomeText(txt);
                      setDraftHome(null);
                    }}
                    onSelectAddress={(sel) => {
                      setDraftHomeText(sel.address);
                      setDraftHome({address: sel.address, lat: sel.lat, lng: sel.lng});
                      setError(null);
                    }}
                  />
                ) : (
                  <div className="flex min-h-[42px] items-center rounded-xl border border-[#FF9F0A]/30 bg-[#FF9F0A]/10 px-3 text-xs text-[#FF9F0A]">
                    Configure une clé Google Maps pour rechercher ton adresse.
                  </div>
                )}
              </div>
            </div>

            <div>
              <label
                htmlFor="profile-work-input"
                className="flex items-center gap-1.5 text-[11px] font-medium text-[var(--text-secondary)]"
              >
                <Briefcase className="h-3 w-3 text-[#30D158]" aria-hidden="true" />
                <span>Travail</span>
              </label>
              <div className="mt-1">
                {mapsReady ? (
                  <AddressAutocompleteInput
                    inputId="profile-work-input"
                    value={draftWorkText}
                    isSelectedCoordsValid={draftWork !== null}
                    placeholder="Adresse de ton travail…"
                    onChangeText={(txt) => {
                      setDraftWorkText(txt);
                      setDraftWork(null);
                    }}
                    onSelectAddress={(sel) => {
                      setDraftWorkText(sel.address);
                      setDraftWork({address: sel.address, lat: sel.lat, lng: sel.lng});
                      setError(null);
                    }}
                  />
                ) : (
                  <div className="flex min-h-[42px] items-center rounded-xl border border-[#FF9F0A]/30 bg-[#FF9F0A]/10 px-3 text-xs text-[#FF9F0A]">
                    Configure une clé Google Maps pour rechercher ton adresse.
                  </div>
                )}
              </div>
            </div>
          </div>

          <div>
            <span className="mb-1.5 block text-[11px] font-medium text-[var(--text-secondary)]">
              Transport préféré
            </span>
            <div className="grid grid-cols-4 gap-1 rounded-xl bg-[var(--bg-surface)] p-1">
              {MODES.map((m) => {
                const Icon = m.icon;
                const active = draftMode === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setDraftMode(m.id)}
                    className={`flex min-h-[38px] flex-col sm:flex-row items-center justify-center gap-1 rounded-lg px-1.5 py-1 text-[11px] font-semibold transition-all ${
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

          {error && (
            <p role="alert" className="text-xs font-medium text-[#FF453A]">
              {error}
            </p>
          )}

          <div className="flex items-center justify-end gap-2">
            {hasSavedProfile && (
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="min-h-[40px] rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-1.5 text-xs font-medium text-[var(--text-primary)]"
              >
                Annuler
              </button>
            )}
            <button
              type="submit"
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full bg-[#0A84FF] px-5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#0A84FF]/90"
            >
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Enregistrer</span>
            </button>
          </div>
        </form>
      )}
    </section>
  );
};
