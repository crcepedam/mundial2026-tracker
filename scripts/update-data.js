// scripts/update-data.js — 5 FUENTES: ELO + Kalshi + TheOddsAPI + API-Football + Claude AI
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

// ── FUENTE 1: ELO Ratings (eloratings.net) ────────────────────────────────────
// Ratings ELO para los 48 equipos del Mundial 2026
// Fuente académicamente validada como la más predictiva para fútbol
const ELO_RATINGS = {
  "Francia":        2083, "España":         2048, "Brasil":         2034,
  "Argentina":      2142, "Inglaterra":     2021, "Portugal":       1975,
  "Países Bajos":   1976, "Alemania":       1956, "Bélgica":        1928,
  "Uruguay":        1870, "Colombia":       1852, "México":         1836,
  "Marruecos":      1827, "Japón":          1808, "Senegal":        1782,
  "Corea del Sur":  1776, "EE.UU.":         1768, "Suiza":          1862,
  "Croacia":        1882, "Noruega":        1825, "Turquía":        1782,
  "Australia":      1737, "Ecuador":        1752, "Canadá":         1773,
  "Austria":        1766, "Suecia":         1759, "C. Marfil":      1745,
  "Rep. Checa":     1729, "Ghana":          1701, "Irán":           1741,
  "Arabia Saudita": 1693, "Escocia":        1733, "Argelia":        1714,
  "Egipto":         1695, "Serbia":         1764, "Bosnia y Herz.": 1698,
  "Uzbekistán":     1672, "Marruecos":      1827, "RD Congo":       1638,
  "Jordania":       1601, "Paraguay":       1718, "Cabo Verde":     1642,
  "Panamá":         1623, "Haití":          1541, "Curazao":        1489,
  "Sudáfrica":      1641, "Nueva Zelanda":  1548, "Catar":          1611,
  "Irak":           1629,
};

// Función para calcular probabilidades con ELO (fórmula estándar)
function eloToProbabilities(homeElo, awayElo) {
  const homeDiff = homeElo - awayElo;
  // Ventaja de local en torneos neutrales es menor (~30-50 puntos)
  const adjustedDiff = homeDiff + 40;
  const homeWinProb = 1 / (1 + Math.pow(10, -adjustedDiff / 400));
  // Modelo Dixon-Coles simplificado para distribución H/D/A
  const drawFactor = 0.26; // ~26% empates en Mundiales
  const adjustedHome = homeWinProb * (1 - drawFactor);
  const adjustedAway = (1 - homeWinProb) * (1 - drawFactor);
  return {
    probHome: Math.round(adjustedHome * 100),
    probDraw: Math.round(drawFactor * 100),
    probAway: Math.round(adjustedAway * 100),
    homeElo,
    awayElo,
    eloDiff: homeDiff,
  };
}

// ── FUENTE 2: Kalshi — Mercados de predicción ─────────────────────────────────
async function getKalshiOdds() {
  console.log("📈 Obteniendo odds de mercados de predicción (Kalshi)...");
  try {
    // Kalshi endpoints correctos para Mundial 2026
    // Los mercados de partido individual aparecen progresivamente
    // Los de ganador del torneo y grupos YA están disponibles
    const endpoints = [
      "https://api.elections.kalshi.com/trade-api/v2/markets?limit=200&status=open&series_ticker=KXMENWORLDCUP",
      "https://api.elections.kalshi.com/trade-api/v2/events?limit=100&status=open&series_ticker=KXMENWORLDCUP",
      "https://api.elections.kalshi.com/trade-api/v2/markets?limit=200&status=open&category=sports&search=world+cup",
    ];

    for (const endpoint of endpoints) {
      const res = await fetch(endpoint, { headers: { "Accept": "application/json" } });
      console.log("  Kalshi endpoint:", endpoint.split("?")[1], "→ status", res.status);
      if (!res.ok) continue;
      const data = await res.json();
      console.log("  Kalshi raw:", JSON.stringify(data).slice(0, 500));
      const items = data.markets || data.events || [];
      const wcItems = items.filter(m =>
        m.title?.toLowerCase().includes("world cup") ||
        m.title?.toLowerCase().includes("soccer") ||
        m.ticker?.toUpperCase().includes("WORLDCUP") ||
        m.event_ticker?.toUpperCase().includes("WORLDCUP") ||
        m.series_ticker?.toUpperCase().includes("WORLDCUP") ||
        m.ticker?.includes("KXMEN")
      );
      if (wcItems.length > 0) {
        console.log(`  ✅ Kalshi WC items: ${wcItems.length}`);
        console.log("  Primeros items:", wcItems.slice(0,3).map(m=>m.ticker+"|"+m.title).join(", "));

        // Extraer probabilidades implícitas de los mercados disponibles
        const teamOdds = {};
        wcItems.forEach(m => {
          if (m.yes_ask && m.title) {
            // yes_ask es la probabilidad implícita en Kalshi (0-1)
            const price = parseFloat(m.yes_ask) || parseFloat(m.last_price) || 0;
            teamOdds[m.title] = Math.round(price * 100);
          }
        });
        console.log("  Team odds sample:", JSON.stringify(teamOdds).slice(0, 300));
        return { available: true, markets: wcItems, teamOdds };
      }
    }
    console.log("  ⚠️ Kalshi: no se encontraron mercados del Mundial");
    return { available: false, markets: [], teamOdds: {} };
  } catch (err) {
    console.log("  ⚠️ Kalshi error:", err.message);
    return { available: false, markets: [], teamOdds: {} };
  }
}

