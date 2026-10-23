import { describe, expect, it } from 'vitest';
import { twapSlices, TwapPlanSchema } from '@gate-crossex/shared-types';

describe('timed execution allocation', () => {
  it('distributes exact lot multiples without losing or exceeding the total', () => {
    expect(twapSlices('100', '1', 60, 10)).toEqual(['17', '17', '17', '17', '16', '16']);
    expect(twapSlices('0.1', '0.00000001', 15, 5)).toEqual(['0.03333334', '0.03333333', '0.03333333']);
    expect(twapSlices('0.03', '0.001', 60, 10)).toEqual(Array(6).fill('0.005'));
  });
  it('keeps large integers exact and handles a single-slice window', () => {
    expect(twapSlices('9007199254740993', '1', 2, 1)).toEqual(['4503599627370497', '4503599627370496']);
    expect(twapSlices('0.0100', '0.0001', 60, 60)).toEqual(['0.01']);
  });
  it('rejects invalid schedules, impossible lots and schedules exceeding the slice cap', () => {
    for (const args of [['1', '0', 60, 10], ['1.1', '1', 60, 10], ['1', '1', 60, 10], ['100', '1', 60, 0], ['100', '1', 60, 61], ['100', '1', 1.5, 1], ['100000', '1', 86400, 1]] as const) {
      expect(() => twapSlices(args[0], args[1], args[2], args[3])).toThrow();
    }
    expect(TwapPlanSchema.safeParse({ requestId: 'invalid', symbol: 'BINANCE_FUTURE_BTC_USDT', side: 'SELL', quantity: '100', durationSeconds: 60, intervalSeconds: 10, expectedPositionMode: 'SINGLE', positionSide: 'NONE' }).success).toBe(false);
  });
});
