// scripts/update-data.js
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const FOOTBALL_API_KEY = process.env.FOOTBALL_API_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// ── 1. Obtener datos de API-Football ─────────────────────────────────────────
async function getFootballData() {
  console.log("📡 Obteniendo datos de API-Football...");

  const headers = { "x-apisports-key": FOOTBALL_API_KEY };

  try {
    // Primero buscar el ID correcto del Mundial 2026
    const leagueRes = await fetch(
      "https://v3.football.api-sports.io/leagues?name=FIFA%20World%20Cup&season=2026",
      { headers }
    );
    const leagueData = await leagueRes.json();
    console.log("Ligas encontradas:", JSON.stringify(leagueData?.response?.slice(0,3)));

    const leagueId = leagueData?.response?.[0]?.league?.id;
    console.log("ID de la liga:", leagueId);

    if (!leagueId) {
      console.log("⚠️ No se encontró el ID del Mundial 2026, usando datos base");
      return { groups: {}, recentResults: [], upcomingFixtures: [] };
    }

    // Standings
    const standingsRes = await fetch(
      `https://v3.football.api-sports.io/standings?league=${leagueId}&season=2026`,
      { headers }
    );
    const standingsData = await standingsRes.json();

    // Fixtures
    const fixturesRes = await fetch(
      `https://v3.football.api-sports.io/fixtures?league=${leagueId}&season=2026&status=FT`,
      { headers }
    );
    const fixturesData = await fixturesRes.json();

    // Próximos partidos
    const upcomingRes = await fetch(
      `https://v3.football.api-sports.io/fixtures?league=${leagueId}&season=2026&status=NS&next=10`,
      { headers }
    );
    const upcomingData = await upcomingRes.json();

    // Parsear standings
    const groups = {};
    const rawStandings = standingsData?.response?.[0]?.league?.standings || [];
    for (const group of rawStandings) {
      if (!group.length) continue;
      const groupName = group[0]?.group?.replace("Group ", "").replace("Grupo ", "") || "?";
      groups[groupName] = group.map(t => ({
        team: t.team.name,
        pts: t.points,
        played: t.all.played,
        gf: t.all.goals.for,
        gc: t.all.goals.against,
        gd: t.goalsDiff,
        form: t.form?.slice(-1) || "?",
      }));
    }

    const recentResults = (fixturesData?.response || []).slice(-15).map(f => ({
      date: f.fixture.date?.split("T")[0],
      home: f.teams.home.name,
      away: f.teams.away.name,
      homeGoals: f.goals.home,
      awayGoals: f.goals.away,
      round: f.league.round,
    }));

    const upcomingFixtures = (upcomingData?.response || []).slice(0, 10).map(f => ({
      date: f.fixture.date?.split("T")[0],
      time: f.fixture.date?.split("T")[1]?.slice(0, 5),
      home: f.teams.home.name,
      away: f.teams.away.name,
      round: f.league.round,
      venue: f.fixture.venue?.name,
    }));

    console.log(`✅ Standings: ${Object.keys(groups).length} grupos`);
    console.log(`✅ Resultados: ${recentResults.length}`);
    console.log(`✅ Próximos: ${upcomingFixtures.length}`);

    return { groups, recentResults, upcomingFixtures };

  } catch (err) {
    console.error("⚠️ Error en API-Football:", err.message);
    return { groups: {}, recentResults: [], upcomingFixtures: [] };
  }
}

// ── 2. Generar análisis con Claude ────────────────────────────────────────────
async function generateAnalysis(footballData) {
  console.log("🤖 Generando análisis con Claude...");

  const today = new Date().toLocaleDateString("es-CL", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  const system = `Eres el mejor analista de fútbol del mundo especializado en Copas del Mundo.
Hoy es ${today}. El Mundial 2026 se juega en USA, México y Canadá. Empezó el 11 de junio.
48 equipos, 12 grupos (A-L). Clasifican top 2 de cada grupo + 8 mejores terceros.

Recibirás datos reales de resultados y standings. Analiza y devuelve SOLO un JSON válido, sin markdown, sin texto extra.

Estructura exacta requerida:
{
  "lastUpdated": "${today}",
  "headline": "El titular más impactante del día",
  "globalFavorite": "País + emoji",
  "globalFavoriteChange": "subió|bajó|estable",
  "topNews": [
    {
      "title": "Noticia concreta",
      "impact": "alto|medio|bajo",
      "team": "País + emoji",
      "type": "lesión|resultado|táctica|otro",
      "detail": "Contexto en 1-2 frases"
    }
  ],
  "groups": {
    "A": {
      "teams": ["País 🏳️", "País 🏳️", "País 🏳️", "País 🏳️"],
      "favorite": "País + emoji",
      "favoriteOdds": 65,
      "trend": "subió|bajó|estable",
      "keyNews": "Lo más relevante del grupo hoy",
      "alert": null,
      "standings": [
        { "team": "País + emoji", "pts": 0, "gf": 0, "gc": 0, "gd": 0 }
      ],
      "nextMatch": "Equipo A vs Equipo B · DD/MM · Ciudad"
    }
  },
  "titleContenders": [
    { "team": "País + emoji", "odds": 22, "trend": "subió|bajó|estable", "reason": "Por qué" }
  ]
}
Genera los 12 grupos A hasta L completos.`;

  const userMsg = `Datos reales del Mundial 2026 a ${today}:

RESULTADOS RECIENTES:
${JSON.stringify(footballData.recentResults, null, 2)}

PRÓXIMOS PARTIDOS:
${JSON.stringify(footballData.upcomingFixtures, null, 2)}

STANDINGS POR GRUPO:
${JSON.stringify(footballData.groups, null, 2)}

Genera el análisis completo. Incluye lesiones conocidas (Rodrygo, Militão, Grealish, Gvardiol, Malagón, Gnabry).
Responde SOLO con el JSON.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5",
      max_tokens: 4000,
      system,
      messages: [{ role: "user", content: userMsg }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Claude API error: ${res.status} - ${errText}`);
  }

  const raw = await res.json();

  const text = (raw.content || [])
    .filter(b => b.type === "text")
    .map(b => b.text)
    .join("")
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1) throw new Error("No JSON en respuesta de Claude");

  return JSON.parse(text.slice(start, end + 1));
}

// ── 3. Main ───────────────────────────────────────────────────────────────────
async function main() {
  console.log("🚀 Iniciando actualización...");
  console.log("⏰", new Date().toLocaleString("es-CL"));

  const footballData = await getFootballData();
  const analysis = await generateAnalysis(footballData);

  const outputDir = path.join(__dirname, "..", "public", "data");
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const outputPath = path.join(outputDir, "mundial-data.json");
  fs.writeFileSync(outputPath, JSON.stringify(analysis, null, 2), "utf8");

  console.log("✅ Datos guardados en public/data/mundial-data.json");
  console.log("📊 Grupos:", Object.keys(analysis.groups || {}).join(", "));
  console.log("📰 Noticias:", analysis.topNews?.length || 0);
}

main().catch(err => {
  console.error("❌ Error fatal:", err.message);
  process.exit(1);
});