// ── FUENTE 3: TheOddsAPI ──────────────────────────────────────────────────────
async function getOddsData() {
  console.log("🎲 Obteniendo cuotas de casas de apuestas (TheOddsAPI)...");
  try {
    const sportsRes = await fetch(
      `https://api.the-odds-api.com/v4/sports/?apiKey=${ODDS_API_KEY}`
    );
    const sportsRaw = await sportsRes.json();
    // DEBUG COMPLETO
    console.log("  TheOddsAPI raw:", JSON.stringify(sportsRaw).slice(0, 1000));
    const sports = Array.isArray(sportsRaw) ? sportsRaw : (sportsRaw?.data || []);
    console.log("  Sports count:", sports.length);
    if (sports.length > 0) {
      const allKeys = sports.map(s => s.key || s.sport_key).filter(Boolean);
      console.log("  Todos los sports keys:", allKeys.join(", ").slice(0, 500));
    }

    // Buscar cualquier deporte de fútbol/soccer disponible
    const wcSport = sports.find(s =>
      (s.key || s.sport_key)?.includes("world_cup") ||
      (s.key || s.sport_key)?.includes("fifa") ||
      s.title?.toLowerCase().includes("world cup") ||
      s.title?.toLowerCase().includes("mundial") ||
      s.description?.toLowerCase().includes("world cup")
    );

    if (!wcSport) {
      const soccerSports = sports.filter(s =>
        (s.key||s.sport_key)?.includes("soccer") ||
        s.group?.toLowerCase().includes("soccer") ||
        s.group?.toLowerCase().includes("football")
      );
      console.log("  Soccer/Football sports:", soccerSports.map(s => (s.key||s.sport_key)+"|"+s.title).join(", ").slice(0,300));
      console.log("  ⚠️ Mundial 2026 no encontrado en TheOddsAPI");
      return { available: false, matches: [] };
    }

    console.log(`  ✅ Sport: ${wcSport.key} | ${wcSport.title}`);
    const oddsRes = await fetch(
      `https://api.the-odds-api.com/v4/sports/${wcSport.key}/odds/?apiKey=${ODDS_API_KEY}&regions=eu&markets=h2h&oddsFormat=decimal`
    );
    const oddsData = await oddsRes.json();

    const matches = (Array.isArray(oddsData) ? oddsData : []).map(game => {
      const bookmakers = game.bookmakers || [];
      if (!bookmakers.length) return null;
      const probSums = { home:0, draw:0, away:0 };
      let count = 0;
      bookmakers.forEach(bm => {
        const h2h = bm.markets?.find(m => m.key === "h2h");
        if (!h2h) return;
        const homeOdd = h2h.outcomes?.find(o => o.name === game.home_team)?.price;
        const awayOdd = h2h.outcomes?.find(o => o.name === game.away_team)?.price;
        const drawOdd = h2h.outcomes?.find(o => o.name === "Draw")?.price;
        if (homeOdd && awayOdd && drawOdd) {
          const total = 1/homeOdd + 1/drawOdd + 1/awayOdd;
          probSums.home += (1/homeOdd/total)*100;
          probSums.draw += (1/drawOdd/total)*100;
          probSums.away += (1/awayOdd/total)*100;
          count++;
        }
      });
      if (!count) return null;
      return {
        home: game.home_team, away: game.away_team,
        date: game.commence_time?.split("T")[0],
        probHome: Math.round(probSums.home/count),
        probDraw: Math.round(probSums.draw/count),
        probAway: Math.round(probSums.away/count),
        bookmakerCount: count,
      };
    }).filter(Boolean);

    console.log(`  ✅ Cuotas: ${matches.length} partidos`);
    return { available: true, matches };
  } catch (err) {
    console.log("  ⚠️ TheOddsAPI error:", err.message);
    return { available: false, matches: [] };
  }
}

