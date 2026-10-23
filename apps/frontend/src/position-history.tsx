import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { api, ApiError, type CrossExHistoryPosition, type CrossExHistoryPositionsResponse } from './api.js';
import { useLanguage } from './i18n.js';
import { ExecutionPagination } from './execution-pagination-control.js';
import { executionPageWindow } from './execution-pagination.js';
import { exchanges, VenueCell, symbolParts } from './route-shared.js';
import { OrderHistory } from './order-history.js';

const PAGE_SIZE = 1000;
type Query = { symbol?: string; from?: number; to?: number; page?: number };
function pnlClass(value: string | null): string {
  return value === null || Number(value) === 0 ? '' : value.startsWith('-') ? 'negative' : 'positive';
}

export function PositionHistory() {
  const { language, t } = useLanguage();
  const [history, setHistory] = useState<CrossExHistoryPositionsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState<Query>({});
  const [symbol, setSymbol] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [search, setSearch] = useState('');
  const [side, setSide] = useState('');
  const [closedType, setClosedType] = useState('COMPLETE_CLOSED');
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<CrossExHistoryPosition | null>(null);
  const generation = useRef(0);
  const inFlight = useRef(false);
  const table = useRef<HTMLDivElement>(null);
  const detailPanel = useRef<HTMLElement>(null);
  const locale = language === 'zh' ? 'zh-CN' : 'en-GB';
  const money = (value: string | null) => value === null ? '—' : Number(value).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 8 });
  const price = (value: string) => Number(value).toLocaleString(locale, { maximumSignificantDigits: 10, useGrouping: false });
  const when = (value: string) => new Date(value).toLocaleString(locale, { hour12: false });

  const load = useCallback(async (request: Query, append = false, revealPage?: number) => {
    if (append && inFlight.current) return;
    const current = append ? generation.current : ++generation.current;
    inFlight.current = true;
    setLoading(true);
    setError(null);
    if (!append) { setHistory(null); setPage(1); setDetail(null); }
    try {
      const result = await api.historyPositions(request);
      if (current !== generation.current) return;
      setHistory((previous) => {
        // A partial-close snapshot and the final close can share the same position ID.
        // Keep the latest cumulative record rather than counting a position twice.
        const latest = new Map<string, CrossExHistoryPosition>();
        for (const position of [...(append ? previous?.items ?? [] : []), ...result.items]) {
          const existing = latest.get(position.id);
          if (!existing || existing.updatedAt <= position.updatedAt) latest.set(position.id, position);
        }
        return { ...result, items: [...latest.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) };
      });
      if (revealPage !== undefined) { setPage(revealPage); table.current?.scrollTo({ top: 0, left: 0 }); }
    } catch (cause) {
      if (current !== generation.current) return;
      setError(cause instanceof ApiError && (cause.code === 'credential_not_configured' || cause.code === 'credential_missing_from_vault')
        ? 'Credentials required for account activity'
        : append ? 'Could not load older positions. Your loaded history is preserved.' : 'Position history is temporarily unavailable');
    } finally {
      if (current === generation.current) { inFlight.current = false; setLoading(false); }
    }
  }, []);
  useEffect(() => { void load({}); return () => { generation.current += 1; }; }, [load]);
  useEffect(() => { if (detail) detailPanel.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }); }, [detail]);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (history?.items ?? []).filter((position) => (!closedType || position.closedType === closedType)
      && (!side || position.positionSide === side)
      && (!needle || [position.id, position.symbol, position.venue, position.positionSide, position.closedType]
        .some((value) => value.toLowerCase().includes(needle))));
  }, [history, search, side, closedType]);
  const window = executionPageWindow(visible.length, page, PAGE_SIZE);
  const hasMore = history?.pagination.hasMore ?? false;
  const older = (revealPage?: number) => {
    if (history && hasMore) void load({ ...query, page: history.pagination.page + 1, to: history.pagination.to }, true, revealPage);
  };
  function changePage(next: number) {
    if (next > window.pageCount) older(next);
    else { setPage(next); table.current?.scrollTo({ top: 0, left: 0 }); }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    const next: Query = {
      ...(symbol.trim() ? { symbol: symbol.trim().toUpperCase() } : {}),
      ...(from ? { from: new Date(from).getTime() } : {}),
      ...(to ? { to: new Date(to).getTime() } : {}),
    };
    if (next.from !== undefined && next.to !== undefined && next.from > next.to) { setError('Start time must be before end time'); return; }
    setQuery(next);
    void load(next);
  }
  const pagination = <ExecutionPagination itemCount={visible.length} page={window.page} pageSize={PAGE_SIZE} hasMore={hasMore} loading={loading} onPageChange={changePage} />;
  const detailQuery = useMemo(() => detail ? {
    symbol: detail.symbol, from: Math.max(0, Date.parse(detail.createdAt) - 60_000), to: Date.parse(detail.updatedAt) + 1,
  } : undefined, [detail]);

  return <div className="position-history">
    <p className="history-search-note">{t('Each row shows one venue position and its cumulative result. Time filters do not truncate its PnL.')}</p>
    <form className="history-filters" onSubmit={submit}>
      <label className="history-symbol">{t('Contract (exact symbol)')}<input aria-label={t('Contract (exact symbol)')} value={symbol} onChange={(event) => setSymbol(event.target.value)} placeholder="ASTER_FUTURE_PTB_USDT" pattern="[A-Za-z0-9_]{3,120}" /></label>
      <label>{t('Start time')}<input type="datetime-local" aria-label={t('Start time')} value={from} onChange={(event) => setFrom(event.target.value)} /></label>
      <label>{t('End time')}<input type="datetime-local" aria-label={t('End time')} value={to} onChange={(event) => setTo(event.target.value)} /></label>
      <button type="submit" disabled={loading}>{t('Query positions')}</button>
      <button type="button" disabled={loading} onClick={() => void load(query)}>{t('Refresh')}</button>
    </form>
    <div className="history-search">
      <input aria-label={t('Filter loaded positions')} placeholder={t('Filter loaded positions')} value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} />
      <select aria-label={t('Position side')} value={side} onChange={(event) => { setSide(event.target.value); setPage(1); }}>
        <option value="">{t('Both directions')}</option><option value="LONG">{t('Long')}</option><option value="SHORT">{t('Short')}</option>
      </select>
      <select aria-label={t('Close status')} value={closedType} onChange={(event) => { setClosedType(event.target.value); setPage(1); }}>
        <option value="COMPLETE_CLOSED">{t('Fully closed')}</option><option value="PARTIAL_CLOSED">{t('Partially closed')}</option><option value="">{t('All close statuses')}</option>
      </select>
      <span>{t('Times use your browser time zone')}: {Intl.DateTimeFormat().resolvedOptions().timeZone}</span>
    </div>
    <p className="history-search-note">{t('Net PnL = realized PnL − trading fees − liquidation fees + funding. Missing fees are shown as unknown.')}</p>
    {error && <div className="history-error" role="alert">{t(error)}{error !== 'Start time must be before end time' && <button type="button" disabled={loading} onClick={() => history ? older() : void load(query)}>{t('Try again')}</button>}</div>}
    {pagination}
    <div className="activity-table-wrap" ref={table}>
      {loading && !history ? <div className="activity-message"><strong>{t('Loading position history…')}</strong></div>
        : visible.length ? <table className="activity-table history-position-table">
          <thead><tr><th>{t('Contract / Exchange')}</th><th>{t('Side / Status')}</th><th>{t('Net PnL')}</th><th>{t('Open / Close price')}</th><th>{t('Closed / Max quantity')}</th><th>{t('Opened / Closed time')}</th><th>{t('Realized PnL')}</th><th>{t('Trading / Liquidation fees')}</th><th>{t('Funding fees')}</th><th>{t('Closing notional')}</th><th>{t('Details')}</th></tr></thead>
          <tbody>{visible.slice(window.start, window.end).map((position) => {
            const venue = exchanges.find((item) => item.id === position.venue.toLowerCase());
            const part = symbolParts(position.symbol);
            return <tr key={position.id}>
              <td title={position.symbol}><strong>{part.asset}/{part.quote}</strong><VenueCell id={position.venue.toLowerCase()} name={venue?.name ?? position.venue} short={venue?.short ?? position.venue.slice(0, 2)} /></td>
              <td>{t(position.positionSide === 'LONG' ? 'Long' : position.positionSide === 'SHORT' ? 'Short' : position.positionSide)}<small>{t(position.closedType === 'COMPLETE_CLOSED' ? 'Fully closed' : position.closedType === 'PARTIAL_CLOSED' ? 'Partially closed' : position.closedType)}</small></td>
              <td className={pnlClass(position.netPnl)} title={position.netPnl === null ? t('Incomplete fee data') : position.netPnl}><strong>{money(position.netPnl)}</strong><small>{position.settlementCoin}</small></td>
              <td><span title={position.openAvgPrice}>{price(position.openAvgPrice)}</span><small title={position.closedAvgPrice}>{price(position.closedAvgPrice)}</small></td>
              <td>{position.closedQuantity}<small>{t('Max')}: {position.maxQuantity} {part.asset}</small></td>
              <td>{when(position.createdAt)}<small>{when(position.updatedAt)}{position.closedType === 'PARTIAL_CLOSED' ? ` · ${t('Updated')}` : ''}</small></td>
              <td className={pnlClass(position.realizedPnl)} title={position.realizedPnl}>{money(position.realizedPnl)} {position.settlementCoin}</td>
              <td title={position.fee ?? ''}>{money(position.fee)}<small>{t('Liquidation fee')}: {money(position.liquidationFee)}</small></td>
              <td className={pnlClass(position.fundingFee)} title={position.fundingFee ?? ''}>{money(position.fundingFee)} {position.settlementCoin}</td>
              <td>{position.closedValue} {position.settlementCoin}</td>
              <td><button type="button" className="history-detail-button" aria-label={`${t('View orders')} ${position.id}`} onClick={() => setDetail(position)}>{t('View orders')}</button></td>
            </tr>;
          })}</tbody>
        </table> : !error && <div className="activity-message"><strong>{t('No historical positions')}</strong><small>{t('Change the filters or load older positions.')}</small></div>}
    </div>
    {pagination}
    <footer className="activity-footer"><span>{history ? `${t('Last updated')} ${when(history.fetchedAt)}` : t('Authenticated CrossEx REST')}</span>
      <span className="activity-history-controls"><span>{t('Loaded entries')}: {history?.items.length ?? 0}</span>
        {hasMore ? <button type="button" disabled={loading} onClick={() => older()}>{t(loading ? 'Loading…' : 'Load 1,000 older entries')}</button>
          : history && <span>{t('All available entries loaded')}</span>}
      </span>
    </footer>
    {search.trim() && <p className="history-search-note">{t('Search applies to loaded entries. Load older entries to search further.')}</p>}
    {detail && <section className="position-history-details" ref={detailPanel} aria-label={t('Related contract orders')}>
      <header><strong>{detail.symbol} · {detail.positionSide} · {t('Position ID')}: {detail.id}</strong><button type="button" onClick={() => setDetail(null)}>{t('Close details')}</button></header>
      <p className="history-search-note">{t('Same contract and direction, queried by time. Includes orders placed up to one minute before opening; this is not an exact position-to-order attribution.')}</p>
      <OrderHistory key={detail.id} initialQuery={detailQuery} positionSide={detail.positionSide} />
    </section>}
  </div>;
}
