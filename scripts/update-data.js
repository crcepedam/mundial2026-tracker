// scripts/update-data.js — 3 FUENTES: API-Football + TheOddsAPI + Claude AI
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

// ── 1. TheOddsAPI — cuotas reales de casas de apuestas ───────────────────────
async function getOddsData() {
  console.log("🎲 Obteniendo cuotas de casas de apuestas...");
  try {
    // Buscar el sport key del Mundial 2026
    const sportsRes = await fetch(
      `https://api.the-odds-api.com/v4/sports/?apiKey=${ODDS_API_KEY}`
    );
    const sportsRaw = await sportsRes.json();
    const sports = Array.isArray(sportsRaw) ? sportsRaw : [];
    console.log("Sports disponibles:", sports.length);
    const wcSport = sports.find(s =>
      s.key?.includes("world_cup") || s.title?.toLowerCase().includes("world cup") ||
      s.title?.toLowerCase().includes("mundial") || s.key?.includes("fifa")
    );

    if (!wcSport) {
      console.log("⚠️ Mundial 2026 aún no en TheOddsAPI — usando solo otras fuentes");
      return { available: false, matches: [] };
    }

    console.log("✅ Sport encontrado:", wcSport.key);

    // Obtener odds del Mundial
    const oddsRes = await fetch(
      `https://api.the-odds-api.com/v4/sports/${wcSport.key}/odds/?apiKey=${ODDS_API_KEY}&regions=eu&markets=h2h&oddsFormat=decimal`
    );
    const oddsData = await oddsRes.json();

    // Parsear: convertir cuotas decimales a probabilidades implícitas
    const matches = (oddsData || []).map(game => {
      const bookmakers = game.bookmakers || [];
      if (!bookmakers.length) return null;

      // Promediar probabilidades de todos los bookmakers disponibles
      const probSums = { home: 0, draw: 0, away: 0 };
      let count = 0;

      bookmakers.forEach(bm => {
        const h2h = bm.markets?.find(m => m.key === "h2h");
        if (!h2h) return;
        const outcomes = h2h.outcomes || [];
        const homeOdd = outcomes.find(o => o.name === game.home_team)?.price;
        const awayOdd = outcomes.find(o => o.name === game.away_team)?.price;
        const drawOdd = outcomes.find(o => o.name === "Draw")?.price;

        if (homeOdd && awayOdd && drawOdd) {
          // Probabilidad implícita = 1/cuota, normalizada
          const rawHome = 1/homeOdd;
          const rawDraw = 1/drawOdd;
          const rawAway = 1/awayOdd;
          const total = rawHome + rawDraw + rawAway;
          probSums.home += (rawHome/total)*100;
          probSums.draw += (rawDraw/total)*100;
          probSums.away += (rawAway/total)*100;
          count++;
        }
      });

      if (!count) return null;

      return {
        home: game.home_team,
        away: game.away_team,
        date: game.commence_time?.split("T")[0],
        probHome: Math.round(probSums.home/count),
        probDraw: Math.round(probSums.draw/count),
        probAway: Math.round(probSums.away/count),
        bookmakerCount: count,
        source: "bookmakers",
      };
    }).filter(Boolean);

    console.log(`✅ Cuotas obtenidas: ${matches.length} partidos de ${oddsData?.length || 0}`);
    return { available: true, matches };

  } catch (err) {
    console.error("⚠️ TheOddsAPI error:", err.message);
    return { available: false, matches: [] };
  }
}