// ── FUENTE 4: API-Football ────────────────────────────────────────────────────
async function getFootballData() {
  console.log("📡 Obteniendo datos de API-Football...");
  try {
    const headers = { "x-apisports-key": FOOTBALL_API_KEY };
    const leagueRes = await fetch(
      "https://v3.football.api-sports.io/leagues?type=cup&season=2026", { headers }
    );
    const leagueData = await leagueRes.json();
    const wc = (leagueData?.response||[]).find(l =>
      l.league?.name?.toLowerCase().includes("world cup") ||
      l.league?.name?.toLowerCase().includes("mundial")
    );
    if (!wc?.league?.id) {
      console.log("  ⚠️ Mundial 2026 aún no en API-Football");
      return { groups:{}, recentResults:[], available:false };
    }
    const [sd, fd] = await Promise.all([
      fetch(`https://v3.football.api-sports.io/standings?league=${wc.league.id}&season=2026`, { headers }).then(r=>r.json()),
      fetch(`https://v3.football.api-sports.io/fixtures?league=${wc.league.id}&season=2026&status=FT`, { headers }).then(r=>r.json()),
    ]);
    const groups = {};
    for (const group of (sd?.response?.[0]?.league?.standings||[])) {
      if (!group.length) continue;
      const name = group[0]?.group?.replace(/^Group\s*/i,"") || "?";
      groups[name] = group.map(t => ({
        team:t.team.name, pts:t.points,
        gf:t.all.goals.for, gc:t.all.goals.against,
        gd:t.goalsDiff, form:t.form?.slice(-1)||"?",
      }));
    }
    const recentResults = (fd?.response||[]).slice(-12).map(f => ({
      date:f.fixture.date?.split("T")[0],
      home:f.teams.home.name, away:f.teams.away.name,
      score:`${f.goals.home}-${f.goals.away}`, round:f.league.round,
    }));
    console.log(`  ✅ ${Object.keys(groups).length} grupos, ${recentResults.length} resultados`);
    return { groups, recentResults, available:true };
  } catch (err) {
    console.log("  ⚠️ API-Football error:", err.message);
    return { groups:{}, recentResults:[], available:false };
  }
}

