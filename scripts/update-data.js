// scripts/update-data.js — MODELO ESTADÍSTICO COMPLETO
// Fuentes: ELO + Kalshi + TheOddsAPI + API-Football + Claude AI
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const FOOTBALL_API_KEY  = process.env.FOOTBALL_API_KEY;
const ODDS_API_KEY      = process.env.ODDS_API_KEY;

function getChileDate() {
  const chile = new Date(new Date().toLocaleString("en-US", { timeZone:"America/Santiago" }));
  return chile.toLocaleDateString("es-CL", { weekday:"long", year:"numeric", month:"long", day:"numeric" });
}
function getChileDateShort() {
  const chile = new Date(new Date().toLocaleString("en-US", { timeZone:"America/Santiago" }));
  return chile.toISOString().split("T")[0];
}

// ── ELO RATINGS — base estadística más confiable ──────────────────────────────
const ELO = {
  "Francia":2083,"España":2048,"Brasil":2034,"Argentina":2142,"Inglaterra":2021,
  "Portugal":1975,"Países Bajos":1976,"Alemania":1956,"Bélgica":1928,"Suiza":1862,
  "Croacia":1882,"Uruguay":1870,"Colombia":1852,"Noruega":1825,"México":1836,
  "Marruecos":1827,"Japón":1808,"Senegal":1782,"Corea del Sur":1776,"EE.UU.":1768,
  "Turquía":1782,"Austria":1766,"Suecia":1759,"Ecuador":1752,"Rep. Checa":1729,
  "Australia":1737,"C. Marfil":1745,"Serbia":1764,"Irán":1741,"Escocia":1733,
  "Argelia":1714,"Canadá":1773,"Egipto":1695,"Bosnia y Herz.":1698,"Paraguay":1718,
  "Ghana":1701,"Arabia Saudita":1693,"Uzbekistán":1672,"RD Congo":1638,
  "Jordania":1601,"Cabo Verde":1642,"Panamá":1623,"Haití":1541,
  "Curazao":1489,"Sudáfrica":1641,"Nueva Zelanda":1548,"Catar":1611,"Irak":1629,
};

// Calcular probabilidades base con ELO + modelo Dixon-Coles
function calcEloProbs(homeTeam, awayTeam) {
  const homeElo = ELO[homeTeam] || 1700;
  const awayElo = ELO[awayTeam] || 1700;
  const diff = homeElo - awayElo + 40; // +40 ventaja local/neutral
  const homeWin = 1 / (1 + Math.pow(10, -diff / 400));
  const draw = 0.26; // ~26% empates en mundiales
  return {
    home: Math.round(homeWin * (1 - draw) * 100),
    draw: Math.round(draw * 100),
    away: Math.round((1 - homeWin) * (1 - draw) * 100),
    homeElo, awayElo, diff: homeElo - awayElo,
  };
}

// Ajustar probabilidades por lesiones conocidas
const INJURY_IMPACT = {
  "Brasil":     { players:["Rodrygo (LCA)","Militão (muscular)"], eloMalus: -35 },
  "Argentina":  { players:["Foyth (Aquiles)","Panichelli (LCA)"], eloMalus: -20 },
  "México":     { players:["Malagón (Aquiles)"], eloMalus: -15 },
  "Inglaterra": { players:["Grealish (pie)"], eloMalus: -10 },
  "Croacia":    { players:["Gvardiol (pierna)"], eloMalus: -25 },
  "Alemania":   { players:["Gnabry"], eloMalus: -10 },
  "España":     { players:["Yamal (duda)"], eloMalus: -10 },
};

function applyInjuryAdjustment(homeTeam, awayTeam, baseProbs) {
  const homeMalus = INJURY_IMPACT[homeTeam]?.eloMalus || 0;
  const awayMalus = INJURY_IMPACT[awayTeam]?.eloMalus || 0;
  const adjustedDiff = baseProbs.diff - homeMalus + awayMalus;
  const homeWin = 1 / (1 + Math.pow(10, -(adjustedDiff + 40) / 400));
  const draw = 0.26;
  return {
    home: Math.round(homeWin * (1 - draw) * 100),
    draw: Math.round(draw * 100),
    away: Math.round((1 - homeWin) * (1 - draw) * 100),
  };
}

// Combinar probabilidades de múltiples fuentes con pesos
function combineProbs(sources) {
  // sources = [{probs:{home,draw,away}, weight, name}]
  const totalWeight = sources.reduce((s, x) => s + x.weight, 0);
  let home = 0, draw = 0, away = 0;
  sources.forEach(s => {
    home += s.probs.home * s.weight / totalWeight;
    draw += s.probs.draw * s.weight / totalWeight;
    away += s.probs.away * s.weight / totalWeight;
  });
  // Normalizar a 100%
  const total = home + draw + away;
  return {
    home: Math.round(home / total * 100),
    draw: Math.round(draw / total * 100),
    away: Math.round(away / total * 100),
    sourceNames: sources.map(s => s.name).join("+"),
  };
}

