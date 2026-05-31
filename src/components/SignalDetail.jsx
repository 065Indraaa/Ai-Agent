import { useEffect, useState } from 'react';
import {
  X, Target, Shield, Gauge, Droplets, Users, Rocket, BookOpen,
  CheckCircle2, AlertTriangle, XCircle, Circle, Database, TrendingUp,
  Copy, Check, LineChart
} from 'lucide-react';
import { formatUsd, shortAddr } from '../data/autoTrader';

const VERDICT_COLOR = { good: 'var(--green)', watch: 'var(--cyan)', warning: 'var(--amber)', danger: 'var(--red)' };
const TONE_COLOR = { good: 'var(--green)', warn: 'var(--amber)', danger: 'var(--red)' };
const RISK_COLOR = { low: 'var(--green)', medium: 'var(--amber)', high: 'var(--red)', critical: 'var(--red)' };

function CheckIcon({ status }) {
  if (status === 'pass') return <CheckCircle2 size={16} className="text-green" />;
  if (status === 'warn') return <AlertTriangle size={16} className="text-amber" />;
  if (status === 'fail') return <XCircle size={16} className="text-red" />;
  return <Circle size={16} className="text-muted" />;
}

function Section({ icon: Icon, title, accent, children }) {
  return (
    <section className="sd-section">
      <h4><Icon size={16} style={{ color: accent || 'var(--cyan)' }} /> {title}</h4>
      {children}
    </section>
  );
}