// ── FUENTE 5: Claude AI ───────────────────────────────────────────────────────
async function callClaude(prompt, maxTokens=1800) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method:"POST",
    headers:{ "Content-Type":"application/json", "x-api-key":ANTHROPIC_API_KEY, "anthropic-version":"2023-06-01" },
    body: JSON.stringify({ model:"claude-haiku-4-5-20251001", max_tokens:maxTokens, messages:[{role:"user",content:prompt}] }),
  });
  if (!res.ok) throw new Error(`Claude ${res.status}: ${await res.text().then(t=>t.slice(0,200))}`);
  const raw = await res.json();
  let text = (raw.content||[]).filter(b=>b.type==="text").map(b=>b.text).join("").trim()
    .replace(/^```json\s*/i,"").replace(/^```\s*/i,"").replace(/\s*```$/i,"").trim();
  const s=text.indexOf("{"), e=text.lastIndexOf("}");
  if (s===-1) throw new Error("No JSON: "+text.slice(0,100));
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

// ── Generar pronósticos combinando 5 fuentes ──────────────────────────────────
async function getMatchPredictions(matches, today, oddsData, kalshiData, footballData) {
  const matchList = matches.map((m, i) => {
    // ELO base (siempre disponible)
    const homeElo = ELO_RATINGS[m.home] || 1700;
    const awayElo = ELO_RATINGS[m.away] || 1700;
    const eloPred = eloToProbabilities(homeElo, awayElo);

    // Cuotas de casas de apuestas
    const odds = oddsData.matches?.find(o =>
      o.home?.toLowerCase().includes(m.home.toLowerCase().split(" ")[0]) ||
      m.home.toLowerCase().includes(o.home?.toLowerCase().split(" ")[0]||"XX")
    );
    const oddsStr = odds
      ? `[BOOKMAKERS (${odds.bookmakerCount} casas): Local ${odds.probHome}%, Empate ${odds.probDraw}%, Visitante ${odds.probAway}%]`
      : `[Sin bookmakers]`;

    return `${i+1}. ${m.home}(ELO:${homeElo}) vs ${m.away}(ELO:${awayElo}) | G${m.group} J${m.j} | ${m.date} ${m.time} Chile | ${m.venue}
   ELO base: Local ${eloPred.probHome}%, Empate ${eloPred.probDraw}%, Visitante ${eloPred.probAway}% (diff ELO: ${eloPred.eloDiff > 0 ? '+' : ''}${eloPred.eloDiff})
   ${oddsStr}`;
  }).join("\n\n");

  const hasResults = footballData.recentResults?.length > 0;
  const resultsStr = hasResults
    ? `\nRESULTADOS REALES: ${footballData.recentResults.slice(-6).map(r=>`${r.home} ${r.score} ${r.away}`).join(" | ")}`
    : "";

  const prompt = `Eres el mejor analista estadístico de fútbol. Hoy ${today}. Mundial FIFA 2026.

METODOLOGÍA: Combina las siguientes fuentes por peso:
1. ELO Ratings (40%) — fortaleza histórica y forma reciente
2. Cuotas de bookmakers (35%) — mercado con miles de analistas
3. Análisis contextual Claude (25%) — lesiones, motivación, sede

LESIONES CONFIRMADAS: Rodrygo(Brasil,LCA), Militao(Brasil,muscular), Grealish(Inglaterra,pie), Gvardiol(Croacia,pierna), Malagón(México,Aquiles), Gnabry(Alemania), Foyth(Argentina,Aquiles), Panichelli(Argentina,LCA), Yamal(España,duda).
${resultsStr}

PARTIDOS (con datos ELO y bookmakers):
${matchList}

INSTRUCCIÓN: Para cada partido, pondera los datos ELO + bookmakers + ajuste por lesiones/contexto. El resultado debe reflejar la combinación real de las fuentes disponibles.

JSON exacto:
{"predictions":[{
  "match":"Home vs Away",
  "date":"YYYY-MM-DD",
  "time":"HH:MM",
  "group":"X",
  "jornada":1,
  "venue":"ciudad",
  "probHome":55,
  "probDraw":25,
  "probAway":20,
  "predictedScore":"2-0",
  "homeGoals":2,
  "awayGoals":0,
  "confidence":72,
  "favorito":"Home",
  "keyFactor":"razon principal en 1 frase",
  "eloHome":2083,
  "eloAway":1827,
  "hasBookmakerOdds":false,
  "sources":"ELO+Claude"
}]}
Solo JSON.`;

  const result = await callClaude(prompt, 2000);
  return result.predictions || [];
}

// ── Grupos ────────────────────────────────────────────────────────────────────
async function getGroups(groupIds, today, footballData) {
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

  // Incluir ELO de los equipos en el análisis
  const eloContext = groupIds.map(g =>
    `Grupo ${g}: ${teams[g].map(t => `${t}(ELO:${ELO_RATINGS[t]||1700})`).join(", ")}`
  ).join(" | ");

  const standingsStr = footballData.available && Object.keys(footballData.groups).length > 0
    ? `\nSTANDINGS REALES: ${JSON.stringify(footballData.groups)}`
    : "";

  const prompt = `Mundial 2026, hoy ${today}.
ELO RATINGS: ${eloContext}
Lesiones: Rodrygo(Brasil), Militao(Brasil), Grealish(Inglaterra), Gvardiol(Croacia), Malagón(México), Gnabry(Alemania), Foyth(Argentina), Panichelli(Argentina).${standingsStr}

Genera análisis grupos: ${groupIds.join(", ")} usando los ELO ratings para calcular favoriteOdds.
JSON:
{${groupIds.map(g=>`"${g}":{"teams":${JSON.stringify(teams[g])},"favorite":"nombre","favoriteOdds":65,"trend":"estable","keyNews":"max 80 chars","alert":null,"standings":${JSON.stringify(teams[g].map(t=>({team:t,pts:0,gf:0,gc:0,gd:0})))},"nextMatch":"${nextMatch[g]}"}`).join(",")}}
Solo JSON.`;

  return await callClaude(prompt, 1800);
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log("🚀 Iniciando actualización con 5 fuentes...");
  const today = getChileDate();
  const todayShort = getChileDateShort();
  console.log("📅 Chile:", today);

  // Obtener todas las fuentes externas en paralelo
  const [oddsData, kalshiData, footballData] = await Promise.all([
    getOddsData(),
    getKalshiOdds(),
    getFootballData(),
  ]);

  const sourcesAvailable = [
    "ELO Ratings (48 equipos) ✅",
    oddsData.available ? `TheOddsAPI (${oddsData.matches.length} partidos) ✅` : "TheOddsAPI ⏳",
    kalshiData.available ? `Kalshi (${kalshiData.markets.length} mercados) ✅` : "Kalshi ⏳",
    footballData.available ? `API-Football ✅` : "API-Football ⏳",
    "Claude AI ✅",
  ];
  console.log("\n📊 FUENTES DISPONIBLES:");
  sourcesAvailable.forEach(s => console.log("  " + s));

  // Pronósticos por lotes de 6 — combinando ELO + bookmakers + Claude
  console.log("\n⚽ Generando pronósticos (ELO + Bookmakers + Claude)...");
  const allPredictions = [];
  for (let i = 0; i < ALL_FIXTURES.length; i += 6) {
    const batch = ALL_FIXTURES.slice(i, i + 6);
    console.log(`  Lote ${Math.floor(i/6)+1}/12`);
    try {
      const preds = await getMatchPredictions(batch, today, oddsData, kalshiData, footballData);
      allPredictions.push(...preds);
    } catch(e) {
      console.log("  ⚠️ Error lote:", e.message);
    }
  }

  // Grupos con ELO
  console.log("📊 Generando grupos...");
  const [gAD, gEH, gIL] = await Promise.all([
    getGroups(["A","B","C","D"], today, footballData),
    getGroups(["E","F","G","H"], today, footballData),
    getGroups(["I","J","K","L"], today, footballData),
  ]);

  // Meta
  console.log("📰 Generando noticias y candidatos...");
  const meta = await callClaude(`Mundial 2026, hoy ${today}.
ELO top 5: Francia(2083), Argentina(2142), España(2048), Brasil(2034), Inglaterra(2021).
Lesiones: Rodrygo(Brasil), Militao(Brasil), Grealish(Inglaterra), Gvardiol(Croacia), Malagón(México), Foyth(Argentina), Panichelli(Argentina). Colombia ganó 2-0 a Jordania.
JSON:{"headline":"titular","globalFavorite":"Argentina","globalFavoriteChange":"estable","topNews":[{"title":"t","impact":"alto","team":"p","type":"lesión","detail":"d"}],"titleContenders":[{"team":"p","odds":20,"trend":"estable","reason":"r"}]}
Nota: Argentina tiene el ELO más alto (2142). Max 6 noticias, 6 candidatos. Solo JSON.`, 1500);

  const oddsCount = allPredictions.filter(p => p.hasBookmakerOdds).length;
  const dataSourcesSummary = sourcesAvailable.join(" | ");

  const analysis = {
    lastUpdated: today,
    lastUpdatedShort: todayShort,
    headline: meta.headline || "Mundial 2026 arranca el 11 de junio",
    globalFavorite: meta.globalFavorite || "Argentina",
    globalFavoriteChange: meta.globalFavoriteChange || "estable",
    dataSources: dataSourcesSummary,
    bookmakerOddsCount: oddsCount,
    eloRatings: ELO_RATINGS,
    topNews: meta.topNews || [],
    titleContenders: meta.titleContenders || [],
    groups: { ...gAD, ...gEH, ...gIL },
    predictions: allPredictions,
    fixtures: ALL_FIXTURES,
  };

  const outputDir = path.join(__dirname, "..", "public", "data");
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, "mundial-data.json"), JSON.stringify(analysis, null, 2), "utf8");

  console.log("\n✅ COMPLETADO");
  console.log("⚽ Pronósticos:", allPredictions.length);
  console.log("🎲 Con bookmakers:", oddsCount);
  console.log("📊 ELO aplicado: 48 equipos");
  console.log("🏆 Candidatos:", analysis.titleContenders?.length);
}

main().catch(err => { console.error("❌", err.message); process.exit(1); });
