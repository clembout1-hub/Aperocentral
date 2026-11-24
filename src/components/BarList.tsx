import React, {useState} from 'react';
import {
  Beer,
  CalendarPlus,
  Check,
  Clock,
  Compass,
  ExternalLink,
  Loader2,
  MapPin,
  Navigation,
  Search,
  Star,
  Tag,
  ThumbsUp,
  Trophy,
} from 'lucide-react';
import type {BarCandidate, Participant, SortCriterion, TravelTimeInfo} from '../types/apero';
import {
  buildCitymapperUrl,
  buildGoogleMapsUrl,
  formatDuration,
  formatPriceLevel,
  getModeEmoji,
  isCheapBar,
  parseNumericPintPrice,
} from '../utils/geo';

interface BarListProps {
  bars: BarCandidate[];
  totalBarsBeforeFilter: number;
  participants: Participant[];
  travelMatrix: Record<string, Record<string, TravelTimeInfo>>; // barId -> participantId -> info
  votes: Record<string, string[]>;
  customPrices: Record<string, string>;
  activeUserName: string;
  selectedBarId: string | null;
  winningBarId: string | null;
  sortBy: SortCriterion;
  onlyCheap: boolean;
  onlyOpen: boolean;
  isLoadingBars: boolean;
  isLoadingRoutes: boolean;
  hasSearchedOnce: boolean;
  barsError: string | null;
  shiftNotice: string | null;
  onChangeSort: (sort: SortCriterion) => void;
  onToggleCheapFilter: () => void;
  onToggleOpenFilter: () => void;
  onResetFilters: () => void;
  onSelectBar: (barId: string) => void;
  onToggleVote: (barId: string) => void;
  onChangeCustomPrice: (barId: string, price: string) => void;
  onAddToCalendar: (bar: BarCandidate) => void;
}

const FAST_TRIP_SECONDS = 18 * 60;

