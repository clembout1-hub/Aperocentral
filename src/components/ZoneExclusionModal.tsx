import React, {useState} from 'react';
import {Ban, MapPinOff, Plus, X} from 'lucide-react';
import type {ExcludedCustomZone, ExcludedZones} from '../types/apero';
import {PARIS_ARRONDISSEMENTS} from '../utils/geo';
import {AddressAutocompleteInput} from './AddressAutocompleteInput';

interface ZoneExclusionModalProps {
  isOpen: boolean;
  onClose: () => void;
  excludedZones: ExcludedZones;
  mapsReady: boolean;
  onTogglePostalCode: (postalCode: string, label?: string) => void;
  onRemovePostalCode: (postalCode: string) => void;
  onAddCustomZone: (zone: ExcludedCustomZone) => void;
  onRemoveCustomZone: (zoneId: string) => void;
  onClearAll: () => void;
}

const REGION_TYPES = ['(regions)'];

export const ZoneExclusionModal: React.FC<ZoneExclusionModalProps> = ({
  isOpen,
  onClose,
  excludedZones,
  mapsReady,
  onTogglePostalCode,
  onRemovePostalCode,
  onAddCustomZone,
  onRemoveCustomZone,
  onClearAll,
}) => {
  const [zoneInput, setZoneInput] = useState('');

  if (!isOpen) return null;

  const parisCodesSet = new Set(PARIS_ARRONDISSEMENTS.map((a) => a.code));
  const extraPostalCodes = excludedZones.postalCodes.filter((c) => !parisCodesSet.has(c));
  const totalExcludedCount =
    excludedZones.postalCodes.length + excludedZones.customZones.length;

  const trimmedInput = zoneInput.trim();
  const isDirectPostalInput = /^\d{5}$/.test(trimmedInput);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[var(--bg-backdrop)] backdrop-blur-md p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="exclusions-modal-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-t-3xl sm:rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-card-strong)] p-5 shadow-2xl backdrop-blur-2xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#FF453A]/15 text-[#FF453A]">
              <Ban className="h-4 w-4" aria-hidden="true" />
            </span>
            <div>
              <h2
                id="exclusions-modal-title"
                className="text-base font-semibold tracking-tight text-[var(--text-primary)]"
              >
                Exclure des quartiers / villes
              </h2>
              <p className="text-xs text-[var(--text-secondary)]">
                {totalExcludedCount === 0
                  ? 'Paris et limitrophes autorisés'
                  : `${totalExcludedCount} exclusion${totalExcludedCount > 1 ? 's' : ''} · spirale auto si besoin`}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer les exclusions"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 flex-1 overflow-y-auto space-y-4 pr-0.5">
          {/* Paris 1er - 20e tactile pills */}
          <div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-[var(--text-secondary)]">
                Arrondissements de Paris
              </span>
              {totalExcludedCount > 0 && (
                <button
                  type="button"
                  onClick={onClearAll}
                  className="text-xs font-medium text-[#0A84FF] hover:opacity-80"
                >
                  Tout réautoriser
                </button>
              )}
            </div>

            <div className="mt-2.5 grid grid-cols-5 gap-1.5 sm:grid-cols-10">
              {PARIS_ARRONDISSEMENTS.map((arr) => {
                const excluded = excludedZones.postalCodes.includes(arr.code);
                return (
                  <button
                    key={arr.code}
                    type="button"
                    onClick={() => onTogglePostalCode(arr.code, `Paris ${arr.shortLabel}`)}
                    aria-pressed={excluded}
                    title={`${arr.shortLabel} (${arr.code})`}
                    className={`min-h-[36px] rounded-full border px-1.5 py-1 text-xs font-semibold transition-all tabular-nums ${
                      excluded
                        ? 'border-[#FF453A]/50 bg-[#FF453A]/15 text-[#FF453A] line-through decoration-[#FF453A] decoration-2'
                        : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    {arr.shortLabel}
                  </button>
                );
              })}
            </div>
          </div>

          {/* City / Postal Code Exclusion */}
          <div>
            <label
              htmlFor="exclude-zone-modal-input"
              className="block text-xs font-medium text-[var(--text-secondary)]"
            >
              Exclure une ville ou un code postal (ex: Montreuil 93100, Boulogne 92100)
            </label>
            <div className="mt-2 space-y-2">
              {mapsReady ? (
                <AddressAutocompleteInput
                  inputId="exclude-zone-modal-input"
                  value={zoneInput}
                  onChangeText={setZoneInput}
                  includedPrimaryTypes={REGION_TYPES}
                  placeholder="Ex: Montreuil, 93100, Boulogne-Billancourt…"
                  onSelectAddress={(selected) => {
                    const shortLabel =
                      selected.shortName ||
                      selected.address.split(',')[0]?.trim() ||
                      selected.address;

                    if (selected.postalCode) {
                      if (!excludedZones.postalCodes.includes(selected.postalCode)) {
                        onTogglePostalCode(selected.postalCode, shortLabel.slice(0, 32));
                      }
                    } else {
                      onAddCustomZone({
                        id: `ez_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`,
                        label: shortLabel.slice(0, 48),
                        lat: selected.lat,
                        lng: selected.lng,
                        radiusMeters: 1500,
                      });
                    }
                    setZoneInput('');
                  }}
                />
              ) : (
                <div className="flex min-h-[44px] items-center rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 text-xs text-[var(--text-secondary)]">
                  Configure une clé Google Maps pour rechercher des villes.
                </div>
              )}

              {isDirectPostalInput && !excludedZones.postalCodes.includes(trimmedInput) && (
                <button
                  type="button"
                  onClick={() => {
                    onTogglePostalCode(trimmedInput);
                    setZoneInput('');
                  }}
                  className="inline-flex min-h-[38px] items-center gap-1.5 rounded-full border border-[#FF453A]/40 bg-[#FF453A]/15 px-3 py-1.5 text-xs font-semibold text-[#FF453A] hover:bg-[#FF453A]/25"
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Exclure le code postal {trimmedInput}</span>
                </button>
              )}
            </div>

            {(extraPostalCodes.length > 0 || excludedZones.customZones.length > 0) && (
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {extraPostalCodes.map((code) => {
                  const label = excludedZones.postalCodeLabels?.[code];
                  return (
                    <span
                      key={code}
                      className="inline-flex items-center gap-1.5 rounded-full border border-[#FF453A]/40 bg-[#FF453A]/15 px-3 py-1 text-xs font-medium text-[#FF453A]"
                    >
                      <MapPinOff className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <span className="line-through decoration-[#FF453A]">
                        {label ? `${label} · ${code}` : code}
                      </span>
                      <button
                        type="button"
                        onClick={() => onRemovePostalCode(code)}
                        aria-label={`Réautoriser ${code}`}
                        className="ml-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full hover:bg-[#FF453A]/25"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  );
                })}

                {excludedZones.customZones.map((zone) => (
                  <span
                    key={zone.id}
                    className="inline-flex items-center gap-1.5 rounded-full border border-[#FF453A]/40 bg-[#FF453A]/15 px-3 py-1 text-xs font-medium text-[#FF453A]"
                  >
                    <MapPinOff className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span className="line-through decoration-[#FF453A]">{zone.label}</span>
                    <button
                      type="button"
                      onClick={() => onRemoveCustomZone(zone.id)}
                      aria-label={`Retirer ${zone.label} des zones exclues`}
                      className="ml-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full hover:bg-[#FF453A]/25"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-4 min-h-[44px] w-full rounded-full bg-[#0A84FF] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0A84FF]/90"
        >
          Valider
        </button>
      </div>
    </div>
  );
};
