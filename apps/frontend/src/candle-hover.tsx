import type { Candle } from './api.js';
import { candleHoverMetrics } from './candle-metrics.js';

function numberText(value: string | number): string {
  if (typeof value === 'string' && !value.trim()) return '—';
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString('zh-CN', { maximumSignificantDigits: 15 }) : '—';
}

function percentText(value: number | undefined, signed = false): string {
  if (value === undefined) return '—';
  const rounded = Number(value.toFixed(4));
  return `${signed && rounded > 0 ? '+' : ''}${rounded.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}%`;
}

export function CandleHoverCard({ candle, side, id }: { candle: Candle; side: 'left' | 'right'; id: string }) {
  const metrics = candleHoverMetrics(candle);
  const tone = metrics ? metrics.change > 0 ? 'positive' : metrics.change < 0 ? 'negative' : '' : '';
  const time = new Date(candle.startTime);
  const timeText = Number.isFinite(time.getTime()) ? time.toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZoneName: 'shortOffset',
  }) : '—';
  return <aside id={id} className={`candle-hover-card ${side}`} role="tooltip" aria-label="K线详情" lang="zh-CN">
    <header><strong>K线详情</strong><span>{candle.closed ? '已收盘' : '未收盘'}</span></header>
    <time dateTime={Number.isFinite(time.getTime()) ? time.toISOString() : undefined}>{timeText}</time>
    <dl>
      <div><dt>开盘价</dt><dd>{numberText(candle.open)}</dd></div>
      <div><dt>最高价</dt><dd>{numberText(candle.high)}</dd></div>
      <div><dt>最低价</dt><dd>{numberText(candle.low)}</dd></div>
      <div><dt>收盘价</dt><dd>{numberText(candle.close)}</dd></div>
      <div><dt>涨跌额</dt><dd className={tone}>{metrics ? `${metrics.change > 0 ? '+' : ''}${numberText(Number(metrics.change.toPrecision(12)))}` : '—'}</dd></div>
      <div><dt>涨跌幅</dt><dd className={tone}>{percentText(metrics?.changePct, true)}</dd></div>
      <div><dt>振幅</dt><dd>{percentText(metrics?.amplitudePct)}</dd></div>
      <div><dt>成交量</dt><dd>{numberText(candle.volume)}</dd></div>
    </dl>
    <p>涨跌幅、振幅均以本根开盘价为基准</p>
  </aside>;
}