export const BarList: React.FC<BarListProps> = ({
  bars,
  totalBarsBeforeFilter,
  participants,
  travelMatrix,
  votes,
  customPrices,
  activeUserName,
  selectedBarId,
  winningBarId,
  sortBy,
  onlyCheap,
  onlyOpen,
  isLoadingBars,
  isLoadingRoutes,
  hasSearchedOnce,
  barsError,
  shiftNotice,
  onChangeSort,
  onToggleCheapFilter,
  onToggleOpenFilter,
  onResetFilters,
  onSelectBar,
  onToggleVote,
  onChangeCustomPrice,
  onAddToCalendar,
}) => {
  const voterKey = activeUserName.trim() || participants[0]?.name || 'Moi';
  const [openNavBarId, setOpenNavBarId] = useState<string | null>(null);

  return (
    <section aria-labelledby="bars-heading" className="space-y-3">
      {/* Section Header & Segmented Sort */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="bars-heading" className="text-base font-semibold tracking-tight text-white">
            Bars autour du QG
          </h2>
          <p className="text-xs text-[#8E8E93]">
            {isLoadingRoutes
              ? 'Calcul des trajets & lignes métro…'
              : 'Classés par équité des temps de trajet'}
          </p>
        </div>

        <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-[#1C1C1E]/90 p-1">
          {(
            [
              {id: 'fairness', label: 'Équité'},
              {id: 'price', label: 'Prix'},
              {id: 'rating', label: 'Note'},
            ] as const
          ).map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => onChangeSort(option.id)}
              className={`min-h-[34px] rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors whitespace-nowrap ${
                sortBy === option.id
                  ? 'bg-[#0A84FF] text-white'
                  : 'text-[#8E8E93] hover:text-white'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {/* Filter Pills */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onToggleCheapFilter}
          aria-pressed={onlyCheap}
          className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
            onlyCheap
              ? 'border-[#30D158]/50 bg-[#30D158]/15 text-[#30D158]'
              : 'border-white/10 bg-[#1C1C1E]/75 text-white/80 hover:border-white/25 hover:text-white'
          }`}
        >
          <Tag className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>Pas cher (€)</span>
        </button>

        <button
          type="button"
          onClick={onToggleOpenFilter}
          aria-pressed={onlyOpen}
          className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
            onlyOpen
              ? 'border-[#FF9F0A]/50 bg-[#FF9F0A]/15 text-[#FF9F0A]'
              : 'border-white/10 bg-[#1C1C1E]/75 text-white/80 hover:border-white/25 hover:text-white'
          }`}
        >
          <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>Ouvert maintenant / tard</span>
        </button>
      </div>

      {/* Spiral Fallback Notice */}
      {shiftNotice && (
        <div className="flex items-start gap-2 rounded-2xl border border-[#0A84FF]/30 bg-[#0A84FF]/10 px-3.5 py-2.5 text-xs text-[#64D2FF]">
          <Compass className="mt-0.5 h-4 w-4 shrink-0 text-[#0A84FF]" aria-hidden="true" />
          <span>{shiftNotice}</span>
        </div>
      )}

      {isLoadingBars && (
        <div className="flex items-center justify-center gap-2.5 rounded-2xl border border-white/10 bg-[#1C1C1E]/75 py-10 text-sm text-[#8E8E93] backdrop-blur-xl">
          <Loader2 className="h-5 w-5 animate-spin text-[#0A84FF]" aria-hidden="true" />
          <span>Recherche des bars autour du QG…</span>
        </div>
      )}

      {!isLoadingBars && barsError && (
        <div
          role="alert"
          className="rounded-2xl border border-[#FF453A]/30 bg-[#FF453A]/10 p-4 text-sm text-[#FF453A]"
        >
          {barsError}
        </div>
      )}

      {!isLoadingBars && !barsError && participants.length === 0 && (
        <div className="rounded-2xl border border-white/10 bg-[#1C1C1E]/75 p-6 text-center backdrop-blur-xl">
          <Beer className="mx-auto h-8 w-8 text-[#FF9F0A]" aria-hidden="true" />
          <p className="mt-2 text-sm font-semibold text-white">
            Ajoute les participants ci-dessus
          </p>
          <p className="mt-1 text-xs text-[#8E8E93]">
            Puis touche « Trouver le QG idéal » pour lancer le calcul.
          </p>
        </div>
      )}

      {!isLoadingBars && !barsError && participants.length > 0 && !hasSearchedOnce && bars.length === 0 && (
        <div className="rounded-2xl border border-white/10 bg-[#1C1C1E]/75 p-6 text-center backdrop-blur-xl">
          <Search className="mx-auto h-7 w-7 text-[#0A84FF]" aria-hidden="true" />
          <p className="mt-2 text-sm font-semibold text-white">
            Prêt à calculer le point de rendez-vous
          </p>
          <p className="mt-1 text-xs text-[#8E8E93]">
            Appuie sur « Trouver le QG idéal » quand le groupe est prêt.
          </p>
        </div>
      )}

      {!isLoadingBars && !barsError && participants.length > 0 && hasSearchedOnce && totalBarsBeforeFilter === 0 && (
        <div className="rounded-2xl border border-white/10 bg-[#1C1C1E]/75 p-6 text-center text-sm text-[#8E8E93]">
          Aucun bar disponible hors des zones exclues. Essaie de réautoriser un quartier ou d&apos;ajuster les départs.
        </div>
      )}

      {!isLoadingBars && !barsError && totalBarsBeforeFilter > 0 && bars.length === 0 && (
        <div className="rounded-2xl border border-white/10 bg-[#1C1C1E]/75 p-6 text-center backdrop-blur-xl">
          <p className="text-sm text-[#8E8E93]">
            Aucun des bars retenus ne correspond aux filtres actifs.
          </p>
          <button
            type="button"
            onClick={onResetFilters}
            className="mt-3 inline-flex min-h-[38px] items-center rounded-full bg-[#0A84FF]/15 px-4 py-1.5 text-xs font-semibold text-[#0A84FF] hover:bg-[#0A84FF]/25"
          >
            Réinitialiser les filtres
          </button>
        </div>
      )}

      {/* Apple Maps Style Bar Cards */}
      {!isLoadingBars && bars.length > 0 && (
        <div className="space-y-3">
          {bars.map((bar, idx) => {
            const barTimes = travelMatrix[bar.id] || {};
            const barVotes = votes[bar.id] || [];
            const hasVoted = barVotes.some(
              (v) => v.toLowerCase() === voterKey.toLowerCase()
            );
            const isWinner = winningBarId === bar.id;
            const isSelected = selectedBarId === bar.id;
            const priceInfo = formatPriceLevel(bar.priceLevel);
            const customPint = parseNumericPintPrice(customPrices[bar.id]);
            const cheapHighlight = isCheapBar(bar, customPrices[bar.id]);
            const isNavOpen = openNavBarId === bar.id;

            const durations = participants
              .map((p) => barTimes[p.id]?.durationSeconds)
              .filter((d): d is number => typeof d === 'number');
            const avgMinutes =
              durations.length > 0
                ? Math.round(durations.reduce((sum, d) => sum + d, 0) / durations.length / 60)
                : null;
            const maxMinutes =
              durations.length > 0 ? Math.round(Math.max(...durations) / 60) : null;

            return (
              <article
                key={bar.id}
                onClick={() => onSelectBar(bar.id)}
                className={`cursor-pointer rounded-2xl border p-4 sm:p-5 backdrop-blur-xl transition-all ${
                  isSelected
                    ? 'border-[#0A84FF] bg-[#1C1C1E]/95 shadow-[0_0_0_1px_rgba(10,132,255,0.35)]'
                    : isWinner
                    ? 'border-[#0A84FF]/40 bg-[#1C1C1E]/85'
                    : 'border-white/10 bg-[#1C1C1E]/75 hover:border-white/20'
                }`}
              >
                {/* Header Row: Rank + Title + Green Price Badge */}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {isWinner && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#0A84FF]/20 px-2 py-0.5 text-[11px] font-semibold text-[#0A84FF] shrink-0">
                          <Trophy className="h-3 w-3" aria-hidden="true" />
                          <span>QG</span>
                        </span>
                      )}
                      <h3 className="truncate text-base font-semibold tracking-tight text-white">
                        {idx + 1}. {bar.name}
                      </h3>
                    </div>

                    {/* Nearest Metro / Transit Station */}
                    {bar.nearestStation && (
                      <p className="mt-1 text-xs font-medium text-white/85">
                        🚉 {bar.nearestStation}
                      </p>
                    )}

                    {/* Rating + Distance + Fairness Summary */}
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#8E8E93]">
                      {bar.rating !== null && (
                        <span className="inline-flex items-center gap-1 font-semibold text-[#FF9F0A] tabular-nums">
                          <Star className="h-3.5 w-3.5 fill-[#FF9F0A] text-[#FF9F0A]" aria-hidden="true" />
                          {bar.rating.toFixed(1)}
                          {bar.userRatingCount !== null && (
                            <span className="font-normal text-[#8E8E93]">({bar.userRatingCount})</span>
                          )}
                        </span>
                      )}
                      <span aria-hidden="true">·</span>
                      <span className="tabular-nums">{Math.round(bar.distanceFromCenterMeters)} m</span>
                      {maxMinutes !== null && avgMinutes !== null && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="text-white/80 tabular-nums">
                            max {maxMinutes} min · moy. {avgMinutes} min
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Price Badge (€ green when cheap) */}
                  <span
                    className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold whitespace-nowrap tabular-nums ${
                      cheapHighlight
                        ? 'border-[#30D158]/35 bg-[#30D158]/15 text-[#30D158]'
                        : priceInfo.tier === 'medium'
                        ? 'border-[#FF9F0A]/30 bg-[#FF9F0A]/15 text-[#FF9F0A]'
                        : 'border-white/10 bg-[#2C2C2E] text-[#8E8E93]'
                    }`}
                  >
                    {customPint !== null && customPint < 6
                      ? `Pinte ${customPrices[bar.id]} €`
                      : priceInfo.label}
                  </span>
                </div>

                {/* Address + Opening Status */}
                <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#8E8E93]">
                  <span className="inline-flex min-w-0 items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5 shrink-0 text-[#8E8E93]" aria-hidden="true" />
                    <span className="truncate">{bar.address}</span>
                  </span>
                  {bar.closesLabel && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span
                        className={`font-medium ${
                          bar.isOpenAtTarget === false ? 'text-[#FF453A]' : 'text-[#30D158]'
                        }`}
                      >
                        {bar.closesLabel}
                      </span>
                    </>
                  )}
                </div>

                {/* Horizontal Row of Travel Times + Transit Line Pills */}
                {participants.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {participants.map((p) => {
                      const info = barTimes[p.id];
                      const isFast = info && info.durationSeconds <= FAST_TRIP_SECONDS;
                      return (
                        <div
                          key={p.id}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-[#2C2C2E]/65 px-2.5 py-1.5 text-xs"
                        >
                          <span aria-hidden="true">{getModeEmoji(p.mode)}</span>
                          <span className="max-w-[80px] truncate font-medium text-white/90">
                            {p.name}
                          </span>
                          <span aria-hidden="true" className="text-[#8E8E93]">·</span>
                          <span
                            className={`font-semibold tabular-nums ${
                              isFast ? 'text-[#30D158]' : 'text-white'
                            }`}
                          >
                            {info ? (
                              <>
                                {info.isEstimate ? '~' : ''}
                                {formatDuration(info.durationSeconds)}
                              </>
                            ) : isLoadingRoutes ? (
                              '…'
                            ) : (
                              'N/C'
                            )}
                          </span>
                          {info?.transitLine && (
                            <span
                              className="rounded-md border border-[#0A84FF]/35 bg-[#0A84FF]/20 px-1.5 py-0.5 text-[10px] font-bold tracking-tight text-[#64D2FF]"
                              style={
                                info.transitLineColor
                                  ? {
                                      borderColor: `${info.transitLineColor}66`,
                                      backgroundColor: `${info.transitLineColor}26`,
                                    }
                                  : undefined
                              }
                            >
                              {info.transitLine}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Pint Price + "Y aller" + Vote Pill */}
                <div
                  className="mt-3.5 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center gap-2">
                    <label htmlFor={`pint-${bar.id}`} className="text-xs font-medium text-[#8E8E93]">
                      Pinte (€)
                    </label>
                    <input
                      id={`pint-${bar.id}`}
                      type="text"
                      inputMode="decimal"
                      value={customPrices[bar.id] || ''}
                      onChange={(e) => onChangeCustomPrice(bar.id, e.target.value)}
                      placeholder="5.50"
                      className="min-h-[38px] w-20 rounded-xl border border-white/10 bg-[#2C2C2E]/75 px-2.5 py-1.5 text-xs font-medium text-white placeholder:text-[#8E8E93] focus:border-[#0A84FF] focus:outline-none tabular-nums"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setOpenNavBarId(isNavOpen ? null : bar.id)}
                      aria-expanded={isNavOpen}
                      className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                        isNavOpen
                          ? 'border-[#0A84FF]/50 bg-[#0A84FF]/20 text-[#0A84FF]'
                          : 'border-white/15 bg-[#2C2C2E]/80 text-white hover:bg-[#3A3A3C]'
                      }`}
                    >
                      <Navigation className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Y aller</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => onToggleVote(bar.id)}
                      className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold transition-all whitespace-nowrap ${
                        hasVoted
                          ? 'bg-[#0A84FF] text-white shadow-sm'
                          : 'border border-white/15 bg-[#2C2C2E]/80 text-white hover:border-[#0A84FF]/60'
                      }`}
                    >
                      {hasVoted ? (
                        <Check className="h-3.5 w-3.5" aria-hidden="true" />
                      ) : (
                        <ThumbsUp className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                      <span>{hasVoted ? 'Voté' : 'Voter'}</span>
                      <span className="tabular-nums">({barVotes.length})</span>
                    </button>
                  </div>
                </div>

                {/* Inline "Y aller" Google Maps / Citymapper Drawer */}
                {isNavOpen && (
                  <div
                    className="mt-2.5 flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-[#2C2C2E]/60 p-2.5"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span className="text-[11px] font-medium text-[#8E8E93]">Ouvrir avec :</span>
                    <a
                      href={buildGoogleMapsUrl(bar)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-[34px] items-center gap-1.5 rounded-full border border-white/15 bg-[#1C1C1E] px-3 py-1 text-xs font-semibold text-white hover:border-[#0A84FF]/60"
                    >
                      <span>Google Maps</span>
                      <ExternalLink className="h-3 w-3" aria-hidden="true" />
                    </a>
                    <a
                      href={buildCitymapperUrl(bar)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-[34px] items-center gap-1.5 rounded-full border border-[#30D158]/35 bg-[#30D158]/15 px-3 py-1 text-xs font-semibold text-[#30D158] hover:bg-[#30D158]/25"
                    >
                      <span>Citymapper</span>
                      <ExternalLink className="h-3 w-3" aria-hidden="true" />
                    </a>
                  </div>
                )}

                {/* Voters & Calendar .ics */}
                {(barVotes.length > 0 || isWinner) && (
                  <div
                    className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-xs"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="text-[#FF9F0A]">
                      {barVotes.length > 0 && <span>Votes : {barVotes.join(', ')}</span>}
                    </div>

                    {isWinner && (
                      <button
                        type="button"
                        onClick={() => onAddToCalendar(bar)}
                        className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full border border-[#30D158]/35 bg-[#30D158]/15 px-3 py-1 text-xs font-semibold text-[#30D158] transition-colors hover:bg-[#30D158]/25 whitespace-nowrap"
                      >
                        <CalendarPlus className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Agenda (.ics)</span>
                      </button>
                    )}
                  </div>
                )}

                {/* Required Google Places Attributions */}
                {bar.attributions.length > 0 && (
                  <p className="mt-2 text-[10px] text-[#8E8E93]/80">
                    Source :{' '}
                    {bar.attributions.map((attr, aIdx) => (
                      <React.Fragment key={`${attr.provider}-${aIdx}`}>
                        {aIdx > 0 && ', '}
                        {attr.providerURI ? (
                          <a
                            href={attr.providerURI}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="underline hover:text-white"
                          >
                            {attr.provider}
                          </a>
                        ) : (
                          attr.provider
                        )}
                      </React.Fragment>
                    ))}
                  </p>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
};
