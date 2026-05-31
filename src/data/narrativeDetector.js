/**
 * narrativeDetector.js — Layer deteksi narasi/meta untuk memecoin.
 *
 * Mendeteksi tema yang sedang panas, saturasi tema (early vs late), dan
 * first-mover vs copycat dari clustering nama token di feed discovery.
 *
 * Ini menjawab keluhan trader: "tema berganti sangat cepat" — engine sekarang
 * bisa baca attention/narrative dimension, bukan cuma on-chain metrics.
 */

/**
 * THEME_REGISTRY — daftar tema yang bisa di-update dengan mudah.
 * Setiap tema punya keywords (untuk matching) dan weight (seberapa hot tema ini baseline).
 *
 * CARA UPDATE: edit array ini langsung. Tambah tema baru, hapus yang sudah mati,
 * atau adjust weight sesuai kondisi market saat ini.
 */
export const THEME_REGISTRY = [
  {
    id: 'political',
    label: 'Politik & Figur Publik',
    keywords: ['trump', 'biden', 'elon', 'musk', 'president', 'election', 'vote', 'democrat', 'republican', 'jokowi', 'prabowo'],
    weight: 1.2 // tema politik biasanya volatile & high-attention
  },
  {
    id: 'celebrity',
    label: 'Celebrity & Influencer',
    keywords: ['kardashian', 'jenner', 'bieber', 'swift', 'ronaldo', 'messi', 'celebrity', 'influencer', 'tiktoker'],
    weight: 1.1
  },
  {
    id: 'animal',
    label: 'Animal Meme',
    keywords: ['dog', 'cat', 'pepe', 'frog', 'shib', 'doge', 'inu', 'floki', 'monkey', 'ape', 'gorilla', 'bear', 'bull', 'wolf', 'tiger', 'dragon', 'penguin', 'seal'],
    weight: 0.9 // animal meme sudah saturated, tapi masih populer
  },
  {
    id: 'ai-agent',
    label: 'AI Agent & Bot',
    keywords: ['agent', 'bot', 'gpt', 'claude', 'openai', 'anthropic', 'chatbot', 'assistant', 'neural', 'model', 'llm', 'terminal', 'truth'],
    weight: 1.3 // AI agent tema panas 2024-2026
  },
  {
    id: 'tech-meme',
    label: 'Tech & Crypto Meme',
    keywords: ['bitcoin', 'btc', 'eth', 'solana', 'sol', 'blockchain', 'defi', 'nft', 'web3', 'crypto', 'satoshi', 'vitalik'],
    weight: 1.0
  },
  {
    id: 'food-drink',
    label: 'Food & Drink',
    keywords: ['pizza', 'burger', 'coffee', 'beer', 'wine', 'sushi', 'taco', 'ramen', 'milk', 'juice', 'cola'],
    weight: 0.7
  },
  {
    id: 'nsfw-degen',
    label: 'NSFW & Degen Culture',
    keywords: ['boob', 'ass', 'sexy', 'porn', 'xxx', 'milf', 'dildo', 'cum', 'dick', 'pussy', 'degen', 'retard', 'autist'],
    weight: 0.8 // degen culture niche tapi loyal
  },
  {
    id: 'finance-money',
    label: 'Finance & Money',
    keywords: ['bank', 'dollar', 'euro', 'yen', 'gold', 'silver', 'stock', 'wall street', 'nasdaq', 'fed', 'treasury', 'inflation'],
    weight: 0.9
  },
  {
    id: 'gaming',
    label: 'Gaming & Esports',
    keywords: ['game', 'gamer', 'esport', 'minecraft', 'fortnite', 'league', 'dota', 'valorant', 'cs', 'pubg', 'cod'],
    weight: 0.8
  },
  {
    id: 'meme-culture',
    label: 'Meme Culture General',
    keywords: ['meme', 'wojak', 'chad', 'virgin', 'based', 'cringe', 'cope', 'seethe', 'kek', 'lol', 'lmao', 'bruh', 'sigma', 'gigachad'],
    weight: 1.0
  }
];

/**
 * Normalize text untuk matching: lowercase, strip $, trim, handle unicode.
 */
