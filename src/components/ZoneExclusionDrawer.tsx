import React, {useState} from 'react';
import {Ban, ChevronDown, ChevronUp, MapPinOff, Plus, X} from 'lucide-react';
import type {ExcludedCustomZone, ExcludedZones} from '../types/apero';
import {PARIS_ARRONDISSEMENTS} from '../utils/geo';
import {AddressAutocompleteInput} from './AddressAutocompleteInput';

interface ZoneExclusionDrawerProps {
  excludedZones: ExcludedZones;
  mapsReady: boolean;
  onTogglePostalCode: (postalCode: string, label?: string) => void;
  onRemovePostalCode: (postalCode: string) => void;
  onAddCustomZone: (zone: ExcludedCustomZone) => void;
  onRemoveCustomZone: (zoneId: string) => void;
  onClearAll: () => void;
}

const REGION_TYPES = ['(regions)'];

export const ZoneExclusionDrawer: React.FC<ZoneExclusionDrawerProps> = ({
  excludedZones,
  mapsReady,
  onTogglePostalCode,
  onRemovePostalCode,
  onAddCustomZone,
  onRemoveCustomZone,
  onClearAll,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [zoneInput, setZoneInput] = useState('');

  const parisCodesSet = new Set(PARIS_ARRONDISSEMENTS.map((a) => a.code));
  const extraPostalCodes = excludedZones.postalCodes.filter((c) => !parisCodesSet.has(c));

  const totalExcludedCount =
    excludedZones.postalCodes.length + excludedZones.customZones.length;

  const trimmedInput = zoneInput.trim();
  const isDirectPostalInput = /^\d{5}$/.test(trimmedInput);

  return (
    <section
      aria-label="Exclure des quartiers ou villes"
      className="rounded-2xl border border-white/10 bg-[#1C1C1E]/75 backdrop-blur-xl"
    >
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        className="flex min-h-[50px] w-full items-center justify-between gap-3 rounded-2xl px-4 py-3 text-left transition-colors hover:bg-white/[0.04]"
      >
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#FF453A]/15 text-[#FF453A]">
            <Ban className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <span className="block text-sm font-semibold tracking-tight text-white">
              Exclure des quartiers / villes
            </span>
            <span className="block truncate text-xs text-[#8E8E93]">
              {totalExcludedCount === 0
                ? 'Paris et limitrophes autorisés'
                : `${totalExcludedCount} exclusion${totalExcludedCount > 1 ? 's' : ''} · spirale auto si besoin`}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {totalExcludedCount > 0 && (
            <span className="rounded-full bg-[#FF453A]/20 px-2.5 py-0.5 text-xs font-semibold text-[#FF453A] tabular-nums">
              {totalExcludedCount}
            </span>
          )}
          {isOpen ? (
            <ChevronUp className="h-4 w-4 text-[#8E8E93]" aria-hidden="true" />
          ) : (
            <ChevronDown className="h-4 w-4 text-[#8E8E93]" aria-hidden="true" />
          )}
        </div>
      </button>

      {isOpen && (
        <div className="space-y-4 border-t border-white/10 px-4 pb-4 pt-3.5">
          {/* Paris 1er - 20e tactile pills */}
          <div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-[#8E8E93]">
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
                        : 'border-white/10 bg-[#2C2C2E]/70 text-white/85 hover:border-white/25 hover:text-white'
                    }`}
                  >
                    {arr.shortLabel}
                  </button>
                );
              })}
            </div>
          </div>

          {/* City / Postal Code Exclusion via Google Places (regions) */}
          <div>
            <label
              htmlFor="exclude-zone-input"
              className="block text-xs font-medium text-[#8E8E93]"
            >
              Exclure une ville ou un code postal (ex: Montreuil 93100, Boulogne 92100)
            </label>
            <div className="mt-2 space-y-2">
              {mapsReady ? (
                <AddressAutocompleteInput
                  inputId="exclude-zone-input"
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
                <div className="flex min-h-[44px] items-center rounded-xl border border-white/10 bg-[#2C2C2E]/50 px-3 text-xs text-[#8E8E93]">
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
      )}
    </section>
  );
};
