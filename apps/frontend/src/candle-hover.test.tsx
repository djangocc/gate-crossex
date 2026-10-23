import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Candle } from './api.js';
import { CandleHoverCard } from './candle-hover.js';
import { candleHoverMetrics } from './candle-metrics.js';

const candle: Candle = { startTime: 1_800_000_000_000, open: '100', high: '112', low: '96', close: '108', volume: '250', closed: true };

describe('candle hover details', () => {
  it('calculates change and amplitude against the selected candle open', () => {
    expect(candleHoverMetrics(candle)).toEqual({ change: 8, changePct: 8, amplitudePct: 16 });
    expect(candleHoverMetrics({ ...candle, close: '96' })).toEqual({ change: -4, changePct: -4, amplitudePct: 16 });
    expect(candleHoverMetrics({ ...candle, close: '100' })?.changePct).toBe(0);
  });

  it.each([{ open: '0' }, { open: '-1' }, { open: 'oops' }, { close: '' }, { high: 'Infinity' }, { high: '95' }])('rejects invalid prices %j', (invalid) => {
    const value = { ...candle, ...invalid };
    expect(candleHoverMetrics(value)).toBeNull();
    const html = renderToStaticMarkup(<CandleHoverCard id="details" side="left" candle={value} />);
    expect(html).not.toMatch(/NaN|Infinity/);
  });

  it('uses Chinese field names, signed change and candle status', () => {
    const html = renderToStaticMarkup(<CandleHoverCard id="details" side="right" candle={candle} />);
    for (const label of ['开盘价', '最高价', '最低价', '收盘价', '涨跌额', '涨跌幅', '振幅', '成交量', '已收盘', '+8.00%', '16.00%', '本根开盘价']) expect(html).toContain(label);
    const down = renderToStaticMarkup(<CandleHoverCard id="details" side="left" candle={{ ...candle, close: '96', closed: false }} />);
    expect(down).toContain('-4.00%');
    expect(down).toContain('未收盘');
  });

  it('keeps micro prices and their percentage movement visible', () => {
    const value = { ...candle, open: '0.000003', high: '0.0000036', low: '0.0000027', close: '0.0000033' };
    const html = renderToStaticMarkup(<CandleHoverCard id="details" side="left" candle={value} />);
    expect(html).toContain('0.0000033');
    expect(html).toContain('+0.0000003');
    expect(html).toContain('+10.00%');
    expect(html).toContain('30.00%');
  });
});