export default function SignalDetail({ signal, trade, onClose }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  if (!signal) return null;
  const ex = signal.explain || {};
  const verdictColor = VERDICT_COLOR[ex.verdict?.tone] || 'var(--cyan)';

  // Level dikunci pakai nilai trade saat sudah entry.
  const entry = trade?.entry ?? signal.entry;
  const sl = trade?.sl ?? signal.sl;
  const tp = trade?.tp ?? signal.tp;
  const slPct = trade?.slPct ?? signal.slPct;
  const tpPct = trade?.tpPct ?? signal.tpPct;
  const livePnl = trade
    ? trade.pnlPct
    : (entry && signal.priceUsd ? ((signal.priceUsd - entry) / entry) * 100 : null);

  const chartUrl = signal.url || `https://dexscreener.com/solana/${signal.ca}`;
  const copyCa = async () => {
    try {
      await navigator.clipboard.writeText(signal.ca);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch { /* ignore */ }
  };

  return (
    <div className="sd-backdrop" onClick={onClose}>
      <aside className="sd-drawer" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <header className="sd-header">
          <div style={{ minWidth: 0 }}>
            <div className="sd-title">
              <strong>${signal.ticker}</strong>
              <span className="badge" style={{ background: `${verdictColor}22`, color: verdictColor, border: `1px solid ${verdictColor}55` }}>
                {signal.grade}
              </span>
            </div>
            <span className="sd-sub">{signal.name}</span>
            <div className="sd-ca-row">
              <code title={signal.ca}>{shortAddr(signal.ca)}</code>
              <button type="button" className="icon-btn" onClick={copyCa} title="Salin contract address">
                {copied ? <Check size={14} className="text-green" /> : <Copy size={14} />}
              </button>
              <a className="icon-btn chart" href={chartUrl} target="_blank" rel="noopener noreferrer" title="Buka chart">
                <LineChart size={14} /> Chart
              </a>
            </div>
          </div>
          <button type="button" className="sd-close" onClick={onClose} aria-label="Tutup"><X size={18} /></button>
        </header>

        {/* Verdict banner */}
        <div className="sd-verdict" style={{ borderColor: `${verdictColor}55`, background: `${verdictColor}12` }}>
          <div>
            <strong style={{ color: verdictColor }}>{ex.verdict?.label || '—'}</strong>
            <span>{ex.verdict?.instruction}</span>
          </div>
          <div className="sd-scores">
            <div><span>Skor</span><strong>{ex.score ?? signal.score}</strong></div>
            <div><span>Keyakinan</span><strong>{ex.confidence ?? signal.confidence}%</strong></div>
            <div><span>Vol. Integritas</span><strong>{ex.volumeIntegrity ?? '—'}%</strong></div>
          </div>
        </div>

        {/* TL;DR pills */}
        <div className="sd-pills">
          <span className="sd-pill" style={{ color: signal.grade === 'B' ? 'var(--amber)' : 'var(--green)' }}>
            {signal.grade === 'B' ? 'High Risk' : 'Layak Entry'}
          </span>
          {(ex.slTpRationale?.rr || signal.rr) && <span className="sd-pill">R:R 1:{ex.slTpRationale?.rr || signal.rr}</span>}
          <span className="sd-pill">SL -{slPct}% · TP +{tpPct}%</span>
          <span className="sd-pill" style={{ color: RISK_COLOR[ex.riskNarrative?.level] || 'var(--muted)' }}>
            Risiko rug: {ex.riskNarrative?.level || '—'}
          </span>
          {ex.runnerSummary?.score > 0 && <span className="sd-pill">Runner {ex.runnerSummary.score}/100</span>}
        </div>

        {ex.summary && <p className="sd-summary">{ex.summary}</p>}

        {/* Entry / SL / TP */}
        <Section icon={Target} title="Entry, SL & TP" accent="var(--cyan)">
          <div className="sd-levelgrid">
            <div className="sd-levelbox"><span>Harga Live</span><strong>{formatUsd(signal.priceUsd)}</strong></div>
            <div className="sd-levelbox"><span>Entry</span><strong>{entry ? formatUsd(entry) : '-'}</strong></div>
            <div className="sd-levelbox"><span>Stop Loss</span><strong className="text-red">{sl ? formatUsd(sl) : '-'}<small> -{slPct}%</small></strong></div>
            <div className="sd-levelbox"><span>Take Profit</span><strong className="text-green">{tp ? formatUsd(tp) : '-'}<small> +{tpPct}%</small></strong></div>
            <div className="sd-levelbox"><span>PnL Berjalan</span><strong className={livePnl == null ? 'text-muted' : livePnl >= 0 ? 'text-green' : 'text-red'}>{livePnl == null ? '—' : `${livePnl >= 0 ? '+' : ''}${livePnl.toFixed(2)}%`}</strong></div>
            <div className="sd-levelbox"><span>Status</span><strong style={{ color: trade?.status === 'WIN' ? 'var(--green)' : trade?.status === 'LOSS' ? 'var(--red)' : trade?.status === 'ACTIVE' ? 'var(--cyan)' : 'var(--muted)' }}>{trade?.status || (signal.tracked ? 'SIAP' : 'PENDING')}</strong></div>
          </div>
          {trade && (
            <div style={{ marginTop: 12, display: 'flex', gap: 8, fontSize: 12, color: 'var(--muted)' }}>
              <span>Posisi tersisa: <strong>{((trade.positionRemaining ?? 1.0) * 100).toFixed(0)}%</strong></span>
              {trade.realizedPnl != null && trade.realizedPnl !== 0 && (
                <span>· Realized PnL: <strong className={trade.realizedPnl >= 0 ? 'text-green' : 'text-red'}>{trade.realizedPnl >= 0 ? '+' : ''}{trade.realizedPnl.toFixed(2)}%</strong></span>
              )}
              {trade.peakPrice && trade.peakPrice > entry && (
                <span>· Peak: <strong className="text-cyan">{formatUsd(trade.peakPrice)}</strong> (+{(((trade.peakPrice - entry) / entry) * 100).toFixed(1)}%)</span>
              )}
            </div>
          )}
          {ex.slTpRationale?.text && <p className="sd-text">{ex.slTpRationale.text}</p>}
          {trade?.exitReason && (
            <p className="sd-text" style={{ marginTop: 8, padding: 8, background: 'var(--bg-secondary)', borderRadius: 6, fontSize: 13 }}>
              <strong>Exit reason:</strong> {trade.exitReason}
            </p>
          )}
          {trade?.exitEvents && trade.exitEvents.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <strong style={{ fontSize: 13, color: 'var(--soft)' }}>Exit Events:</strong>
              <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {trade.exitEvents.map((evt, i) => (
                  <div key={i} style={{ fontSize: 12, padding: 6, background: 'var(--bg-secondary)', borderRadius: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'var(--muted)' }}>
                      {evt.type === 'PARTIAL_EXIT' && `${evt.tier}: exit ${(evt.size * 100).toFixed(0)}% @ ${formatUsd(evt.price)}`}
                      {evt.type === 'FULL_EXIT' && `Full exit ${(evt.size * 100).toFixed(0)}% @ ${formatUsd(evt.price)}`}
                      {evt.type === 'MOVE_STOP' && `SL → ${formatUsd(evt.newStop)}`}
                      {evt.type === 'TRAIL_STOP' && `Trail ${evt.trailPct}% → ${formatUsd(evt.newStop)}`}
                    </span>
                    {evt.pnlPct != null && (
                      <strong className={evt.pnlPct >= 0 ? 'text-green' : 'text-red'} style={{ fontSize: 12 }}>
                        {evt.pnlPct >= 0 ? '+' : ''}{evt.pnlPct.toFixed(1)}%
                      </strong>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </Section>

        {/* Kenapa Entry */}
        <Section icon={TrendingUp} title="Kenapa Sinyal Ini Muncul" accent="var(--green)">
          {ex.entryRationale?.headline && <p className="sd-headline">{ex.entryRationale.headline}</p>}
          <ul className="sd-list">
            {(ex.entryRationale?.points || []).map((p, i) => <li key={i}>{p}</li>)}
          </ul>
        </Section>

        {/* Global Fees & Volume */}
        <Section icon={Gauge} title="Global Fees & Integritas Volume" accent="var(--amber)">
          <p className="sd-text">{ex.volumeFees?.text}</p>
        </Section>

        {/* Risiko */}
        <Section icon={Shield} title="Penilaian Risiko" accent="var(--red)">
          <p className="sd-text"><strong>Risiko utama:</strong> {ex.riskNarrative?.primaryRisk}. <em>Level rug: {ex.riskNarrative?.level}.</em></p>
          {ex.riskNarrative?.reasons?.length > 0 && (
            <ul className="sd-list">
              {ex.riskNarrative.reasons.map((r, i) => <li key={i} className="text-red">{r}</li>)}
            </ul>
          )}
        </Section>

        {/* Holder */}
        <Section icon={Users} title="Distribusi Holder & Smart Money" accent="var(--blue)">
          <p className="sd-text">{ex.holderInsight?.text}</p>
        </Section>

        {/* Runner */}
        {ex.runnerSummary?.score > 0 && (
          <Section icon={Rocket} title="Analisa Runner" accent="var(--cyan)">
            <p className="sd-text">Runner score <strong>{ex.runnerSummary.score}/100</strong>{ex.runnerSummary.isRunner ? ' — terkonfirmasi runner.' : '.'}</p>
            {ex.runnerSummary.signals?.length > 0 && (
              <div className="sd-chips">
                {ex.runnerSummary.signals.map((s, i) => <span key={i} className="sd-chip">{s}</span>)}
              </div>
            )}
          </Section>
        )}

        {/* Checks */}
        {ex.checks?.length > 0 && (
          <Section icon={Droplets} title="Hasil Pemeriksaan" accent="var(--cyan)">
            <div className="sd-checks">
              {ex.checks.map((c, i) => (
                <div className="sd-check" key={i}>
                  <CheckIcon status={c.status} />
                  <div>
                    <strong>{c.label}</strong>
                    <span>{c.detail}</span>
                  </div>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Market signals */}
        {ex.marketSignals?.length > 0 && (
          <Section icon={AlertTriangle} title="Sinyal Pasar" accent="var(--amber)">
            <div className="sd-signals">
              {ex.marketSignals.map((m, i) => (
                <div className="sd-signal" key={i} style={{ borderLeftColor: TONE_COLOR[m.tone] || 'var(--muted)' }}>
                  <strong style={{ color: TONE_COLOR[m.tone] || 'var(--soft)' }}>{m.title}</strong>
                  <span>{m.detail}</span>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Ponyin */}
        {ex.knowledgeHits?.length > 0 && (
          <Section icon={BookOpen} title="Prinsip Ponyin Terkait" accent="var(--blue)">
            <div className="sd-knowledge">
              {ex.knowledgeHits.map((k) => (
                <div className="sd-know" key={k.id}>
                  <div className="sd-know-head">
                    <strong>{k.title}</strong>
                    <span>{k.source}</span>
                  </div>
                  <p>{k.rule}</p>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Keyakinan data */}
        <Section icon={Database} title="Keyakinan Data" accent="var(--muted)">
          <p className="sd-text">
            Keyakinan data live {ex.providers?.confidence}%
            {ex.providers?.jupiterRegistered ? ' · token terverifikasi di registry' : ''}.
            {ex.providers?.discrepancySuspicious
              ? ` Peringatan: harga antar sumber berbeda ${ex.providers.discrepancyPct}% (mencurigakan).`
              : ex.providers?.discrepancyPct > 0 ? ` Selisih harga antar sumber ${ex.providers.discrepancyPct}%.` : ''}
          </p>
        </Section>

        <p className="sd-disclaimer">
          Mode backtest: sinyal dan PnL adalah simulasi otomatis dari data live, bukan eksekusi on-chain. Tetap lakukan riset mandiri (DYOR).
        </p>
      </aside>
    </div>
  );
}
