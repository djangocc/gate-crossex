import type { ReactNode } from 'react';
import { useLanguage } from './i18n.js';
import { useDialogFocus } from './route-shared.js';

export interface StrategyConfirmationRow {
  label: string;
  value: ReactNode;
  tone?: 'positive' | 'negative';
}

export function StrategyLaunchConfirmation({
  market,
  rows,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  market: string;
  rows: StrategyConfirmationRow[];
  busy: boolean;
  error?: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useLanguage();
  const dialogRef = useDialogFocus(true, busy ? undefined : onCancel);

  return <div className="modal-backdrop confirm-order-backdrop" role="presentation" onMouseDown={() => { if (!busy) onCancel(); }}>
    <section ref={dialogRef} tabIndex={-1} className="confirm-order-modal strategy-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="confirm-strategy-title" onMouseDown={(event) => event.stopPropagation()}>
      <header>
        <div>
          <p className="eyebrow">{t('Live automation')}</p>
          <h2 id="confirm-strategy-title">{t('Confirm strategy launch')}</h2>
          <span className="confirm-market">{market}</span>
        </div>
        <button className="disclaimer-close" aria-label={t('Close')} onClick={onCancel} disabled={busy}>×</button>
      </header>
      <p className="strategy-confirm-warning">{t('Review the strategy details before starting live automated execution.')}</p>
      <dl className="confirm-order-summary">
        {rows.map((row, index) => <div key={`${row.label}:${index}`}><dt>{row.label}</dt><dd className={row.tone}>{row.value}</dd></div>)}
      </dl>
      {error && <p className="strategy-confirm-warning" role="alert">{error}</p>}
      <div className="confirm-order-actions">
        <button className="confirm-back" data-dialog-autofocus onClick={onCancel} disabled={busy}>{t('Go back')}</button>
        <button className="confirm-submit buy" disabled={busy} onClick={onConfirm}>
          <strong>{busy ? t('Launching…') : t('Run strategy')}</strong>
          <span>{t('This will start live automated execution.')}</span>
        </button>
      </div>
    </section>
  </div>;
}
