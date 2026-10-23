import { useEffect, useMemo, useState } from 'react';
import { manualOrderPositionSide, twapSlices, type PositionModeResponse } from '@gate-crossex/shared-types';
import { api, ApiError, type AuthenticatedPortfolioSnapshot, type CrossExInstrument, type MarketCatalogAsset, type MarketSnapshot, type StrategyConfig, type StrategyRecord, type TradingMode, type TradingSnapshot } from './api.js';
import { useLanguage } from './i18n.js';
import { exchanges, formatAmount, isPositiveDecimal, liveMarketFor, priceText } from './route-shared.js';
import { VenueSelect } from './venue-select.js';
import { StrategyAssetSearch } from './strategy-asset-search.js';
import { strategyAssetOptions, strategyVenueSymbol } from './strategy-asset-options.js';
import { StrategyLaunchConfirmation } from './strategy-launch-confirmation.js';
import { RunningStrategiesPanel } from './strategy-route.js';

interface Props {
  accountProfileId?: string | null;
  marketSnapshot: MarketSnapshot | null;
  catalog: MarketCatalogAsset[] | null;
  strategies: StrategyRecord[];
  authenticatedPortfolio: AuthenticatedPortfolioSnapshot | null;
  tradingSnapshot: TradingSnapshot | null;
  tradingMode: TradingMode | null;
  onOpenModeDialog: () => void;
  onStrategiesChanged: () => Promise<void>;
  onPositionsRefresh: () => Promise<void>;
  watchQuotes: (symbols: string[]) => void;
}

