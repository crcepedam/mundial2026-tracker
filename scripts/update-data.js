// scripts/update-data.js
// Este script corre 2x/día via GitHub Actions
// Obtiene datos de API-Football + genera análisis con Claude
// Guarda el resultado en public/data/mundial-data.json

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const FOOTBALL_API_KEY = process.env.FOOTBALL_API_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const WC_LEAGUE_ID = 1; // FIFA World Cup 2026 en API-Football

// ── 1. Obtener datos de API-Football ─────────────────────────────────────────
async function getFootballData() {
  console.log("📡 Obteniendo datos de API-Football...");

  const headers = {
    "x-apisports-key": FOOTBALL_API_KEY,
  };

  try {
    // Standings (tabla de posiciones)
    const standingsRes = await fetch(
      `https://v3.football.api-sports.io/standings?league=${WC_LEAGUE_ID}&season=2026`,
      { headers }
    );
    const standingsData = await standingsRes.json();

    // Fixtures recientes y próximos
    const fixturesRes = await fetch(
      `https://v3.football.api-sports.io/fixtures?league=${WC_LEAGUE_ID}&season=2026`,
      { headers }
    );
    const fixturesData = await fixturesRes.json();

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

    // Parsear fixtures
    const allFixtures = fixturesData?.response || [];
    const today = new Date().toISOString().split("T")[0];

    const recentResults = allFixtures
      .filter(f => f.fixture.status.short === "FT")
      .slice(-15)
      .map(f => ({
        date: f.fixture.date?.split("T")[0],
        home: f.teams.home.name,
        away: f.teams.away.name,
        homeGoals: f.goals.home,
        awayGoals: f.goals.away,
        round: f.league.round,
      }));

    const upcomingFixtures = allFixtures
      .filter(f => f.fixture.status.short === "NS" && f.fixture.date >= today)
      .slice(0, 10)
      .map(f => ({
        date: f.fixture.date?.split("T")[0],
        time: f.fixture.date?.split("T")[1]?.slice(0, 5),
        home: f.teams.home.name,
        away: f.teams.away.name,
        round: f.league.round,
        venue: f.fixture.venue?.name,
      }));

    console.log(`✅ Standings: ${Object.keys(groups).length} grupos`);
    console.log(`✅ Resultados recientes: ${recentResults.length}`);
    console.log(`✅ Próximos partidos: ${upcomingFixtures.length}`);

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
48 equipos, 12 grupos. Clasifican top 2 de cada grupo + 8 mejores terceros.

Recibirás datos reales de resultados y standings. Analiza y devuelve SOLO un JSON válido, sin markdown.

Estructura exacta:
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
      "alert": "Alerta crítica o null",
      "standings": [
        { "team": "País + emoji", "pts": 3, "gf": 2, "gc": 0, "gd": 2 }
      ],
      "nextMatch": "Equipo A vs Equipo B · DD/MM · Ciudad"
    }
  },
  "titleContenders": [
    { "team": "País + emoji", "odds": 22, "trend": "subió|bajó|estable", "reason": "Por qué" }
  ]
}`;

  const userMsg = `Datos reales del Mundial 2026 a ${today}:

RESULTADOS RECIENTES:
${JSON.stringify(footballData.recentResults, null, 2)}

PRÓXIMOS PARTIDOS:
${JSON.stringify(footballData.upcomingFixtures, null, 2)}

STANDINGS ACTUALES POR GRUPO:
${JSON.stringify(footballData.groups, null, 2)}

Genera el análisis completo con los 12 grupos (A-L).
Incluye lesiones conocidas (Rodrygo, Militão, Grealish, Gvardiol, Malagón, Gnabry, etc).
Responde SOLO con el JSON, sin texto adicional.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4000,
      system,
      messages: [{ role: "user", content: userMsg }],
    }),
  });

  if (!res.ok) throw new Error(`Claude API error: ${res.status}`);
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

// ── 3. Guardar JSON ───────────────────────────────────────────────────────────
async function main() {
  console.log("🚀 Iniciando actualización de datos del Mundial 2026...");
  console.log("⏰", new Date().toLocaleString("es-CL"));

  const footballData = await getFootballData();
  const analysis = await generateAnalysis(footballData);

  // Crear directorio si no existe
  const outputDir = path.join(__dirname, "..", "public", "data");
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputPath = path.join(outputDir, "mundial-data.json");
  fs.writeFileSync(outputPath, JSON.stringify(analysis, null, 2), "utf8");

  console.log("✅ Datos guardados en public/data/mundial-data.json");
  console.log("📊 Grupos actualizados:", Object.keys(analysis.groups || {}).join(", "));
  console.log("📰 Noticias:", analysis.topNews?.length || 0);
  console.log("🏆 Candidatos:", analysis.titleContenders?.length || 0);
}

main().catch(err => {
  console.error("❌ Error fatal:", err.message);
  process.exit(1);
});
