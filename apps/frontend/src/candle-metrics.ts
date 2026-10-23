import type { Candle } from './api.js';

/** Percentages use this candle's open, including while it is still forming. */
export function candleHoverMetrics(candle: Candle): { change: number; changePct: number; amplitudePct: number } | null {
  const prices = [candle.open, candle.close, candle.high, candle.low];
  if (prices.some((price) => !price.trim())) return null;
  const [open, close, high, low] = prices.map(Number);
  if (![open, close, high, low].every(Number.isFinite) || open <= 0 || low <= 0 || high < low) return null;
  const change = close - open;
  const changePct = change / open * 100;
  const amplitudePct = (high - low) / open * 100;
  return [change, changePct, amplitudePct].every(Number.isFinite) ? { change, changePct, amplitudePct } : null;
}
