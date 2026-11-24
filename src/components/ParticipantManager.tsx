import React, {useEffect, useRef, useState} from 'react';
import {
  Bike,
  BookmarkPlus,
  Briefcase,
  Car,
  Check,
  Footprints,
  Home,
  Pencil,
  Plus,
  Trash2,
  TrainFront,
  UserPlus,
  X,
} from 'lucide-react';
import type {Participant, SavedFavoriteAddress, TransportMode} from '../types/apero';
import {getModeLabel} from '../utils/geo';
import {
  loadFavoriteAddresses,
  loadUserPrefs,
  saveFavoriteAddresses,
  saveUserPrefs,
} from '../utils/storage';
import {AddressAutocompleteInput} from './AddressAutocompleteInput';

interface ParticipantManagerProps {
  participants: Participant[];
  onUpsertParticipant: (participant: Participant) => void;
  onRemoveParticipant: (participantId: string) => void;
  activeUserName: string;
  onSetActiveUserName: (name: string) => void;
  mapsReady: boolean;
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
  onUpsertParticipant,
  onRemoveParticipant,
  activeUserName,
  onSetActiveUserName,
  mapsReady,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [coords, setCoords] = useState<{lat: number; lng: number} | null>(null);
  const [mode, setMode] = useState<TransportMode>('TRANSIT');
  const [rememberMe, setRememberMe] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(true);
  const [favorites, setFavorites] = useState<SavedFavoriteAddress[]>(() => loadFavoriteAddresses());
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const [editingFavSlot, setEditingFavSlot] = useState<'Maison' | 'Travail' | null>(null);
  const [favAddressInput, setFavAddressInput] = useState('');
  const [favCoords, setFavCoords] = useState<{lat: number; lng: number} | null>(null);
  const [favError, setFavError] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const prefs = loadUserPrefs();
    if (prefs && !editingId) {
      setName((prev) => prev || prefs.name);
      setAddress((prev) => prev || prefs.address);
      setCoords((prev) => prev || {lat: prefs.lat, lng: prefs.lng});
      setMode(prefs.mode);
      if (!activeUserName && prefs.name) {
        onSetActiveUserName(prefs.name);
      }
      const alreadyJoined = participants.some(
        (p) => p.name.trim().toLowerCase() === prefs.name.trim().toLowerCase()
      );
      if (alreadyJoined && participants.length > 0) {
        setShowForm(false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!savedNotice) return;
    const t = window.setTimeout(() => setSavedNotice(null), 2400);
    return () => window.clearTimeout(t);
  }, [savedNotice]);

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

  const handleOpenFavoriteEditor = (slot: 'Maison' | 'Travail', existing?: SavedFavoriteAddress) => {
    if (editingFavSlot === slot) {
      setEditingFavSlot(null);
      setFavError(null);
      return;
    }
    setEditingFavSlot(slot);
    setFavAddressInput(existing?.address || '');
    setFavCoords(existing ? {lat: existing.lat, lng: existing.lng} : null);
    setFavError(null);
  };

