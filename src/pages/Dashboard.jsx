import { useEffect, useMemo, useRef, useState } from 'react';
import {
  LogOut, RefreshCw, Activity, Trophy, Settings, Bot, Zap
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth.jsx';
import {
  refreshSignals,
  pollPrices,
  applyPriceUpdates,
  getCachedSignals,
  getBacktestTrades,
  getBacktestStats,
  resetBacktest,
  getSignalHistory,
} from '../data/autoTrader';
import SignalCard from '../components/SignalCard.jsx';
import SignalDetail from '../components/SignalDetail.jsx';
import PerformancePanel from '../components/PerformancePanel.jsx';

const TABS = [
  { key: 'signals', label: 'Sinyal Pasar', icon: Activity },
  { key: 'performance', label: 'Performa', icon: Trophy },
  { key: 'agent', label: 'Agent', icon: Settings },
];

const HISTORY_RESET_KEY = 'ma_history_reset_v2';

export default function Dashboard({ onLogout }) {
  const { user } = useAuth();
  const [tab, setTab] = useState('signals');
  const [signals, setSignals] = useState(() => getCachedSignals());
  const [trades, setTrades] = useState(() => getBacktestTrades());
  const [signalHistory, setSignalHistory] = useState(() => getSignalHistory());
  const [scanning, setScanning] = useState(false);
  const [agentOn, setAgentOn] = useState(() => localStorage.getItem('ma_agent_on') !== 'false');
  const [selectedCa, setSelectedCa] = useState(null);
  const [toast, setToast] = useState('');
  const [lastPriceUpdate, setLastPriceUpdate] = useState(null);

  useEffect(() => {
    if (localStorage.getItem(HISTORY_RESET_KEY) !== 'true') {
      resetBacktest();
      setTrades([]);
      localStorage.setItem(HISTORY_RESET_KEY, 'true');
    }
  }, []);

  const agentOnRef = useRef(agentOn);
  agentOnRef.current = agentOn;

  const tradesMap = useMemo(() => {
    const m = new Map();
    trades.filter((t) => t.status === 'ACTIVE').forEach((t) => m.set(t.ca, t));
    return m;
  }, [trades]);

  // Feed yang ditampilkan = trade aktif (tetap tampil sampai SL/TP) digabung
  // sinyal baru dari scan. Trade aktif tidak hilang walau keluar dari discovery.
  const displaySignals = useMemo(() => {
    const rank = { 'A+': 4, A: 3, B: 2, C: 1 };
    const byCa = new Map();
    trades.filter((t) => t.status === 'ACTIVE').forEach((t) => {
      const sig = t.signal || {
        id: t.ca, ca: t.ca, ticker: t.ticker, name: t.name, grade: t.grade, side: t.side,
        confidence: 0, reasons: [], score: 0, priceUsd: t.lastPrice, entry: t.entry,
        sl: t.sl, tp: t.tp, slPct: t.slPct, tpPct: t.tpPct, url: null, tracked: true, explain: {}
      };
      byCa.set(t.ca, sig);
    });
    signals.forEach((s) => { if (!byCa.has(s.ca)) byCa.set(s.ca, s); });
    return Array.from(byCa.values()).sort((a, b) =>
      (rank[b.grade] || 0) - (rank[a.grade] || 0) || (b.confidence || 0) - (a.confidence || 0));
  }, [trades, signals]);

  const stats = useMemo(() => getBacktestStats(), [trades]);

  const counts = useMemo(() => ({
    total: displaySignals.length,
    buy: displaySignals.filter((s) => s.side === 'BUY').length,
    highRisk: displaySignals.filter((s) => s.grade === 'B').length,
  }), [displaySignals]);

  const handleRefreshSignals = async () => {
    setScanning(true);
    const s = await refreshSignals({ autoTrack: agentOnRef.current });
    setSignals(s);
    setTrades(getBacktestTrades());
    setSignalHistory(getSignalHistory());
    setScanning(false);
  };

  // Initial load
  useEffect(() => {
    handleRefreshSignals();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refresh signal feed every 20s
  useEffect(() => {
    const timer = setInterval(() => { handleRefreshSignals(); }, 20000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live price poll every 6s → update signals + resolve trade WIN/LOSS
  useEffect(() => {
    const runPoll = async () => {
      const currentSignals = getCachedSignals();
      const currentTrades = getBacktestTrades();
      const cas = [...new Set([
        ...currentSignals.map((s) => s.ca),
        ...currentTrades.filter((t) => t.status === 'ACTIVE').map((t) => t.ca),
      ])];
      if (!cas.length) return;
      try {
        const liveTokens = await pollPrices(cas);
        if (liveTokens.length) {
          const { signals: nextSignals, trades: nextTrades } = applyPriceUpdates(currentSignals, currentTrades, liveTokens);
          setSignals(nextSignals);
          setTrades(nextTrades);
          setLastPriceUpdate(Date.now());
        }
      } catch { /* abaikan */ }
    };
    runPoll();
    const timer = setInterval(runPoll, 6000);
    return () => clearInterval(timer);
  }, []);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  };

  const toggleAgent = () => {
    const next = !agentOn;
    setAgentOn(next);
    localStorage.setItem('ma_agent_on', String(next));
    showToast(next ? 'Auto-track aktif: sinyal terbaik dilacak otomatis' : 'Auto-track dijeda');
  };

  const handleReset = () => {
    resetBacktest();
    setTrades(getBacktestTrades());
    setSignalHistory(getSignalHistory());
    showToast('Data backtest dan riwayat sinyal telah dikosongkan');
  };

  const selectedSignal = selectedCa
    ? (displaySignals.find((s) => s.ca === selectedCa) || null)
    : null;

  return (
    <div className="dashboard-shell">
      <NavBar user={user} onLogout={onLogout} />

      <div className="tab-bar">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button key={key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>
            <Icon size={15} /> {label}
            {key === 'signals' && tradesMap.size > 0 && <span className="tab-count">{tradesMap.size}</span>}
          </button>
        ))}
      </div>

      {tab === 'signals' && (
        <SignalsTab
          signals={displaySignals}
          tradesMap={tradesMap}
          counts={counts}
          stats={stats}
          scanning={scanning}
          agentOn={agentOn}
          lastPriceUpdate={lastPriceUpdate}
          onRefresh={handleRefreshSignals}
          onSelect={(s) => setSelectedCa(s.ca)}
        />
      )}
      {tab === 'performance' && (
        <PerformancePanel stats={stats} trades={trades} signalHistory={signalHistory} onReset={handleReset} />
      )}
      {tab === 'agent' && (
        <AgentTab agentOn={agentOn} onToggle={toggleAgent} onReset={handleReset} />
      )}

      {selectedSignal && (
        <SignalDetail
          signal={selectedSignal}
          trade={tradesMap.get(selectedSignal.ca)}
          onClose={() => setSelectedCa(null)}
        />
      )}

      {toast && (
        <div className="toast">{toast}</div>
      )}
    </div>
  );
}

function NavBar({ user, onLogout }) {
  return (
    <nav className="site-nav">
      <div className="brand">
        <span>AI</span>
        <div>
          <strong>MemeAgent</strong>
          <small>Signal Intelligence Solana</small>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div className="user-chip">
          <div className="user-chip-avatar">{user?.name?.[0]?.toUpperCase() || 'T'}</div>
          <span>{user?.name || 'Trader'}</span>
        </div>
        <button type="button" className="btn-secondary" style={{ padding: '8px 14px', fontSize: 13 }} onClick={onLogout}>
          <LogOut size={14} /> Keluar
        </button>
      </div>
    </nav>
  );
}

const FEED_FILTERS = [
  { key: 'all', label: 'Semua' },
  { key: 'entry', label: 'Layak Entry' },
  { key: 'highrisk', label: 'Selektif B' },
  { key: 'active', label: 'Dilacak' },
];

function SignalsTab({ signals, tradesMap, counts, stats, scanning, agentOn, lastPriceUpdate, onRefresh, onSelect }) {
  const [filter, setFilter] = useState('all');
  const [showGuide, setShowGuide] = useState(false);

  const filterCount = {
    all: counts.total,
    entry: counts.buy,
    highrisk: counts.highRisk,
    active: tradesMap.size,
  };

  const filtered = signals.filter((s) => {
    if (filter === 'entry') return s.grade === 'A+' || s.grade === 'A';
    if (filter === 'highrisk') return s.grade === 'B';
    if (filter === 'active') return tradesMap.has(s.ca);
    return true;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="signal-summary">
        <div className="ss-stat" title="Total sinyal yang sedang tampil"><span>Total Sinyal</span><strong>{counts.total}</strong></div>
        <div className="ss-stat" title="Grade A+/A dengan kualitas entry terbaik"><span>Prioritas Entry</span><strong className="text-green">{counts.buy}</strong></div>
        <div className="ss-stat" title="Grade B hanya tampil jika memenuhi gerbang seleksi tambahan"><span>Grade B Tersaring</span><strong className="text-amber">{counts.highRisk}</strong></div>
        <div className="ss-stat" title="Trade simulasi yang masih dipantau menuju TP/SL"><span>Dalam Pantauan</span><strong className="text-cyan">{tradesMap.size}</strong></div>
        <div className="ss-stat" title="Persentase trade selesai yang berakhir menang"><span>Win Rate</span><strong className={stats.winRate >= 50 ? 'text-green' : 'text-red'}>{stats.total ? `${stats.winRate.toFixed(0)}%` : '—'}</strong></div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <div>
            <h3>Sinyal Pasar</h3>
            <p className="panel-subtitle">Feed backtest untuk membaca peluang, kualitas momentum, dan risiko sebelum sistem digunakan secara real-time.</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {lastPriceUpdate && (
              <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700 }}>
                Harga update {Math.max(0, Math.round((Date.now() - lastPriceUpdate) / 1000))}d lalu
              </span>
            )}
            {agentOn && (
              <span className="scan-mini" style={{ padding: '6px 10px', fontSize: 12 }}>
                <div className="spinner" style={{ width: 12, height: 12 }} />
                Auto-track aktif
              </span>
            )}
            <button type="button" className="btn-secondary" style={{ padding: '8px 14px', fontSize: 13 }} onClick={onRefresh} disabled={scanning}>
              <RefreshCw size={14} style={{ animation: scanning ? 'spin 1s linear infinite' : 'none' }} />
              {scanning ? 'Memindai...' : 'Perbarui Sinyal'}
            </button>
          </div>
        </div>

        <div className="feed-toolbar">
          <div className="filter-chips">
            {FEED_FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                className={`chip ${filter === f.key ? 'active' : ''}`}
                onClick={() => setFilter(f.key)}
              >
                {f.label} <span className="chip-count">{filterCount[f.key]}</span>
              </button>
            ))}
          </div>
          <button type="button" className="guide-toggle" onClick={() => setShowGuide((v) => !v)}>
            {showGuide ? 'Tutup panduan' : 'Panduan grade'}
          </button>
        </div>

        {showGuide && (
          <div className="feed-legend">
            <div><span className="badge" style={{ background: 'rgba(22,163,74,0.12)', color: 'var(--green)', border: '1px solid rgba(22,163,74,0.28)' }}>A+</span> Prioritas tertinggi: struktur, momentum, dan risiko paling seimbang.</div>
            <div><span className="badge" style={{ background: 'rgba(37,99,235,0.1)', color: 'var(--cyan)', border: '1px solid rgba(37,99,235,0.24)' }}>A</span> Layak dipantau untuk entry dengan risiko yang masih terukur.</div>
            <div><span className="badge" style={{ background: 'rgba(217,119,6,0.12)', color: 'var(--amber)', border: '1px solid rgba(217,119,6,0.26)' }}>B</span> Selektif: hanya muncul jika lolos filter tambahan untuk mengurangi potensi loss.</div>
            <div><span className="sc-status active">DILACAK</span> berarti entry virtual aktif sampai menyentuh TP atau SL. <span className="sc-status win">WIN</span>/<span className="sc-status loss">LOSS</span> adalah hasil simulasi.</div>
            <div className="feed-legend-note">SL/TP menyesuaikan karakter token: volatilitas, likuiditas, momentum, dan keyakinan data. Saat ini masih mode backtest, bukan eksekusi on-chain.</div>
          </div>
        )}

        {scanning && signals.length === 0 ? (
          <div className="signal-grid">
            {Array.from({ length: 6 }).map((_, i) => <div className="signal-card skeleton" key={i} />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            {signals.length === 0
              ? 'Belum ada sinyal yang memenuhi standar seleksi. Klik Perbarui Sinyal untuk memindai ulang.'
              : 'Belum ada sinyal yang cocok dengan filter ini.'}
          </div>
        ) : (
          <div className="signal-grid">
            {filtered.map((s) => (
              <SignalCard key={s.id} signal={s} trade={tradesMap.get(s.ca)} onClick={() => onSelect(s)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AgentTab({ agentOn, onToggle, onReset }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="panel">
        <div className="panel-header">
          <h3>Kontrol Agent</h3>
          <div className="live-dot" style={{ color: agentOn ? 'var(--green)' : 'var(--muted)' }}>
            <span style={{ background: agentOn ? 'var(--green)' : 'var(--muted)', animation: agentOn ? 'pulse-dot 1.4s ease-out infinite' : 'none' }} />
            {agentOn ? 'Auto-track Aktif' : 'Auto-track Dijeda'}
          </div>
        </div>

        <div className="agent-control">
          <div className="toggle-row">
            <button type="button" className={`toggle ${agentOn ? 'on' : ''}`} onClick={onToggle} aria-label="Toggle auto-track" />
            <div>
              <strong style={{ fontSize: 15 }}>Auto-Track Sinyal Pilihan</strong>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                Saat aktif, grade A+/A dan grade B yang lolos seleksi tambahan akan di-entry virtual dan dipantau otomatis sampai TP atau SL.
              </div>
            </div>
          </div>
        </div>

        <div style={{ marginTop: 16 }}>
          <button type="button" className="btn-secondary" style={{ fontSize: 13, padding: '10px 16px' }} onClick={onReset}>
            <Zap size={14} /> Kosongkan Data Backtest
          </button>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header"><h3>Cara Kerja</h3></div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {[
            { title: 'Pemindaian Pasar', text: 'Agent membaca token memecoin Solana dari data pasar, lalu menilai struktur, momentum, likuiditas, dan risiko dasar.' },
            { title: 'Seleksi Bertingkat', text: 'Grade A+/A menjadi prioritas utama. Grade B hanya ditampilkan jika lolos gerbang tambahan yang lebih ketat untuk menekan risiko loss.' },
            { title: 'Backtest Otomatis', text: 'Sinyal yang lolos di-entry virtual pada harga live, kemudian dipantau sampai TP atau SL tanpa eksekusi on-chain.' },
            { title: 'Transparansi Analisa', text: 'Klik kartu sinyal untuk membaca alasan lengkap: entry, integritas volume, holder, rug/runner, dan keyakinan data.' },
          ].map((item) => (
            <div key={item.title} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <div className="feature-icon" style={{ flex: '0 0 auto' }}><Bot size={18} /></div>
              <div>
                <strong style={{ fontSize: 14 }}>{item.title}</strong>
                <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--muted)', lineHeight: 1.5 }}>{item.text}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
