# Gate CrossEx integration

This document records the external API boundary needed to review the adapters. Gate's official references remain authoritative:

- `https://www.gate.com/docs/developers/crossex/en/`
- `https://www.gate.com/docs/developers/crossex/ws/en/`
- `https://www.gate.com/docs/developers/apiv4/en/`

## REST boundary

CrossEx REST is served below `https://api.gateio.ws/api/v4/crossex/*`. The adapter exposes a fixed allowlist rather than a generic authenticated proxy:

- account, positions, margin positions, open orders, fills, fees, transfers, and account-ledger reads;
- instrument and risk-limit discovery;
- order creation, order cancellation, leverage updates, and Spot/CrossEx transfers.

Private requests use Gate APIv4 `KEY`, `Timestamp`, and HMAC-SHA512 `SIGN` authentication. This fork sends no `X-Gate-Channel-Id` broker attribution header on any request, including order placement.

Account history uses read-only, intent-protected routes: `/api/crossex/portfolio-activity`, `/api/crossex/history-orders`, and `/api/crossex/history-positions`. Each batch defaults to 1,000 records; pagination keeps a fixed `to` cutoff. Historical positions come from CrossEx `/crossex/history_positions`, rather than aggregating a truncated order page. Net PnL is calculated with decimal arithmetic as `closed_pnl - fee - liq_fee + funding_fee`; missing fee fields leave net PnL unknown. The view defaults to fully closed positions and retains the latest cumulative snapshot per position ID. Order drill-down queries the same contract and direction over the position time range, including a one-minute buffer before opening for resting orders; it is explicitly a time-based view, not an exact attribution of orders to a position.

Manual orders read the current account position mode before submission, including the selected venue in isolated-exchange mode. Single-mode orders use `NONE`; dual-mode opening orders use the corresponding `LONG`/`SHORT` leg, and reduce-only orders close the opposite buy/sell leg. Close quantities are checked against a fresh matching position. If the position mode changed since the order was reviewed, submission is blocked for a new review. Paired position strategies may use the same contract on both legs only in verified dual mode, with one shared leverage. Both taker-taker and maker-taker execution are supported. Same-contract maker fills trigger cancellation and remote confirmation of the remaining strategy quotes before the opposing taker; fills racing the cancel are included in the hedge quantity. Unconfirmed cancellation blocks both hedging and replacement quotes until reconciliation succeeds. Each such strategy order rechecks mode and selects the opening or closing position side; margin and close preflights match the corresponding leg. Continuous spread bots still require different venues. Other automated strategies retain their existing position-mode handling.

`GET /crossex/rule/symbols` is the runtime source of truth for venue/product availability and trading limits. The application does not infer that an instrument exists from a static venue list. Gate documents no CrossEx testnet, so execution is production-only.

## WebSocket boundary

- Public endpoint: `wss://api.gateio.ws/ws/crossex/public`
- Private endpoint: `wss://api.gateio.ws/ws/crossex`

The market hub validates and relays public `ticker`, `funding_rate`, `open_interest`, `order_book_update`, `trade`, and kline channels. Detailed subscriptions are opened only for watched markets and are bounded, batched, and removed when no client needs them.

After authenticated login, the private stream subscribes account-wide to `order`, `usertrades`, `position`, `margin_position`, and `asset`. REST snapshots bootstrap and periodically reconcile the in-memory projection so disconnects or missed pushes do not silently become authoritative.

The application routes writes through the reviewed REST adapter rather than CrossEx WebSocket API write channels.

## Public venue data

CrossEx REST does not provide every candle, current-funding, funding-history, or bulk open-interest view required by the UI. Unauthenticated adapters query official public APIs for Gate, Binance, OKX, Bybit, Kraken, Hyperliquid, Deribit, and Lighter. Every response is schema-validated and mapped back to a validated CrossEx instrument; public reference data never authorizes trading.

## Execution controls

Every backend start is locked. Writes require the appropriate API permission, an explicit live-mode acknowledgement, local Host/Origin and intent checks, schema validation, and audit logging. Strategy execution uses acknowledged remote order state, refuses stale or seed prices, reconciles ambiguous outcomes, and pauses when exposure cannot be repaired safely.

Timed market execution at `/strategies/timed-execution` supports one CrossEx futures contract, a total base-asset quantity, ordinary or reduce-only buy/sell intent, a submission window, and an interval. It is stored as a position strategy with `twapPlan`; legacy strategy rows remain compatible. The backend allocates exactly `ceil(durationSeconds / intervalSeconds)` balanced lot-aligned slices (up to 10,000), submits the first immediately, then waits at least one interval from each actual submission. For example, a 60-second window and 10-second interval schedules six slices, starting at seconds 0 through 50. Delays never trigger catch-up bursts. The window limits submissions and does not guarantee fill completion before its deadline.

Each slice rechecks position mode, current reduce-only capacity or opening risk limits, fresh quotes, and size constraints. Only confirmed filled quantity advances progress; partial, rejected, or uncertain orders pause further submissions. Stop prevents later slices and waits for existing orders to become terminal without reversing completed fills. Startup retries are idempotent per account and request UUID. Restarts reconcile remote orders and retain the original deadline; expired tasks cannot resume or replay missed slices. Ordinary orders can offset opposite exposure in single-position mode. No live order is required for verification: unit tests use scripted gateways and browser tests intercept all strategy submissions.

The backend scheduler is independent of browser connections. Active timed tasks refresh their market lease between slices, including intervals longer than the dynamic-market idle timeout, so closing the page does not release the task's ticker subscription. The backend process must remain running; restarting it locks live execution until the user re-enables it.
