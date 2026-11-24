import React, {useEffect, useMemo, useState} from 'react';
import {
  AdvancedMarker,
  InfoWindow,
  Map as GoogleMap,
  useAdvancedMarkerRef,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import {
  Beer,
  Crosshair,
  ExternalLink,
  Maximize2,
  Minimize2,
  Navigation,
  Star,
  TrainFront,
} from 'lucide-react';
import type {BarCandidate, ExcludedZones, Participant} from '../types/apero';
import {
  buildCitymapperUrl,
  buildGoogleMapsUrl,
  formatPriceLevel,
  isCheapBar,
} from '../utils/geo';

interface AperoMapProps {
  participants: Participant[];
  centerPoint: {lat: number; lng: number} | null;
  effectiveSearchCenter: {lat: number; lng: number} | null;
  excludedZones: ExcludedZones;
  shiftNotice: string | null;
  bars: BarCandidate[];
  selectedBarId: string | null;
  winningBarId: string | null;
  onSelectBar: (barId: string | null) => void;
  votes: Record<string, string[]>;
  customPrices: Record<string, string>;
  onMapReady?: (map: google.maps.Map | null) => void;
}

const MapInstanceBridge: React.FC<{onMapReady?: (map: google.maps.Map | null) => void}> = ({
  onMapReady,
}) => {
  const map = useMap();
  useEffect(() => {
    onMapReady?.(map ?? null);
  }, [map, onMapReady]);
  return null;
};

const BoundsFitter: React.FC<{
  participants: Participant[];
  centerPoint: {lat: number; lng: number} | null;
  effectiveSearchCenter: {lat: number; lng: number} | null;
  bars: BarCandidate[];
}> = ({participants, centerPoint, effectiveSearchCenter, bars}) => {
  const map = useMap();
  const coreLib = useMapsLibrary('core');

  useEffect(() => {
    if (!map || !coreLib) return;

    const points: {lat: number; lng: number}[] = [];
    for (const p of participants) {
      points.push({lat: p.lat, lng: p.lng});
    }
    if (centerPoint) {
      points.push(centerPoint);
    }
    if (effectiveSearchCenter) {
      points.push(effectiveSearchCenter);
    }
    for (const b of bars.slice(0, 8)) {
      points.push({lat: b.lat, lng: b.lng});
    }

    if (points.length === 0) return;

    if (points.length === 1) {
      map.panTo(points[0]);
      map.setZoom(14);
      return;
    }

    const bounds = new coreLib.LatLngBounds();
    for (const pt of points) {
      bounds.extend(pt);
    }
    map.fitBounds(bounds, {top: 44, right: 32, bottom: 44, left: 32});
  }, [map, coreLib, participants, centerPoint, effectiveSearchCenter, bars]);

  return null;
};

const MapRadiusOverlays: React.FC<{
  searchCenter: {lat: number; lng: number} | null;
  excludedZones: ExcludedZones;
}> = ({searchCenter, excludedZones}) => {
  const map = useMap();
  const mapsLib = useMapsLibrary('maps');

  useEffect(() => {
    if (!map || !mapsLib) return;

    const circles: google.maps.Circle[] = [];

    if (searchCenter) {
      circles.push(
        new mapsLib.Circle({
          map,
          center: searchCenter,
          radius: 800,
          strokeColor: '#0A84FF',
          strokeOpacity: 0.45,
          strokeWeight: 1.5,
          fillColor: '#0A84FF',
          fillOpacity: 0.08,
          clickable: false,
        })
      );
    }

    for (const zone of excludedZones.customZones) {
      circles.push(
        new mapsLib.Circle({
          map,
          center: {lat: zone.lat, lng: zone.lng},
          radius: zone.radiusMeters || 500,
          strokeColor: '#FF453A',
          strokeOpacity: 0.65,
          strokeWeight: 1.5,
          fillColor: '#FF453A',
          fillOpacity: 0.14,
          clickable: false,
        })
      );
    }

    return () => {
      for (const c of circles) {
        c.setMap(null);
      }
    };
  }, [map, mapsLib, searchCenter, excludedZones]);

  return null;
};

interface BarMarkerProps {
  bar: BarCandidate;
  isSelected: boolean;
  isWinner: boolean;
  voteCount: number;
  customPrice?: string;
  onSelect: () => void;
  onClose: () => void;
}

const BarMarker: React.FC<BarMarkerProps> = ({
  bar,
  isSelected,
  isWinner,
  voteCount,
  customPrice,
  onSelect,
  onClose,
}) => {
  const [markerRef, marker] = useAdvancedMarkerRef();
  const priceInfo = formatPriceLevel(bar.priceLevel);
  const cheap = isCheapBar(bar, customPrice);

  return (
    <>
      <AdvancedMarker
        ref={markerRef}
        position={{lat: bar.lat, lng: bar.lng}}
        onClick={onSelect}
        title={bar.name}
        zIndex={isSelected ? 50 : isWinner ? 40 : 20}
      >
        <div
          className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold shadow-lg transition-transform ${
            isSelected
              ? 'scale-110 border-white bg-white text-black'
              : isWinner
              ? 'border-white/70 bg-[#0A84FF] text-white'
              : cheap
              ? 'border-[#30D158]/60 bg-[#1C1C1E]/95 text-[#30D158]'
              : 'border-white/20 bg-[#1C1C1E]/95 text-white'
          }`}
        >
          <Beer
            className={`h-3 w-3 shrink-0 ${
              isSelected
                ? 'text-black'
                : isWinner
                ? 'text-white'
                : cheap
                ? 'text-[#30D158]'
                : 'text-[#FF9F0A]'
            }`}
            aria-hidden="true"
          />
          <span className="max-w-[88px] truncate">{bar.name}</span>
          {voteCount > 0 && (
            <span
              className={`rounded-full px-1.5 text-[10px] font-bold tabular-nums ${
                isSelected ? 'bg-black/15 text-black' : 'bg-white/15 text-white'
              }`}
            >
              {voteCount}
            </span>
          )}
        </div>
      </AdvancedMarker>

      {isSelected && marker && (
        <InfoWindow anchor={marker} onCloseClick={onClose} maxWidth={260}>
          <div className="min-w-[205px] space-y-2 p-1 text-neutral-900">
            <div>
              <p className="text-sm font-bold leading-snug text-black">{bar.name}</p>
              {bar.nearestStation && (
                <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-medium text-blue-600">
                  <TrainFront className="h-3 w-3 shrink-0" aria-hidden="true" />
                  <span>{bar.nearestStation}</span>
                </p>
              )}
              <p className="mt-0.5 text-xs text-neutral-600">{bar.address}</p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 text-xs font-medium text-neutral-700">
              {bar.rating !== null && (
                <span className="inline-flex items-center gap-0.5 tabular-nums">
                  <Star className="h-3.5 w-3.5 fill-amber-500 text-amber-500" aria-hidden="true" />
                  {bar.rating.toFixed(1)}
                </span>
              )}
              <span aria-hidden="true">·</span>
              <span>{priceInfo.label}</span>
              {customPrice && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-semibold text-emerald-700 tabular-nums">
                    Pinte {customPrice} €
                  </span>
                </>
              )}
            </div>
            <div className="flex items-center gap-2 pt-1">
              <a
                href={buildGoogleMapsUrl(bar)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-full bg-black px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-neutral-800"
              >
                <span>Google Maps</span>
                <ExternalLink className="h-3 w-3" aria-hidden="true" />
              </a>
              <a
                href={buildCitymapperUrl(bar)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-full border border-neutral-300 bg-white px-3 py-1.5 text-[11px] font-semibold text-neutral-900 hover:bg-neutral-100"
              >
                <span>Citymapper</span>
                <ExternalLink className="h-3 w-3" aria-hidden="true" />
              </a>
            </div>
          </div>
        </InfoWindow>
      )}
    </>
  );
};

const PARTICIPANT_AVATARS = [
  'bg-[#0A84FF] text-white',
  'bg-[#30D158] text-black',
  'bg-[#FF9F0A] text-black',
  'bg-[#BF5AF2] text-white',
  'bg-[#64D2FF] text-black',
  'bg-[#FF375F] text-white',
];

export const AperoMap: React.FC<AperoMapProps> = ({
  participants,
  centerPoint,
  effectiveSearchCenter,
  excludedZones,
  shiftNotice,
  bars,
  selectedBarId,
  winningBarId,
  onSelectBar,
  votes,
  customPrices,
  onMapReady,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const selectedBar = useMemo(
    () => bars.find((b) => b.id === selectedBarId) || null,
    [bars, selectedBarId]
  );

  const isShifted =
    Boolean(centerPoint && effectiveSearchCenter) &&
    (Math.abs(centerPoint!.lat - effectiveSearchCenter!.lat) > 0.0005 ||
      Math.abs(centerPoint!.lng - effectiveSearchCenter!.lng) > 0.0005);

  return (
    <div
      className={`relative overflow-hidden rounded-3xl border border-white/10 bg-[#1C1C1E] transition-all ${
        isExpanded
          ? 'fixed inset-x-3 top-14 bottom-24 z-40 shadow-2xl lg:static lg:inset-auto lg:h-full'
          : 'h-[38vh] min-h-[260px] lg:h-full lg:min-h-[540px]'
      }`}
    >
      <GoogleMap
        mapId="DEMO_MAP_ID"
        colorScheme="DARK"
        defaultCenter={{lat: 48.8566, lng: 2.3522}}
        defaultZoom={12}
        gestureHandling="greedy"
        mapTypeControl={false}
        streetViewControl={false}
        fullscreenControl={false}
        internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
        className="h-full w-full"
      >
        <MapInstanceBridge onMapReady={onMapReady} />
        <BoundsFitter
          participants={participants}
          centerPoint={centerPoint}
          effectiveSearchCenter={effectiveSearchCenter}
          bars={bars}
        />

        <MapRadiusOverlays
          searchCenter={effectiveSearchCenter || centerPoint}
          excludedZones={excludedZones}
        />

        {/* Minimalist Friend Markers (colored initial circles) */}
        {participants.map((p, index) => {
          const avatarClass = PARTICIPANT_AVATARS[index % PARTICIPANT_AVATARS.length];
          const initial = p.name.trim().charAt(0).toUpperCase() || '?';
          return (
            <AdvancedMarker
              key={p.id}
              position={{lat: p.lat, lng: p.lng}}
              title={`${p.name} · ${p.address}`}
              zIndex={15}
            >
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full border-2 border-white/90 text-xs font-bold shadow-lg ${avatarClass}`}
              >
                {initial}
              </div>
            </AdvancedMarker>
          );
        })}

        {/* Weighted Barycenter Marker */}
        {centerPoint && (
          <AdvancedMarker
            position={centerPoint}
            title="Barycentre pondéré"
            zIndex={28}
          >
            {isShifted ? (
              <div className="flex h-6 w-6 items-center justify-center rounded-full border border-white/40 bg-[#2C2C2E]/90 text-white/75 shadow">
                <Crosshair className="h-3.5 w-3.5" aria-hidden="true" />
              </div>
            ) : (
              <div className="relative flex items-center justify-center">
                <span className="absolute h-10 w-10 rounded-full bg-[#0A84FF]/30 blur-sm" />
                <div className="relative flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-[#0A84FF] text-white shadow-[0_0_20px_rgba(10,132,255,0.65)]">
                  <Crosshair className="h-4 w-4" aria-hidden="true" />
                </div>
              </div>
            )}
          </AdvancedMarker>
        )}

        {/* Luminous Shifted Search Pin (when spiral fallback triggered) */}
        {isShifted && effectiveSearchCenter && (
          <AdvancedMarker
            position={effectiveSearchCenter}
            title={shiftNotice || 'Point de recherche déplacé hors zones exclues'}
            zIndex={34}
          >
            <div className="relative flex items-center justify-center">
              <span className="absolute h-11 w-11 rounded-full bg-[#0A84FF]/35 blur-sm" />
              <div className="relative flex h-9 w-9 items-center justify-center rounded-full border-2 border-white bg-[#0A84FF] text-white shadow-[0_0_22px_rgba(10,132,255,0.75)]">
                <Navigation className="h-4 w-4" aria-hidden="true" />
              </div>
            </div>
          </AdvancedMarker>
        )}

        {/* Minimal Bar Pill Markers */}
        {bars.map((bar) => (
          <BarMarker
            key={bar.id}
            bar={bar}
            isSelected={selectedBar?.id === bar.id}
            isWinner={winningBarId === bar.id}
            voteCount={(votes[bar.id] || []).length}
            customPrice={customPrices[bar.id]}
            onSelect={() => onSelectBar(bar.id)}
            onClose={() => onSelectBar(null)}
          />
        ))}
      </GoogleMap>

      {/* Expand/collapse toggle on mobile */}
      <button
        type="button"
        onClick={() => setIsExpanded((prev) => !prev)}
        aria-label={isExpanded ? 'Réduire la carte' : 'Agrandir la carte'}
        className="lg:hidden absolute top-3 right-3 z-10 inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-black/75 text-white shadow-lg backdrop-blur-xl hover:bg-black/90"
      >
        {isExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
      </button>

      {/* Minimal frosted legend */}
      <div className="pointer-events-none absolute bottom-3 left-3 z-10 flex items-center gap-2 rounded-full border border-white/10 bg-black/75 px-3 py-1.5 text-[11px] font-medium text-[#8E8E93] backdrop-blur-xl">
        <span className="text-white/90">{participants.length} ami{participants.length > 1 ? 's' : ''}</span>
        <span aria-hidden="true">·</span>
        <span className="text-[#0A84FF]">QG 800m</span>
        <span aria-hidden="true">·</span>
        <span className="text-[#FF9F0A] tabular-nums">{bars.length} bar{bars.length > 1 ? 's' : ''}</span>
      </div>
    </div>
  );
};
