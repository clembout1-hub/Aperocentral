import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import type {User as SupabaseUser} from '@supabase/supabase-js';
import {
  APILoadingStatus,
  APIProvider,
  useApiLoadingStatus,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import {
  Ban,
  Beer,
  Calendar,
  CalendarPlus,
  CheckCircle2,
  Compass,
  Copy,
  FolderHeart,
  KeyRound,
  Loader2,
  Moon,
  Pencil,
  Settings,
  Sun,
  Trophy,
} from 'lucide-react';
import {
  AccountAndFriendsModal,
  type AccountFriendsModalTab,
} from './components/AccountAndFriendsModal';
import {AperoMap} from './components/AperoMap';
import {ApiKeyModal} from './components/ApiKeyModal';
import {BarList} from './components/BarList';
import {BottomSheet, type SheetSnap, type SheetTab} from './components/BottomSheet';
import {MessengerShareBar} from './components/MessengerShareBar';
import {OfflineIndicator} from './components/OfflineIndicator';
import {ParticipantManager} from './components/ParticipantManager';
import {PWAInstallButton} from './components/PWAInstallButton';
import {SessionsDrawer} from './components/SessionsDrawer';
import {ZoneExclusionModal} from './components/ZoneExclusionModal';
import {supabase} from './lib/supabase';
import {
  ensureMyProfile,
  fetchMyFriendships,
  fetchMySharedGroups,
} from './lib/supabaseService';
import type {
  BarCandidate,
  ExcludedCustomZone,
  LocalParisBarRecord,
  OpeningPeriodLite,
  Participant,
  RouteStepDetail,
  SavedSessionRecord,
  SessionState,
  SharedGroupWithMembers,
  SortCriterion,
  SupabaseFriendship,
  SupabaseProfile,
  ThemeMode,
  TransportMode,
  TravelTimeInfo,
} from './types/apero';
import {
  buildMessengerRecapText,
  buildRouteSummary,
  buildSpiralPointsForRadius,
  calculateWeightedBarycenter,
  computeBarFairnessMetrics,
  downloadIcsFile,
  estimateTravelSeconds,
  evaluateOpeningStatus,
  extractPostalCode,
  formatPriceLevel,
  formatTransitLineBadge,
  getEffectiveBarPintPrice,
  haversineDistanceMeters,
  isCheapBar,
  isPointInExcludedZones,
  isRealBarPlace,
  SPIRAL_RADII_METERS,
  type SpiralSearchPoint,
} from './utils/geo';
import {fetchLocalParisBars, toBarCandidateFromLocal} from './utils/localBars';
import {
  buildShareUrl,
  createDefaultSession,
  createSessionId,
  deleteSessionRecord,
  getSessionFromUrl,
  isSessionEffectivelyDefault,
  loadActiveSessionId,
  loadCustomApiKey,
  loadSessionsList,
  loadThemeMode,
  saveActiveSessionId,
  saveCustomApiKey,
  saveThemeMode,
  syncSessionToUrl,
  upsertSessionRecord,
} from './utils/storage';

declare const __GMAPS_ENV_KEY__: string | undefined;

const ENV_API_KEY = (
  (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined) ||
  (typeof __GMAPS_ENV_KEY__ !== 'undefined' ? __GMAPS_ENV_KEY__ : '') ||
  ''
).trim();

async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fallback below
  }

  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

function isQuotaError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('OVER_QUERY_LIMIT') ||
    msg.includes('429') ||
    msg.includes('Quota')
  );
}

function extractOpeningPeriods(
  regularOpeningHours: google.maps.places.OpeningHours | null | undefined
): OpeningPeriodLite[] | null {
  if (!regularOpeningHours?.periods || regularOpeningHours.periods.length === 0) {
    return null;
  }
  return regularOpeningHours.periods.map((period) => ({
    open: {
      day: period.open.day,
      hour: period.open.hour,
      minute: period.open.minute,
    },
    close: period.close
      ? {
          day: period.close.day,
          hour: period.close.hour,
          minute: period.close.minute,
        }
      : null,
  }));
}

function toRestTravelMode(mode: TransportMode): 'TRANSIT' | 'BICYCLE' | 'WALK' | 'DRIVE' {
  switch (mode) {
    case 'TRANSIT':
      return 'TRANSIT';
    case 'BICYCLING':
      return 'BICYCLE';
    case 'WALKING':
      return 'WALK';
    case 'DRIVING':
      return 'DRIVE';
  }
}

function normalizeStepKind(
  rawMode: string | null | undefined,
  fallback: TransportMode
): RouteStepDetail['kind'] {
  const m = (rawMode || '').toUpperCase();
  if (m === 'TRANSIT') return 'TRANSIT';
  if (m === 'BICYCLING' || m === 'BICYCLE') return 'BICYCLING';
  if (m === 'DRIVING' || m === 'DRIVE') return 'DRIVING';
  if (m === 'WALKING' || m === 'WALK') return 'WALKING';
  return fallback;
}

function parseProtoDurationSeconds(durationStr?: string | null): number | null {
  if (!durationStr) return null;
  const parsed = Number.parseFloat(durationStr.replace(/s$/i, ''));
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
}

function extractStepsFromSdk(
  sdkSteps: google.maps.routes.RouteLegStep[],
  fallbackMode: TransportMode
): RouteStepDetail[] {
  return sdkSteps.map((s) => {
    const kind = normalizeStepKind(s.travelMode, fallbackMode);
    const td = s.transitDetails;
    const line = td?.transitLine;
    const lineBadge = line
      ? formatTransitLineBadge(line.shortName, line.vehicle?.vehicleType, line.name)
      : null;

    return {
      kind,
      durationSeconds:
        typeof s.staticDurationMillis === 'number' && Number.isFinite(s.staticDurationMillis)
          ? Math.round(s.staticDurationMillis / 1000)
          : null,
      distanceMeters: typeof s.distanceMeters === 'number' ? s.distanceMeters : 0,
      lineBadge,
      lineColor: line?.color || null,
      headsign: td?.headsign || null,
      departureStop: td?.departureStop?.name || null,
      arrivalStop: td?.arrivalStop?.name || null,
      stopCount: typeof td?.stopCount === 'number' ? td.stopCount : null,
      instructions: s.instructions || null,
    };
  });
}

interface RestStepShape {
  travelMode?: string;
  staticDuration?: string;
  distanceMeters?: number;
  navigationInstruction?: {instructions?: string};
  transitDetails?: {
    headsign?: string;
    stopCount?: number;
    stopDetails?: {
      departureStop?: {name?: string};
      arrivalStop?: {name?: string};
    };
    transitLine?: {
      name?: string;
      shortName?: string;
      nameShort?: string;
      color?: string;
      vehicle?: {type?: string};
    };
  };
}

function extractStepsFromRest(
  restSteps: RestStepShape[],
  fallbackMode: TransportMode
): RouteStepDetail[] {
  return restSteps.map((s) => {
    const kind = normalizeStepKind(s.travelMode, fallbackMode);
    const td = s.transitDetails;
    const line = td?.transitLine;
    const lineBadge = line
      ? formatTransitLineBadge(line.nameShort || line.shortName, line.vehicle?.type, line.name)
      : null;

    return {
      kind,
      durationSeconds: parseProtoDurationSeconds(s.staticDuration),
      distanceMeters: typeof s.distanceMeters === 'number' ? s.distanceMeters : 0,
      lineBadge,
      lineColor: line?.color || null,
      headsign: td?.headsign || null,
      departureStop: td?.stopDetails?.departureStop?.name || null,
      arrivalStop: td?.stopDetails?.arrivalStop?.name || null,
      stopCount: typeof td?.stopCount === 'number' ? td.stopCount : null,
      instructions: s.navigationInstruction?.instructions || null,
    };
  });
}

function sumWalkSeconds(
  steps: RouteStepDetail[],
  mode: TransportMode,
  totalDurationSeconds: number
): number {
  if (steps.length > 0) {
    let walkSec = 0;
    for (const s of steps) {
      if (s.kind === 'WALKING') {
        if (typeof s.durationSeconds === 'number' && Number.isFinite(s.durationSeconds)) {
          walkSec += s.durationSeconds;
        } else if (s.distanceMeters > 0) {
          walkSec += Math.round((s.distanceMeters / 80) * 60);
        }
      }
    }
    return walkSec;
  }
  return mode === 'WALKING' ? totalDurationSeconds : 0;
}

