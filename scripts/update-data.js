// scripts/update-data.js — MODELO ESTADÍSTICO COMPLETO v4
// ELO + TheOddsAPI(cuotas reales) + Kalshi(mercado predicción) + API-Football + Claude
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

// ── TABLA DE TRADUCCIÓN: nombres español ↔ inglés ─────────────────────────────
// Necesaria para hacer match entre nuestros datos y los de APIs en inglés
const ES_TO_EN = {
  "Francia":"France","España":"Spain","Brasil":"Brazil","Argentina":"Argentina",
  "Inglaterra":"England","Portugal":"Portugal","Países Bajos":"Netherlands",
  "Alemania":"Germany","Bélgica":"Belgium","Suiza":"Switzerland","Croacia":"Croatia",
  "Uruguay":"Uruguay","Colombia":"Colombia","Noruega":"Norway","México":"Mexico",
  "Marruecos":"Morocco","Japón":"Japan","Senegal":"Senegal","Corea del Sur":"South Korea",
  "EE.UU.":"USA","Turquía":"Turkey","Austria":"Austria","Suecia":"Sweden",
  "Ecuador":"Ecuador","Rep. Checa":"Czech Republic","Australia":"Australia",
  "C. Marfil":"Ivory Coast","Irán":"Iran","Escocia":"Scotland","Argelia":"Algeria",
  "Canadá":"Canada","Egipto":"Egypt","Bosnia y Herz.":"Bosnia and Herzegovina",
  "Paraguay":"Paraguay","Ghana":"Ghana","Arabia Saudita":"Saudi Arabia",
  "Uzbekistán":"Uzbekistan","RD Congo":"DR Congo","Jordania":"Jordan",
  "Cabo Verde":"Cape Verde","Panamá":"Panama","Haití":"Haiti",
  "Curazao":"Curacao","Sudáfrica":"South Africa","Nueva Zelanda":"New Zealand",
  "Catar":"Qatar","Irak":"Iraq",
};
// Invertir para inglés → español
const EN_TO_ES = Object.fromEntries(Object.entries(ES_TO_EN).map(([es,en]) => [en, es]));

// Función de matching flexible entre nombres en inglés de APIs y nombres en español
function matchTeam(apiName, esName) {
  if (!apiName || !esName) return false;
  const apiLower = apiName.toLowerCase().trim();
  const enName = (ES_TO_EN[esName] || esName).toLowerCase();
  const esLower = esName.toLowerCase();

  return apiLower === enName ||
    apiLower === esLower ||
    apiLower.includes(enName.split(" ")[0]) ||
    enName.includes(apiLower.split(" ")[0]) ||
    apiLower.includes(esLower.split(" ")[0]) ||
    esLower.includes(apiLower.split(" ")[0]);
}

// ── ELO RATINGS ───────────────────────────────────────────────────────────────
const ELO = {
  "Francia":2083,"España":2048,"Brasil":2034,"Argentina":2142,"Inglaterra":2021,
  "Portugal":1975,"Países Bajos":1976,"Alemania":1956,"Bélgica":1928,"Suiza":1862,
  "Croacia":1882,"Uruguay":1870,"Colombia":1852,"Noruega":1825,"México":1836,
  "Marruecos":1827,"Japón":1808,"Senegal":1782,"Corea del Sur":1776,"EE.UU.":1768,
  "Turquía":1782,"Austria":1766,"Suecia":1759,"Ecuador":1752,"Rep. Checa":1729,
  "Australia":1737,"C. Marfil":1745,"Irán":1741,"Escocia":1733,"Argelia":1714,
  "Canadá":1773,"Egipto":1695,"Bosnia y Herz.":1698,"Paraguay":1718,"Ghana":1701,
  "Arabia Saudita":1693,"Uzbekistán":1672,"RD Congo":1638,"Jordania":1601,
  "Cabo Verde":1642,"Panamá":1623,"Haití":1541,"Curazao":1489,"Sudáfrica":1641,
  "Nueva Zelanda":1548,"Catar":1611,"Irak":1629,
};

// Lesiones confirmadas con impacto en ELO
const INJURIES = {
  "Brasil":     { players:["Rodrygo (LCA)","Militão (muscular)"], eloMalus:-35 },
  "Argentina":  { players:["Foyth (Aquiles)","Panichelli (LCA)"], eloMalus:-20 },
  "México":     { players:["Malagón (Aquiles)"], eloMalus:-15 },
  "Inglaterra": { players:["Grealish (pie)"], eloMalus:-10 },
  "Croacia":    { players:["Gvardiol (pierna)"], eloMalus:-25 },
  "Alemania":   { players:["Gnabry"], eloMalus:-10 },
  "España":     { players:["Yamal (duda)"], eloMalus:-10 },
};