function normalizeText(text) {
  if (!text) return '';
  return String(text)
    .toLowerCase()
    .replace(/\$/g, '')
    .replace(/[^\w\s]/g, ' ') // ganti punctuation jadi space
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Match token name/ticker terhadap theme registry.
 * Return array of matched theme IDs.
 */
function matchThemes(name, ticker) {
  const nameNorm = normalizeText(name);
  const tickerNorm = normalizeText(ticker);
  const combined = `${nameNorm} ${tickerNorm}`;

  const matched = [];
  for (const theme of THEME_REGISTRY) {
    for (const keyword of theme.keywords) {
      // Word-boundary matching untuk avoid false positive
      const regex = new RegExp(`\\b${keyword}\\b`, 'i');
      if (regex.test(combined)) {
        matched.push(theme.id);
        break; // satu keyword cukup untuk match tema ini
      }
    }
  }

  return [...new Set(matched)]; // dedupe
}

/**
 * Extract keyword stems dari token name untuk clustering.
 * Ambil kata-kata signifikan (>= 3 huruf, bukan stopword).
 */
function extractKeywords(name) {
  const stopwords = new Set(['the', 'and', 'for', 'with', 'token', 'coin', 'meme', 'inu', 'erc', 'bsc', 'sol', 'eth']);
  const norm = normalizeText(name);
  const words = norm.split(/\s+/).filter(w => w.length >= 3 && !stopwords.has(w));
  return words;
}

/**
 * Build meta context dari seluruh feed population.
 * Ini dipanggil sekali per scan di refreshSignals() sebelum per-token analysis.
 *
 * @param {array} tokens - array token dari fetchDiscoveryFeed()
 * @returns {object} metaContext dengan clustering, theme saturation, dll.
 */
export function buildMetaContext(tokens) {
  if (!tokens || tokens.length === 0) {
    return {
      totalTokens: 0,
      themeCounts: {},
      keywordClusters: {},
      hotThemes: [],
      saturatedThemes: [],
      timestamp: Date.now()
    };
  }

  const themeCounts = {};
  const keywordClusters = {}; // { keyword: [tokens with that keyword] }

  // Pass 1: count themes & cluster by keywords
  for (const token of tokens) {
    const themes = matchThemes(token.name, token.ticker);
    for (const themeId of themes) {
      themeCounts[themeId] = (themeCounts[themeId] || 0) + 1;
    }

    const keywords = extractKeywords(token.name);
    for (const kw of keywords) {
      if (!keywordClusters[kw]) keywordClusters[kw] = [];
      keywordClusters[kw].push(token);
    }
  }

  // Pass 2: detect hot vs saturated themes
  const themeEntries = Object.entries(themeCounts).map(([id, count]) => {
    const theme = THEME_REGISTRY.find(t => t.id === id);
    const weight = theme?.weight || 1.0;
    const score = count * weight;
    return { id, count, weight, score };
  });

  themeEntries.sort((a, b) => b.score - a.score);

  // Hot theme: top 3 tema dengan count >= 3 dan score tinggi
  const hotThemes = themeEntries.filter(t => t.count >= 3).slice(0, 3).map(t => t.id);

  // Saturated theme: tema dengan count >= 8 (terlalu banyak copycat)
  const saturatedThemes = themeEntries.filter(t => t.count >= 8).map(t => t.id);

  // Keyword clusters dengan >= 4 token = potential meta cluster
  const significantClusters = Object.entries(keywordClusters)
    .filter(([kw, toks]) => toks.length >= 4)
    .map(([kw, toks]) => ({ keyword: kw, count: toks.length, tokens: toks }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10); // top 10 clusters

  return {
    totalTokens: tokens.length,
    themeCounts,
    keywordClusters: significantClusters,
    hotThemes,
    saturatedThemes,
    timestamp: Date.now()
  };
}

/**
 * Analyze narrative untuk satu token, given meta context dari feed.
 *
 * @param {object} token - token object
 * @param {object} metaContext - dari buildMetaContext()
 * @returns {object} { themes, isHotMeta, isSaturated, isFirstMover, narrativeScore, signals }
 */
export function analyzeNarrative(token, metaContext) {
  if (!token || !metaContext) {
    return {
      themes: [],
      isHotMeta: false,
      isSaturated: false,
      isFirstMover: false,
      narrativeScore: 0,
      signals: []
    };
  }

  const themes = matchThemes(token.name, token.ticker);
  const isHotMeta = themes.some(t => metaContext.hotThemes.includes(t));
  const isSaturated = themes.some(t => metaContext.saturatedThemes.includes(t));

  // First-mover detection: cek apakah token ini paling awal di cluster keyword-nya
  let isFirstMover = false;
  const keywords = extractKeywords(token.name);
  for (const kw of keywords) {
    const cluster = metaContext.keywordClusters.find(c => c.keyword === kw);
    if (cluster && cluster.count >= 4) {
      // Sort by ageMinutes ascending (paling muda = paling awal)
      const sorted = [...cluster.tokens].sort((a, b) => (a.ageMinutes ?? 999999) - (b.ageMinutes ?? 999999));
      const firstToken = sorted[0];
      if (firstToken.ca === token.ca) {
        isFirstMover = true;
        break;
      }
    }
  }

  // Narrative score: +/- modifier untuk main score
  let narrativeScore = 0;
  const signals = [];

  if (isHotMeta && !isSaturated) {
    narrativeScore += 12;
    signals.push('Tema sedang panas dan belum saturated');
  } else if (isHotMeta && isSaturated) {
    narrativeScore += 4; // tema panas tapi sudah ramai
    signals.push('Tema panas tapi sudah banyak copycat');
  }

  if (isSaturated && !isFirstMover) {
    narrativeScore -= 10;
    signals.push('Late copycat di tema saturated — risiko exit liquidity');
  }

  if (isFirstMover) {
    narrativeScore += 14;
    signals.push('First-mover di cluster tema ini');
  }

  // Bonus jika token punya tema tapi tidak saturated
  if (themes.length > 0 && !isSaturated) {
    narrativeScore += 6;
  }

  // Penalty jika tidak punya tema sama sekali (generic/random name)
  if (themes.length === 0) {
    narrativeScore -= 8;
    signals.push('Tidak ada tema yang jelas — sulit dapat attention');
  }

  return {
    themes,
    isHotMeta,
    isSaturated,
    isFirstMover,
    narrativeScore: Math.round(narrativeScore),
    signals
  };
}