async function computeDoorToDoorRoute(
  routesLib: google.maps.RoutesLibrary | null,
  apiKey: string,
  participant: Participant,
  bar: BarCandidate,
  targetDepartureDate: Date | null
): Promise<TravelTimeInfo> {
  const nowMs = Date.now();
  const maxFutureMs = nowMs + 95 * 24 * 60 * 60 * 1000;
  const minTransitPastMs = nowMs - 6 * 24 * 60 * 60 * 1000;

  let effectiveDeparture: Date | undefined;
  if (targetDepartureDate && !Number.isNaN(targetDepartureDate.getTime())) {
    const tMs = targetDepartureDate.getTime();
    if (participant.mode === 'TRANSIT') {
      if (tMs > minTransitPastMs && tMs < maxFutureMs) {
        effectiveDeparture = targetDepartureDate;
      }
    } else if (tMs > nowMs + 60 * 1000 && tMs < maxFutureMs) {
      effectiveDeparture = targetDepartureDate;
    }
  }

  if (routesLib?.Route?.computeRoutes) {
    try {
      const request: google.maps.routes.ComputeRoutesRequest = {
        origin: {lat: participant.lat, lng: participant.lng},
        destination: {lat: bar.lat, lng: bar.lng},
        travelMode: participant.mode,
        fields: ['durationMillis', 'distanceMeters', 'legs'],
        language: 'fr',
        region: 'FR',
        internalUsageAttributionIds: ['gmp_mcp_codeassist_v1_aistudio'],
        ...(effectiveDeparture ? {departureTime: effectiveDeparture} : {}),
        ...(participant.mode === 'TRANSIT'
          ? {transitPreference: {routingPreference: 'LESS_WALKING'}}
          : {}),
        ...(participant.mode === 'DRIVING' && effectiveDeparture
          ? {routingPreference: 'TRAFFIC_AWARE'}
          : {}),
      };

      const {routes} = await routesLib.Route.computeRoutes(request);
      const route = routes?.[0];
      if (
        route &&
        typeof route.durationMillis === 'number' &&
        Number.isFinite(route.durationMillis)
      ) {
        const sdkSteps = route.legs?.[0]?.steps || [];
        const steps = extractStepsFromSdk(sdkSteps, participant.mode);
        const durationSeconds = Math.round(route.durationMillis / 1000);
        const distanceMeters =
          typeof route.distanceMeters === 'number'
            ? route.distanceMeters
            : Math.round(haversineDistanceMeters(participant, bar));
        const firstTransit = steps.find((st) => st.kind === 'TRANSIT' && st.lineBadge);

        return {
          durationSeconds,
          distanceMeters,
          walkSeconds: sumWalkSeconds(steps, participant.mode, durationSeconds),
          isEstimate: false,
          transitLine: firstTransit?.lineBadge || null,
          transitLineColor: firstTransit?.lineColor || null,
          routeSummary: buildRouteSummary(participant.mode, steps, distanceMeters),
          steps,
        };
      }
    } catch (err) {
      if (isQuotaError(err)) {
        window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
      }
    }
  }

  if (apiKey) {
    try {
      const restBody: Record<string, unknown> = {
        origin: {location: {latLng: {latitude: participant.lat, longitude: participant.lng}}},
        destination: {location: {latLng: {latitude: bar.lat, longitude: bar.lng}}},
        travelMode: toRestTravelMode(participant.mode),
        languageCode: 'fr',
        regionCode: 'FR',
      };
      if (effectiveDeparture) {
        restBody.departureTime = effectiveDeparture.toISOString();
      }
      if (participant.mode === 'TRANSIT') {
        restBody.transitPreferences = {routingPreference: 'LESS_WALKING'};
      }
      if (participant.mode === 'DRIVING' && effectiveDeparture) {
        restBody.routingPreference = 'TRAFFIC_AWARE';
      }

      const resp = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask':
            'routes.duration,routes.distanceMeters,routes.legs.steps.travelMode,routes.legs.steps.staticDuration,routes.legs.steps.distanceMeters,routes.legs.steps.navigationInstruction,routes.legs.steps.transitDetails',
        },
        body: JSON.stringify(restBody),
      });

      if (resp.ok) {
        const json = (await resp.json()) as {
          routes?: {
            duration?: string;
            distanceMeters?: number;
            legs?: {steps?: RestStepShape[]}[];
          }[];
        };
        const route = json.routes?.[0];
        const durationSec = parseProtoDurationSeconds(route?.duration);
        if (durationSec !== null) {
          const restSteps = route?.legs?.[0]?.steps || [];
          const steps = extractStepsFromRest(restSteps, participant.mode);
          const distanceMeters =
            typeof route?.distanceMeters === 'number'
              ? route.distanceMeters
              : Math.round(haversineDistanceMeters(participant, bar));
          const firstTransit = steps.find((st) => st.kind === 'TRANSIT' && st.lineBadge);

          return {
            durationSeconds: durationSec,
            distanceMeters,
            walkSeconds: sumWalkSeconds(steps, participant.mode, durationSec),
            isEstimate: false,
            transitLine: firstTransit?.lineBadge || null,
            transitLineColor: firstTransit?.lineColor || null,
            routeSummary: buildRouteSummary(participant.mode, steps, distanceMeters),
            steps,
          };
        }
      } else if (resp.status === 429) {
        window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
      }
    } catch {
      // Fall through to geometric estimate
    }
  }

  const dist = haversineDistanceMeters(participant, bar);
  const estDuration = estimateTravelSeconds(dist, participant.mode);
  return {
    durationSeconds: estDuration,
    distanceMeters: Math.round(dist),
    walkSeconds:
      participant.mode === 'WALKING'
        ? estDuration
        : participant.mode === 'TRANSIT'
        ? Math.round(estDuration * 0.2)
        : 0,
    isEstimate: true,
    routeSummary: buildRouteSummary(participant.mode, [], dist),
    steps: [],
  };
}

async function runInBatches<T>(
  tasks: (() => Promise<T>)[],
  batchSize: number
): Promise<T[]> {
  const results: T[] = [];
  for (let i = 0; i < tasks.length; i += batchSize) {
    const slice = tasks.slice(i, i + batchSize);
    const chunk = await Promise.all(slice.map((fn) => fn()));
    results.push(...chunk);
  }
  return results;
}

interface SearchPipelineResult {
  bars: BarCandidate[];
  travelMatrix: Record<string, Record<string, TravelTimeInfo>>;
  effectiveSearchCenter: {lat: number; lng: number} | null;
  shiftNotice: string | null;
}

interface MapsWorkspaceProps {
  apiKey: string;
  session: SessionState;
  centerPoint: {lat: number; lng: number} | null;
  effectiveSearchCenter: {lat: number; lng: number} | null;
  shiftNotice: string | null;
  bars: BarCandidate[];
  selectedBarId: string | null;
  winningBarId: string | null;
  searchTriggerId: number;
  isDarkMode: boolean;
  sheetSnap: SheetSnap;
  getLocalBars: () => Promise<LocalParisBarRecord[]>;
  onSelectBar: (id: string | null) => void;
  onSearchLoadingChange: (barsLoading: boolean, routesLoading: boolean) => void;
  onSearchError: (err: string | null) => void;
  onSearchComplete: (result: SearchPipelineResult) => void;
  onMapsReadyChange: (ready: boolean) => void;
}