  const handleSaveInlineFavorite = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingFavSlot) return;
    if (!favCoords || !favAddressInput.trim()) {
      setFavError('Sélectionne une adresse dans les suggestions Google Maps.');
      return;
    }
    const existing = favorites.find(
      (f) => f.label.toLowerCase() === editingFavSlot.toLowerCase()
    );
    const nextItem: SavedFavoriteAddress = {
      id: editingFavSlot.toLowerCase(),
      label: editingFavSlot,
      address: favAddressInput.trim(),
      lat: favCoords.lat,
      lng: favCoords.lng,
      mode: existing?.mode || mode || 'TRANSIT',
    };
    const nextFavorites = [
      ...favorites.filter((f) => f.label.toLowerCase() !== editingFavSlot.toLowerCase()),
      nextItem,
    ];
    setFavorites(nextFavorites);
    saveFavoriteAddresses(nextFavorites);
    setEditingFavSlot(null);
    setFavAddressInput('');
    setFavCoords(null);
    setFavError(null);
    setSavedNotice(`Adresse « ${editingFavSlot} » enregistrée`);
  };

  const handleSaveFavorite = (label: 'Maison' | 'Travail') => {
    if (!coords || !address.trim()) {
      setFormError(`Choisis d'abord une adresse pour enregistrer "${label}".`);
      return;
    }
    const nextItem: SavedFavoriteAddress = {
      id: label.toLowerCase(),
      label,
      address: address.trim(),
      lat: coords.lat,
      lng: coords.lng,
      mode,
    };
    const nextFavorites = [
      ...favorites.filter((f) => f.label.toLowerCase() !== label.toLowerCase()),
      nextItem,
    ];
    setFavorites(nextFavorites);
    saveFavoriteAddresses(nextFavorites);
    setSavedNotice(`"${label}" mémorisé sur ce téléphone`);
    setFormError(null);
  };

  const handleRemoveFavorite = (id: string) => {
    const next = favorites.filter((f) => f.id !== id);
    setFavorites(next);
    saveFavoriteAddresses(next);
    if (editingFavSlot && editingFavSlot.toLowerCase() === id.toLowerCase()) {
      setEditingFavSlot(null);
    }
  };

  const handleOneTapFavorite = (fav: SavedFavoriteAddress) => {
    const prefs = loadUserPrefs();
    const resolvedName = (name.trim() || activeUserName.trim() || prefs?.name || '').trim();

    // Always populate form fields immediately
    setAddress(fav.address);
    setCoords({lat: fav.lat, lng: fav.lng});
    setMode(fav.mode);
    setFormError(null);

    if (!resolvedName) {
      setShowForm(true);
      setFormError(`Adresse « ${fav.label} » chargée : indique ton prénom puis valide.`);
      window.setTimeout(() => nameInputRef.current?.focus(), 60);
      return;
    }

    // If the user already has the add/edit form open, keep it filled so they can verify or edit
    if (showForm) {
      setName(resolvedName);
      setSavedNotice(`Adresse « ${fav.label} » remplie`);
      return;
    }

    const existing = participants.find(
      (p) => p.name.trim().toLowerCase() === resolvedName.toLowerCase()
    );

    const participant: Participant = {
      id:
        existing?.id ||
        `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      name: resolvedName,
      address: fav.address,
      lat: fav.lat,
      lng: fav.lng,
      mode: fav.mode,
    };

    onUpsertParticipant(participant);
    onSetActiveUserName(resolvedName);
    if (rememberMe) {
      saveUserPrefs({
        name: resolvedName,
        address: fav.address,
        lat: fav.lat,
        lng: fav.lng,
        mode: fav.mode,
      });
    }
    setEditingId(null);
    setSavedNotice(`${resolvedName} ajouté depuis ${fav.label}`);
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
    onSetActiveUserName(cleanName);

    if (rememberMe) {
      saveUserPrefs({
        name: cleanName,
        address: address.trim(),
        lat: coords.lat,
        lng: coords.lng,
        mode,
      });
    }

    setFormError(null);
    setEditingId(null);
    setName('');
    setAddress('');
    setCoords(null);
    setShowForm(false);
  };

  const favoriteSlots: {label: 'Maison' | 'Travail'; icon: typeof Home}[] = [
    {label: 'Maison', icon: Home},
    {label: 'Travail', icon: Briefcase},
  ];

  return (
    <section
      aria-labelledby="participants-heading"
      className="rounded-2xl border border-white/10 bg-[#1C1C1E]/75 p-4 backdrop-blur-xl"
    >
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 id="participants-heading" className="text-base font-semibold tracking-tight text-white">
            Participants ({participants.length})
          </h2>
          <p className="text-xs text-[#8E8E93]">
            Touche un prénom pour modifier son trajet
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            if (showForm && editingId) {
              resetFormToFresh();
            } else {
              if (!showForm && !editingId) {
                const prefs = loadUserPrefs();
                if (prefs && !participants.some((p) => p.name.toLowerCase() === prefs.name.toLowerCase())) {
                  setName(prefs.name);
                  setAddress(prefs.address);
                  setCoords({lat: prefs.lat, lng: prefs.lng});
                  setMode(prefs.mode);
                }
              }
              setShowForm((prev) => !prev);
            }
          }}
          className="inline-flex min-h-[38px] items-center gap-1.5 rounded-full bg-[#0A84FF]/15 px-3.5 py-1.5 text-xs font-semibold text-[#0A84FF] transition-colors hover:bg-[#0A84FF]/25 whitespace-nowrap shrink-0"
        >
          {showForm ? (
            <>
              <X className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Fermer</span>
            </>
          ) : (
            <>
              <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Ajouter</span>
            </>
          )}
        </button>
      </div>

      {/* Always-available Maison & Travail Favorite Chips */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-medium text-[#8E8E93]">Favoris :</span>
        {favoriteSlots.map(({label, icon: Icon}) => {
          const saved = favorites.find(
            (f) => f.label.toLowerCase() === label.toLowerCase()
          );

          if (!saved) {
            const isEditingThis = editingFavSlot === label;
            return (
              <button
                key={label}
                type="button"
                onClick={() => handleOpenFavoriteEditor(label)}
                className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  isEditingThis
                    ? 'border-[#0A84FF] bg-[#0A84FF]/15 text-[#0A84FF]'
                    : 'border-dashed border-white/20 bg-[#2C2C2E]/50 text-white/80 hover:border-[#0A84FF]/50 hover:text-white'
                }`}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>+ {label}</span>
              </button>
            );
          }

          return (
            <div
              key={label}
              className="inline-flex items-center overflow-hidden rounded-full border border-[#0A84FF]/35 bg-[#0A84FF]/15"
            >
              <button
                type="button"
                onClick={() => handleOneTapFavorite(saved)}
                title={`${saved.label} : ${saved.address}`}
                className="inline-flex min-h-[36px] items-center gap-1.5 px-3 py-1 text-xs font-semibold text-[#0A84FF] transition-colors hover:bg-[#0A84FF]/15"
              >
                <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>{saved.label}</span>
              </button>
              <button
                type="button"
                onClick={() => handleOpenFavoriteEditor(label, saved)}
                aria-label={`Modifier ${saved.label}`}
                title={`Modifier ${saved.label}`}
                className="inline-flex min-h-[36px] items-center justify-center border-l border-white/10 px-2 text-[#8E8E93] hover:bg-white/10 hover:text-white"
              >
                <Pencil className="h-3 w-3" />
              </button>
              <button
                type="button"
                onClick={() => handleRemoveFavorite(saved.id)}
                aria-label={`Supprimer le favori ${saved.label}`}
                title={`Supprimer ${saved.label}`}
                className="inline-flex min-h-[36px] items-center justify-center border-l border-white/10 px-2 text-[#8E8E93] hover:bg-[#FF453A]/20 hover:text-[#FF453A]"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          );
        })}
      </div>

      {/* Inline Favorite Address Editor */}
      {editingFavSlot && (
        <form
          onSubmit={handleSaveInlineFavorite}
          className="mt-2.5 space-y-2.5 rounded-2xl border border-[#0A84FF]/35 bg-[#2C2C2E]/60 p-3"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-white">
              Adresse favorite « {editingFavSlot} »
            </span>
            <button
              type="button"
              onClick={() => {
                setEditingFavSlot(null);
                setFavError(null);
              }}
              aria-label="Fermer"
              className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[#8E8E93] hover:bg-white/10 hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {mapsReady ? (
            <AddressAutocompleteInput
              inputId="fav-address-input"
              value={favAddressInput}
              isSelectedCoordsValid={favCoords !== null}
              placeholder={`Saisis ton adresse ${editingFavSlot.toLowerCase()}…`}
              onChangeText={(txt) => {
                setFavAddressInput(txt);
                setFavCoords(null);
              }}
              onSelectAddress={(selected) => {
                setFavAddressInput(selected.address);
                setFavCoords({lat: selected.lat, lng: selected.lng});
                setFavError(null);
              }}
            />
          ) : (
            <div className="flex min-h-[42px] items-center rounded-xl border border-[#FF9F0A]/30 bg-[#FF9F0A]/10 px-3 text-xs text-[#FF9F0A]">
              Configure une clé Google Maps pour rechercher ton adresse.
            </div>
          )}

          {favError && (
            <p role="alert" className="text-xs font-medium text-[#FF453A]">
              {favError}
            </p>
          )}

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setEditingFavSlot(null);
                setFavError(null);
              }}
              className="min-h-[36px] rounded-full border border-white/10 bg-[#1C1C1E] px-3.5 py-1 text-xs font-medium text-white/80 hover:text-white"
            >
              Annuler
            </button>
            <button
              type="submit"
              className="min-h-[36px] rounded-full bg-[#0A84FF] px-4 py-1 text-xs font-semibold text-white hover:bg-[#0A84FF]/90"
            >
              Enregistrer
            </button>
          </div>
        </form>
      )}

      {savedNotice && (
        <p role="status" className="mt-2 text-xs font-medium text-[#30D158]">
          {savedNotice}
        </p>
      )}

      {/* Participant List (iOS grouped list) */}
      {participants.length > 0 && (
        <ul className="mt-3 divide-y divide-white/10 overflow-hidden rounded-2xl border border-white/10 bg-[#2C2C2E]/40">
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
                    isEditing ? 'bg-[#0A84FF]/15' : 'hover:bg-white/5'
                  }`}
                >
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${avatarTone}`}
                    aria-hidden="true"
                  >
                    {initial}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 text-sm font-semibold text-white">
                      <span className="truncate">{p.name}</span>
                      <span aria-hidden="true" className="text-[#8E8E93]">·</span>
                      <span className="text-xs font-medium text-[#0A84FF] whitespace-nowrap">
                        {getModeLabel(p.mode)}
                      </span>
                    </div>
                    <p className="truncate text-xs text-[#8E8E93]">{p.address}</p>
                  </div>
                  <Pencil className="h-3.5 w-3.5 shrink-0 text-[#8E8E93]" aria-hidden="true" />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (editingId === p.id) resetFormToFresh();
                    onRemoveParticipant(p.id);
                  }}
                  aria-label={`Supprimer ${p.name}`}
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[#8E8E93] transition-colors hover:bg-[#FF453A]/15 hover:text-[#FF453A]"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* iOS Grouped Add / Edit Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="mt-3.5 space-y-3 border-t border-white/10 pt-3.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-white/90">
              {editingId ? `Modifier ${name || 'ce participant'}` : 'Ajouter mon départ / un ami'}
            </span>
            {editingId && (
              <button
                type="button"
                onClick={resetFormToFresh}
                className="text-xs font-medium text-[#0A84FF] hover:opacity-80"
              >
                Nouveau
              </button>
            )}
          </div>

          <div className="divide-y divide-white/10 rounded-2xl border border-white/10 bg-[#2C2C2E]/40 p-3 space-y-3">
            <div className="pb-3">
              <label htmlFor="participant-name" className="block text-[11px] font-medium text-[#8E8E93]">
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
                className="mt-1 min-h-[42px] w-full rounded-xl border border-white/10 bg-[#2C2C2E]/70 px-3 py-2 text-sm text-white placeholder:text-[#8E8E93] focus:border-[#0A84FF] focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="participant-address" className="block text-[11px] font-medium text-[#8E8E93]">
                Point de départ
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

              {coords && (
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1 text-[11px] text-[#8E8E93]">
                    <BookmarkPlus className="h-3 w-3" aria-hidden="true" />
                    <span>Sauvegarder :</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => handleSaveFavorite('Maison')}
                    className="inline-flex min-h-[30px] items-center gap-1 rounded-full border border-white/10 bg-[#2C2C2E] px-2.5 py-1 text-[11px] font-medium text-white/90 hover:border-[#0A84FF]/60 hover:text-[#0A84FF]"
                  >
                    <Home className="h-3 w-3" aria-hidden="true" />
                    <span>Maison</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSaveFavorite('Travail')}
                    className="inline-flex min-h-[30px] items-center gap-1 rounded-full border border-white/10 bg-[#2C2C2E] px-2.5 py-1 text-[11px] font-medium text-white/90 hover:border-[#0A84FF]/60 hover:text-[#0A84FF]"
                  >
                    <Briefcase className="h-3 w-3" aria-hidden="true" />
                    <span>Travail</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* iOS Segmented Control (4 transport modes) */}
          <div>
            <span className="block text-[11px] font-medium text-[#8E8E93] mb-1.5">
              Mode de transport
            </span>
            <div
              role="radiogroup"
              aria-label="Mode de transport"
              className="grid grid-cols-4 gap-1 rounded-xl bg-[#2C2C2E]/85 p-1"
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
                        : 'text-[#8E8E93] hover:text-white'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span className="truncate">{m.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <label className="inline-flex min-h-[40px] cursor-pointer items-center gap-2 text-xs text-[#8E8E93] select-none">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="h-4 w-4 rounded border-white/20 bg-[#2C2C2E] accent-[#0A84FF]"
              />
              <span>Mémoriser sur ce téléphone</span>
            </label>

            <button
              type="submit"
              className="inline-flex min-h-[44px] w-full sm:w-auto items-center justify-center gap-1.5 rounded-full bg-[#0A84FF] px-5 py-2 text-sm font-semibold text-white transition-all hover:bg-[#0A84FF]/90 active:scale-[0.98]"
            >
              {editingId ? (
                <>
                  <Check className="h-4 w-4" aria-hidden="true" />
                  <span>Mettre à jour</span>
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  <span>Valider</span>
                </>
              )}
            </button>
          </div>

          {formError && (
            <p role="alert" className="text-xs font-medium text-[#FF453A]">
              {formError}
            </p>
          )}
        </form>
      )}
    </section>
  );
};