// ── 2. API-Football — resultados y standings reales ──────────────────────────
async function getFootballData() {
  console.log("📡 Obteniendo datos de API-Football...");
  try {
    const headers = { "x-apisports-key": FOOTBALL_API_KEY };
    const leagueRes = await fetch(
      "https://v3.football.api-sports.io/leagues?type=cup&season=2026",
      { headers }
    );
    const leagueData = await leagueRes.json();
    const wc = (leagueData?.response||[]).find(l =>
      l.league?.name?.toLowerCase().includes("world cup") ||
      l.league?.name?.toLowerCase().includes("mundial")
    );
    const leagueId = wc?.league?.id;

    if (!leagueId) {
      console.log("⚠️ Mundial 2026 aún no en API-Football");
      return { groups:{}, recentResults:[], upcomingFixtures:[], available:false };
    }

    const [standingsRes, finishedRes] = await Promise.all([
      fetch(`https://v3.football.api-sports.io/standings?league=${leagueId}&season=2026`, { headers }),
      fetch(`https://v3.football.api-sports.io/fixtures?league=${leagueId}&season=2026&status=FT`, { headers }),
    ]);
    const [sd, fd] = await Promise.all([standingsRes.json(), finishedRes.json()]);

    const groups = {};
    for (const group of (sd?.response?.[0]?.league?.standings||[])) {
      if (!group.length) continue;
      const name = group[0]?.group?.replace(/^Group\s*/i,"") || "?";
      groups[name] = group.map(t => ({
        team: t.team.name, pts: t.points,
        gf: t.all.goals.for, gc: t.all.goals.against,
        gd: t.goalsDiff, form: t.form?.slice(-1)||"?",
      }));
    }

    const recentResults = (fd?.response||[]).slice(-12).map(f => ({
      date: f.fixture.date?.split("T")[0],
      home: f.teams.home.name, away: f.teams.away.name,
      score: `${f.goals.home}-${f.goals.away}`, round: f.league.round,
    }));

    console.log(`✅ API-Football: ${Object.keys(groups).length} grupos, ${recentResults.length} resultados`);
    return { groups, recentResults, available: true };

  } catch (err) {
    console.error("⚠️ API-Football error:", err.message);
    return { groups:{}, recentResults:[], available:false };
  }
}

// ── 3. Claude AI — análisis + combinación de fuentes ─────────────────────────
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
  const s = text.indexOf("{"), e = text.lastIndexOf("}");
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