const MapsWorkspace: React.FC<MapsWorkspaceProps> = ({
  apiKey,
  session,
  centerPoint,
  effectiveSearchCenter,
  shiftNotice,
  bars,
  selectedBarId,
  winningBarId,
  searchTriggerId,
  isDarkMode,
  sheetSnap,
  getLocalBars,
  onSelectBar,
  onSearchLoadingChange,
  onSearchError,
  onSearchComplete,
  onMapsReadyChange,
}) => {
  const loadingStatus = useApiLoadingStatus();
  const placesLib = useMapsLibrary('places');
  const routesLib = useMapsLibrary('routes');
  const executedTriggerRef = useRef<number>(0);
  const mapRef = useRef<google.maps.Map | null>(null);

  const latestSessionRef = useRef(session);
  latestSessionRef.current = session;
  const latestCenterRef = useRef(centerPoint);
  latestCenterRef.current = centerPoint;

  useEffect(() => {
    onMapsReadyChange(Boolean(placesLib));
    if (loadingStatus === APILoadingStatus.AUTH_FAILURE) {
      window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
    }
  }, [loadingStatus, placesLib, onMapsReadyChange]);

  useEffect(() => {
    if (searchTriggerId <= 0) return;
    if (executedTriggerRef.current === searchTriggerId) return;
    if (!placesLib) return;

    const currentSession = latestSessionRef.current;
    const weightedCenter = latestCenterRef.current;
    if (!weightedCenter || currentSession.participants.length === 0) return;

    executedTriggerRef.current = searchTriggerId;
    let cancelled = false;

    const runQuotaOptimizedSearch = async () => {
      onSearchLoadingChange(true, false);
      onSearchError(null);

      const isStrictlyValid = (bar: BarCandidate): boolean =>
        !isPointInExcludedZones(
          bar.lat,
          bar.lng,
          bar.postalCode,
          currentSession.excludedZones,
          bar.address,
          bar.arrondissement
        );

      const searchNearbyBars = async (
        searchOrigin: {lat: number; lng: number}
      ): Promise<BarCandidate[]> => {
        try {
          if (!placesLib.Place?.searchNearby) {
            throw new Error('Place.searchNearby unavailable');
          }

          const response = await placesLib.Place.searchNearby({
            fields: [
              'id',
              'displayName',
              'primaryType',
              'types',
              'location',
              'formattedAddress',
              'addressComponents',
              'rating',
              'userRatingCount',
              'priceLevel',
              'regularOpeningHours',
            ],
            locationRestriction: {
              center: searchOrigin,
              radius: 800,
            },
            includedPrimaryTypes: ['bar', 'pub', 'wine_bar', 'cocktail_bar'],
            excludedPrimaryTypes: ['restaurant', 'fast_food_restaurant', 'cafe', 'bakery'],
            maxResultCount: 20,
            rankPreference: placesLib.SearchNearbyRankPreference.POPULARITY,
            language: 'fr',
            region: 'FR',
            internalUsageAttributionIds: ['gmp_mcp_codeassist_v1_aistudio'],
          });

          const rawPlaces = response.places || [];
          return rawPlaces
            .filter(
              (p) =>
                p.location &&
                p.businessStatus !== 'CLOSED_PERMANENTLY' &&
                isRealBarPlace(p.displayName || '', p.primaryType, p.types)
            )
            .map((p) => {
              const lat = p.location!.lat();
              const lng = p.location!.lng();
              const address = p.formattedAddress || '';
              const postalCode = extractPostalCode(address, p.addressComponents);
              const openingPeriods = extractOpeningPeriods(p.regularOpeningHours);
              const openEval = evaluateOpeningStatus(openingPeriods, currentSession.dateTime);
              const attrs = Array.isArray(p.attributions)
                ? p.attributions.map((a) => ({
                    provider: a.provider || 'Google',
                    providerURI: a.providerURI,
                  }))
                : [];
              return {
                id: p.id,
                name: p.displayName || 'Bar',
                primaryType: p.primaryType ?? null,
                address,
                postalCode,
                lat,
                lng,
                rating: typeof p.rating === 'number' ? p.rating : null,
                userRatingCount: typeof p.userRatingCount === 'number' ? p.userRatingCount : null,
                priceLevel: p.priceLevel ?? null,
                googleMapsURI: null,
                attributions: attrs,
                distanceFromCenterMeters: haversineDistanceMeters(searchOrigin, {lat, lng}),
                openingPeriods,
                isOpenAtTarget: openEval.isOpen,
                closesLabel: openEval.closesLabel,
                nearestStation: null,
                source: 'google_places' as const,
              };
            });
        } catch (newApiErr) {
          const newApiMsg =
            newApiErr instanceof Error ? newApiErr.message : String(newApiErr);

          const serviceTarget = mapRef.current ?? document.createElement('div');
          const service = new placesLib.PlacesService(serviceTarget);

          const legacyResults = await new Promise<google.maps.places.PlaceResult[]>(
            (resolve, reject) => {
              service.nearbySearch(
                {
                  location: searchOrigin,
                  radius: 800,
                  type: 'bar',
                },
                (results, status) => {
                  if (status === placesLib.PlacesServiceStatus.OK) {
                    resolve(results || []);
                  } else if (status === placesLib.PlacesServiceStatus.ZERO_RESULTS) {
                    resolve([]);
                  } else {
                    reject(
                      new Error(
                        `PlacesService: ${status} | Place.searchNearby: ${newApiMsg}`
                      )
                    );
                  }
                }
              );
            }
          );

          return legacyResults
            .filter(
              (p) =>
                p.geometry?.location &&
                p.business_status !== 'CLOSED_PERMANENTLY' &&
                isRealBarPlace(p.name || '', null, p.types)
            )
            .map((p, idx) => {
              const lat = p.geometry!.location!.lat();
              const lng = p.geometry!.location!.lng();
              const address = p.vicinity || p.formatted_address || '';
              const postalCode = extractPostalCode(address);
              let isOpenAtTarget: boolean | null = null;
              try {
                if (typeof p.opening_hours?.isOpen === 'function') {
                  isOpenAtTarget = p.opening_hours.isOpen() ?? null;
                }
              } catch {
                isOpenAtTarget = null;
              }
              return {
                id: p.place_id || `legacy_bar_${idx}_${lat.toFixed(5)}`,
                name: p.name || 'Bar',
                primaryType: null,
                address,
                postalCode,
                lat,
                lng,
                rating: typeof p.rating === 'number' ? p.rating : null,
                userRatingCount:
                  typeof p.user_ratings_total === 'number' ? p.user_ratings_total : null,
                priceLevel: typeof p.price_level === 'number' ? p.price_level : null,
                googleMapsURI: null,
                attributions: [],
                distanceFromCenterMeters: haversineDistanceMeters(searchOrigin, {lat, lng}),
                openingPeriods: null,
                isOpenAtTarget,
                closesLabel: null,
                nearestStation: null,
                source: 'google_places' as const,
              };
            });
        }
      };

      try {
        let effectiveCenter = weightedCenter;
        let nextShiftNotice: string | null = null;
        let candidatePool20: BarCandidate[] = [];

        // 1. Check priority local dataset (/bars-paris.json) within 8 km of weightedCenter (min 3 bars)
        const localRecords = await getLocalBars();
        if (cancelled) return;

        const localCandidatesAll = localRecords.map((rec) =>
          toBarCandidateFromLocal(rec, weightedCenter)
        );
        const localWithin8Km = localCandidatesAll.filter(
          (bar) => bar.distanceFromCenterMeters <= 8000
        );

        if (localWithin8Km.length >= 3) {
          const validWithin8Km = localWithin8Km
            .filter(isStrictlyValid)
            .sort((a, b) => a.distanceFromCenterMeters - b.distanceFromCenterMeters);

          let selectedLocalPool = validWithin8Km;
          if (selectedLocalPool.length < 3) {
            const validAllLocal = localCandidatesAll
              .filter(isStrictlyValid)
              .sort((a, b) => a.distanceFromCenterMeters - b.distanceFromCenterMeters);
            if (validAllLocal.length > selectedLocalPool.length) {
              selectedLocalPool = validAllLocal;
            }
          }

          if (selectedLocalPool.length > 0) {
            candidatePool20 = selectedLocalPool.slice(0, 20);
            const centerExcluded = isPointInExcludedZones(
              weightedCenter.lat,
              weightedCenter.lng,
              null,
              currentSession.excludedZones
            );
            if (centerExcluded) {
              effectiveCenter = {
                lat: candidatePool20[0].lat,
                lng: candidatePool20[0].lng,
              };
              nextShiftNotice =
                'Point de recherche recentré hors des arrondissements/zones exclus.';
            }
          }
        }

        // 2. Fallback to Google Places nearbySearch if outside Paris/petite couronne (< 3 local bars within 8 km)
        if (candidatePool20.length === 0) {
          const initialRaw = await searchNearbyBars(weightedCenter);
          if (cancelled) return;

          let filtered = initialRaw.filter(isStrictlyValid);

          const allValidById: Record<string, BarCandidate> = {};
          for (const b of filtered) {
            allValidById[b.id] = b;
          }

          if (filtered.length < 8) {
            type SpiralCandidateResult = {
              point: SpiralSearchPoint;
              bars: BarCandidate[];
            };

            let winningSpiral: SpiralCandidateResult | null = null;
            let bestPartialSpiral: SpiralCandidateResult | null = null;

            const isBetterPartial = (
              candidate: SpiralCandidateResult,
              currentBest: SpiralCandidateResult | null
            ) => {
              if (!currentBest) return true;
              if (candidate.bars.length !== currentBest.bars.length) {
                return candidate.bars.length > currentBest.bars.length;
              }
              return candidate.point.avgParticipantDist < currentBest.point.avgParticipantDist;
            };

            const probeGroup = async (
              points: SpiralSearchPoint[]
            ): Promise<{winner: SpiralCandidateResult | null; best: SpiralCandidateResult | null}> => {
              if (points.length === 0) return {winner: null, best: null};
              const results = await Promise.all(
                points.map(async (pt) => {
                  const raw = await searchNearbyBars({lat: pt.lat, lng: pt.lng});
                  const valid = raw.filter(isStrictlyValid);
                  for (const b of valid) {
                    allValidById[b.id] = b;
                  }
                  return {point: pt, bars: valid};
                })
              );

              let best: SpiralCandidateResult | null = null;
              for (const entry of results) {
                if (isBetterPartial(entry, best)) {
                  best = entry;
                }
              }

              const winner = results.find((entry) => entry.bars.length >= 8) || null;
              return {winner, best};
            };

            for (const ringRadius of SPIRAL_RADII_METERS) {
              if (cancelled) return;
              const ringPoints = buildSpiralPointsForRadius(
                weightedCenter,
                ringRadius,
                currentSession.participants,
                currentSession.excludedZones
              );

              const primaryPoints = ringPoints.filter((p) => !p.isPointExcluded);
              const secondaryPoints = ringPoints.filter((p) => p.isPointExcluded);

              const primaryRes = await probeGroup(primaryPoints);
              if (cancelled) return;
              if (primaryRes.best && isBetterPartial(primaryRes.best, bestPartialSpiral)) {
                bestPartialSpiral = primaryRes.best;
              }
              winningSpiral = primaryRes.winner;

              if (!winningSpiral) {
                const secondaryRes = await probeGroup(secondaryPoints);
                if (cancelled) return;
                if (secondaryRes.best && isBetterPartial(secondaryRes.best, bestPartialSpiral)) {
                  bestPartialSpiral = secondaryRes.best;
                }
                winningSpiral = secondaryRes.winner;
              }

              if (winningSpiral) {
                break;
              }
            }

            if (winningSpiral) {
              effectiveCenter = {
                lat: winningSpiral.point.lat,
                lng: winningSpiral.point.lng,
              };
              filtered = winningSpiral.bars;
              const kmLabel = (winningSpiral.point.radiusMeters / 1000)
                .toFixed(1)
                .replace('.0', '')
                .replace('.', ',');
              nextShiftNotice = `Point de recherche déplacé à ${kmLabel} km (${winningSpiral.point.directionLabel}) pour éviter les zones exclues.`;
            } else if (filtered.length < 5) {
              const fallbackAnchor =
                bestPartialSpiral && bestPartialSpiral.bars.length > 0
                  ? {lat: bestPartialSpiral.point.lat, lng: bestPartialSpiral.point.lng}
                  : weightedCenter;
              effectiveCenter = fallbackAnchor;
              filtered = Object.values(allValidById).map((b) => ({
                ...b,
                distanceFromCenterMeters: haversineDistanceMeters(fallbackAnchor, {
                  lat: b.lat,
                  lng: b.lng,
                }),
              }));
              if (bestPartialSpiral && bestPartialSpiral.bars.length > 0) {
                const kmLabel = (bestPartialSpiral.point.radiusMeters / 1000)
                  .toFixed(1)
                  .replace('.0', '')
                  .replace('.', ',');
                nextShiftNotice = `Point de recherche élargi à ${kmLabel} km (${bestPartialSpiral.point.directionLabel}) hors zones exclues.`;
              }
            }
          }

          candidatePool20 = [...filtered]
            .sort((a, b) => a.distanceFromCenterMeters - b.distanceFromCenterMeters)
            .slice(0, 20);
        }

        if (candidatePool20.length === 0) {
          onSearchComplete({
            bars: [],
            travelMatrix: {},
            effectiveSearchCenter: effectiveCenter,
            shiftNotice: nextShiftNotice,
          });
          onSearchLoadingChange(false, false);
          return;
        }

        onSearchLoadingChange(false, true);

        // 3. Compute real Google Routes (with LESS_WALKING for TRANSIT) on the 20 pre-selected bars
        const matrixResult: Record<string, Record<string, TravelTimeInfo>> = {};
        for (const bar of candidatePool20) {
          matrixResult[bar.id] = {};
        }

        const parsedDate = new Date(currentSession.dateTime);
        const validTargetDate = Number.isNaN(parsedDate.getTime()) ? null : parsedDate;

        const routeTasks: (() => Promise<void>)[] = [];
        for (const bar of candidatePool20) {
          for (const participant of currentSession.participants) {
            routeTasks.push(async () => {
              const info = await computeDoorToDoorRoute(
                routesLib,
                apiKey,
                participant,
                bar,
                validTargetDate
              );
              matrixResult[bar.id][participant.id] = info;
            });
          }
        }

        await runInBatches(routeTasks, 8);
        if (cancelled) return;

        // 4. Rank all 20 candidates by strict inequity + maxWalkMinutes penalty and take Top 8
        const sortedByStrictFairness = [...candidatePool20].sort((a, b) => {
          const scoreA = computeBarFairnessMetrics(
            a.id,
            currentSession.participants,
            matrixResult
          ).score;
          const scoreB = computeBarFairnessMetrics(
            b.id,
            currentSession.participants,
            matrixResult
          ).score;
          if (scoreA !== scoreB) return scoreA - scoreB;
          return a.distanceFromCenterMeters - b.distanceFromCenterMeters;
        });

        const top8Bars = sortedByStrictFairness.slice(0, 8);
        const top8Matrix: Record<string, Record<string, TravelTimeInfo>> = {};
        for (const bar of top8Bars) {
          top8Matrix[bar.id] = matrixResult[bar.id] || {};
        }

        // 5. Enrich nearest metro station only for Top 8 bars missing one
        const stationByBarId: Record<string, string | null> = {};
        const stationTasks = top8Bars
          .filter((bar) => !bar.nearestStation)
          .map((bar) => async () => {
            try {
              const res = await placesLib.Place.searchNearby({
                fields: ['displayName'],
                locationRestriction: {
                  center: {lat: bar.lat, lng: bar.lng},
                  radius: 350,
                },
                includedPrimaryTypes: ['subway_station', 'transit_station', 'train_station'],
                maxResultCount: 1,
                rankPreference: placesLib.SearchNearbyRankPreference.DISTANCE,
                language: 'fr',
                region: 'FR',
                internalUsageAttributionIds: ['gmp_mcp_codeassist_v1_aistudio'],
              });
              const stationName = res.places?.[0]?.displayName?.trim();
              if (stationName) {
                stationByBarId[bar.id] = stationName;
              }
            } catch (err) {
              if (isQuotaError(err)) {
                window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
              }
            }
          });

        if (stationTasks.length > 0) {
          await runInBatches(stationTasks, 4);
          if (cancelled) return;
        }

        const enrichedTop8 = top8Bars.map((bar) => ({
          ...bar,
          nearestStation: bar.nearestStation ?? stationByBarId[bar.id] ?? null,
        }));

        onSearchComplete({
          bars: enrichedTop8,
          travelMatrix: top8Matrix,
          effectiveSearchCenter: effectiveCenter,
          shiftNotice: nextShiftNotice,
        });
      } catch (err) {
        if (cancelled) return;
        if (isQuotaError(err)) {
          window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
        }
        const exactError =
          err instanceof Error
            ? err.message
            : typeof err === 'object' && err !== null && 'status' in err
            ? String((err as {status: unknown}).status)
            : String(err);
        onSearchError(`Erreur Google Places : ${exactError}`);
      } finally {
        if (!cancelled) {
          onSearchLoadingChange(false, false);
        }
      }
    };

    void runQuotaOptimizedSearch();

    return () => {
      cancelled = true;
    };
  }, [
    apiKey,
    searchTriggerId,
    placesLib,
    routesLib,
    getLocalBars,
    onSearchLoadingChange,
    onSearchError,
    onSearchComplete,
  ]);

  return (
    <AperoMap
      participants={session.participants}
      centerPoint={centerPoint}
      effectiveSearchCenter={effectiveSearchCenter}
      excludedZones={session.excludedZones}
      shiftNotice={shiftNotice}
      bars={bars}
      selectedBarId={selectedBarId}
      winningBarId={winningBarId}
      onSelectBar={onSelectBar}
      votes={session.votes}
      customPrices={session.customPrices}
      targetDateTime={session.dateTime}
      isDarkMode={isDarkMode}
      sheetSnap={sheetSnap}
      onMapReady={(m) => {
        mapRef.current = m;
      }}
    />
  );
};