export function TwapStrategyView(props: Props) {
  const { t } = useLanguage();
  const { watchQuotes } = props;
  const [venue, setVenue] = useState('binance');
  const [asset, setAsset] = useState('BTC');
  const [quantity, setQuantity] = useState('');
  const [minutes, setMinutes] = useState('10');
  const [interval, setInterval] = useState('5');
  const [side, setSide] = useState<'BUY' | 'SELL'>('SELL');
  const [reduceOnly, setReduceOnly] = useState(true);
  const [leverage, setLeverage] = useState('');
  const [instruments, setInstruments] = useState<CrossExInstrument[] | null>(null);
  const [mode, setMode] = useState<PositionModeResponse | null>(null);
  const [modeError, setModeError] = useState(false);
  const [modeRevision, setModeRevision] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [review, setReview] = useState<StrategyConfig | null>(null);
  const [launching, setLaunching] = useState(false);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const symbol = strategyVenueSymbol(props.catalog, venue, asset);
  const exchange = exchanges.find((item) => item.id === venue)!;
  const options = useMemo(() => strategyAssetOptions(props.catalog, [], venue, venue), [props.catalog, venue]);
  const instrument = instruments?.find((item) => item.symbol === symbol);
  const market = liveMarketFor(props.marketSnapshot, venue, asset);
  const requestLeverage = reduceOnly ? '1' : leverage;
  const durationSeconds = Number(minutes) * 60;
  const intervalSeconds = Number(interval);
  const reference = market ? Number(side === 'BUY' ? market.askPrice : market.bidPrice) : 0;
  const fresh = Boolean(market && props.marketSnapshot?.connectionState === 'healthy' && market.source === 'gate_crossex_websocket'
    && Date.now() - Date.parse(market.updatedAt) < 15000 && Date.parse(market.receivedAt) - Date.parse(market.updatedAt) < 3000);
  const preview = useMemo(() => {
    if (!instrument || !quantity) return null;
    try { return twapSlices(quantity, instrument.lotSize, durationSeconds, intervalSeconds); }
    catch { return null; }
  }, [instrument, quantity, durationSeconds, intervalSeconds]);
  const smallerSlice = preview?.at(-1);
  const largerSlice = preview?.[0];
  const sizeValid = Boolean(preview && instrument && smallerSlice && Number(smallerSlice) >= Number(instrument.minSize)
    && (!instrument.minNotional || Number(smallerSlice) * reference >= Number(instrument.minNotional))
    && (!instrument.maxMarketSize || Number(instrument.maxMarketSize) <= 0 || Number(largerSlice) <= Number(instrument.maxMarketSize)));
  const modeReady = mode?.symbol === symbol;
  const valid = sizeValid && modeReady && fresh && (reduceOnly || (isPositiveDecimal(leverage) && Number(leverage) <= 200));
  const direction = reduceOnly ? side === 'BUY' ? 'Close short' : 'Close long' : side === 'BUY' ? 'Open long' : 'Open short';

  useEffect(() => { let active = true; void api.instruments().then((result) => { if (active) setInstruments(result.items); }).catch(() => undefined); return () => { active = false; }; }, []);
  useEffect(() => { watchQuotes([symbol]); return () => watchQuotes([]); }, [watchQuotes, symbol]);
  useEffect(() => {
    let active = true;
    setMode(null); setModeError(false); setLeverage(''); setReview(null); setNotice(null);
    void api.positionMode(symbol).then((result) => { if (active) setMode(result); }).catch(() => { if (active) setModeError(true); });
    void api.leverage(symbol).then((result) => { if (active) setLeverage(result.leverage ?? ''); }).catch(() => undefined);
    return () => { active = false; };
  }, [symbol, props.accountProfileId, modeRevision]);
  useEffect(() => { if (options.length && !options.some((item) => item.asset === asset)) setAsset(options[0]!.asset); }, [options, asset]);
  useEffect(() => { setRequestId(crypto.randomUUID()); setReview(null); }, [symbol, side, reduceOnly, quantity, minutes, interval, requestLeverage, props.accountProfileId]);

  function requestLaunch() {
    if (props.tradingMode !== 'live') { props.onOpenModeDialog(); return; }
    if (!valid || !mode || !preview) return;
    setNotice(null);
    setReview({ kind: 'position', asset, leftVenue: venue.toUpperCase(), rightVenue: venue.toUpperCase(),
      leftSide: side, rightSide: side === 'BUY' ? 'SELL' : 'BUY', totalAmount: quantity,
      perOrderQuantity: preview[0]!, reduceOnly, executionMethod: 'TAKER_TAKER', leftLeverage: requestLeverage, rightLeverage: requestLeverage,
      twapPlan: { requestId, symbol, side, quantity, durationSeconds, intervalSeconds,
        expectedPositionMode: mode.positionMode, positionSide: manualOrderPositionSide(mode.positionMode, side, reduceOnly) },
    });
  }
  async function launch() {
    if (!review || launching) return;
    setLaunching(true);
    try {
      const result = await api.startStrategy(review);
      setNotice(`${t('Timed execution started')}: ${result.id}`);
      setReview(null); setRequestId(crypto.randomUUID());
      await props.onStrategiesChanged().catch(() => undefined);
    } catch (error) {
      setNotice(error instanceof ApiError ? t(error.code) === error.code ? error.message : t(error.code) : t('Backend unavailable'));
    } finally { setLaunching(false); }
  }

  return <div className="alternate-view twap-view">
    <section className="view-heading"><div><p className="eyebrow">TWAP</p><h1>{t('Timed market execution')}</h1><p>{t('Enter a total quantity and time window. Split market orders run on the server.')}</p></div></section>
    <section className="twap-layout">
      <article className="terminal-panel twap-setup">
        <header className="strategy-panel-head"><h2>{t('Execution setup')}</h2></header>
        <div className="twap-fields">
          <VenueSelect label={t('Exchange')} options={exchanges} value={venue} onSelect={setVenue} />
          <div className="twap-contract-label"><StrategyAssetSearch asset={asset} options={options} loading={props.catalog === null} leftVenueId={venue} rightVenueId={venue} leftVenueName={exchange.name} rightVenueName={exchange.name} onSelect={setAsset} t={t} /></div>
          <label>{t('Order intent')}<select aria-label={t('Order intent')} value={reduceOnly ? 'reduce' : 'ordinary'} onChange={(event) => setReduceOnly(event.target.value === 'reduce')}>
            <option value="reduce">{t('Reduce only')}</option><option value="ordinary">{t('Ordinary order · allow opening')}</option>
          </select></label>
          <label>{t('Direction')}<select aria-label={t('Direction')} value={side} onChange={(event) => setSide(event.target.value as 'BUY' | 'SELL')}>
            <option value="BUY">{t(reduceOnly ? 'Buy · close short' : 'Buy · open long')}</option><option value="SELL">{t(reduceOnly ? 'Sell · close long' : 'Sell · open short')}</option>
          </select></label>
          <label>{t('Total quantity')} ({asset})<input aria-label={t('Total quantity')} inputMode="decimal" placeholder="0" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></label>
          <label>{t('Execution window (minutes)')}<input aria-label={t('Execution window (minutes)')} type="number" min="0.0166666667" max="1440" step="any" value={minutes} onChange={(event) => setMinutes(event.target.value)} /></label>
          <label>{t('Interval (seconds)')}<input aria-label={t('Interval (seconds)')} type="number" min="1" max="86400" step="1" value={interval} onChange={(event) => setInterval(event.target.value)} /></label>
          {!reduceOnly && <label>{t('Leverage')}<input aria-label={t('Leverage')} type="number" min="1" max="200" step="1" value={leverage} onChange={(event) => setLeverage(event.target.value)} /></label>}
        </div>
        <p className="history-search-note">{t('The first slice submits immediately; later slices wait at least the selected interval. No catch-up bursts.')}</p>
        {!reduceOnly && mode?.positionMode === 'SINGLE' && <p className="history-search-note">{t('In single-position mode, an ordinary order can first offset an opposite position.')}</p>}
      </article>
      <article className="terminal-panel twap-preview">
        <header className="strategy-panel-head"><h2>{t('Execution preview')}</h2></header>
        <dl className="launch-summary review-grid">
          <div><dt>{t('Contract')}</dt><dd>{symbol}</dd></div>
          <div><dt>{t('Action')}</dt><dd>{t(direction)} · {t('Market')}</dd></div>
          <div><dt>{t('Total quantity')}</dt><dd>{quantity || '—'} {asset}</dd></div>
          <div><dt>{t('Planned slices')}</dt><dd>{preview?.length ?? '—'}</dd></div>
          <div><dt>{t('Quantity per slice')}</dt><dd>{preview ? smallerSlice === largerSlice ? `${largerSlice} ${asset}` : `${smallerSlice}–${largerSlice} ${asset}` : '—'}</dd></div>
          <div><dt>{t('Reference market price')}</dt><dd>{fresh ? priceText(reference) : '—'}</dd></div>
          <div><dt>{t('Approximate notional')}</dt><dd>{reference && quantity ? formatAmount(reference * Number(quantity)) : '—'} {symbol.split('_').at(-1)}</dd></div>
          <div><dt>{t('Position mode')}</dt><dd><button type="button" className="mode-refresh" aria-label={t('Refresh position mode')} onClick={() => setModeRevision((value) => value + 1)}>{t(modeReady ? mode?.positionMode === 'DUAL' ? 'Dual position mode' : 'Single position mode' : modeError ? 'Unable to verify position mode' : 'Loading…')}</button></dd></div>
        </dl>
        {quantity && !preview && <p className="twap-message" role="status">{t('Check quantity, lot size, duration and interval. Maximum 10,000 slices.')}</p>}
        {preview && !sizeValid && <p className="twap-message" role="status">{t('Slice quantities must satisfy the exchange minimum size, minimum notional and market-order limit.')}</p>}
        {!fresh && <p className="history-search-note">{t('Waiting for a fresh market quote.')}</p>}
        <button type="button" className="start-strategy" disabled={launching || (props.tradingMode === 'live' && !valid)} onClick={requestLaunch}>{t(props.tradingMode === 'live' ? 'Review timed execution' : 'Live trading locked')}</button>
        <p className="history-search-note">{t('The time window is a submission deadline, not a guaranteed fill time. Rejections, uncertain orders and timeouts pause the task. Stopping prevents later slices; completed fills remain.')}</p>
        {notice && <p className="twap-message" role="status">{notice}</p>}
      </article>
    </section>
    <RunningStrategiesPanel strategies={props.strategies} authenticatedPortfolio={props.authenticatedPortfolio} tradingSnapshot={props.tradingSnapshot} instruments={instruments} tradingMode={props.tradingMode} onOpenModeDialog={props.onOpenModeDialog} onStrategiesChanged={props.onStrategiesChanged} onPositionsRefresh={props.onPositionsRefresh} />
    {review?.twapPlan && <StrategyLaunchConfirmation market={review.twapPlan.symbol} busy={launching} error={notice} onCancel={() => setReview(null)} onConfirm={() => void launch()} rows={[
      { label: t('Action'), value: `${t(review.reduceOnly ? 'Reduce only' : 'Ordinary order')} · ${t(review.twapPlan.side === 'BUY' ? 'Buy' : 'Sell')}` },
      { label: t('Total quantity'), value: `${review.twapPlan.quantity} ${review.asset}` },
      { label: t('Execution window (minutes)'), value: review.twapPlan.durationSeconds / 60 },
      { label: t('Interval (seconds)'), value: review.twapPlan.intervalSeconds },
      { label: t('Position side'), value: review.twapPlan.positionSide },
      ...(!review.reduceOnly ? [{ label: t('Leverage'), value: review.leftLeverage }] : []),
    ]} />}
  </div>;
}