function calcEloProbs(home, away) {
  const hElo = (ELO[home]||1700) + (INJURIES[home]?.eloMalus||0);
  const aElo = (ELO[away]||1700) + (INJURIES[away]?.eloMalus||0);
  const diff = hElo - aElo + 40; // +40 ventaja local/neutral
  const hWin = 1 / (1 + Math.pow(10, -diff/400));
  const draw = 0.26;
  return {
    home: Math.round(hWin*(1-draw)*100),
    draw: Math.round(draw*100),
    away: Math.round((1-hWin)*(1-draw)*100),
    hEloAdj: hElo, aEloAdj: aElo,
  };
}

function combineProbs(sources) {
  const totalW = sources.reduce((s,x) => s+x.weight, 0);
  let h=0, d=0, a=0;
  sources.forEach(s => { h+=s.p.home*s.weight/totalW; d+=s.p.draw*s.weight/totalW; a+=s.p.away*s.weight/totalW; });
  const t = h+d+a;
  return { home:Math.round(h/t*100), draw:Math.round(d/t*100), away:Math.round(a/t*100) };
}

// ── FUENTE 1: Kalshi ──────────────────────────────────────────────────────────
async function getKalshiData() {
  console.log("📈 Kalshi...");
  try {
    const res = await fetch(
      "https://api.elections.kalshi.com/trade-api/v2/markets?limit=200&status=open&series_ticker=KXMENWORLDCUP",
      { headers:{ "Accept":"application/json" } }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

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
    (data.markets||[]).forEach(m => {
      const code = m.ticker?.split("-").pop();
      const team = ISO2[code] || code;
      const price = parseFloat(m.last_price_dollars)||parseFloat(m.yes_bid)||parseFloat(m.yes_ask)||0;
      if (price > 0 && ISO2[code]) teamOdds[team] = Math.round(price*100);
    });

    const sorted = Object.entries(teamOdds).sort((a,b)=>b[1]-a[1]);
    console.log(`  ✅ ${sorted.length} equipos | Top: ${sorted.slice(0,6).map(([t,p])=>t+":"+p+"%").join(", ")}`);
    return { available:true, teamOdds, sorted };
  } catch(e) {
    console.log("  ⚠️ Kalshi:", e.message);
    return { available:false, teamOdds:{}, sorted:[] };
  }
}

// ── FUENTE 2: TheOddsAPI ──────────────────────────────────────────────────────
async function getOddsData() {
  console.log("🎲 TheOddsAPI...");
  if (!ODDS_API_KEY) { console.log("  ⚠️ Sin key"); return { available:false, matches:[] }; }
  try {
    const sportsRes = await fetch(`https://api.the-odds-api.com/v4/sports/?apiKey=${ODDS_API_KEY}`);
    const sports = await sportsRes.json();
    const wcSport = (Array.isArray(sports)?sports:[]).find(s =>
      s.key?.includes("world_cup")||s.key?.includes("fifa")||
      s.title?.toLowerCase().includes("world cup")
    );
    if (!wcSport) {
      const soccer = (Array.isArray(sports)?sports:[]).filter(s=>s.key?.includes("soccer")).map(s=>s.key);
      console.log("  ⚠️ WC no encontrado. Soccer sports:", soccer.slice(0,5).join(", "));
      return { available:false, matches:[] };
    }
    console.log(`  Sport: ${wcSport.key} | ${wcSport.title}`);
    const oddsRes = await fetch(
      `https://api.the-odds-api.com/v4/sports/${wcSport.key}/odds/?apiKey=${ODDS_API_KEY}&regions=eu&markets=h2h&oddsFormat=decimal`
    );
    const oddsData = await oddsRes.json();
    const matches = (Array.isArray(oddsData)?oddsData:[]).map(game => {
      const bms = game.bookmakers||[];
      if (!bms.length) return null;
      const sums={home:0,draw:0,away:0}; let count=0;
      bms.forEach(bm => {
        const h2h = bm.markets?.find(m=>m.key==="h2h");
        if (!h2h) return;
        const hO=h2h.outcomes?.find(o=>o.name===game.home_team)?.price;
        const aO=h2h.outcomes?.find(o=>o.name===game.away_team)?.price;
        const dO=h2h.outcomes?.find(o=>o.name==="Draw")?.price;
        if (hO&&aO&&dO) {
          const t=1/hO+1/dO+1/aO;
          sums.home+=(1/hO/t)*100; sums.draw+=(1/dO/t)*100; sums.away+=(1/aO/t)*100; count++;
        }
      });
      if (!count) return null;
      return {
        homeEN:game.home_team, awayEN:game.away_team,
        date:game.commence_time?.split("T")[0],
        probs:{ home:Math.round(sums.home/count), draw:Math.round(sums.draw/count), away:Math.round(sums.away/count) },
        bookmakerCount:count,
      };
    }).filter(Boolean);

    console.log(`  ✅ ${matches.length} partidos | Ejemplo: ${matches[0]?.homeEN} vs ${matches[0]?.awayEN} → Local ${matches[0]?.probs.home}%`);
    return { available:true, matches };
  } catch(e) {
    console.log("  ⚠️ TheOddsAPI:", e.message);
    return { available:false, matches:[] };
  }
}

// ── FUENTE 3: API-Football (ID fijo = 1) ──────────────────────────────────────
async function getFootballData() {
  console.log("📡 API-Football (league=1, season=2026)...");
  if (!FOOTBALL_API_KEY) return { available:false, groups:{}, recentResults:[], upcoming:[] };
  try {
    const headers = { "x-apisports-key": FOOTBALL_API_KEY };
    const [checkRes, sdRes, fdRes, upRes] = await Promise.all([
      fetch("https://v3.football.api-sports.io/leagues?id=1&season=2026", {headers}).then(r=>r.json()),
      fetch("https://v3.football.api-sports.io/standings?league=1&season=2026", {headers}).then(r=>r.json()),
      fetch("https://v3.football.api-sports.io/fixtures?league=1&season=2026&status=FT", {headers}).then(r=>r.json()),
      fetch("https://v3.football.api-sports.io/fixtures?league=1&season=2026&status=NS&next=10", {headers}).then(r=>r.json()),
    ]);

    const leagueName = checkRes?.response?.[0]?.league?.name || "no encontrada";
    console.log(`  Liga: ${leagueName}`);

    // Standings
    const groups = {};
    for (const g of (sdRes?.response?.[0]?.league?.standings||[])) {
      if (!g.length) continue;
      const name = g[0]?.group?.replace(/^Group\s*/i,"") || "?";
      groups[name] = g.map(t => ({
        team: EN_TO_ES[t.team.name] || t.team.name,
        teamEN: t.team.name,
        pts:t.points, gf:t.all.goals.for, gc:t.all.goals.against, gd:t.goalsDiff,
        form:t.form?.slice(-1)||"?",
      }));
    }

    // Resultados finalizados
    const recentResults = (fdRes?.response||[]).slice(-15).map(f => ({
      home: EN_TO_ES[f.teams.home.name]||f.teams.home.name,
      away: EN_TO_ES[f.teams.away.name]||f.teams.away.name,
      homeEN: f.teams.home.name, awayEN: f.teams.away.name,
      score:`${f.goals.home}-${f.goals.away}`,
      date:f.fixture.date?.split("T")[0], round:f.league.round,
    }));

    // Próximos
    const upcoming = (upRes?.response||[]).map(f => ({
      home: EN_TO_ES[f.teams.home.name]||f.teams.home.name,
      away: EN_TO_ES[f.teams.away.name]||f.teams.away.name,
      date:f.fixture.date?.split("T")[0],
    }));

    console.log(`  ✅ Grupos: ${Object.keys(groups).length} | Resultados: ${recentResults.length} | Próximos: ${upcoming.length}`);
    return { available:Object.keys(groups).length>0||recentResults.length>0, groups, recentResults, upcoming };
  } catch(e) {
    console.log("  ⚠️ API-Football:", e.message);
    return { available:false, groups:{}, recentResults:[], upcoming:[] };
  }
}

// ── MODELO ESTADÍSTICO: Combinar TODAS las fuentes ────────────────────────────
function buildMatchProbs(fixture, oddsData, kalshiData, footballData) {
  const { home, away } = fixture;
  const sources = [];

  // FUENTE 1: ELO + lesiones (siempre disponible, base más confiable)
  const eloP = calcEloProbs(home, away);
  sources.push({ p:eloP, weight:35, name:"ELO" });

  // FUENTE 2: TheOddsAPI — buscar con matching flexible ES↔EN
  const bookMatch = oddsData.matches?.find(o =>
    matchTeam(o.homeEN, home) && matchTeam(o.awayEN, away)
  );
  if (bookMatch) {
    sources.push({ p:bookMatch.probs, weight:40, name:`Bookmakers(${bookMatch.bookmakerCount})` });
    console.log(`    📊 Bookmakers encontrados: ${home} vs ${away} → Local ${bookMatch.probs.home}%`);
  }

  // FUENTE 3: Kalshi — convertir probabilidad de torneo a partido
  const kHome = kalshiData.teamOdds?.[home] || 0;
  const kAway = kalshiData.teamOdds?.[away] || 0;
  if (kHome > 0 || kAway > 0) {
    const total = kHome + kAway;
    if (total > 0) {
      // Función logística para convertir ratio torneo → partido
      // Un equipo con 3x más chances de ganar el torneo ~tiene 60% chance en el partido
      const ratio = kHome / total;
      const matchProb = 1 / (1 + Math.exp(-4 * (ratio - 0.5))); // sigmoide
      const draw = 0.26;
      sources.push({
        p:{ home:Math.round(matchProb*(1-draw)*100), draw:Math.round(draw*100), away:Math.round((1-matchProb)*(1-draw)*100) },
        weight: bookMatch ? 10 : 20, // menos peso si ya tenemos bookmakers
        name:"Kalshi",
      });
    }
  }

  // FUENTE 4: API-Football — ajuste por forma reciente
  if (footballData.available && footballData.recentResults?.length > 0) {
    const getForm = (team) => {
      const results = footballData.recentResults.filter(r => r.home===team||r.away===team).slice(-5);
      if (!results.length) return 0.5;
      const pts = results.reduce((s,r) => {
        const [hg,ag] = r.score.split("-").map(Number);
        const isHome = r.home===team;
        return s + (isHome ? (hg>ag?3:hg===ag?1:0) : (ag>hg?3:hg===ag?1:0));
      }, 0);
      return pts / (results.length * 3); // 0-1
    };
    const hForm = getForm(home);
    const aForm = getForm(away);
    if (hForm !== 0.5 || aForm !== 0.5) {
      const formRatio = 0.5 + (hForm - aForm) * 0.25;
      const draw = 0.26;
      sources.push({
        p:{ home:Math.round(formRatio*(1-draw)*100), draw:Math.round(draw*100), away:Math.round((1-formRatio)*(1-draw)*100) },
        weight:10, name:"Forma",
      });
    }
  }

  const combined = combineProbs(sources);

  // Confianza: mayor cuando las fuentes coinciden
  const homeProbs = sources.map(s=>s.p.home);
  const variance = homeProbs.length>1
    ? homeProbs.reduce((v,p)=>v+Math.pow(p-combined.home,2),0)/homeProbs.length
    : 150;
  const confidence = Math.max(45, Math.min(92, Math.round(82 - Math.sqrt(variance))));

  // Modelo de Poisson — estándar estadístico para predicción de goles en fútbol
  // Promedio histórico Mundiales: ~2.6 goles/partido (1.4 local + 1.2 visitante)
  function poissonProb(lambda, k) {
    let factorial = 1;
    for (let i = 2; i <= k; i++) factorial *= i;
    return Math.exp(-lambda) * Math.pow(lambda, k) / factorial;
  }

  function predictScorePoisson(pH, pA) {
    // Calcular lambdas ajustados por ventaja relativa
    // diff positivo = local favorito, negativo = visitante favorito
    const diff = (pH - pA) / 100;
    const lambdaHome = Math.max(0.5, 1.4 + diff * 1.2);
    const lambdaAway = Math.max(0.5, 1.2 - diff * 1.0);

    // Encontrar marcador con mayor probabilidad (0-0 hasta 5-5)
    let best = { hg:0, ag:0, prob:0 };
    for (let hg = 0; hg <= 5; hg++) {
      for (let ag = 0; ag <= 5; ag++) {
        const prob = poissonProb(lambdaHome, hg) * poissonProb(lambdaAway, ag);
        if (prob > best.prob) best = { hg, ag, prob };
      }
    }
    return { score:`${best.hg}-${best.ag}`, hg:best.hg, ag:best.ag };
  }

  const predicted = predictScorePoisson(combined.home, combined.away);

  return {
    probHome:combined.home, probDraw:combined.draw, probAway:combined.away,
    predictedScore:predicted.score, homeGoals:predicted.hg, awayGoals:predicted.ag,
    confidence,
    favorito: combined.home>combined.away+5 ? home : combined.away>combined.home+5 ? away : "Equilibrado",
    sources: sources.map(s=>s.name).join("+"),
    hasBookmakerOdds: !!bookMatch,
    hasKalshi: kHome>0||kAway>0,
    eloHome: ELO[home]||1700,
    eloAway: ELO[away]||1700,
    eloHomeAdj: eloP.hEloAdj,
    eloAwayAdj: eloP.aEloAdj,
    kalshiHome: kHome,
    kalshiAway: kAway,
    injuries: [
      ...(INJURIES[home]?.players.map(p=>`${home}: ${p}`)||[]),
      ...(INJURIES[away]?.players.map(p=>`${away}: ${p}`)||[]),
    ],
  };
}

// ── Claude: factores clave contextuales ───────────────────────────────────────
async function callClaude(prompt, maxTokens=800) {
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

async function getKeyFactors(matches, today) {
  const injuryNotes = Object.entries(INJURIES).map(([t,i])=>`${t}:${i.players.join(",")}`).join(" | ");
  const list = matches.map((m,i)=>`${i+1}. ${m.home}(ELO:${ELO[m.home]||1700}) vs ${m.away}(ELO:${ELO[m.away]||1700}) G${m.group} J${m.j}`).join("\n");
  const prompt = `Mundial 2026, ${today}. Lesiones: ${injuryNotes}.
Para cada partido da UN factor clave táctico/físico en máximo 12 palabras.
${list}
JSON: {"factors":["factor1","factor2",...]} — exactamente ${matches.length} strings. Solo JSON.`;
  try {
    const r = await callClaude(prompt, 1000);
    return Array.isArray(r.factors) ? r.factors : matches.map(()=>"");
  } catch(e) { return matches.map(()=>""); }
}

// ── Grupos: standings reales + cálculo ELO+Kalshi ────────────────────────────
function buildGroups(footballData, kalshiData) {
  const TEAMS = {
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
  const NEXT = {
    A:"México vs Sudáfrica · 11/06 19:00",B:"Canadá vs Bosnia · 12/06 20:00",
    C:"Brasil vs Marruecos · 13/06 19:00",D:"EE.UU. vs Paraguay · 12/06 17:00",
    E:"Alemania vs Curazao · 14/06 16:00",F:"Países Bajos vs Japón · 14/06 19:00",
    G:"Bélgica vs Egipto · 15/06 19:00",H:"España vs Cabo Verde · 15/06 22:00",
    I:"Francia vs Senegal · 16/06 19:00",J:"Argentina vs Argelia · 16/06 22:00",
    K:"Portugal vs RD Congo · 17/06 19:00",L:"Inglaterra vs Croacia · 17/06 22:00",
  };

  const result = {};
  for (const [g, groupTeams] of Object.entries(TEAMS)) {
    // Usar standings reales si están disponibles, si no usar base
    const realStandings = footballData.groups[g];
    const standings = realStandings || groupTeams.map(t=>({team:t,pts:0,gf:0,gc:0,gd:0}));

    // Score combinado ELO + Kalshi para determinar favorito
    const scores = groupTeams.map(t => {
      const elo = (ELO[t]||1700) + (INJURIES[t]?.eloMalus||0);
      const kalshi = kalshiData.teamOdds?.[t] || 0;
      // Normalizar ELO al rango 0-100
      const eloNorm = (elo - 1400) / 8; // ~0-100
      const combined = eloNorm * 0.65 + kalshi * 0.35;
      return { team:t, score:combined, elo, kalshi };
    }).sort((a,b)=>b.score-a.score);

    const fav = scores[0];
    const favoriteOdds = Math.min(88, Math.max(35, Math.round(
      ((fav.elo - (ELO[scores[3].team]||1700)) / 4) + 45
    )));

    const injuryAlert = INJURIES[fav.team]
      ? `⚠️ ${fav.team}: ${INJURIES[fav.team].players.join(", ")}`
      : null;

    result[g] = {
      teams: groupTeams,
      favorite: fav.team,
      favoriteOdds,
      trend: "estable",
      keyNews: `${fav.team} lidera (ELO:${fav.elo}${fav.kalshi?`, Kalshi:${fav.kalshi}%`:""})`,
      alert: injuryAlert,
      standings,
      nextMatch: NEXT[g] || "",
    };
  }
  return result;
}

// ── Fixture completo con horarios Chile ───────────────────────────────────────
const ALL_FIXTURES = [
  {date:"2026-06-11",time:"19:00",group:"A",home:"México",away:"Sudáfrica",j:1,venue:"Azteca, CDMX"},
  {date:"2026-06-11",time:"22:00",group:"A",home:"Corea del Sur",away:"Rep. Checa",j:1,venue:"Guadalajara"},
  {date:"2026-06-12",time:"17:00",group:"D",home:"EE.UU.",away:"Paraguay",j:1,venue:"SoFi, LA"},
  {date:"2026-06-12",time:"20:00",group:"B",home:"Canadá",away:"Bosnia y Herz.",j:1,venue:"Toronto"},
  {date:"2026-06-13",time:"13:00",group:"B",home:"Catar",away:"Suiza",j:1,venue:"San Francisco"},
  {date:"2026-06-13",time:"16:00",group:"C",home:"Haití",away:"Escocia",j:1,venue:"Boston"},
  {date:"2026-06-13",time:"19:00",group:"C",home:"Brasil",away:"Marruecos",j:1,venue:"MetLife, NJ"},
  {date:"2026-06-13",time:"22:00",group:"D",home:"Australia",away:"Turquía",j:1,venue:"Vancouver"},
  {date:"2026-06-14",time:"13:00",group:"F",home:"Suecia",away:"Túnez",j:1,venue:"Monterrey"},
  {date:"2026-06-14",time:"16:00",group:"E",home:"Alemania",away:"Curazao",j:1,venue:"Houston"},
  {date:"2026-06-14",time:"19:00",group:"F",home:"Países Bajos",away:"Japón",j:1,venue:"Dallas"},
  {date:"2026-06-14",time:"22:00",group:"E",home:"C. Marfil",away:"Ecuador",j:1,venue:"Philadelphia"},
  {date:"2026-06-15",time:"13:00",group:"G",home:"Irán",away:"Nueva Zelanda",j:1,venue:"Los Ángeles"},
  {date:"2026-06-15",time:"16:00",group:"H",home:"Arabia Saudita",away:"Uruguay",j:1,venue:"Miami"},
  {date:"2026-06-15",time:"19:00",group:"G",home:"Bélgica",away:"Egipto",j:1,venue:"Seattle"},
  {date:"2026-06-15",time:"22:00",group:"H",home:"España",away:"Cabo Verde",j:1,venue:"Atlanta"},
  {date:"2026-06-16",time:"13:00",group:"I",home:"Irak",away:"Noruega",j:1,venue:"Boston"},
  {date:"2026-06-16",time:"16:00",group:"J",home:"Austria",away:"Jordania",j:1,venue:"San Francisco"},
  {date:"2026-06-16",time:"19:00",group:"I",home:"Francia",away:"Senegal",j:1,venue:"MetLife, NJ"},
  {date:"2026-06-16",time:"22:00",group:"J",home:"Argentina",away:"Argelia",j:1,venue:"Kansas City"},
  {date:"2026-06-17",time:"13:00",group:"K",home:"Uzbekistán",away:"Colombia",j:1,venue:"CDMX"},
  {date:"2026-06-17",time:"16:00",group:"L",home:"Ghana",away:"Panamá",j:1,venue:"Toronto"},
  {date:"2026-06-17",time:"19:00",group:"K",home:"Portugal",away:"RD Congo",j:1,venue:"Houston"},
  {date:"2026-06-17",time:"22:00",group:"L",home:"Inglaterra",away:"Croacia",j:1,venue:"Dallas"},
  {date:"2026-06-18",time:"13:00",group:"A",home:"Rep. Checa",away:"Sudáfrica",j:2,venue:"Atlanta"},
  {date:"2026-06-18",time:"16:00",group:"B",home:"Canadá",away:"Catar",j:2,venue:"Vancouver"},
  {date:"2026-06-18",time:"19:00",group:"A",home:"México",away:"Corea del Sur",j:2,venue:"Guadalajara"},
  {date:"2026-06-18",time:"22:00",group:"B",home:"Suiza",away:"Bosnia y Herz.",j:2,venue:"Los Ángeles"},
  {date:"2026-06-19",time:"13:00",group:"D",home:"Turquía",away:"Paraguay",j:2,venue:"San Francisco"},
  {date:"2026-06-19",time:"16:00",group:"C",home:"Escocia",away:"Marruecos",j:2,venue:"Boston"},
  {date:"2026-06-19",time:"19:00",group:"D",home:"EE.UU.",away:"Australia",j:2,venue:"Seattle"},
  {date:"2026-06-19",time:"22:00",group:"C",home:"Brasil",away:"Haití",j:2,venue:"Philadelphia"},
  {date:"2026-06-20",time:"13:00",group:"F",home:"Túnez",away:"Japón",j:2,venue:"Monterrey"},
  {date:"2026-06-20",time:"16:00",group:"E",home:"Ecuador",away:"Curazao",j:2,venue:"Kansas City"},
  {date:"2026-06-20",time:"19:00",group:"F",home:"Países Bajos",away:"Suecia",j:2,venue:"Houston"},
  {date:"2026-06-20",time:"22:00",group:"E",home:"Alemania",away:"C. Marfil",j:2,venue:"Toronto"},
  {date:"2026-06-21",time:"13:00",group:"H",home:"Uruguay",away:"Cabo Verde",j:2,venue:"Miami"},
  {date:"2026-06-21",time:"16:00",group:"G",home:"Nueva Zelanda",away:"Egipto",j:2,venue:"Vancouver"},
  {date:"2026-06-21",time:"19:00",group:"H",home:"España",away:"Arabia Saudita",j:2,venue:"Atlanta"},
  {date:"2026-06-21",time:"22:00",group:"G",home:"Bélgica",away:"Irán",j:2,venue:"Los Ángeles"},
  {date:"2026-06-22",time:"13:00",group:"J",home:"Jordania",away:"Argelia",j:2,venue:"San Francisco"},
  {date:"2026-06-22",time:"16:00",group:"I",home:"Noruega",away:"Senegal",j:2,venue:"MetLife, NJ"},
  {date:"2026-06-22",time:"19:00",group:"J",home:"Argentina",away:"Austria",j:2,venue:"Dallas"},
  {date:"2026-06-22",time:"22:00",group:"I",home:"Francia",away:"Irak",j:2,venue:"Philadelphia"},
  {date:"2026-06-23",time:"13:00",group:"L",home:"Panamá",away:"Croacia",j:2,venue:"Toronto"},
  {date:"2026-06-23",time:"16:00",group:"K",home:"Colombia",away:"RD Congo",j:2,venue:"Guadalajara"},
  {date:"2026-06-23",time:"19:00",group:"L",home:"Inglaterra",away:"Ghana",j:2,venue:"Boston"},
  {date:"2026-06-23",time:"22:00",group:"K",home:"Portugal",away:"Uzbekistán",j:2,venue:"Houston"},
  {date:"2026-06-24",time:"18:00",group:"A",home:"México",away:"Rep. Checa",j:3,venue:"Azteca, CDMX"},
  {date:"2026-06-24",time:"18:00",group:"A",home:"Sudáfrica",away:"Corea del Sur",j:3,venue:"Monterrey"},
  {date:"2026-06-24",time:"21:00",group:"B",home:"Suiza",away:"Canadá",j:3,venue:"Vancouver"},
  {date:"2026-06-24",time:"21:00",group:"B",home:"Bosnia y Herz.",away:"Catar",j:3,venue:"CDMX"},
  {date:"2026-06-25",time:"18:00",group:"C",home:"Brasil",away:"Escocia",j:3,venue:"Kansas City"},
  {date:"2026-06-25",time:"18:00",group:"C",home:"Marruecos",away:"Haití",j:3,venue:"Seattle"},
  {date:"2026-06-25",time:"21:00",group:"D",home:"EE.UU.",away:"Turquía",j:3,venue:"Dallas"},
  {date:"2026-06-25",time:"21:00",group:"D",home:"Paraguay",away:"Australia",j:3,venue:"Houston"},
  {date:"2026-06-26",time:"15:00",group:"E",home:"Alemania",away:"Ecuador",j:3,venue:"Philadelphia"},
  {date:"2026-06-26",time:"15:00",group:"E",home:"C. Marfil",away:"Curazao",j:3,venue:"Los Ángeles"},
  {date:"2026-06-26",time:"18:00",group:"F",home:"Países Bajos",away:"Túnez",j:3,venue:"Boston"},
  {date:"2026-06-26",time:"18:00",group:"F",home:"Japón",away:"Suecia",j:3,venue:"Dallas"},
  {date:"2026-06-26",time:"21:00",group:"G",home:"Bélgica",away:"Nueva Zelanda",j:3,venue:"Atlanta"},
  {date:"2026-06-26",time:"21:00",group:"G",home:"Egipto",away:"Irán",j:3,venue:"Kansas City"},
  {date:"2026-06-26",time:"21:00",group:"H",home:"España",away:"Uruguay",j:3,venue:"MetLife, NJ"},
  {date:"2026-06-26",time:"21:00",group:"H",home:"Cabo Verde",away:"Arabia Saudita",j:3,venue:"Seattle"},
  {date:"2026-06-26",time:"21:00",group:"I",home:"Francia",away:"Noruega",j:3,venue:"Miami"},
  {date:"2026-06-26",time:"21:00",group:"I",home:"Senegal",away:"Irak",j:3,venue:"Los Ángeles"},
  {date:"2026-06-26",time:"21:00",group:"J",home:"Argentina",away:"Jordania",j:3,venue:"Nueva Orleans"},
  {date:"2026-06-26",time:"21:00",group:"J",home:"Argelia",away:"Austria",j:3,venue:"Guadalajara"},
  {date:"2026-06-27",time:"18:00",group:"K",home:"Portugal",away:"Colombia",j:3,venue:"Seattle"},
  {date:"2026-06-27",time:"18:00",group:"K",home:"RD Congo",away:"Uzbekistán",j:3,venue:"Monterrey"},
  {date:"2026-06-27",time:"21:00",group:"L",home:"Inglaterra",away:"Panamá",j:3,venue:"MetLife, NJ"},
  {date:"2026-06-27",time:"21:00",group:"L",home:"Croacia",away:"Ghana",j:3,venue:"Atlanta"},
];

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log("🚀 Modelo estadístico multi-fuente v4");
  const today = getChileDate();
  const todayShort = getChileDateShort();
  console.log("📅", today);

  // Todas las fuentes en paralelo
  const [kalshiData, oddsData, footballData] = await Promise.all([
    getKalshiData(),
    getOddsData(),
    getFootballData(),
  ]);

  console.log("\n📊 FUENTES:");
  console.log("  ELO: ✅ 48 equipos (con ajuste por lesiones)");
  console.log("  Kalshi:", kalshiData.available?`✅ ${Object.keys(kalshiData.teamOdds).length} equipos`:"❌");
  console.log("  TheOddsAPI:", oddsData.available?`✅ ${oddsData.matches.length} partidos`:"❌");
  console.log("  API-Football:", footballData.available?`✅ ${footballData.recentResults.length} resultados`:"⏳");

  // Calcular probabilidades estadísticas para los 72 partidos
  console.log("\n⚽ Calculando probabilidades...");
  const predictions = ALL_FIXTURES.map(f => ({
    match:`${f.home} vs ${f.away}`,
    date:f.date, time:f.time, group:f.group, jornada:f.j, venue:f.venue,
    ...buildMatchProbs(f, oddsData, kalshiData, footballData),
    keyFactor:"",
  }));

  const withBM = predictions.filter(p=>p.hasBookmakerOdds).length;
  const withK = predictions.filter(p=>p.hasKalshi).length;
  console.log(`  Con Bookmakers: ${withBM}/72 | Con Kalshi: ${withK}/72`);

  // Factores clave contextuales via Claude (solo texto)
  console.log("🧠 Factores clave con Claude...");
  for (let i=0; i<ALL_FIXTURES.length; i+=8) {
    const batch = ALL_FIXTURES.slice(i,i+8);
    const factors = await getKeyFactors(batch, today);
    factors.forEach((f,j) => { if (predictions[i+j]) predictions[i+j].keyFactor = f; });
    process.stdout.write(`  ${Math.floor(i/8)+1}/9 `);
  }
  console.log("\n✅ Factores OK");

  // Grupos con datos reales
  console.log("📊 Grupos...");
  const groups = buildGroups(footballData, kalshiData);

  // Noticias y candidatos — Claude con todos los datos integrados
  console.log("📰 Noticias y candidatos...");
  const kalshiTop = kalshiData.sorted?.slice(0,8).map(([t,p])=>`${t}:${p}%`).join(", ")||"no disponible";
  const resultsStr = footballData.recentResults?.length>0
    ? footballData.recentResults.slice(-6).map(r=>`${r.home} ${r.score} ${r.away}`).join(", ")
    : "Torneo aún no iniciado (empieza 11 jun)";

  const meta = await callClaude(`Mundial 2026, ${today}.

DATOS REALES:
Kalshi (prob. ganar torneo): ${kalshiTop}
ELO top8: Argentina(2142→2122*), Francia(2083), España(2048→2038*), Países Bajos(1976), Alemania(1956→1946*), Croacia(1882→1857*), Brasil(2034→1999*), Suiza(1862)
(*ajustado por lesiones)
Resultados recientes: ${resultsStr}
Lesiones confirmadas: Rodrygo/Militão(Brasil), Foyth/Panichelli(Argentina), Gvardiol(Croacia), Malagón(México), Grealish(Inglaterra), Gnabry(Alemania), Yamal(España,duda)

INSTRUCCIÓN: Los titleContenders.odds deben coincidir con los precios de Kalshi si están disponibles. Ajusta según ELO ajustado por lesiones.

JSON:{"headline":"titular más impactante","globalFavorite":"nombre","globalFavoriteChange":"subió|bajó|estable","topNews":[{"title":"t","impact":"alto|medio|bajo","team":"p","type":"lesión|resultado|táctica|otro","detail":"d"}],"titleContenders":[{"team":"p","odds":17,"trend":"subió|bajó|estable","reason":"razón con datos ELO+Kalshi","kalshiPrice":17,"eloRating":2048}]}
Max 6 noticias, 8 candidatos. Solo JSON.`, 1800);

  const sourcesStr = [
    "ELO+Lesiones",
    kalshiData.available?`Kalshi(${Object.keys(kalshiData.teamOdds).length})`:null,
    oddsData.available?`Bookmakers(${withBM} partidos)`:null,
    footballData.available?"API-Football":null,
    "Claude(contexto)",
  ].filter(Boolean).join(" + ");

  const analysis = {
    lastUpdated: today,
    lastUpdatedShort: todayShort,
    headline: meta.headline||"Mundial 2026 - Análisis multi-fuente",
    globalFavorite: meta.globalFavorite||"España",
    globalFavoriteChange: meta.globalFavoriteChange||"estable",
    dataSources: sourcesStr,
    stats:{ predictions:predictions.length, withBookmakers:withBM, withKalshi:withK },
    topNews: meta.topNews||[],
    titleContenders: meta.titleContenders||[],
    groups,
    predictions,
    fixtures: ALL_FIXTURES,
    eloRatings: ELO,
    kalshiOdds: kalshiData.teamOdds||{},
  };

  const outputDir = path.join(__dirname,"..","public","data");
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir,{recursive:true});
  fs.writeFileSync(path.join(outputDir,"mundial-data.json"), JSON.stringify(analysis,null,2), "utf8");

  console.log("\n✅ COMPLETADO");
  console.log(`⚽ 72 pronósticos | 🎲 Bookmakers: ${withBM} | 📈 Kalshi: ${withK}`);
  console.log(`📊 Fuentes: ${sourcesStr}`);
}

main().catch(err=>{ console.error("❌",err.message); process.exit(1); });