export default function App() {
  const initialUrlSessionRef = useRef<SessionState | null>(getSessionFromUrl());

  const [authUser, setAuthUser] = useState<SupabaseUser | null>(null);
  const [profile, setProfile] = useState<SupabaseProfile | null>(null);
  const [friendships, setFriendships] = useState<SupabaseFriendship[]>([]);
  const [sharedGroups, setSharedGroups] = useState<SharedGroupWithMembers[]>([]);

  const [savedSessions, setSavedSessions] = useState<SavedSessionRecord[]>(() =>
    loadSessionsList()
  );

  const [activeSessionId, setActiveSessionId] = useState<string>(() => {
    if (initialUrlSessionRef.current) {
      return createSessionId();
    }
    const storedActiveId = loadActiveSessionId();
    const list = loadSessionsList();
    if (storedActiveId && list.some((s) => s.id === storedActiveId)) {
      return storedActiveId;
    }
    if (list.length > 0) {
      return list[0].id;
    }
    return createSessionId();
  });

  const [session, setSession] = useState<SessionState>(() => {
    if (initialUrlSessionRef.current) {
      return initialUrlSessionRef.current;
    }
    const storedActiveId = loadActiveSessionId();
    const list = loadSessionsList();
    const matched =
      (storedActiveId && list.find((s) => s.id === storedActiveId)) || list[0];
    return matched ? matched.session : createDefaultSession();
  });

  const [themeMode, setThemeMode] = useState<ThemeMode>(() => loadThemeMode());
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [accountModalTab, setAccountModalTab] = useState<AccountFriendsModalTab>('profile');
  const [isSessionsDrawerOpen, setIsSessionsDrawerOpen] = useState(false);
  const [isExclusionsModalOpen, setIsExclusionsModalOpen] = useState(false);

  const [sheetSnap, setSheetSnap] = useState<SheetSnap>('mid');
  const [activeTab, setActiveTab] = useState<SheetTab>(() =>
    initialUrlSessionRef.current && initialUrlSessionRef.current.participants.length > 0
      ? 'bars'
      : 'participants'
  );
  const sheetScrollRef = useRef<HTMLDivElement | null>(null);
  const barCardRefs = useRef<Record<string, HTMLElement | null>>({});

  const [customApiKey, setCustomApiKey] = useState<string>(() => loadCustomApiKey());
  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false);
  const [quotaExceeded, setQuotaExceeded] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const dateInputRef = useRef<HTMLInputElement | null>(null);

  const [searchTriggerId, setSearchTriggerId] = useState<number>(() => {
    if (initialUrlSessionRef.current && initialUrlSessionRef.current.participants.length > 0) {
      return 1;
    }
    return 0;
  });
  const [hasSearchedOnce, setHasSearchedOnce] = useState(false);
  const [hasPendingChanges, setHasPendingChanges] = useState(false);

  const [bars, setBars] = useState<BarCandidate[]>([]);
  const [travelMatrix, setTravelMatrix] = useState<Record<string, Record<string, TravelTimeInfo>>>({});
  const [effectiveSearchCenter, setEffectiveSearchCenter] = useState<{lat: number; lng: number} | null>(null);
  const [shiftNotice, setShiftNotice] = useState<string | null>(null);

  const [isLoadingBars, setIsLoadingBars] = useState(false);
  const [isLoadingRoutes, setIsLoadingRoutes] = useState(false);
  const [barsError, setBarsError] = useState<string | null>(null);
  const [mapsReady, setMapsReady] = useState(false);

  const [selectedBarId, setSelectedBarId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortCriterion>('fairness');
  const [onlyCheap, setOnlyCheap] = useState(false);
  const [onlyTopRated, setOnlyTopRated] = useState(false);
  const [onlyOpen, setOnlyOpen] = useState(false);
  const [activeUserName, setActiveUserName] = useState<string>('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const localBarsRef = useRef<LocalParisBarRecord[] | null>(null);
  const localBarsPromiseRef = useRef<Promise<LocalParisBarRecord[]> | null>(null);

  const getLocalBars = useCallback((): Promise<LocalParisBarRecord[]> => {
    if (localBarsRef.current !== null) {
      return Promise.resolve(localBarsRef.current);
    }
    if (!localBarsPromiseRef.current) {
      localBarsPromiseRef.current = fetchLocalParisBars().then((records) => {
        localBarsRef.current = records;
        return records;
      });
    }
    return localBarsPromiseRef.current;
  }, []);

  useEffect(() => {
    void getLocalBars();
  }, [getLocalBars]);

  const refreshSupabaseUserData = useCallback(async (user: SupabaseUser | null) => {
    if (!supabase || !user) {
      setProfile(null);
      setFriendships([]);
      setSharedGroups([]);
      return;
    }

    try {
      const ensured = await ensureMyProfile(user);
      setProfile(ensured);
      if (ensured?.username) {
        setActiveUserName(ensured.username);
      }

      const [nextFriendships, nextGroups] = await Promise.all([
        fetchMyFriendships(user.id),
        fetchMySharedGroups(user.id),
      ]);
      setFriendships(nextFriendships);
      setSharedGroups(nextGroups);
    } catch {
      // Non-fatal if Supabase tables/RLS are not yet provisioned
    }
  }, []);

  useEffect(() => {
    if (!supabase) return;
    let active = true;

    void supabase.auth.getSession().then(({data}) => {
      if (!active) return;
      const user = data.session?.user ?? null;
      setAuthUser(user);
      void refreshSupabaseUserData(user);
    });

    const {data: authListener} = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return;
      const user = nextSession?.user ?? null;
      setAuthUser(user);
      void refreshSupabaseUserData(user);
    });

    return () => {
      active = false;
      authListener.subscription.unsubscribe();
    };
  }, [refreshSupabaseUserData]);

  useEffect(() => {
    if (profile?.username) {
      setActiveUserName(profile.username);
    }
  }, [profile?.username]);

  const pendingInvitesCount = useMemo(
    () =>
      profile
        ? friendships.filter((f) => f.status === 'pending' && f.addressee_id === profile.id).length
        : 0,
    [friendships, profile]
  );

  const activeApiKey = customApiKey || ENV_API_KEY;
  const isDarkMode = themeMode === 'dark';

  const excludedCount =
    session.excludedZones.postalCodes.length + session.excludedZones.customZones.length;

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', themeMode);
    if (themeMode === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    saveThemeMode(themeMode);
  }, [themeMode]);

  useEffect(() => {
    const handler = () => setQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', handler);
    return () => window.removeEventListener('gmp-quota-exceeded', handler);
  }, []);

  useEffect(() => {
    syncSessionToUrl(session);
    saveActiveSessionId(activeSessionId);

    const alreadyStored = savedSessions.some((r) => r.id === activeSessionId);
    if (!isSessionEffectivelyDefault(session) || alreadyStored) {
      const updated = upsertSessionRecord(activeSessionId, session);
      setSavedSessions(updated);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, activeSessionId]);

  useEffect(() => {
    if (isEditingTitle) {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    }
  }, [isEditingTitle]);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
  }, []);

  useEffect(() => {
    if (!toastMessage) return;
    const timer = window.setTimeout(() => setToastMessage(null), 3000);
    return () => window.clearTimeout(timer);
  }, [toastMessage]);

  const registerBarRef = useCallback((barId: string, el: HTMLElement | null) => {
    barCardRefs.current[barId] = el;
  }, []);

  const centerPoint = useMemo(
    () => calculateWeightedBarycenter(session.participants),
    [session.participants]
  );

  const barsWithLiveHours = useMemo(() => {
    return bars.map((bar) => {
      if (!bar.openingPeriods) return bar;
      const evalRes = evaluateOpeningStatus(bar.openingPeriods, session.dateTime);
      return {
        ...bar,
        isOpenAtTarget: evalRes.isOpen,
        closesLabel: evalRes.closesLabel,
      };
    });
  }, [bars, session.dateTime]);

  const filteredAndSortedBars = useMemo(() => {
    const filtered = barsWithLiveHours.filter((bar) => {
      if (
        isPointInExcludedZones(
          bar.lat,
          bar.lng,
          bar.postalCode,
          session.excludedZones,
          bar.address,
          bar.arrondissement
        )
      ) {
        return false;
      }
      if (onlyCheap && !isCheapBar(bar, session.customPrices[bar.id], session.dateTime)) {
        return false;
      }
      if (onlyTopRated && (bar.rating ?? 0) < 4.3) {
        return false;
      }
      if (onlyOpen && bar.isOpenAtTarget === false) {
        return false;
      }
      return true;
    });

    const getFairnessScore = (bar: BarCandidate): number => {
      const metrics = computeBarFairnessMetrics(bar.id, session.participants, travelMatrix);
      return metrics.hasRoutes ? metrics.score : bar.distanceFromCenterMeters;
    };

    const copy = [...filtered];
    copy.sort((a, b) => {
      if (sortBy === 'rating') {
        const diff = (b.rating ?? 0) - (a.rating ?? 0);
        if (Math.abs(diff) > 0.01) return diff;
      }

      if (sortBy === 'price') {
        const effA = getEffectiveBarPintPrice(a, session.customPrices[a.id], session.dateTime);
        const effB = getEffectiveBarPintPrice(b, session.customPrices[b.id], session.dateTime);
        const rankA = effA.price !== null ? effA.price : formatPriceLevel(a.priceLevel).numericRank * 4;
        const rankB = effB.price !== null ? effB.price : formatPriceLevel(b.priceLevel).numericRank * 4;
        if (Math.abs(rankA - rankB) > 0.01) return rankA - rankB;
      }

      return getFairnessScore(a) - getFairnessScore(b);
    });

    return copy;
  }, [
    barsWithLiveHours,
    session.excludedZones,
    session.dateTime,
    onlyCheap,
    onlyTopRated,
    onlyOpen,
    sortBy,
    travelMatrix,
    session.participants,
    session.customPrices,
  ]);

  const winningBar = useMemo(() => {
    if (filteredAndSortedBars.length === 0) return null;
    let bestBar = filteredAndSortedBars[0];
    let bestVotes = (session.votes[bestBar.id] || []).length;

    for (const bar of filteredAndSortedBars) {
      const count = (session.votes[bar.id] || []).length;
      if (count > bestVotes) {
        bestVotes = count;
        bestBar = bar;
      }
    }
    return bestBar;
  }, [filteredAndSortedBars, session.votes]);

  // Synchronize Map marker tap <-> Bottom Sheet tab, mid snap & scrollIntoView
  const handleSelectBarFromMap = useCallback(
    (barId: string | null) => {
      setSelectedBarId(barId);
      if (!barId) return;

      setActiveTab('bars');
      setSheetSnap((prev) => (prev === 'low' ? 'mid' : prev));

      window.setTimeout(() => {
        const el = barCardRefs.current[barId];
        el?.scrollIntoView({behavior: 'smooth', block: 'nearest'});
      }, 140);
    },
    []
  );

  const handleSearchLoadingChange = useCallback((barsLoading: boolean, routesLoading: boolean) => {
    setIsLoadingBars(barsLoading);
    setIsLoadingRoutes(routesLoading);
  }, []);

  const handleSearchComplete = useCallback((result: SearchPipelineResult) => {
    setBars(result.bars);
    setTravelMatrix(result.travelMatrix);
    setEffectiveSearchCenter(result.effectiveSearchCenter);
    setShiftNotice(result.shiftNotice);
    setHasSearchedOnce(true);
    setHasPendingChanges(false);
    setSelectedBarId(null);
    setActiveTab('bars');
    setSheetSnap('mid');
  }, []);

  const handleTriggerSearch = () => {
    if (session.participants.length === 0 || !activeApiKey) return;
    setActiveTab('bars');
    setSheetSnap((prev) => (prev === 'low' ? 'mid' : prev));
    setSearchTriggerId((prev) => prev + 1);
  };

  const handleUpsertParticipant = useCallback(
    (participant: Participant) => {
      setSession((prev) => {
        const exists = prev.participants.some((p) => p.id === participant.id);
        const nextParticipants = exists
          ? prev.participants.map((p) => (p.id === participant.id ? participant : p))
          : [...prev.participants, participant];
        return {...prev, participants: nextParticipants};
      });
      if (hasSearchedOnce) setHasPendingChanges(true);
    },
    [hasSearchedOnce]
  );

  const handleRemoveParticipant = useCallback(
    (participantId: string) => {
      setSession((prev) => {
        const nextParticipants = prev.participants.filter((p) => p.id !== participantId);
        return {...prev, participants: nextParticipants};
      });
      if (hasSearchedOnce) setHasPendingChanges(true);
    },
    [hasSearchedOnce]
  );

  const clearSearchResults = useCallback(() => {
    setBars([]);
    setTravelMatrix({});
    setEffectiveSearchCenter(null);
    setShiftNotice(null);
    setSelectedBarId(null);
    setHasSearchedOnce(false);
    setHasPendingChanges(false);
    setBarsError(null);
  }, []);

  const openAccountModal = useCallback((tab: AccountFriendsModalTab) => {
    setAccountModalTab(tab);
    setIsAccountModalOpen(true);
  }, []);

  const handleLaunchSharedGroup = useCallback(
    (group: SharedGroupWithMembers) => {
      const members: Participant[] = group.members
        .filter(
          (m) =>
            Boolean(m.default_address?.trim()) &&
            typeof m.default_lat === 'number' &&
            Number.isFinite(m.default_lat) &&
            typeof m.default_lng === 'number' &&
            Number.isFinite(m.default_lng) &&
            (m.default_lat !== 0 || m.default_lng !== 0)
        )
        .map((m) => ({
          id: `member_${m.id}`,
          name: m.username,
          address: m.default_address!.trim(),
          lat: m.default_lat!,
          lng: m.default_lng!,
          mode: m.default_mode || 'TRANSIT',
        }));

      if (members.length === 0) {
        showToast("Aucun membre de ce groupe n'a d'adresse enregistrée.");
        return;
      }

      setSession((prev) => ({
        ...prev,
        participants: members,
      }));
      setActiveTab('participants');
      if (hasSearchedOnce) setHasPendingChanges(true);

      const skipped = group.members.length - members.length;
      if (skipped > 0) {
        showToast(
          `Groupe « ${group.name} » chargé (${members.length} participants, ${skipped} sans adresse)`
        );
      } else {
        showToast(`Groupe « ${group.name} » chargé (${members.length} participants)`);
      }
    },
    [hasSearchedOnce, showToast]
  );

  const handleTogglePostalCode = useCallback(
    (postalCode: string, label?: string) => {
      setSession((prev) => {
        const current = prev.excludedZones.postalCodes;
        const exists = current.includes(postalCode);
        const nextCodes = exists
          ? current.filter((c) => c !== postalCode)
          : [...current, postalCode];

        const nextLabels = {...(prev.excludedZones.postalCodeLabels || {})};
        if (exists) {
          delete nextLabels[postalCode];
        } else if (label) {
          nextLabels[postalCode] = label;
        }

        return {
          ...prev,
          excludedZones: {
            ...prev.excludedZones,
            postalCodes: nextCodes,
            postalCodeLabels: Object.keys(nextLabels).length > 0 ? nextLabels : undefined,
          },
        };
      });
      if (hasSearchedOnce) setHasPendingChanges(true);
    },
    [hasSearchedOnce]
  );

  const handleRemovePostalCode = useCallback(
    (postalCode: string) => {
      setSession((prev) => {
        const nextCodes = prev.excludedZones.postalCodes.filter((c) => c !== postalCode);
        const nextLabels = {...(prev.excludedZones.postalCodeLabels || {})};
        delete nextLabels[postalCode];
        return {
          ...prev,
          excludedZones: {
            ...prev.excludedZones,
            postalCodes: nextCodes,
            postalCodeLabels: Object.keys(nextLabels).length > 0 ? nextLabels : undefined,
          },
        };
      });
      if (hasSearchedOnce) setHasPendingChanges(true);
    },
    [hasSearchedOnce]
  );

  const handleAddCustomExcludedZone = useCallback(
    (zone: ExcludedCustomZone) => {
      setSession((prev) => ({
        ...prev,
        excludedZones: {
          ...prev.excludedZones,
          customZones: [...prev.excludedZones.customZones, zone],
        },
      }));
      if (hasSearchedOnce) setHasPendingChanges(true);
    },
    [hasSearchedOnce]
  );

  const handleRemoveCustomExcludedZone = useCallback(
    (zoneId: string) => {
      setSession((prev) => ({
        ...prev,
        excludedZones: {
          ...prev.excludedZones,
          customZones: prev.excludedZones.customZones.filter((z) => z.id !== zoneId),
        },
      }));
      if (hasSearchedOnce) setHasPendingChanges(true);
    },
    [hasSearchedOnce]
  );

  const handleClearExcludedZones = useCallback(() => {
    setSession((prev) => ({
      ...prev,
      excludedZones: {postalCodes: [], customZones: []},
    }));
    if (hasSearchedOnce) setHasPendingChanges(true);
  }, [hasSearchedOnce]);

  const handleToggleVote = useCallback(
    (barId: string) => {
      const voter = activeUserName.trim() || session.participants[0]?.name || 'Moi';
      setSession((prev) => {
        const current = prev.votes[barId] || [];
        const exists = current.some((v) => v.toLowerCase() === voter.toLowerCase());
        const nextForBar = exists
          ? current.filter((v) => v.toLowerCase() !== voter.toLowerCase())
          : [...current, voter];
        return {
          ...prev,
          votes: {
            ...prev.votes,
            [barId]: nextForBar,
          },
        };
      });
    },
    [activeUserName, session.participants]
  );

  const handleCreateNewSession = useCallback(() => {
    const freshId = createSessionId();
    const fresh = createDefaultSession();
    setActiveSessionId(freshId);
    setSession(fresh);
    clearSearchResults();
    setActiveTab('participants');
    setSheetSnap('mid');
    showToast('Nouvelle soirée prête');
  }, [clearSearchResults, showToast]);

  const handleSelectSavedSession = useCallback(
    (record: SavedSessionRecord) => {
      setActiveSessionId(record.id);
      setSession(record.session);
      clearSearchResults();
      if (record.session.participants.length > 0 && activeApiKey) {
        setActiveTab('bars');
        setSearchTriggerId((prev) => prev + 1);
      } else {
        setActiveTab('participants');
      }
      showToast(`Soirée « ${record.session.title} » chargée`);
    },
    [activeApiKey, clearSearchResults, showToast]
  );

  const handleDeleteSavedSession = useCallback(
    (sessionId: string) => {
      const nextList = deleteSessionRecord(sessionId);
      setSavedSessions(nextList);

      if (sessionId === activeSessionId) {
        if (nextList.length > 0) {
          setActiveSessionId(nextList[0].id);
          setSession(nextList[0].session);
          clearSearchResults();
        } else {
          const freshId = createSessionId();
          setActiveSessionId(freshId);
          setSession(createDefaultSession());
          clearSearchResults();
        }
      }
      showToast('Soirée supprimée');
    },
    [activeSessionId, clearSearchResults, showToast]
  );

  const shareUrl = useMemo(() => buildShareUrl(session), [session]);

  const voteMessage = useMemo(() => {
    const title = session.title.trim() || 'ApéroCentral';
    return `🍻 Rejoins « ${title} » et ajoute ton trajet :\n${shareUrl}`;
  }, [session.title, shareUrl]);

  const recapMessage = useMemo(() => {
    if (!winningBar) return null;
    return buildMessengerRecapText(
      session,
      winningBar,
      travelMatrix[winningBar.id] || {}
    );
  }, [session, winningBar, travelMatrix]);

  const handleSyncShareUrl = useCallback(() => {
    syncSessionToUrl(session);
  }, [session]);

  const handleCopyShareText = useCallback(
    (text: string, toastText: string) => {
      void copyTextToClipboard(text);
      showToast(toastText);
    },
    [showToast]
  );

  const handleTriggerMessengerShare = useCallback(
    (text: string, url: string) => {
      syncSessionToUrl(session);
      void copyTextToClipboard(text);
      showToast('Copié pour Messenger !');

      if (typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
        const link = document.createElement('a');
        link.href = `fb-messenger://share?link=${encodeURIComponent(url)}`;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    },
    [session, showToast]
  );

  const handleCopyMessengerRecap = () => {
    if (!winningBar) return;
    const text = buildMessengerRecapText(
      session,
      winningBar,
      travelMatrix[winningBar.id] || {}
    );
    void copyTextToClipboard(text);
    showToast('Copié pour Messenger !');
  };

  const handleSaveApiKey = (newKey: string) => {
    saveCustomApiKey(newKey);
    setCustomApiKey(newKey);
    setQuotaExceeded(false);
    showToast(newKey ? 'Clé Google Maps enregistrée' : 'Clé personnalisée effacée');
  };

  const summaryText = useMemo(() => {
    const pCount = session.participants.length;
    const pLabel = `${pCount} participant${pCount > 1 ? 's' : ''}`;
    const bCount = filteredAndSortedBars.length;
    if (isLoadingBars) return `${pLabel} · Recherche des bars…`;
    if (isLoadingRoutes) return `${pLabel} · Calcul des trajets…`;
    if (bCount > 0) {
      const bestName = winningBar?.name || filteredAndSortedBars[0].name;
      return `${pLabel} · ${bCount} bar${bCount > 1 ? 's' : ''} trouvé${bCount > 1 ? 's' : ''} · Meilleur : ${bestName}`;
    }
    if (pCount === 0) return 'Ajoute tes potes pour trouver le bar central';
    return `${pLabel} · Touche pour trouver le QG idéal`;
  }, [session.participants.length, filteredAndSortedBars, isLoadingBars, isLoadingRoutes, winningBar]);

  const isSearching = isLoadingBars || isLoadingRoutes;

  const appShell = (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-[var(--bg-page)] text-[var(--text-primary)]">
      {/* 1. Full-Screen Interactive Google Map (100dvh background) */}
      {activeApiKey ? (
        <MapsWorkspace
          apiKey={activeApiKey}
          session={session}
          centerPoint={centerPoint}
          effectiveSearchCenter={effectiveSearchCenter}
          shiftNotice={shiftNotice}
          bars={filteredAndSortedBars}
          selectedBarId={selectedBarId}
          winningBarId={winningBar?.id || null}
          searchTriggerId={searchTriggerId}
          isDarkMode={isDarkMode}
          sheetSnap={sheetSnap}
          getLocalBars={getLocalBars}
          onSelectBar={handleSelectBarFromMap}
          onSearchLoadingChange={handleSearchLoadingChange}
          onSearchError={setBarsError}
          onSearchComplete={handleSearchComplete}
          onMapsReadyChange={setMapsReady}
        />
      ) : (
        <div className="fixed inset-0 flex h-[100dvh] w-full flex-col items-center justify-center bg-[var(--bg-page)] p-6 pb-48 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#0A84FF]/15 text-[#0A84FF]">
            <KeyRound className="h-6 w-6" aria-hidden="true" />
          </div>
          <h2 className="mt-3 text-base font-semibold tracking-tight text-[var(--text-primary)]">
            Clé API Google Maps requise
          </h2>
          <p className="mt-1 max-w-sm text-xs leading-relaxed text-[var(--text-secondary)]">
            Ajoute ta clé Google Maps Platform (Maps JS, Places New, Routes) pour afficher la carte plein écran et calculer les trajets réels.
          </p>
          <button
            type="button"
            onClick={() => setIsApiKeyModalOpen(true)}
            className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-full bg-[#0A84FF] px-5 py-2 text-sm font-semibold text-white hover:bg-[#0A84FF]/90"
          >
            <Settings className="h-4 w-4" aria-hidden="true" />
            <span>Saisir ma clé API</span>
          </button>
        </div>
      )}

      {/* Quota Banner (if triggered) */}
      {quotaExceeded && (
        <div className="fixed top-0 inset-x-0 z-50 bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2 text-xs text-center shadow-sm">
          <span>
            Google Maps Platform quota reached. Visit{' '}
            <a
              href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold text-amber-950"
            >
              maps developer site
            </a>{' '}
            for instructions.
          </span>
        </div>
      )}

      <OfflineIndicator />

      {/* 2. Floating Frosted Apple Maps Header */}
      <header className="fixed top-0 left-0 right-0 z-30 pt-safe pointer-events-none">
        <div className="pointer-events-auto mx-3 mt-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-header)] px-3.5 py-2 shadow-lg backdrop-blur-xl lg:mx-4">
          {/* Left: Editable Title + Interactive Date/Time Pill */}
          <div className="flex min-w-[155px] flex-1 items-center gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#FF9F0A]/15 text-[#FF9F0A]">
              <Beer className="h-4 w-4" aria-hidden="true" />
            </span>

            <div className="min-w-0 flex-1">
              {isEditingTitle ? (
                <input
                  ref={titleInputRef}
                  type="text"
                  value={session.title}
                  onChange={(e) => setSession((prev) => ({...prev, title: e.target.value}))}
                  onBlur={() => {
                    setIsEditingTitle(false);
                    if (!session.title.trim()) {
                      setSession((prev) => ({...prev, title: 'Apéro de la Team'}));
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === 'Escape') {
                      setIsEditingTitle(false);
                    }
                  }}
                  maxLength={60}
                  aria-label="Nom de la soirée"
                  className="w-full max-w-[200px] rounded-lg border border-[#0A84FF] bg-[var(--bg-card-strong)] px-2 py-0.5 text-sm font-semibold tracking-tight text-[var(--text-primary)] focus:outline-none"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setIsEditingTitle(true)}
                  title="Taper pour modifier le titre"
                  className="group flex max-w-full items-center gap-1 text-left"
                >
                  <span className="truncate text-sm sm:text-base font-semibold tracking-tight text-[var(--text-primary)]">
                    {session.title || 'Apéro de la Team'}
                  </span>
                  <Pencil
                    className="h-3 w-3 shrink-0 text-[var(--text-secondary)] opacity-75 group-hover:opacity-100"
                    aria-hidden="true"
                  />
                </button>
              )}

              <div className="mt-0.5 flex items-center">
                <div
                  onClick={() => {
                    try {
                      const el = dateInputRef.current as
                        | (HTMLInputElement & {showPicker?: () => void})
                        | null;
                      el?.showPicker?.();
                      el?.focus();
                    } catch {
                      dateInputRef.current?.focus();
                    }
                  }}
                  className="inline-flex cursor-pointer items-center gap-1 rounded-full bg-[var(--bg-surface)] px-2 py-0.5 transition-colors hover:bg-[var(--bg-surface-hover)]"
                >
                  <Calendar className="h-3 w-3 shrink-0 text-[#0A84FF]" aria-hidden="true" />
                  <input
                    ref={dateInputRef}
                    id="session-datetime"
                    type="datetime-local"
                    aria-label="Date et heure du rendez-vous"
                    value={session.dateTime}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val) {
                        setSession((prev) => ({...prev, dateTime: val}));
                        if (hasSearchedOnce) setHasPendingChanges(true);
                      }
                    }}
                    className="cursor-pointer bg-transparent text-[11px] font-medium text-[var(--text-primary)] focus:outline-none tabular-nums"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Right: Compact Action Controls */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setIsSessionsDrawerOpen(true)}
              aria-label="Mes soirées"
              title="Mes soirées"
              className="inline-flex min-h-[34px] items-center gap-1 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5 py-1 text-xs font-semibold text-[var(--text-primary)] transition-colors hover:border-[#0A84FF]/50 whitespace-nowrap"
            >
              <FolderHeart className="h-3.5 w-3.5 text-[#0A84FF]" aria-hidden="true" />
              <span className="hidden sm:inline">Mes soirées</span>
              {savedSessions.length > 0 && (
                <span className="rounded-full bg-[#0A84FF]/20 px-1.5 py-0.5 text-[10px] font-bold text-[#0A84FF] tabular-nums">
                  {savedSessions.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setIsExclusionsModalOpen(true)}
              aria-label="Exclure des quartiers ou villes"
              title="Exclusions de zones"
              className={`inline-flex min-h-[34px] items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors whitespace-nowrap ${
                excludedCount > 0
                  ? 'border-[#FF453A]/45 bg-[#FF453A]/15 text-[#FF453A]'
                  : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] hover:border-[var(--border-strong)]'
              }`}
            >
              <Ban className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="hidden md:inline">Exclusions</span>
              {excludedCount > 0 && (
                <span className="rounded-full bg-[#FF453A] px-1.5 py-0.5 text-[10px] font-bold text-white tabular-nums">
                  {excludedCount}
                </span>
              )}
            </button>

            <PWAInstallButton />

            <button
              type="button"
              onClick={() => setThemeMode((prev) => (prev === 'dark' ? 'light' : 'dark'))}
              aria-label={isDarkMode ? 'Passer en mode jour' : 'Passer en mode nuit'}
              title={isDarkMode ? 'Mode Nuit (passer en Jour)' : 'Mode Jour (passer en Nuit)'}
              className="inline-flex h-[34px] w-[34px] items-center justify-center rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] transition-colors hover:border-[#0A84FF]/50"
            >
              {isDarkMode ? (
                <Moon className="h-3.5 w-3.5 text-[#0A84FF]" aria-hidden="true" />
              ) : (
                <Sun className="h-3.5 w-3.5 text-[#FF9F0A]" aria-hidden="true" />
              )}
            </button>

            <button
              type="button"
              onClick={() => setIsApiKeyModalOpen(true)}
              aria-label="Paramètres clé API Google Maps"
              title="Paramètres clé API Google Maps"
              className="inline-flex h-[34px] w-[34px] items-center justify-center rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
            >
              <Settings className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>
      </header>

      {/* 3. Magnetic 3-Snap iOS Bottom Sheet (Floating Side Panel on lg:) */}
      <BottomSheet
        snap={sheetSnap}
        onSnapChange={setSheetSnap}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        participantsCount={session.participants.length}
        barsCount={filteredAndSortedBars.length}
        summaryText={summaryText}
        connectedUsername={profile?.username || null}
        pendingInvitesCount={pendingInvitesCount}
        onOpenAccountModal={() => openAccountModal('profile')}
        scrollContainerRef={sheetScrollRef}
        footer={
          <MessengerShareBar
            voteMessage={voteMessage}
            recapMessage={recapMessage}
            shareUrl={shareUrl}
            canCopyRecap={Boolean(winningBar)}
            onSyncUrl={handleSyncShareUrl}
            onCopyText={handleCopyShareText}
            onTriggerMessenger={handleTriggerMessengerShare}
            onAddCalendar={() => {
              if (winningBar) downloadIcsFile(session, winningBar);
            }}
          />
        }
      >
        {activeTab === 'participants' ? (
          <>
            <ParticipantManager
              participants={session.participants}
              isAuthenticated={Boolean(authUser && profile)}
              groups={sharedGroups}
              mapsReady={Boolean(activeApiKey) && mapsReady}
              onUpsertParticipant={handleUpsertParticipant}
              onRemoveParticipant={handleRemoveParticipant}
              onSetActiveUserName={setActiveUserName}
              onLaunchGroup={handleLaunchSharedGroup}
              onOpenGroupsModal={() => openAccountModal('groups')}
            />

            <button
              type="button"
              onClick={handleTriggerSearch}
              disabled={session.participants.length === 0 || !activeApiKey || isSearching}
              className={`flex min-h-[48px] w-full items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-semibold transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 ${
                hasPendingChanges
                  ? 'bg-[#30D158] text-black shadow-[0_8px_24px_rgba(48,209,88,0.28)] hover:bg-[#30D158]/90'
                  : 'bg-[#0A84FF] text-white shadow-[0_8px_24px_rgba(10,132,255,0.3)] hover:bg-[#0A84FF]/90'
              }`}
            >
              {isSearching ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  <span>
                    {isLoadingBars
                      ? 'Recherche des vrais bars…'
                      : 'Calcul porte-à-porte Google Routes…'}
                  </span>
                </>
              ) : (
                <>
                  <Compass className="h-4 w-4" aria-hidden="true" />
                  <span>
                    {hasPendingChanges ? 'Recalculer le QG idéal' : 'Trouver le QG idéal'}
                  </span>
                </>
              )}
            </button>
          </>
        ) : (
          <>
            {hasPendingChanges && (
              <button
                type="button"
                onClick={handleTriggerSearch}
                disabled={session.participants.length === 0 || !activeApiKey || isSearching}
                className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-full bg-[#30D158] px-4 py-2.5 text-xs font-semibold text-black shadow-md transition-all active:scale-[0.98]"
              >
                <Compass className="h-4 w-4" aria-hidden="true" />
                <span>Paramètres modifiés · Recalculer le QG idéal</span>
              </button>
            )}

            {winningBar && (
              <div className="space-y-2.5 rounded-2xl border border-[#0A84FF]/35 bg-[var(--bg-card-strong)] px-4 py-3 backdrop-blur-xl">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-[#0A84FF]">
                      <Trophy className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <span>QG retenu</span>
                    </div>
                    <p className="truncate text-sm font-semibold tracking-tight text-[var(--text-primary)]">
                      {winningBar.name}
                    </p>
                    {winningBar.nearestStation && (
                      <p className="truncate text-xs text-[var(--text-secondary)]">
                        🚉 {winningBar.nearestStation}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => downloadIcsFile(session, winningBar)}
                    className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full border border-[#30D158]/35 bg-[#30D158]/15 px-3 py-1 text-xs font-semibold text-[#30D158] transition-colors hover:bg-[#30D158]/25 whitespace-nowrap shrink-0"
                  >
                    <CalendarPlus className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Agenda</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleCopyMessengerRecap}
                  className="flex min-h-[38px] w-full items-center justify-center gap-2 rounded-full bg-[#0084FF] px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#0073E6]"
                >
                  <Copy className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>Copier le récap pour Messenger</span>
                </button>
              </div>
            )}

            <BarList
              bars={filteredAndSortedBars}
              totalBarsBeforeFilter={barsWithLiveHours.length}
              participants={session.participants}
              travelMatrix={travelMatrix}
              votes={session.votes}
              customPrices={session.customPrices}
              targetDateTime={session.dateTime}
              activeUserName={activeUserName}
              selectedBarId={selectedBarId}
              winningBarId={winningBar?.id || null}
              sortBy={sortBy}
              onlyCheap={onlyCheap}
              onlyTopRated={onlyTopRated}
              onlyOpen={onlyOpen}
              isLoadingBars={isLoadingBars}
              isLoadingRoutes={isLoadingRoutes}
              hasSearchedOnce={hasSearchedOnce}
              barsError={barsError}
              shiftNotice={shiftNotice}
              registerBarRef={registerBarRef}
              onChangeSort={setSortBy}
              onSelectAllFilter={() => {
                setOnlyCheap(false);
                setOnlyTopRated(false);
                setOnlyOpen(false);
              }}
              onToggleCheapFilter={() => setOnlyCheap((p) => !p)}
              onToggleTopRatedFilter={() => setOnlyTopRated((p) => !p)}
              onToggleOpenFilter={() => setOnlyOpen((p) => !p)}
              onResetFilters={() => {
                setOnlyCheap(false);
                setOnlyTopRated(false);
                setOnlyOpen(false);
              }}
              onSelectBar={(id) => setSelectedBarId(id)}
              onToggleVote={handleToggleVote}
              onAddToCalendar={(bar) => downloadIcsFile(session, bar)}
            />
          </>
        )}
      </BottomSheet>

      {/* iOS Toast Pill */}
      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          className="fixed top-24 left-1/2 z-50 -translate-x-1/2 flex items-center gap-2 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-card-strong)] px-4 py-2 text-xs sm:text-sm font-medium text-[var(--text-primary)] shadow-2xl backdrop-blur-2xl whitespace-nowrap"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0 text-[#30D158]" aria-hidden="true" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Supabase Account, Friends & Shared Groups Modal */}
      <AccountAndFriendsModal
        isOpen={isAccountModalOpen}
        initialTab={accountModalTab}
        onClose={() => setIsAccountModalOpen(false)}
        mapsReady={Boolean(activeApiKey) && mapsReady}
        authUser={authUser}
        profile={profile}
        friendships={friendships}
        groups={sharedGroups}
        onRefreshData={() => refreshSupabaseUserData(authUser)}
        onProfileUpdated={(nextProfile) => {
          setProfile(nextProfile);
          if (nextProfile?.username) {
            setActiveUserName(nextProfile.username);
          }
        }}
        onLaunchGroup={handleLaunchSharedGroup}
        onShowToast={showToast}
      />

      {/* Saved Sessions Drawer */}
      <SessionsDrawer
        isOpen={isSessionsDrawerOpen}
        onClose={() => setIsSessionsDrawerOpen(false)}
        sessions={savedSessions}
        activeSessionId={activeSessionId}
        onSelectSession={handleSelectSavedSession}
        onCreateNewSession={handleCreateNewSession}
        onDeleteSession={handleDeleteSavedSession}
      />

      {/* Zone Exclusions Modal */}
      <ZoneExclusionModal
        isOpen={isExclusionsModalOpen}
        onClose={() => setIsExclusionsModalOpen(false)}
        excludedZones={session.excludedZones}
        mapsReady={Boolean(activeApiKey) && mapsReady}
        onTogglePostalCode={handleTogglePostalCode}
        onRemovePostalCode={handleRemovePostalCode}
        onAddCustomZone={handleAddCustomExcludedZone}
        onRemoveCustomZone={handleRemoveCustomExcludedZone}
        onClearAll={handleClearExcludedZones}
      />

      {/* Gear API Key Modal */}
      <ApiKeyModal
        isOpen={isApiKeyModalOpen}
        onClose={() => setIsApiKeyModalOpen(false)}
        customApiKey={customApiKey}
        envApiKeyPresent={Boolean(ENV_API_KEY)}
        onSaveKey={handleSaveApiKey}
      />
    </div>
  );

  return activeApiKey ? (
    <APIProvider
      key={activeApiKey}
      apiKey={activeApiKey}
      libraries={['places', 'routes']}
      language="fr"
      region="FR"
    >
      {appShell}
    </APIProvider>
  ) : (
    appShell
  );
}