// ── Generar pronósticos combinando las 3 fuentes ──────────────────────────────
async function getMatchPredictions(matches, today, oddsData, footballData) {
  const matchList = matches.map((m,i) => {
    // Buscar cuotas reales si existen
    const odds = oddsData.matches.find(o =>
      (o.home?.includes(m.home.split(" ")[0]) || m.home.includes(o.home?.split(" ")[0]||"")) &&
      (o.away?.includes(m.away.split(" ")[0]) || m.away.includes(o.away?.split(" ")[0]||""))
    );
    const oddsStr = odds
      ? `[CUOTAS REALES: Local ${odds.probHome}%, Empate ${odds.probDraw}%, Visitante ${odds.probAway}% — ${odds.bookmakerCount} casas de apuestas]`
      : "[Sin cuotas disponibles aún]";
    return `${i+1}. ${m.home} vs ${m.away} (G${m.group} J${m.j}, ${m.date} ${m.time} Chile, ${m.venue}) ${oddsStr}`;
  }).join("\n");

  const hasResults = footballData.recentResults?.length > 0;
  const resultsStr = hasResults
    ? `\nRESULTADOS RECIENTES:\n${footballData.recentResults.slice(-6).map(r=>`${r.home} ${r.score} ${r.away}`).join(", ")}`
    : "";

  const prompt = `Eres el mejor analista estadístico de fútbol. Hoy ${today}. Mundial FIFA 2026.
LESIONES CONFIRMADAS: Rodrygo(Brasil,LCA), Militao(Brasil,muscular), Grealish(Inglaterra,pie), Gvardiol(Croacia,pierna), Malagón(México,Aquiles), Gnabry(Alemania), Foyth(Argentina,Aquiles), Panichelli(Argentina,LCA), Yamal(España,duda).
${resultsStr}

INSTRUCCIÓN: Si hay cuotas reales de casas de apuestas, úsalas como BASE y ajusta según lesiones y contexto. Si no hay cuotas, usa tu análisis estadístico.

PARTIDOS A ANALIZAR:
${matchList}

Responde con JSON exacto:
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
  "keyFactor":"razon principal",
  "hasBookmakerOdds":true
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

  // Usar standings reales si están disponibles
  const standingsStr = footballData.available && Object.keys(footballData.groups).length > 0
    ? `\nSTANDINGS REALES: ${JSON.stringify(footballData.groups)}`
    : "";

  const prompt = `Mundial 2026, hoy ${today}.
Lesiones: Rodrygo(Brasil), Militao(Brasil), Grealish(Inglaterra), Gvardiol(Croacia), Malagón(México), Gnabry(Alemania), Foyth(Argentina), Panichelli(Argentina).${standingsStr}
Genera análisis grupos: ${groupIds.join(", ")}
JSON:
{${groupIds.map(g=>`"${g}":{"teams":${JSON.stringify(teams[g])},"favorite":"nombre","favoriteOdds":65,"trend":"estable","keyNews":"max 80 chars","alert":null,"standings":${JSON.stringify(teams[g].map(t=>({team:t,pts:0,gf:0,gc:0,gd:0})))},"nextMatch":"${nextMatch[g]}"}`).join(",")}}
Solo JSON.`;

  return await callClaude(prompt, 1800);
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log("🚀 Iniciando actualización con 3 fuentes...");
  const today = getChileDate();
  const todayShort = getChileDateShort();
  console.log("📅 Chile:", today);

  // Obtener datos de las 3 fuentes en paralelo
  const [oddsData, footballData] = await Promise.all([
    getOddsData(),
    getFootballData(),
  ]);

  console.log(`📊 TheOddsAPI: ${oddsData.available ? oddsData.matches.length+" partidos con cuotas" : "no disponible"}`);
  console.log(`📊 API-Football: ${footballData.available ? "disponible" : "no disponible"}`);

  // Pronósticos por lotes de 6 combinando las 3 fuentes
  console.log("⚽ Generando pronósticos...");
  const allPredictions = [];
  const batchSize = 6;
  for (let i = 0; i < ALL_FIXTURES.length; i += batchSize) {
    const batch = ALL_FIXTURES.slice(i, i + batchSize);
    console.log(`  Lote ${Math.floor(i/batchSize)+1}/${Math.ceil(ALL_FIXTURES.length/batchSize)}: ${batch.map(m=>m.home+" vs "+m.away).join(", ")}`);
    try {
      const preds = await getMatchPredictions(batch, today, oddsData, footballData);
      allPredictions.push(...preds);
    } catch(e) {
      console.log("  ⚠️ Error lote:", e.message);
    }
  }
  console.log(`✅ Pronósticos: ${allPredictions.length}`);

  // Grupos
  console.log("📊 Generando grupos...");
  const [gAD, gEH, gIL] = await Promise.all([
    getGroups(["A","B","C","D"], today, footballData),
    getGroups(["E","F","G","H"], today, footballData),
    getGroups(["I","J","K","L"], today, footballData),
  ]);

  // Meta: noticias y candidatos
  console.log("📰 Generando meta...");
  const meta = await callClaude(`Mundial 2026, hoy ${today}.
Lesiones: Rodrygo(Brasil), Militao(Brasil), Grealish(Inglaterra), Gvardiol(Croacia), Malagón(México), Foyth(Argentina), Panichelli(Argentina). Colombia ganó 2-0 a Jordania.
Fuentes consultadas: ${oddsData.available?"TheOddsAPI (cuotas reales)":""} ${footballData.available?"API-Football (resultados)":""} Claude AI (análisis).
JSON:{"headline":"titular","globalFavorite":"Francia","globalFavoriteChange":"estable","topNews":[{"title":"t","impact":"alto","team":"p","type":"lesión","detail":"d"}],"titleContenders":[{"team":"p","odds":20,"trend":"estable","reason":"r"}]}
Max 6 noticias, 6 candidatos. Solo JSON.`, 1500);

  // Estadísticas de fuentes usadas
  const oddsCount = allPredictions.filter(p => p.hasBookmakerOdds).length;
  const dataSourcesSummary = [
    oddsData.available ? `TheOddsAPI (${oddsData.matches.length} partidos)` : null,
    footballData.available ? `API-Football (${footballData.recentResults?.length||0} resultados)` : null,
    `Claude AI (análisis de los ${allPredictions.length} partidos)`,
  ].filter(Boolean).join(" + ");

  const analysis = {
    lastUpdated: today,
    lastUpdatedShort: todayShort,
    headline: meta.headline || "Mundial 2026 - Análisis en vivo",
    globalFavorite: meta.globalFavorite || "Francia",
    globalFavoriteChange: meta.globalFavoriteChange || "estable",
    dataSources: dataSourcesSummary,
    bookmakerOddsCount: oddsCount,
    topNews: meta.topNews || [],
    titleContenders: meta.titleContenders || [],
    groups: { ...gAD, ...gEH, ...gIL },
    predictions: allPredictions,
    fixtures: ALL_FIXTURES,
  };

  const outputDir = path.join(__dirname, "..", "public", "data");
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, "mundial-data.json"), JSON.stringify(analysis, null, 2), "utf8");

  console.log("✅ Listo!");
  console.log("⚽ Pronósticos:", allPredictions.length);
  console.log("🎲 Con cuotas reales:", oddsCount);
  console.log("📊 Fuentes:", dataSourcesSummary);
}

main().catch(err => { console.error("❌", err.message); process.exit(1); });
