// scripts/update-data.js
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const FOOTBALL_API_KEY  = process.env.FOOTBALL_API_KEY;

// ── 1. API-Football ───────────────────────────────────────────────────────────
async function getFootballData() {
  console.log("📡 Obteniendo datos de API-Football...");
  const headers = { "x-apisports-key": FOOTBALL_API_KEY };

  try {
    // Buscar el Mundial 2026 por nombre y temporada
    const leagueRes = await fetch(
      "https://v3.football.api-sports.io/leagues?type=cup&season=2026",
      { headers }
    );
    const leagueData = await leagueRes.json();
    const wc = (leagueData?.response || []).find(l =>
      l.league?.name?.toLowerCase().includes("world cup") ||
      l.league?.name?.toLowerCase().includes("mundial")
    );
    const leagueId = wc?.league?.id;
    console.log("Liga encontrada:", wc?.league?.name, "ID:", leagueId);

    if (!leagueId) {
      console.log("⚠️ Mundial 2026 aún no disponible en API-Football — usando datos base");
      return { groups: {}, recentResults: [], upcomingFixtures: [], apiAvailable: false };
    }

    const [standingsRes, finishedRes, upcomingRes] = await Promise.all([
      fetch(`https://v3.football.api-sports.io/standings?league=${leagueId}&season=2026`, { headers }),
      fetch(`https://v3.football.api-sports.io/fixtures?league=${leagueId}&season=2026&status=FT`, { headers }),
      fetch(`https://v3.football.api-sports.io/fixtures?league=${leagueId}&season=2026&status=NS&next=8`, { headers }),
    ]);

    const [sd, fd, ud] = await Promise.all([
      standingsRes.json(), finishedRes.json(), upcomingRes.json()
    ]);

    const groups = {};
    for (const group of (sd?.response?.[0]?.league?.standings || [])) {
      if (!group.length) continue;
      const name = group[0]?.group?.replace(/^Group\s*/i, "") || "?";
      groups[name] = group.map(t => ({
        team: t.team.name, pts: t.points,
        gf: t.all.goals.for, gc: t.all.goals.against, gd: t.goalsDiff,
        form: t.form?.slice(-1) || "?",
      }));
    }

    const recentResults = (fd?.response || []).slice(-10).map(f => ({
      date: f.fixture.date?.split("T")[0],
      home: f.teams.home.name, away: f.teams.away.name,
      score: `${f.goals.home}-${f.goals.away}`, round: f.league.round,
    }));

    const upcomingFixtures = (ud?.response || []).slice(0, 6).map(f => ({
      date: f.fixture.date?.split("T")[0],
      home: f.teams.home.name, away: f.teams.away.name,
      venue: f.fixture.venue?.city, round: f.league.round,
    }));

    console.log(`✅ Grupos: ${Object.keys(groups).length} | Resultados: ${recentResults.length} | Próximos: ${upcomingFixtures.length}`);
    return { groups, recentResults, upcomingFixtures, apiAvailable: true };

  } catch (err) {
    console.error("⚠️ API-Football error:", err.message);
    return { groups: {}, recentResults: [], upcomingFixtures: [], apiAvailable: false };
  }
}

// ── 2. Claude AI ──────────────────────────────────────────────────────────────
async function generateAnalysis(footballData) {
  console.log("🤖 Generando análisis con Claude...");

  const today = new Date().toLocaleDateString("es-CL", {
    weekday:"long", year:"numeric", month:"long", day:"numeric"
  });

  const hasData = footballData.apiAvailable && footballData.recentResults.length > 0;

  const system = `Eres analista experto del Mundial FIFA 2026 (USA, México, Canadá).
Hoy: ${today}. El torneo empezó el 11 de junio de 2026. 48 equipos, 12 grupos A-L.
${hasData ? "Recibirás datos reales de la API." : "No hay datos de API aún — usa tu conocimiento actualizado."}
Devuelve ÚNICAMENTE JSON válido y compacto. Sin markdown. Sin texto extra.
Usa nombres cortos para los equipos (máximo 20 chars). Máximo 6 noticias. Máximo 8 candidatos.
Estructura:
{"lastUpdated":"${today}","headline":"string","globalFavorite":"string","globalFavoriteChange":"subió|bajó|estable","topNews":[{"title":"string","impact":"alto|medio|bajo","team":"string","type":"lesión|resultado|táctica|otro","detail":"string"}],"groups":{"A":{"teams":["s","s","s","s"],"favorite":"s","favoriteOdds":65,"trend":"estable","keyNews":"s","alert":null,"standings":[{"team":"s","pts":0,"gf":0,"gc":0,"gd":0}],"nextMatch":"s"}},"titleContenders":[{"team":"s","odds":20,"trend":"estable","reason":"s"}]}
Completa los 12 grupos A-L. Sé conciso.`;

  const userMsg = hasData
    ? `Datos reales: ${JSON.stringify({
        resultados: footballData.recentResults,
        proximos: footballData.upcomingFixtures,
        standings: footballData.groups
      })}\nGenera JSON completo. Incluye lesiones: Rodrygo(Brasil), Militão(Brasil), Grealish(Inglaterra), Gvardiol(Croacia), Malagón(México).`
    : `Mundial inicia 11 jun. Genera análisis pre-torneo con lesiones confirmadas: Rodrygo y Militão(Brasil), Grealish(Inglaterra), Gvardiol(Croacia), Malagón(México), Gnabry(Alemania), Foyth y Panichelli(Argentina). Solo JSON.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 3000,
      system,
      messages: [{ role: "user", content: userMsg }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude API ${res.status}: ${err.slice(0,200)}`);
  }

  const raw = await res.json();
  let text = (raw.content || [])
    .filter(b => b.type === "text")
    .map(b => b.text)
    .join("")
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  const start = text.indexOf("{");
  const end   = text.lastIndexOf("}");
  if (start === -1) throw new Error("No JSON en respuesta");

  return JSON.parse(text.slice(start, end + 1));
}

// ── 3. Main ───────────────────────────────────────────────────────────────────
async function main() {
  console.log("🚀 Iniciando actualización...");
  console.log("⏰", new Date().toLocaleString("es-CL"));

  const footballData = await getFootballData();
  const analysis     = await generateAnalysis(footballData);

  const outputDir  = path.join(__dirname, "..", "public", "data");
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const outputPath = path.join(outputDir, "mundial-data.json");
  fs.writeFileSync(outputPath, JSON.stringify(analysis, null, 2), "utf8");

  console.log("✅ Guardado en public/data/mundial-data.json");
  console.log("📊 Grupos:", Object.keys(analysis.groups || {}).length);
  console.log("📰 Noticias:", analysis.topNews?.length || 0);
  console.log("🏆 Candidatos:", analysis.titleContenders?.length || 0);
}

main().catch(err => {
  console.error("❌ Error fatal:", err.message);
  process.exit(1);
});
