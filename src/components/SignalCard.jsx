import { useState } from 'react';
import { TrendingUp, AlertTriangle, ArrowRight, Copy, Check, LineChart, Droplets, Clock } from 'lucide-react';
import { formatUsd, shortAddr } from '../data/autoTrader';

const GRADE_META = {
  'A+': { cls: 'grade-aplus', caption: 'Prioritas Tertinggi', color: 'var(--green)' },
  A: { cls: 'grade-a', caption: 'Layak Dipantau', color: 'var(--cyan)' },
  B: { cls: 'grade-b', caption: 'Selektif', color: 'var(--amber)' },
};

function gradeStyle(grade) {
  if (grade === 'A+') return { background: 'rgba(22,163,74,0.10)', color: 'var(--green)', border: '1px solid rgba(22,163,74,0.25)' };
  if (grade === 'A') return { background: 'rgba(37,99,235,0.10)', color: 'var(--cyan)', border: '1px solid rgba(37,99,235,0.25)' };
  if (grade === 'B') return { background: 'rgba(217,119,6,0.10)', color: 'var(--amber)', border: '1px solid rgba(217,119,6,0.25)' };
  return { background: 'rgba(220,38,38,0.08)', color: 'var(--red)', border: '1px solid rgba(220,38,38,0.20)' };
}

function statusChip(trade) {
  if (trade?.status === 'WIN') return { label: 'WIN', cls: 'sc-status win' };
  if (trade?.status === 'LOSS') return { label: 'LOSS', cls: 'sc-status loss' };
  if (trade?.status === 'ACTIVE') return { label: 'DILACAK', cls: 'sc-status active' };
  return { label: 'PENDING', cls: 'sc-status ready' };
}

export default function SignalCard({ signal, trade, onClick }) {
  const [copied, setCopied] = useState(false);

  // Level dikunci pakai nilai trade saat sudah entry; kalau belum, pakai sinyal.
  const entry = trade?.entry ?? signal.entry;
  const slPct = trade?.slPct ?? signal.slPct;
  const tpPct = trade?.tpPct ?? signal.tpPct;
  const livePnl = trade
    ? trade.pnlPct
    : (entry && signal.priceUsd ? ((signal.priceUsd - entry) / entry) * 100 : null);

  const meta = GRADE_META[signal.grade] || { cls: '', caption: '', color: 'var(--muted)' };
  const chip = statusChip(trade);
  const isHighRisk = signal.grade === 'B';
  const chartUrl = signal.url || `https://dexscreener.com/solana/${signal.ca}`;
  const conf = Math.max(0, Math.min(100, Number(signal.confidence) || 0));

  const copyCa = async (e) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(signal.ca);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch { /* ignore */ }
  };

  const onKey = (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); }
  };

  return (
    <div className={`signal-card ${meta.cls}`} role="button" tabIndex={0} onClick={onClick} onKeyDown={onKey}>
      <div className="sc-head">
        <div className="sc-id">
          <strong>${signal.ticker}</strong>
          <span>{signal.name}</span>
        </div>
        <div className="sc-grade">
          <span className="badge" style={gradeStyle(signal.grade)} title={`Grade ${signal.grade} — ${meta.caption}`}>{signal.grade}</span>
          <small style={{ color: meta.color }}>{meta.caption}</small>
        </div>
      </div>

      <div className="sc-tags">
        {isHighRisk ? (
          <span className="badge" style={{ background: 'rgba(217,119,6,0.10)', color: 'var(--amber)', border: '1px solid rgba(217,119,6,0.25)' }}>
            <AlertTriangle size={12} /> SELEKTIF
          </span>
        ) : (
          <span className="badge badge-buy"><TrendingUp size={12} /> BUY</span>
        )}
        <span className={chip.cls}>{chip.label}</span>
      </div>

      <div className="sc-conf" title={`Keyakinan engine ${conf}%`}>
        <div className="sc-conf-top"><span>Keyakinan</span><strong>{conf}%</strong></div>
        <div className="sc-conf-bar"><div style={{ width: `${conf}%`, background: meta.color }} /></div>
      </div>

      <div className="sc-pnl">
        <span className="sc-pnl-label">PnL Berjalan</span>
        <strong className={livePnl == null ? 'text-muted' : livePnl >= 0 ? 'text-green' : 'text-red'}>
          {livePnl == null ? '—' : `${livePnl >= 0 ? '+' : ''}${livePnl.toFixed(2)}%`}
        </strong>
        {trade && trade.positionRemaining != null && trade.positionRemaining < 1.0 && (
          <small style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>
            Posisi: {(trade.positionRemaining * 100).toFixed(0)}%
          </small>
        )}
      </div>

      <div className="sc-levels">
        <div className="sc-level"><span>Harga</span><strong>{formatUsd(signal.priceUsd)}</strong></div>
        <div className="sc-level"><span>Entry</span><strong>{entry ? formatUsd(entry) : '-'}</strong></div>
        <div className="sc-level"><span>Stop Loss</span><strong className="text-red">{entry ? `-${slPct}%` : '-'}</strong></div>
        <div className="sc-level"><span>Take Profit</span><strong className="text-green">{entry ? `+${tpPct}%` : '-'}</strong></div>
      </div>

      <div className="sc-meta">
        <span title="Likuiditas"><Droplets size={12} /> {formatUsd(signal.liquidityUsd)}</span>
        {signal.age && <span title="Umur token"><Clock size={12} /> {signal.age}</span>}
        {signal.rr ? <span title="Risk : Reward">RR 1:{signal.rr}</span> : null}
      </div>

      <div className="sc-foot">
        <code className="sc-ca" title={signal.ca}>{shortAddr(signal.ca)}</code>
        <div className="sc-actions">
          <button type="button" className="icon-btn" onClick={copyCa} title="Salin contract address">
            {copied ? <Check size={14} className="text-green" /> : <Copy size={14} />}
            {copied ? 'Tersalin' : 'CA'}
          </button>
          <a
            className="icon-btn chart"
            href={chartUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            title="Buka chart"
          >
            <LineChart size={14} /> Chart
          </a>
          <span className="sc-open">Detail <ArrowRight size={13} /></span>
        </div>
      </div>
    </div>
  );
}
