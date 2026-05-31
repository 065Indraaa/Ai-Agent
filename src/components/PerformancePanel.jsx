import { Trophy, RotateCcw, History, ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { formatUsd } from '../data/autoTrader';

function StatBox({ label, value, tone, sub }) {
  const cls = tone === 'up' ? 'text-green' : tone === 'down' ? 'text-red' : tone === 'cyan' ? 'text-cyan' : '';
  return (
    <div className="perf-stat">
      <span>{label}</span>
      <strong className={cls}>{value}</strong>
      {sub && <small>{sub}</small>}
    </div>
  );
}

/* Kurva ekuitas: PnL% kumulatif dari trade yang sudah selesai (diurutkan berdasarkan waktu penutupan). */
function EquityCurve({ trades }) {
  const closed = trades
    .filter((t) => t.status === 'WIN' || t.status === 'LOSS')
    .sort((a, b) => (a.closedAt || 0) - (b.closedAt || 0));

  if (closed.length < 2) {
    return <div className="perf-curve empty">Kurva ekuitas tersedia setelah minimal 2 trade selesai.</div>;
  }

  let cum = 0;
  const points = closed.map((t) => (cum += (t.pnlPct || 0)));
  const min = Math.min(0, ...points);
  const max = Math.max(0, ...points);
  const range = max - min || 1;
  const W = 100;
  const H = 36;
  const coords = points.map((p, i) => {
    const x = (i / (points.length - 1)) * W;
    const y = H - ((p - min) / range) * H;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
  const zeroY = H - ((0 - min) / range) * H;
  const last = points[points.length - 1];
  const color = last >= 0 ? 'var(--green)' : 'var(--red)';

  return (
    <div className="perf-curve">
      <div className="perf-curve-head">
        <span>Kurva Ekuitas (PnL% kumulatif)</span>
        <strong className={last >= 0 ? 'text-green' : 'text-red'}>{last >= 0 ? '+' : ''}{last.toFixed(1)}%</strong>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="perf-curve-svg">
        <line x1="0" y1={zeroY} x2={W} y2={zeroY} stroke="var(--line)" strokeWidth="0.5" strokeDasharray="2 2" />
        <polyline points={coords.join(' ')} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}

export default function PerformancePanel({ stats, trades = [], signalHistory = [], onReset }) {
  const fmt = (n, plus = false) => `${plus && n > 0 ? '+' : ''}${(n || 0).toFixed(1)}%`;
  const [historyPage, setHistoryPage] = useState(0);
  const ITEMS_PER_PAGE = 20;

  const totalPages = Math.ceil(signalHistory.length / ITEMS_PER_PAGE);
  const paginatedHistory = signalHistory.slice(
    historyPage * ITEMS_PER_PAGE,
    (historyPage + 1) * ITEMS_PER_PAGE
  );

  const gradeColor = (grade) => {
    if (grade === 'A+') return 'var(--green)';
    if (grade === 'A') return 'var(--cyan)';
    if (grade === 'B') return 'var(--amber)';
    return 'var(--muted)';
  };

  const formatTime = (timestamp) => {
    if (!timestamp) return '-';
    const date = new Date(timestamp);
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
  };

  return (
    <div className="panel">
      <div className="panel-header">
        <h3><Trophy size={16} style={{ verticalAlign: '-3px', marginRight: 6, color: 'var(--amber)' }} /> Performa Simulasi</h3>
        {onReset && (
          <button type="button" className="btn-secondary" style={{ padding: '8px 14px', fontSize: 13 }} onClick={onReset}>
            <RotateCcw size={14} /> Reset
          </button>
        )}
      </div>

      {stats.total === 0 && stats.active === 0 ? (
        <div className="empty-state">Belum ada data simulasi. Sinyal dengan grade terbaik akan otomatis dilacak begitu muncul.</div>
      ) : (
        <>
          <div className="perf-grid">
            <StatBox label="Win Rate" value={`${stats.winRate.toFixed(0)}%`} tone={stats.winRate >= 50 ? 'up' : 'down'} sub={`${stats.wins}W / ${stats.losses}L`} />
            <StatBox label="Trade Selesai" value={stats.total} sub={`${stats.active} dilacak`} />
            <StatBox label="Rata-rata Profit" value={fmt(stats.avgWinPct, true)} tone="up" />
            <StatBox label="Rata-rata Loss" value={fmt(stats.avgLossPct)} tone="down" />
            <StatBox label="Ekspektansi / Trade" value={fmt(stats.expectancy, true)} tone={stats.expectancy >= 0 ? 'up' : 'down'} />
            <StatBox label="Total PnL" value={fmt(stats.totalPnlPct, true)} tone={stats.totalPnlPct >= 0 ? 'up' : 'down'} />
            <StatBox label="Trade Terbaik" value={fmt(stats.bestPct, true)} tone="up" />
            <StatBox label="Trade Terburuk" value={fmt(stats.worstPct)} tone="down" />
          </div>

          <EquityCurve trades={trades} />

          <div className="perf-bar">
            <div className="perf-bar-fill" style={{ width: `${Math.min(100, stats.winRate)}%` }} />
            <span>{stats.wins} menang · {stats.losses} kalah dari {stats.total} trade selesai</span>
          </div>

          <p className="perf-note">
            Ekspektansi adalah rata-rata hasil per trade dengan memperhitungkan win rate. Nilai positif
            menandakan strategi ini menguntungkan dalam simulasi. Mode backtest, bukan eksekusi nyata.
          </p>
        </>
      )}

      {/* Riwayat Sinyal */}
      {signalHistory.length > 0 && (
        <div style={{ marginTop: 24, borderTop: '1px solid var(--line)', paddingTop: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h4 style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0, fontSize: 15, color: 'var(--soft)' }}>
              <History size={16} style={{ color: 'var(--cyan)' }} />
              Riwayat Sinyal ({signalHistory.length})
            </h4>
            {totalPages > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => setHistoryPage(p => Math.max(0, p - 1))}
                  disabled={historyPage === 0}
                  style={{ opacity: historyPage === 0 ? 0.4 : 1 }}
                >
                  <ChevronLeft size={14} />
                </button>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                  {historyPage + 1} / {totalPages}
                </span>
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => setHistoryPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={historyPage >= totalPages - 1}
                  style={{ opacity: historyPage >= totalPages - 1 ? 0.4 : 1 }}
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            )}
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--line)', color: 'var(--muted)' }}>
                  <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 600 }}>Token</th>
                  <th style={{ textAlign: 'center', padding: '8px 12px', fontWeight: 600 }}>Grade</th>
                  <th style={{ textAlign: 'right', padding: '8px 12px', fontWeight: 600 }}>Score</th>
                  <th style={{ textAlign: 'right', padding: '8px 12px', fontWeight: 600 }}>Confidence</th>
                  <th style={{ textAlign: 'right', padding: '8px 12px', fontWeight: 600 }}>Entry</th>
                  <th style={{ textAlign: 'right', padding: '8px 12px', fontWeight: 600 }}>Liquidity</th>
                  <th style={{ textAlign: 'right', padding: '8px 12px', fontWeight: 600 }}>Waktu</th>
                </tr>
              </thead>
              <tbody>
                {paginatedHistory.map((signal, i) => (
                  <tr key={`${signal.ca}-${i}`} style={{ borderBottom: '1px solid var(--line)' }}>
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <strong style={{ fontSize: 13 }}>${signal.ticker}</strong>
                        <span style={{ fontSize: 11, color: 'var(--muted)' }}>{signal.name}</span>
                      </div>
                    </td>
                    <td style={{ textAlign: 'center', padding: '10px 12px' }}>
                      <span style={{
                        display: 'inline-block',
                        padding: '2px 8px',
                        borderRadius: 4,
                        fontSize: 11,
                        fontWeight: 700,
                        color: gradeColor(signal.grade),
                        background: `${gradeColor(signal.grade)}22`,
                        border: `1px solid ${gradeColor(signal.grade)}44`
                      }}>
                        {signal.grade}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right', padding: '10px 12px', color: 'var(--soft)' }}>
                      {signal.score || '-'}
                    </td>
                    <td style={{ textAlign: 'right', padding: '10px 12px', color: 'var(--soft)' }}>
                      {signal.confidence || '-'}%
                    </td>
                    <td style={{ textAlign: 'right', padding: '10px 12px', color: 'var(--soft)' }}>
                      {signal.entry ? formatUsd(signal.entry) : '-'}
                    </td>
                    <td style={{ textAlign: 'right', padding: '10px 12px', color: 'var(--soft)' }}>
                      {formatUsd(signal.liquidityUsd)}
                    </td>
                    <td style={{ textAlign: 'right', padding: '10px 12px', fontSize: 11, color: 'var(--muted)' }}>
                      {formatTime(signal.firstSeenAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
