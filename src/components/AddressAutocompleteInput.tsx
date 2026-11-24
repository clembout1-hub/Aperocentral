import React, {useEffect, useRef, useState} from 'react';
import {useMapsLibrary} from '@vis.gl/react-google-maps';
import {Loader2, MapPin, X} from 'lucide-react';
import {extractPostalCode} from '../utils/geo';

export interface SelectedAddress {
  address: string;
  lat: number;
  lng: number;
  postalCode?: string | null;
  shortName?: string | null;
}

interface AddressAutocompleteInputProps {
  value: string;
  onChangeText: (text: string) => void;
  onSelectAddress: (selected: SelectedAddress) => void;
  placeholder?: string;
  inputId?: string;
  isSelectedCoordsValid?: boolean;
  includedPrimaryTypes?: string[];
}

export const AddressAutocompleteInput: React.FC<AddressAutocompleteInputProps> = ({
  value,
  onChangeText,
  onSelectAddress,
  placeholder = 'Ex: Châtelet, Bastille, 12 rue Oberkampf…',
  inputId = 'participant-address',
  isSelectedCoordsValid = false,
  includedPrimaryTypes,
}) => {
  const placesLib = useMapsLibrary('places');
  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const [suggestions, setSuggestions] = useState<google.maps.places.AutocompleteSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [suppressNextFetch, setSuppressNextFetch] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!placesLib) return;
    if (suppressNextFetch) {
      setSuppressNextFetch(false);
      return;
    }

    const trimmed = value.trim();
    if (trimmed.length < 2 || isSelectedCoordsValid) {
      setSuggestions([]);
      setFetchError(null);
      setIsOpen(false);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        setIsLoading(true);
        setFetchError(null);
        const {AutocompleteSessionToken, AutocompleteSuggestion} = placesLib;
        if (!sessionTokenRef.current) {
          sessionTokenRef.current = new AutocompleteSessionToken();
        }

        const res = await AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: trimmed,
          sessionToken: sessionTokenRef.current,
          language: 'fr',
          region: 'FR',
          includedRegionCodes: ['FR'],
          ...(includedPrimaryTypes && includedPrimaryTypes.length > 0
            ? {includedPrimaryTypes}
            : {}),
          internalUsageAttributionIds: ['gmp_mcp_codeassist_v1_aistudio'],
        });

        if (!cancelled) {
          const list = res.suggestions || [];
          setSuggestions(list);
          setIsOpen(true);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('RESOURCE_EXHAUSTED') || msg.includes('OVER_QUERY_LIMIT') || msg.includes('429')) {
          window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
        }
        if (!cancelled) {
          setSuggestions([]);
          setFetchError('Suggestions indisponibles (vérifie la clé API Google Maps).');
          setIsOpen(true);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }, 220);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [placesLib, value, isSelectedCoordsValid, suppressNextFetch, includedPrimaryTypes]);

  const handleSelectSuggestion = async (suggestion: google.maps.places.AutocompleteSuggestion) => {
    if (!placesLib || !suggestion.placePrediction) return;

    try {
      setIsLoading(true);
      setFetchError(null);
      const place = suggestion.placePrediction.toPlace();
      await place.fetchFields({
        fields: ['displayName', 'formattedAddress', 'addressComponents', 'location'],
      });

      const loc = place.location;
      if (loc) {
        const formatted =
          place.formattedAddress ||
          suggestion.placePrediction.text.text ||
          place.displayName ||
          value;

        const postalCode = extractPostalCode(formatted, place.addressComponents);

        setSuppressNextFetch(true);
        onSelectAddress({
          address: formatted,
          lat: loc.lat(),
          lng: loc.lng(),
          postalCode,
          shortName: place.displayName || suggestion.placePrediction.mainText?.text || null,
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('RESOURCE_EXHAUSTED') || msg.includes('OVER_QUERY_LIMIT') || msg.includes('429')) {
        window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
      }
      setFetchError('Impossible de récupérer les coordonnées de ce lieu.');
    } finally {
      sessionTokenRef.current = null;
      setSuggestions([]);
      setIsOpen(false);
      setIsLoading(false);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <div className="relative flex items-center">
        <MapPin
          className={`pointer-events-none absolute left-3 h-4 w-4 ${
            isSelectedCoordsValid ? 'text-[#30D158]' : 'text-[#8E8E93]'
          }`}
          aria-hidden="true"
        />
        <input
          id={inputId}
          type="text"
          value={value}
          onChange={(e) => {
            onChangeText(e.target.value);
          }}
          onFocus={() => {
            if ((suggestions.length > 0 || fetchError) && !isSelectedCoordsValid) {
              setIsOpen(true);
            }
          }}
          placeholder={placeholder}
          autoComplete="off"
          className={`min-h-[44px] w-full rounded-xl border bg-[#2C2C2E]/70 pl-9 pr-10 py-2.5 text-sm text-white placeholder:text-[#8E8E93] focus:outline-none transition-colors ${
            isSelectedCoordsValid
              ? 'border-[#30D158]/50 focus:border-[#30D158]'
              : 'border-white/10 focus:border-[#0A84FF]'
          }`}
        />
        {isLoading ? (
          <Loader2
            className="absolute right-3 h-4 w-4 animate-spin text-[#0A84FF]"
            aria-label="Recherche d'adresse"
          />
        ) : (
          value.length > 0 && (
            <button
              type="button"
              onClick={() => {
                onChangeText('');
                setSuggestions([]);
                setFetchError(null);
                setIsOpen(false);
              }}
              aria-label="Effacer l'adresse"
              className="absolute right-1.5 inline-flex h-8 w-8 items-center justify-center rounded-full text-[#8E8E93] hover:bg-white/10 hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )
        )}
      </div>

      {isOpen && (suggestions.length > 0 || fetchError || (!isLoading && value.trim().length >= 2 && !isSelectedCoordsValid)) && (
        <ul
          role="listbox"
          className="absolute left-0 right-0 z-50 mt-1.5 max-h-60 overflow-y-auto rounded-2xl border border-white/15 bg-[#1C1C1E]/95 py-1 shadow-2xl backdrop-blur-2xl"
        >
          {fetchError ? (
            <li className="px-3.5 py-2.5 text-xs text-[#FF453A]">{fetchError}</li>
          ) : suggestions.length === 0 ? (
            <li className="px-3.5 py-2.5 text-xs text-[#8E8E93]">Aucune suggestion trouvée.</li>
          ) : (
            suggestions.map((suggestion, index) => {
              const label = suggestion.placePrediction?.text.text;
              if (!label) return null;
              return (
                <li key={suggestion.placePrediction?.placeId || index}>
                  <button
                    type="button"
                    onClick={() => void handleSelectSuggestion(suggestion)}
                    className="flex min-h-[44px] w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm text-white/90 transition-colors hover:bg-[#0A84FF]/20 hover:text-white"
                  >
                    <MapPin className="h-4 w-4 shrink-0 text-[#0A84FF]" aria-hidden="true" />
                    <span className="line-clamp-2">{label}</span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
};