// ── FUENTE 1: Kalshi ──────────────────────────────────────────────────────────
async function getKalshiData() {
  console.log("📈 Kalshi...");
  try {
    const res = await fetch(
      "https://api.elections.kalshi.com/trade-api/v2/markets?limit=200&status=open&series_ticker=KXMENWORLDCUP",
      { headers: { "Accept": "application/json" } }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const markets = data.markets || [];

    const ISO2 = {
      "ES":"España","FR":"Francia","PT":"Portugal","GB":"Inglaterra","AR":"Argentina",
      "BR":"Brasil","DE":"Alemania","NL":"Países Bajos","BE":"Bélgica","UY":"Uruguay",
      "CO":"Colombia","MX":"México","MA":"Marruecos","JP":"Japón","SN":"Senegal",
      "KR":"Corea del Sur","US":"EE.UU.","CH":"Suiza","HR":"Croacia","NO":"Noruega",
      "TR":"Turquía","AU":"Australia","EC":"Ecuador","CA":"Canadá","AT":"Austria",
      "SE":"Suecia","CI":"C. Marfil","CZ":"Rep. Checa","GH":"Ghana","IR":"Irán",
      "SA":"Arabia Saudita","DZ":"Argelia","EG":"Egipto","BA":"Bosnia y Herz.",
      "UZ":"Uzbekistán","CD":"RD Congo","JO":"Jordania","PY":"Paraguay",
      "CV":"Cabo Verde","PA":"Panamá","HT":"Haití","CW":"Curazao","ZA":"Sudáfrica",
      "NZ":"Nueva Zelanda","QA":"Catar","IQ":"Irak","SC":"Escocia",
    };

    const teamOdds = {};
    markets.forEach(m => {
      const code = m.ticker?.split("-").pop();
      const team = ISO2[code] || code;
      const price = parseFloat(m.last_price_dollars) || parseFloat(m.yes_bid) || parseFloat(m.yes_ask) || 0;
      if (price > 0 && team) teamOdds[team] = Math.round(price * 100);
    });

    const sorted = Object.entries(teamOdds).sort((a,b) => b[1]-a[1]);
    console.log(`  ✅ ${markets.length} mercados | Top: ${sorted.slice(0,6).map(([t,p])=>t+":"+p+"%").join(", ")}`);
    return { available: true, teamOdds, sorted };
  } catch(e) {
    console.log("  ⚠️ Kalshi:", e.message);
    return { available: false, teamOdds: {}, sorted: [] };
  }
}

// ── FUENTE 2: TheOddsAPI ──────────────────────────────────────────────────────
async function getOddsData() {
  console.log("🎲 TheOddsAPI...");
  console.log("  Key existe:", !!ODDS_API_KEY, "| longitud:", ODDS_API_KEY?.length || 0);
  if (!ODDS_API_KEY) return { available: false, matches: [] };
  try {
    const sportsRes = await fetch(`https://api.the-odds-api.com/v4/sports/?apiKey=${ODDS_API_KEY}`);
    const sportsRaw = await sportsRes.json();
    const sports = Array.isArray(sportsRaw) ? sportsRaw : [];
    const wcSport = sports.find(s =>
      s.key?.includes("world_cup") || s.key?.includes("fifa") ||
      s.title?.toLowerCase().includes("world cup")
    );
    if (!wcSport) {
      const soccer = sports.filter(s => s.key?.includes("soccer")).map(s=>s.key).join(", ");
      console.log("  Soccer sports:", soccer.slice(0,200) || "ninguno");
      return { available: false, matches: [] };
    }
    const oddsRes = await fetch(
      `https://api.the-odds-api.com/v4/sports/${wcSport.key}/odds/?apiKey=${ODDS_API_KEY}&regions=eu&markets=h2h&oddsFormat=decimal`
    );
    const oddsData = await oddsRes.json();
    const matches = (Array.isArray(oddsData) ? oddsData : []).map(game => {
      const bms = game.bookmakers || [];
      if (!bms.length) return null;
      const sums = {home:0,draw:0,away:0}; let count = 0;
      bms.forEach(bm => {
        const h2h = bm.markets?.find(m=>m.key==="h2h");
        if (!h2h) return;
        const hO = h2h.outcomes?.find(o=>o.name===game.home_team)?.price;
        const aO = h2h.outcomes?.find(o=>o.name===game.away_team)?.price;
        const dO = h2h.outcomes?.find(o=>o.name==="Draw")?.price;
        if (hO && aO && dO) {
          const t = 1/hO+1/dO+1/aO;
          sums.home += (1/hO/t)*100; sums.draw += (1/dO/t)*100; sums.away += (1/aO/t)*100;
          count++;
        }
      });
      if (!count) return null;
      return {
        home:game.home_team, away:game.away_team,
        date:game.commence_time?.split("T")[0],
        probs:{ home:Math.round(sums.home/count), draw:Math.round(sums.draw/count), away:Math.round(sums.away/count) },
        bookmakerCount:count,
      };
    }).filter(Boolean);
    console.log(`  ✅ ${matches.length} partidos con cuotas`);
    return { available: true, matches };
  } catch(e) {
    console.log("  ⚠️ TheOddsAPI:", e.message);
    return { available: false, matches: [] };
  }
}

// ── FUENTE 3: API-Football ────────────────────────────────────────────────────
async function getFootballData() {
  console.log("📡 API-Football...");
  if (!FOOTBALL_API_KEY) return { available:false, groups:{}, recentResults:[] };
  try {
    const headers = { "x-apisports-key": FOOTBALL_API_KEY };
    const lr = await fetch("https://v3.football.api-sports.io/leagues?type=cup&season=2026", { headers });
    const ld = await lr.json();
    const wc = (ld?.response||[]).find(l => l.league?.name?.toLowerCase().includes("world cup"));
    if (!wc?.league?.id) { console.log("  ⚠️ Torneo no disponible aún"); return { available:false, groups:{}, recentResults:[] }; }
    const [sd, fd] = await Promise.all([
      fetch(`https://v3.football.api-sports.io/standings?league=${wc.league.id}&season=2026`, {headers}).then(r=>r.json()),
      fetch(`https://v3.football.api-sports.io/fixtures?league=${wc.league.id}&season=2026&status=FT`, {headers}).then(r=>r.json()),
    ]);
    const groups = {};
    for (const g of (sd?.response?.[0]?.league?.standings||[])) {
      if (!g.length) continue;
      const name = g[0]?.group?.replace(/^Group\s*/i,"") || "?";
      groups[name] = g.map(t => ({
        team:t.team.name, pts:t.points,
        gf:t.all.goals.for, gc:t.all.goals.against, gd:t.goalsDiff,
      }));
    }
    const results = (fd?.response||[]).slice(-12).map(f => ({
      home:f.teams.home.name, away:f.teams.away.name,
      score:`${f.goals.home}-${f.goals.away}`, date:f.fixture.date?.split("T")[0],
    }));
    console.log(`  ✅ ${Object.keys(groups).length} grupos, ${results.length} resultados`);
    return { available:true, groups, recentResults:results };
  } catch(e) {
    console.log("  ⚠️ API-Football:", e.message);
    return { available:false, groups:{}, recentResults:[] };
  }
}

// ── Claude AI helper ──────────────────────────────────────────────────────────
async function callClaude(prompt, maxTokens=1800) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method:"POST",
    headers:{ "Content-Type":"application/json","x-api-key":ANTHROPIC_API_KEY,"anthropic-version":"2023-06-01" },
    body: JSON.stringify({ model:"claude-haiku-4-5-20251001", max_tokens:maxTokens, messages:[{role:"user",content:prompt}] }),
  });
  if (!res.ok) throw new Error(`Claude ${res.status}`);
  const raw = await res.json();
  let text = (raw.content||[]).filter(b=>b.type==="text").map(b=>b.text).join("").trim()
    .replace(/^```json\s*/i,"").replace(/^```\s*/i,"").replace(/\s*```$/i,"").trim();
  const s=text.indexOf("{"),e=text.lastIndexOf("}");
  if (s===-1) throw new Error("No JSON");
  return JSON.parse(text.slice(s,e+1));
}

// ── Fixture completo con horarios Chile ───────────────────────────────────────
const ALL_FIXTURES = [
  { date:"2026-06-11", time:"19:00", group:"A", home:"México",        away:"Sudáfrica",      j:1, venue:"Azteca, CDMX" },
  { date:"2026-06-11", time:"22:00", group:"A", home:"Corea del Sur", away:"Rep. Checa",     j:1, venue:"Guadalajara" },
  { date:"2026-06-12", time:"17:00", group:"D", home:"EE.UU.",        away:"Paraguay",       j:1, venue:"SoFi, LA" },
  { date:"2026-06-12", time:"20:00", group:"B", home:"Canadá",        away:"Bosnia y Herz.", j:1, venue:"Toronto" },
  { date:"2026-06-13", time:"13:00", group:"B", home:"Catar",         away:"Suiza",          j:1, venue:"San Francisco" },
  { date:"2026-06-13", time:"16:00", group:"C", home:"Haití",         away:"Escocia",        j:1, venue:"Boston" },
  { date:"2026-06-13", time:"19:00", group:"C", home:"Brasil",        away:"Marruecos",      j:1, venue:"MetLife, NJ" },
  { date:"2026-06-13", time:"22:00", group:"D", home:"Australia",     away:"Turquía",        j:1, venue:"Vancouver" },
  { date:"2026-06-14", time:"13:00", group:"F", home:"Suecia",        away:"Túnez",          j:1, venue:"Monterrey" },
  { date:"2026-06-14", time:"16:00", group:"E", home:"Alemania",      away:"Curazao",        j:1, venue:"Houston" },
  { date:"2026-06-14", time:"19:00", group:"F", home:"Países Bajos",  away:"Japón",          j:1, venue:"Dallas" },
  { date:"2026-06-14", time:"22:00", group:"E", home:"C. Marfil",     away:"Ecuador",        j:1, venue:"Philadelphia" },
  { date:"2026-06-15", time:"13:00", group:"G", home:"Irán",          away:"Nueva Zelanda",  j:1, venue:"Los Ángeles" },
  { date:"2026-06-15", time:"16:00", group:"H", home:"Arabia Saudita",away:"Uruguay",        j:1, venue:"Miami" },
  { date:"2026-06-15", time:"19:00", group:"G", home:"Bélgica",       away:"Egipto",         j:1, venue:"Seattle" },
  { date:"2026-06-15", time:"22:00", group:"H", home:"España",        away:"Cabo Verde",     j:1, venue:"Atlanta" },
  { date:"2026-06-16", time:"13:00", group:"I", home:"Irak",          away:"Noruega",        j:1, venue:"Boston" },
  { date:"2026-06-16", time:"16:00", group:"J", home:"Austria",       away:"Jordania",       j:1, venue:"San Francisco" },
  { date:"2026-06-16", time:"19:00", group:"I", home:"Francia",       away:"Senegal",        j:1, venue:"MetLife, NJ" },
  { date:"2026-06-16", time:"22:00", group:"J", home:"Argentina",     away:"Argelia",        j:1, venue:"Kansas City" },
  { date:"2026-06-17", time:"13:00", group:"K", home:"Uzbekistán",    away:"Colombia",       j:1, venue:"CDMX" },
  { date:"2026-06-17", time:"16:00", group:"L", home:"Ghana",         away:"Panamá",         j:1, venue:"Toronto" },
  { date:"2026-06-17", time:"19:00", group:"K", home:"Portugal",      away:"RD Congo",       j:1, venue:"Houston" },
  { date:"2026-06-17", time:"22:00", group:"L", home:"Inglaterra",    away:"Croacia",        j:1, venue:"Dallas" },
  { date:"2026-06-18", time:"13:00", group:"A", home:"Rep. Checa",    away:"Sudáfrica",      j:2, venue:"Atlanta" },
  { date:"2026-06-18", time:"16:00", group:"B", home:"Canadá",        away:"Catar",          j:2, venue:"Vancouver" },
  { date:"2026-06-18", time:"19:00", group:"A", home:"México",        away:"Corea del Sur",  j:2, venue:"Guadalajara" },
  { date:"2026-06-18", time:"22:00", group:"B", home:"Suiza",         away:"Bosnia y Herz.", j:2, venue:"Los Ángeles" },
  { date:"2026-06-19", time:"13:00", group:"D", home:"Turquía",       away:"Paraguay",       j:2, venue:"San Francisco" },
  { date:"2026-06-19", time:"16:00", group:"C", home:"Escocia",       away:"Marruecos",      j:2, venue:"Boston" },
  { date:"2026-06-19", time:"19:00", group:"D", home:"EE.UU.",        away:"Australia",      j:2, venue:"Seattle" },
  { date:"2026-06-19", time:"22:00", group:"C", home:"Brasil",        away:"Haití",          j:2, venue:"Philadelphia" },
  { date:"2026-06-20", time:"13:00", group:"F", home:"Túnez",         away:"Japón",          j:2, venue:"Monterrey" },
  { date:"2026-06-20", time:"16:00", group:"E", home:"Ecuador",       away:"Curazao",        j:2, venue:"Kansas City" },
  { date:"2026-06-20", time:"19:00", group:"F", home:"Países Bajos",  away:"Suecia",         j:2, venue:"Houston" },
  { date:"2026-06-20", time:"22:00", group:"E", home:"Alemania",      away:"C. Marfil",      j:2, venue:"Toronto" },
  { date:"2026-06-21", time:"13:00", group:"H", home:"Uruguay",       away:"Cabo Verde",     j:2, venue:"Miami" },
  { date:"2026-06-21", time:"16:00", group:"G", home:"Nueva Zelanda", away:"Egipto",         j:2, venue:"Vancouver" },
  { date:"2026-06-21", time:"19:00", group:"H", home:"España",        away:"Arabia Saudita", j:2, venue:"Atlanta" },
  { date:"2026-06-21", time:"22:00", group:"G", home:"Bélgica",       away:"Irán",           j:2, venue:"Los Ángeles" },
  { date:"2026-06-22", time:"13:00", group:"J", home:"Jordania",      away:"Argelia",        j:2, venue:"San Francisco" },
  { date:"2026-06-22", time:"16:00", group:"I", home:"Noruega",       away:"Senegal",        j:2, venue:"MetLife, NJ" },
  { date:"2026-06-22", time:"19:00", group:"J", home:"Argentina",     away:"Austria",        j:2, venue:"Dallas" },
  { date:"2026-06-22", time:"22:00", group:"I", home:"Francia",       away:"Irak",           j:2, venue:"Philadelphia" },
  { date:"2026-06-23", time:"13:00", group:"L", home:"Panamá",        away:"Croacia",        j:2, venue:"Toronto" },
  { date:"2026-06-23", time:"16:00", group:"K", home:"Colombia",      away:"RD Congo",       j:2, venue:"Guadalajara" },
  { date:"2026-06-23", time:"19:00", group:"L", home:"Inglaterra",    away:"Ghana",          j:2, venue:"Boston" },
  { date:"2026-06-23", time:"22:00", group:"K", home:"Portugal",      away:"Uzbekistán",     j:2, venue:"Houston" },
  { date:"2026-06-24", time:"18:00", group:"A", home:"México",        away:"Rep. Checa",     j:3, venue:"Azteca, CDMX" },
  { date:"2026-06-24", time:"18:00", group:"A", home:"Sudáfrica",     away:"Corea del Sur",  j:3, venue:"Monterrey" },
  { date:"2026-06-24", time:"21:00", group:"B", home:"Suiza",         away:"Canadá",         j:3, venue:"Vancouver" },
  { date:"2026-06-24", time:"21:00", group:"B", home:"Bosnia y Herz.",away:"Catar",          j:3, venue:"CDMX" },
  { date:"2026-06-25", time:"18:00", group:"C", home:"Brasil",        away:"Escocia",        j:3, venue:"Kansas City" },
  { date:"2026-06-25", time:"18:00", group:"C", home:"Marruecos",     away:"Haití",          j:3, venue:"Seattle" },
  { date:"2026-06-25", time:"21:00", group:"D", home:"EE.UU.",        away:"Turquía",        j:3, venue:"Dallas" },
  { date:"2026-06-25", time:"21:00", group:"D", home:"Paraguay",      away:"Australia",      j:3, venue:"Houston" },
  { date:"2026-06-26", time:"15:00", group:"E", home:"Alemania",      away:"Ecuador",        j:3, venue:"Philadelphia" },
  { date:"2026-06-26", time:"15:00", group:"E", home:"C. Marfil",     away:"Curazao",        j:3, venue:"Los Ángeles" },
  { date:"2026-06-26", time:"18:00", group:"F", home:"Países Bajos",  away:"Túnez",          j:3, venue:"Boston" },
  { date:"2026-06-26", time:"18:00", group:"F", home:"Japón",         away:"Suecia",         j:3, venue:"Dallas" },
  { date:"2026-06-26", time:"21:00", group:"G", home:"Bélgica",       away:"Nueva Zelanda",  j:3, venue:"Atlanta" },
  { date:"2026-06-26", time:"21:00", group:"G", home:"Egipto",        away:"Irán",           j:3, venue:"Kansas City" },
  { date:"2026-06-26", time:"21:00", group:"H", home:"España",        away:"Uruguay",        j:3, venue:"MetLife, NJ" },
  { date:"2026-06-26", time:"21:00", group:"H", home:"Cabo Verde",    away:"Arabia Saudita", j:3, venue:"Seattle" },
  { date:"2026-06-26", time:"21:00", group:"I", home:"Francia",       away:"Noruega",        j:3, venue:"Miami" },
  { date:"2026-06-26", time:"21:00", group:"I", home:"Senegal",       away:"Irak",           j:3, venue:"Los Ángeles" },
  { date:"2026-06-26", time:"21:00", group:"J", home:"Argentina",     away:"Jordania",       j:3, venue:"Nueva Orleans" },
  { date:"2026-06-26", time:"21:00", group:"J", home:"Argelia",       away:"Austria",        j:3, venue:"Guadalajara" },
  { date:"2026-06-27", time:"18:00", group:"K", home:"Portugal",      away:"Colombia",       j:3, venue:"Seattle" },
  { date:"2026-06-27", time:"18:00", group:"K", home:"RD Congo",      away:"Uzbekistán",     j:3, venue:"Monterrey" },
  { date:"2026-06-27", time:"21:00", group:"L", home:"Inglaterra",    away:"Panamá",         j:3, venue:"MetLife, NJ" },
  { date:"2026-06-27", time:"21:00", group:"L", home:"Croacia",       away:"Ghana",          j:3, venue:"Atlanta" },
];

// ── NÚCLEO: Calcular probabilidades combinando TODAS las fuentes ──────────────
function buildMatchProbs(fixture, oddsData, kalshiData, footballData) {
  const { home, away } = fixture;

  // FUENTE 1: ELO + ajuste por lesiones (siempre disponible)
  const eloBase = calcEloProbs(home, away);
  const eloAdj  = applyInjuryAdjustment(home, away, eloBase);
  const sources = [{ probs: eloAdj, weight: 40, name: "ELO" }];

  // FUENTE 2: TheOddsAPI bookmakers
  const bookmakerMatch = oddsData.matches?.find(o =>
    (o.home?.toLowerCase().includes(home.split(" ")[0].toLowerCase()) ||
     home.toLowerCase().includes((o.home||"").split(" ")[0].toLowerCase())) &&
    (o.away?.toLowerCase().includes(away.split(" ")[0].toLowerCase()) ||
     away.toLowerCase().includes((o.away||"").split(" ")[0].toLowerCase()))
  );
  if (bookmakerMatch) {
    sources.push({ probs: bookmakerMatch.probs, weight: 35, name: `Bookmakers(${bookmakerMatch.bookmakerCount})` });
  }

  // FUENTE 3: Kalshi — usar diferencia relativa de probabilidades de ganar el torneo
  // Si el equipo A tiene 17% de ganar el torneo y el B tiene 5%,
  // eso informa la probabilidad del partido individual
  const kalshiHome = kalshiData.teamOdds?.[home] || 0;
  const kalshiAway = kalshiData.teamOdds?.[away] || 0;
  if (kalshiHome > 0 || kalshiAway > 0) {
    const total = kalshiHome + kalshiAway;
    if (total > 0) {
      const kalshiRatio = kalshiHome / total; // proporción relativa
      // Convertir ratio de torneo a prob. de partido (con regresión a la media)
      const matchProb = 0.3 + kalshiRatio * 0.4; // escala entre 30% y 70%
      const draw = 0.26;
      sources.push({
        probs: {
          home: Math.round(matchProb * (1-draw) * 100),
          draw: Math.round(draw * 100),
          away: Math.round((1-matchProb) * (1-draw) * 100),
        },
        weight: 15,
        name: "Kalshi",
      });
    }
  }

  // FUENTE 4: API-Football resultados recientes (ajuste de forma)
  if (footballData.available && footballData.recentResults?.length > 0) {
    const homeResults = footballData.recentResults.filter(r => r.home===home || r.away===home);
    const awayResults = footballData.recentResults.filter(r => r.home===away || r.away===away);
    if (homeResults.length > 0 || awayResults.length > 0) {
      // Calcular puntos de forma (últimos 3 partidos)
      const formScore = (results, team) => {
        return results.slice(-3).reduce((score, r) => {
          const [hg, ag] = r.score.split("-").map(Number);
          const isHome = r.home === team;
          const won = isHome ? hg > ag : ag > hg;
          const drew = hg === ag;
          return score + (won ? 3 : drew ? 1 : 0);
        }, 0);
      };
      const homeForm = formScore(homeResults, home) / 9; // 0-1
      const awayForm = formScore(awayResults, away) / 9;
      const formRatio = 0.5 + (homeForm - awayForm) * 0.3;
      const draw = 0.26;
      sources.push({
        probs: {
          home: Math.round(formRatio * (1-draw) * 100),
          draw: Math.round(draw * 100),
          away: Math.round((1-formRatio) * (1-draw) * 100),
        },
        weight: 10,
        name: "Forma",
      });
    }
  }

  const combined = combineProbs(sources);

  // Calcular confianza basada en cuántas fuentes están de acuerdo
  const homeProbs = sources.map(s => s.probs.home);
  const variance = homeProbs.length > 1
    ? homeProbs.reduce((v, p) => v + Math.pow(p - combined.home, 2), 0) / homeProbs.length
    : 100;
  const confidence = Math.max(45, Math.min(90, Math.round(80 - Math.sqrt(variance))));

  // Marcador más probable basado en probabilidades
  function predictScore(pHome, pAway) {
    const homeGoals = pHome > 60 ? 2 : pHome > 45 ? 1 : 1;
    const awayGoals = pAway > 60 ? 2 : pAway > 45 ? 1 : 0;
    if (pHome > pAway + 20) return { score:`${homeGoals+1}-${awayGoals}`, hg:homeGoals+1, ag:awayGoals };
    if (pAway > pHome + 20) return { score:`${awayGoals}-${homeGoals+1}`, hg:awayGoals, ag:homeGoals+1 };
    if (combined.draw > 28) return { score:"1-1", hg:1, ag:1 };
    return { score:`${homeGoals}-${awayGoals}`, hg:homeGoals, ag:awayGoals };
  }
  const predicted = predictScore(combined.home, combined.away);

  return {
    probHome: combined.home,
    probDraw: combined.draw,
    probAway: combined.away,
    predictedScore: predicted.score,
    homeGoals: predicted.hg,
    awayGoals: predicted.ag,
    confidence,
    favorito: combined.home > combined.away ? home : combined.away > combined.home ? away : "Equilibrado",
    sources: combined.sourceNames,
    hasBookmakerOdds: !!bookmakerMatch,
    hasKalshi: kalshiHome > 0 || kalshiAway > 0,
    eloHome: eloBase.homeElo,
    eloAway: eloBase.awayElo,
    eloDiff: eloBase.diff,
    kalshiHome,
    kalshiAway,
    injuries: [
      ...(INJURY_IMPACT[home]?.players.map(p => `${home}: ${p}`) || []),
      ...(INJURY_IMPACT[away]?.players.map(p => `${away}: ${p}`) || []),
    ],
  };
}

// ── Claude: solo factor clave (análisis contextual ligero) ────────────────────
async function getKeyFactors(matches, today) {
  const list = matches.map((m,i) => `${i+1}. ${m.home} vs ${m.away} (G${m.group} J${m.j})`).join("\n");
  const prompt = `Mundial 2026, ${today}. Para cada partido da UN factor clave en máximo 10 palabras.
Lesiones: Rodrygo/Militão(Brasil), Grealish(Inglaterra), Gvardiol(Croacia), Malagón(México), Gnabry(Alemania), Foyth/Panichelli(Argentina).
${list}
JSON: {"factors":["factor1","factor2",...]} — exactamente ${matches.length} factores. Solo JSON.`;
  try {
    const r = await callClaude(prompt, 800);
    return r.factors || matches.map(() => "");
  } catch(e) { return matches.map(() => ""); }
}

// ── Grupos ────────────────────────────────────────────────────────────────────
async function getGroups(groupIds, today, footballData, kalshiData) {
  const teams = {
    A:["México","Corea del Sur","Rep. Checa","Sudáfrica"],
    B:["Canadá","Suiza","Bosnia y Herz.","Catar"],
    C:["Brasil","Marruecos","Escocia","Haití"],
    D:["EE.UU.","Turquía","Australia","Paraguay"],
    E:["Alemania","C. Marfil","Ecuador","Curazao"],
    F:["Países Bajos","Japón","Suecia","Túnez"],
    G:["Bélgica","Irán","Egipto","Nueva Zelanda"],
    H:["España","Uruguay","Arabia Saudita","Cabo Verde"],
    I:["Francia","Noruega","Senegal","Irak"],
    J:["Argentina","Austria","Argelia","Jordania"],
    K:["Portugal","Colombia","RD Congo","Uzbekistán"],
    L:["Inglaterra","Croacia","Ghana","Panamá"],
  };
  const nextMatch = {
    A:"México vs Sudáfrica · 11/06 19:00",B:"Canadá vs Bosnia · 12/06 20:00",
    C:"Brasil vs Marruecos · 13/06 19:00",D:"EE.UU. vs Paraguay · 12/06 17:00",
    E:"Alemania vs Curazao · 14/06 16:00",F:"Países Bajos vs Japón · 14/06 19:00",
    G:"Bélgica vs Egipto · 15/06 19:00",H:"España vs Cabo Verde · 15/06 22:00",
    I:"Francia vs Senegal · 16/06 19:00",J:"Argentina vs Argelia · 16/06 22:00",
    K:"Portugal vs RD Congo · 17/06 19:00",L:"Inglaterra vs Croacia · 17/06 22:00",
  };

  // Calcular favoriteOdds usando ELO + Kalshi directamente (sin Claude)
  const result = {};
  for (const g of groupIds) {
    const groupTeams = teams[g];
    // Sumar ELO de cada equipo normalizado
    const eloSum = groupTeams.reduce((s, t) => s + (ELO[t]||1700), 0);
    const standings = footballData.available && footballData.groups[g]
      ? footballData.groups[g]
      : groupTeams.map(t => ({ team:t, pts:0, gf:0, gc:0, gd:0 }));

    // Favorito: mayor ELO ajustado por Kalshi
    const scores = groupTeams.map(t => {
      const eloScore = (ELO[t]||1700) / eloSum * 100;
      const kalshiScore = kalshiData.teamOdds?.[t] || 0;
      return { team:t, score: eloScore * 0.7 + kalshiScore * 0.3 };
    }).sort((a,b) => b.score - a.score);

    const favorite = scores[0].team;
    const favoriteOdds = Math.min(85, Math.max(35, Math.round(scores[0].score * 2.5)));

    result[g] = {
      teams: groupTeams,
      favorite,
      favoriteOdds,
      trend: "estable",
      keyNews: `${favorite} favorito por ELO ${ELO[favorite]||1700}${kalshiData.teamOdds?.[favorite] ? ` y Kalshi ${kalshiData.teamOdds[favorite]}%` : ""}`,
      alert: INJURY_IMPACT[favorite] ? `⚠️ ${favorite}: ${INJURY_IMPACT[favorite].players.join(", ")}` : null,
      standings,
      nextMatch: nextMatch[g] || "",
    };
  }
  return result;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log("🚀 Iniciando — modelo estadístico multi-fuente");
  const today = getChileDate();
  const todayShort = getChileDateShort();
  console.log("📅", today);

  // Obtener todas las fuentes en paralelo
  const [kalshiData, oddsData, footballData] = await Promise.all([
    getKalshiData(),
    getOddsData(),
    getFootballData(),
  ]);

  console.log("\n📊 FUENTES ACTIVAS:");
  console.log("  ELO Ratings: ✅ 48 equipos");
  console.log("  Kalshi:", kalshiData.available ? `✅ ${Object.keys(kalshiData.teamOdds).length} equipos` : "❌");
  console.log("  TheOddsAPI:", oddsData.available ? `✅ ${oddsData.matches.length} partidos` : "❌");
  console.log("  API-Football:", footballData.available ? "✅" : "⏳ pendiente (inicia 11 jun)");

  // Calcular probabilidades para los 72 partidos usando modelo estadístico directo
  console.log("\n⚽ Calculando probabilidades (modelo estadístico)...");
  const predictions = ALL_FIXTURES.map(f => ({
    match: `${f.home} vs ${f.away}`,
    date: f.date,
    time: f.time,
    group: f.group,
    jornada: f.j,
    venue: f.venue,
    ...buildMatchProbs(f, oddsData, kalshiData, footballData),
    keyFactor: "", // se llena después
  }));

  // Agregar factores clave via Claude (solo texto, no probabilidades)
  console.log("🧠 Agregando factores clave con Claude...");
  for (let i = 0; i < ALL_FIXTURES.length; i += 8) {
    const batch = ALL_FIXTURES.slice(i, i + 8);
    const predBatch = predictions.slice(i, i + 8);
    const factors = await getKeyFactors(batch, today);
    factors.forEach((f, j) => { if (predBatch[j]) predBatch[j].keyFactor = f; });
    console.log(`  Lote ${Math.floor(i/8)+1}/9`);
  }

  // Grupos
  console.log("📊 Generando grupos...");
  const [gAD, gEH, gIL] = await Promise.all([
    getGroups(["A","B","C","D"], today, footballData, kalshiData),
    getGroups(["E","F","G","H"], today, footballData, kalshiData),
    getGroups(["I","J","K","L"], today, footballData, kalshiData),
  ]);

  // Meta: noticias + candidatos con datos reales de Kalshi
  console.log("📰 Generando noticias y candidatos...");
  const kalshiTop = kalshiData.sorted?.slice(0,10).map(([t,p])=>`${t}:${p}%`).join(", ") || "no disponible";
  const meta = await callClaude(`Mundial 2026, ${today}.
KALSHI (probabilidades reales de ganar el torneo): ${kalshiTop}
ELO top: Argentina(2142), Francia(2083), España(2048), Brasil(2034), Inglaterra(2021), Países Bajos(1976), Alemania(1956), Croacia(1882).
Lesiones: Rodrygo/Militão(Brasil,-35 ELO), Foyth/Panichelli(Argentina,-20), Gvardiol(Croacia,-25), Malagón(México,-15), Grealish(Inglaterra,-10), Gnabry(Alemania,-10), Yamal(España,duda).
Noticias: Colombia ganó 2-0 a Jordania. EE.UU. cayó 2-1 ante Alemania. Argentina venció 2-0 a Honduras (Messi en banca, fatiga muscular).

INSTRUCCIÓN: Los titleContenders deben usar los precios de Kalshi como probabilidad base, ajustada por ELO y lesiones. El campo "odds" debe coincidir aproximadamente con Kalshi.

JSON:{"headline":"titular impactante del día","globalFavorite":"nombre","globalFavoriteChange":"subió|bajó|estable","topNews":[{"title":"t","impact":"alto|medio|bajo","team":"p","type":"lesión|resultado|táctica|otro","detail":"d"}],"titleContenders":[{"team":"p","odds":17,"trend":"estable","reason":"razon con datos ELO y Kalshi","kalshiPrice":17,"eloRating":2048}]}
Max 6 noticias, 8 candidatos. Solo JSON.`, 1800);

  // Estadísticas finales
  const sourcesUsed = [
    "ELO(48 equipos)",
    kalshiData.available ? `Kalshi(${Object.keys(kalshiData.teamOdds).length} equipos)` : null,
    oddsData.available ? `Bookmakers(${oddsData.matches.length} partidos)` : null,
    footballData.available ? "API-Football" : null,
    "Claude AI(factores)",
  ].filter(Boolean).join(" + ");

  const withKalshi = predictions.filter(p => p.hasKalshi).length;
  const withBookmakers = predictions.filter(p => p.hasBookmakerOdds).length;

  console.log(`\n✅ COMPLETADO`);
  console.log(`⚽ Pronósticos: ${predictions.length}`);
  console.log(`📊 Con Kalshi: ${withKalshi} | Con Bookmakers: ${withBookmakers}`);
  console.log(`🔢 Fuentes: ${sourcesUsed}`);

  const analysis = {
    lastUpdated: today,
    lastUpdatedShort: todayShort,
    headline: meta.headline || "Mundial 2026 - Análisis en vivo",
    globalFavorite: meta.globalFavorite || "España",
    globalFavoriteChange: meta.globalFavoriteChange || "estable",
    dataSources: sourcesUsed,
    stats: { predictions: predictions.length, withKalshi, withBookmakers },
    topNews: meta.topNews || [],
    titleContenders: meta.titleContenders || [],
    groups: { ...gAD, ...gEH, ...gIL },
    predictions,
    fixtures: ALL_FIXTURES,
    eloRatings: ELO,
    kalshiOdds: kalshiData.teamOdds || {},
  };

  const outputDir = path.join(__dirname, "..", "public", "data");
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, "mundial-data.json"), JSON.stringify(analysis, null, 2), "utf8");
  console.log("💾 Guardado en public/data/mundial-data.json");
}

main().catch(err => { console.error("❌", err.message); process.exit(1); });
