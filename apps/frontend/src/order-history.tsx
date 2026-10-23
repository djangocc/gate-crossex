import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { api, ApiError, type CrossExHistoryOrdersResponse } from './api.js';
import { useLanguage } from './i18n.js';
import { ExecutionPagination } from './execution-pagination-control.js';
import { executionPageWindow } from './execution-pagination.js';
import { exchanges, VenueCell } from './route-shared.js';

const PAGE_SIZE = 1000;
type HistoryQuery = { symbol?: string; from?: number; to?: number; attributes?: string; page?: number };
const ATTRIBUTES = { COMMON: 'Ordinary order', SETTLEMENT: 'Delisting settlement', LIQ: 'Liquidation takeover', REDUCE: 'Liquidation reduction', ADL: 'Auto-deleveraging' } as const;

function localTimeInput(timestamp: number | undefined): string {
  if (timestamp === undefined) return '';
  const date = new Date(timestamp);
  return new Date(timestamp - date.getTimezoneOffset() * 60000).toISOString().slice(0, 23);
}

export function OrderHistory({ initialQuery, positionSide }: { initialQuery?: HistoryQuery; positionSide?: string } = {}) {
  const { language, t } = useLanguage();
  const [history, setHistory] = useState<CrossExHistoryOrdersResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState<HistoryQuery>(initialQuery ?? {});
  const [symbol, setSymbol] = useState(initialQuery?.symbol ?? '');
  const [from, setFrom] = useState(localTimeInput(initialQuery?.from));
  const [to, setTo] = useState(localTimeInput(initialQuery?.to));
  const [attribute, setAttribute] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const generation = useRef(0);
  const inFlight = useRef(false);
  const table = useRef<HTMLDivElement>(null);
  const locale = language === 'zh' ? 'zh-CN' : 'en-GB';
  const when = (value: string) => new Date(value).toLocaleString(locale, { hour12: false });

  const load = useCallback(async (request: HistoryQuery, append = false, revealPage?: number) => {
    if (append && inFlight.current) return;
    const current = append ? generation.current : ++generation.current;
    inFlight.current = true;
    setLoading(true);
    setError(null);
    if (!append) { setHistory(null); setPage(1); }
    try {
      const result = await api.historyOrders(request);
      if (current !== generation.current) return;
      setHistory((previous) => append && previous ? {
        ...result,
        items: [...new Map([...previous.items, ...result.items].map((order) => [order.id, order])).values()]
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      } : result);
      if (revealPage !== undefined) { setPage(revealPage); table.current?.scrollTo({ top: 0, left: 0 }); }
    } catch (cause) {
      if (current !== generation.current) return;
      setError(cause instanceof ApiError && (cause.code === 'credential_not_configured' || cause.code === 'credential_missing_from_vault')
        ? 'Credentials required for account activity'
        : append ? 'Could not load older orders. Your loaded history is preserved.' : 'Order history is temporarily unavailable');
    } finally {
      if (current === generation.current) { inFlight.current = false; setLoading(false); }
    }
  }, []);

  useEffect(() => {
    void load(initialQuery ?? {});
    return () => { generation.current += 1; };
  }, [load, initialQuery]);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (history?.items ?? []).filter((order) => (!positionSide || order.positionSide === positionSide) && (!needle || [order.id, order.text, order.symbol, order.venue, order.side, order.positionSide, order.state, order.attribute, order.reason]
      .some((value) => value.toLowerCase().includes(needle))));
  }, [history, search, positionSide]);
  const window = executionPageWindow(visible.length, page, PAGE_SIZE);
  const hasMore = history?.pagination.hasMore ?? false;
  const older = (revealPage?: number) => {
    if (!history || !hasMore) return;
    void load({ ...query, page: history.pagination.page + 1, to: history.pagination.to }, true, revealPage);
  };
  function changePage(next: number) {
    if (next > window.pageCount) older(next);
    else { setPage(next); table.current?.scrollTo({ top: 0, left: 0 }); }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    const next: HistoryQuery = {
      ...(symbol.trim() ? { symbol: symbol.trim().toUpperCase() } : {}),
      ...(from ? { from: new Date(from).getTime() } : {}),
      ...(to ? { to: new Date(to).getTime() } : {}),
      ...(attribute ? { attributes: attribute } : {}),
    };
    if (next.from !== undefined && next.to !== undefined && next.from > next.to) { setError('Start time must be before end time'); return; }
    setQuery(next);
    void load(next);
  }
  const pagination = <ExecutionPagination itemCount={visible.length} page={window.page} pageSize={PAGE_SIZE} hasMore={hasMore} loading={loading} onPageChange={changePage} />;

  return <div className="order-history">
    <form className="history-filters" onSubmit={submit}>
      <label className="history-symbol">{t('Contract (exact symbol)')}<input aria-label={t('Contract (exact symbol)')} value={symbol} onChange={(event) => setSymbol(event.target.value)} placeholder="ASTER_FUTURE_PTB_USDT" pattern="[A-Za-z0-9_]{3,120}" /></label>
      <label>{t('Start time')}<input type="datetime-local" step="0.001" aria-label={t('Start time')} value={from} onChange={(event) => setFrom(event.target.value)} /></label>
      <label>{t('End time')}<input type="datetime-local" step="0.001" aria-label={t('End time')} value={to} onChange={(event) => setTo(event.target.value)} /></label>
      <label>{t('Order attribute')}<select aria-label={t('Order attribute')} value={attribute} onChange={(event) => setAttribute(event.target.value)}>
        <option value="">{t('All order attributes')}</option>
        {Object.entries(ATTRIBUTES).map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}
      </select></label>
      <button type="submit" disabled={loading}>{t('Query orders')}</button>
      <button type="button" disabled={loading} onClick={() => void load(query)}>{t('Refresh')}</button>
    </form>
    <div className="history-search">
      <input aria-label={t('Filter loaded orders')} placeholder={t('Filter loaded orders')} value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} />
      <span>{t('Times use your browser time zone')}: {Intl.DateTimeFormat().resolvedOptions().timeZone}</span>
    </div>
    {error && <div className="history-error" role="alert">{t(error)} <button type="button" disabled={loading} onClick={() => history ? older() : void load(query)}>{t('Try again')}</button></div>}
    {pagination}
    <div className="activity-table-wrap history-order-table-wrap" ref={table}>
      {loading && !history ? <div className="activity-message"><strong>{t('Loading order history…')}</strong></div>
        : visible.length ? <table className="activity-table history-order-table">
          <thead><tr><th>{t('Time')}</th><th>{t('Contract')}</th><th>{t('Exchange')}</th><th>{t('Side')}</th><th>{t('Type')}</th><th>{t('Amount')}</th><th>{t('Filled')}</th><th>{t('Order price')}</th><th>{t('Average fill price')}</th><th>{t('Fee')}</th><th>{t('Status / Reason')}</th><th>{t('Order ID')}</th></tr></thead>
          <tbody>{visible.slice(window.start, window.end).map((order) => {
            const venue = exchanges.find((item) => item.id === order.venue.toLowerCase());
            const direction = order.positionSide === 'LONG' ? order.side === 'BUY' ? 'Open long' : 'Close long'
              : order.positionSide === 'SHORT' ? order.side === 'SELL' ? 'Open short' : 'Close short' : order.side === 'BUY' ? 'Buy' : 'Sell';
            const attributeLabel = ATTRIBUTES[order.attribute as keyof typeof ATTRIBUTES] ?? order.attribute;
            return <tr key={order.id}>
              <td title={`${t('Updated')}: ${when(order.updatedAt)}`}>{when(order.createdAt)}</td>
              <td><strong>{order.symbol}</strong></td>
              <td><VenueCell id={order.venue.toLowerCase()} name={venue?.name ?? order.venue} short={venue?.short ?? order.venue.slice(0, 2)} /></td>
              <td>{t(direction)}<small>{order.side} / {order.positionSide || 'NONE'}{order.reduceOnly ? ` · ${t('Reduce only')}` : ''}</small></td>
              <td>{t(order.type === 'MARKET' ? 'Market' : order.type === 'LIMIT' ? 'Limit' : order.type)}<small>{t(attributeLabel)}</small></td>
              <td>{order.quantity}</td><td>{order.executedQuantity}{Number(order.executedQuantity) > 0 && order.state !== 'FILLED' && <small>{t('Partial fill')}</small>}</td>
              <td>{order.type === 'MARKET' ? '—' : order.price ?? '—'}</td>
              <td>{Number(order.executedQuantity) > 0 ? order.executedAvgPrice : '—'}</td>
              <td>{order.fee || '—'} {order.feeCoin}</td>
              <td className="history-order-reason"><span className={`status-tag ${order.state.toLowerCase()}`}>{t(order.state)}</span>{order.reason && <small title={order.reason}>{order.reason === 'delist' ? t('Delisting settlement') : order.reason}</small>}</td>
              <td><span className="activity-reference">{order.id}</span>{order.text && <small title={order.text}>{order.text}</small>}</td>
            </tr>;
          })}</tbody>
        </table> : !error && <div className="activity-message"><strong>{t('No historical orders')}</strong><small>{t('Change the filters or load older orders.')}</small></div>}
    </div>
    {pagination}
    {search.trim() && <p className="history-search-note">{t('Search applies to loaded entries. Load older entries to search further.')}</p>}
    <footer className="activity-footer">
      <span>{history ? `${t('Last updated')} ${when(history.fetchedAt)}` : t('Authenticated CrossEx REST')}</span>
      <span className="activity-history-controls"><span>{t('Loaded entries')}: {history?.items.length ?? 0}</span>
        {hasMore ? <button type="button" disabled={loading} onClick={() => older()}>{t(loading ? 'Loading…' : 'Load 1,000 older entries')}</button>
          : history && <span>{t('All available entries loaded')}</span>}
      </span>
    </footer>
  </div>;
}
