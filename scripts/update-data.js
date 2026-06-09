// scripts/update-data.js — ENFOQUE EN PRONÓSTICOS
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// Fecha correcta en Chile (UTC-4)
function getChileDate() {
  const now = new Date();
  const chile = new Date(now.toLocaleString("en-US", { timeZone: "America/Santiago" }));
  return chile.toLocaleDateString("es-CL", {
    weekday: "long", year: "numeric", month: "long", day: "numeric"
  });
}

function getChileDateShort() {
  const now = new Date();
  const chile = new Date(now.toLocaleString("en-US", { timeZone: "America/Santiago" }));
  return chile.toISOString().split("T")[0];
}

// ── Claude helper ─────────────────────────────────────────────────────────────
async function callClaude(prompt, maxTokens = 1800) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`Claude API ${res.status}: ${await res.text().then(t => t.slice(0,200))}`);
  const raw = await res.json();
  let text = (raw.content || []).filter(b => b.type === "text").map(b => b.text).join("").trim()
    .replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
  const start = text.indexOf("{"); const end = text.lastIndexOf("}");
  if (start === -1) throw new Error("No JSON: " + text.slice(0,100));
  return JSON.parse(text.slice(start, end + 1));
}

// ── Fixture completo del Mundial ──────────────────────────────────────────────
const ALL_FIXTURES = [
  // Jornada 1
  { date:"2026-06-11", group:"A", home:"México",       away:"Sudáfrica",      j:1 },
  { date:"2026-06-11", group:"A", home:"Corea del Sur",away:"Rep. Checa",     j:1 },
  { date:"2026-06-12", group:"B", home:"Canadá",       away:"Bosnia y Herz.", j:1 },
  { date:"2026-06-12", group:"D", home:"EE.UU.",       away:"Paraguay",       j:1 },
  { date:"2026-06-13", group:"B", home:"Catar",        away:"Suiza",          j:1 },
  { date:"2026-06-13", group:"C", home:"Brasil",       away:"Marruecos",      j:1 },
  { date:"2026-06-13", group:"C", home:"Haití",        away:"Escocia",        j:1 },
  { date:"2026-06-13", group:"D", home:"Australia",    away:"Turquía",        j:1 },
  { date:"2026-06-14", group:"E", home:"Alemania",     away:"Curazao",        j:1 },
  { date:"2026-06-14", group:"E", home:"C. Marfil",    away:"Ecuador",        j:1 },
  { date:"2026-06-14", group:"F", home:"Países Bajos", away:"Japón",          j:1 },
  { date:"2026-06-14", group:"F", home:"Suecia",       away:"Túnez",          j:1 },
  { date:"2026-06-15", group:"G", home:"Bélgica",      away:"Egipto",         j:1 },
  { date:"2026-06-15", group:"G", home:"Irán",         away:"Nueva Zelanda",  j:1 },
  { date:"2026-06-15", group:"H", home:"España",       away:"Cabo Verde",     j:1 },
  { date:"2026-06-15", group:"H", home:"Arabia Saudita",away:"Uruguay",       j:1 },
  { date:"2026-06-16", group:"I", home:"Francia",      away:"Senegal",        j:1 },
  { date:"2026-06-16", group:"I", home:"Irak",         away:"Noruega",        j:1 },
  { date:"2026-06-16", group:"J", home:"Argentina",    away:"Argelia",        j:1 },
  { date:"2026-06-16", group:"J", home:"Austria",      away:"Jordania",       j:1 },
  { date:"2026-06-17", group:"K", home:"Portugal",     away:"RD Congo",       j:1 },
  { date:"2026-06-17", group:"K", home:"Uzbekistán",   away:"Colombia",       j:1 },
  { date:"2026-06-17", group:"L", home:"Inglaterra",   away:"Croacia",        j:1 },
  { date:"2026-06-17", group:"L", home:"Ghana",        away:"Panamá",         j:1 },
  // Jornada 2
  { date:"2026-06-18", group:"A", home:"México",       away:"Corea del Sur",  j:2 },
  { date:"2026-06-18", group:"A", home:"Rep. Checa",   away:"Sudáfrica",      j:2 },
  { date:"2026-06-18", group:"B", home:"Suiza",        away:"Bosnia y Herz.", j:2 },
  { date:"2026-06-18", group:"B", home:"Canadá",       away:"Catar",          j:2 },
  { date:"2026-06-19", group:"C", home:"Escocia",      away:"Marruecos",      j:2 },
  { date:"2026-06-19", group:"C", home:"Brasil",       away:"Haití",          j:2 },
  { date:"2026-06-19", group:"D", home:"EE.UU.",       away:"Australia",      j:2 },
  { date:"2026-06-19", group:"D", home:"Turquía",      away:"Paraguay",       j:2 },
  { date:"2026-06-20", group:"E", home:"Alemania",     away:"C. Marfil",      j:2 },
  { date:"2026-06-20", group:"E", home:"Ecuador",      away:"Curazao",        j:2 },
  { date:"2026-06-20", group:"F", home:"Países Bajos", away:"Suecia",         j:2 },
  { date:"2026-06-20", group:"F", home:"Túnez",        away:"Japón",          j:2 },
  { date:"2026-06-21", group:"G", home:"Bélgica",      away:"Irán",           j:2 },
  { date:"2026-06-21", group:"G", home:"Nueva Zelanda",away:"Egipto",         j:2 },
  { date:"2026-06-21", group:"H", home:"España",       away:"Arabia Saudita", j:2 },
  { date:"2026-06-21", group:"H", home:"Uruguay",      away:"Cabo Verde",     j:2 },
  { date:"2026-06-22", group:"I", home:"Francia",      away:"Irak",           j:2 },
  { date:"2026-06-22", group:"I", home:"Noruega",      away:"Senegal",        j:2 },
  { date:"2026-06-22", group:"J", home:"Argentina",    away:"Austria",        j:2 },
  { date:"2026-06-22", group:"J", home:"Jordania",     away:"Argelia",        j:2 },
  { date:"2026-06-23", group:"K", home:"Portugal",     away:"Uzbekistán",     j:2 },
  { date:"2026-06-23", group:"K", home:"Colombia",     away:"RD Congo",       j:2 },
  { date:"2026-06-23", group:"L", home:"Inglaterra",   away:"Ghana",          j:2 },
  { date:"2026-06-23", group:"L", home:"Panamá",       away:"Croacia",        j:2 },
  // Jornada 3
  { date:"2026-06-24", group:"A", home:"México",       away:"Rep. Checa",     j:3 },
  { date:"2026-06-24", group:"A", home:"Sudáfrica",    away:"Corea del Sur",  j:3 },
  { date:"2026-06-24", group:"B", home:"Suiza",        away:"Canadá",         j:3 },
  { date:"2026-06-24", group:"B", home:"Bosnia y Herz.",away:"Catar",         j:3 },
  { date:"2026-06-25", group:"C", home:"Brasil",       away:"Escocia",        j:3 },
  { date:"2026-06-25", group:"C", home:"Marruecos",    away:"Haití",          j:3 },
  { date:"2026-06-25", group:"D", home:"EE.UU.",       away:"Turquía",        j:3 },
  { date:"2026-06-25", group:"D", home:"Paraguay",     away:"Australia",      j:3 },
  { date:"2026-06-26", group:"E", home:"Alemania",     away:"Ecuador",        j:3 },
  { date:"2026-06-26", group:"E", home:"C. Marfil",    away:"Curazao",        j:3 },
  { date:"2026-06-26", group:"F", home:"Países Bajos", away:"Túnez",          j:3 },
  { date:"2026-06-26", group:"F", home:"Japón",        away:"Suecia",         j:3 },
  { date:"2026-06-26", group:"G", home:"Bélgica",      away:"Nueva Zelanda",  j:3 },
  { date:"2026-06-26", group:"G", home:"Egipto",       away:"Irán",           j:3 },
  { date:"2026-06-26", group:"H", home:"España",       away:"Uruguay",        j:3 },
  { date:"2026-06-26", group:"H", home:"Cabo Verde",   away:"Arabia Saudita", j:3 },
  { date:"2026-06-26", group:"I", home:"Francia",      away:"Noruega",        j:3 },
  { date:"2026-06-26", group:"I", home:"Senegal",      away:"Irak",           j:3 },
  { date:"2026-06-26", group:"J", home:"Argentina",    away:"Jordania",       j:3 },
  { date:"2026-06-26", group:"J", home:"Argelia",      away:"Austria",        j:3 },
  { date:"2026-06-27", group:"K", home:"Portugal",     away:"Colombia",       j:3 },
  { date:"2026-06-27", group:"K", home:"RD Congo",     away:"Uzbekistán",     j:3 },
  { date:"2026-06-27", group:"L", home:"Inglaterra",   away:"Panamá",         j:3 },
  { date:"2026-06-27", group:"L", home:"Croacia",      away:"Ghana",          j:3 },
];

// ── Generar pronósticos para un lote de partidos ──────────────────────────────
async function getMatchPredictions(matches, today) {
  const matchList = matches.map((m,i) =>
    `${i+1}. ${m.home} vs ${m.away} (Grupo ${m.group}, J${m.j}, ${m.date})`
  ).join("\n");

  const prompt = `Eres el mejor analista estadístico de fútbol del mundo. Hoy es ${today}.
Mundial FIFA 2026. Analiza estos partidos con tu conocimiento de:
- Ranking FIFA y ELO de cada equipo
- Forma reciente (últimos 10 partidos)
- Lesiones confirmadas: Rodrygo(Brasil,LCA), Militao(Brasil,muscular), Grealish(Inglaterra,pie), Gvardiol(Croacia,pierna), Malagón(México,Aquiles), Gnabry(Alemania), Foyth(Argentina,Aquiles), Panichelli(Argentina,LCA), Yamal(España,duda)
- Head-to-head histórico
- Factor sede (USA/México/Canadá)

PARTIDOS:
${matchList}

Devuelve JSON exacto:
{
  "predictions": [
    {
      "match": "${matches[0]?.home} vs ${matches[0]?.away}",
      "date": "${matches[0]?.date}",
      "group": "${matches[0]?.group}",
      "jornada": ${matches[0]?.j},
      "probHome": 55,
      "probDraw": 25,
      "probAway": 20,
      "predictedScore": "2-0",
      "confidence": 72,
      "favorito": "${matches[0]?.home}",
      "keyFactor": "razon principal en 1 frase",
      "homeGoals": 2,
      "awayGoals": 0
    }
  ]
}
Solo JSON valido. Sin texto adicional.`;

  const result = await callClaude(prompt, 2000);
  return result.predictions || [];
}

// ── Generar grupos ────────────────────────────────────────────────────────────
async function getGroups(groupIds, today) {
  const fixtures = {
    A:"México vs Sudáfrica 11jun, Corea del Sur vs Rep.Checa 11jun",
    B:"Canadá vs Bosnia 12jun, Catar vs Suiza 13jun",
    C:"Brasil vs Marruecos 13jun, Haití vs Escocia 13jun",
    D:"EE.UU. vs Paraguay 12jun, Australia vs Turquía 13jun",
    E:"Alemania vs Curazao 14jun, C.Marfil vs Ecuador 14jun",
    F:"Países Bajos vs Japón 14jun, Suecia vs Túnez 14jun",
    G:"Bélgica vs Egipto 15jun, Irán vs Nueva Zelanda 15jun",
    H:"España vs Cabo Verde 15jun, Arabia Saudita vs Uruguay 15jun",
    I:"Francia vs Senegal 16jun, Irak vs Noruega 16jun",
    J:"Argentina vs Argelia 16jun, Austria vs Jordania 16jun",
    K:"Portugal vs RD Congo 17jun, Uzbekistán vs Colombia 17jun",
    L:"Inglaterra vs Croacia 17jun, Ghana vs Panamá 17jun",
  };
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

  const prompt = `Mundial 2026, hoy ${today}.
Lesiones clave: Rodrygo(Brasil), Militao(Brasil), Grealish(Inglaterra), Gvardiol(Croacia), Malagón(México), Gnabry(Alemania), Foyth(Argentina), Panichelli(Argentina).

Genera análisis para grupos: ${groupIds.join(", ")}

JSON exacto:
{
  ${groupIds.map(g => `"${g}": {
    "teams": ${JSON.stringify(teams[g])},
    "favorite": "nombre",
    "favoriteOdds": 65,
    "trend": "estable",
    "keyNews": "texto max 80 chars",
    "alert": null,
    "standings": ${JSON.stringify(teams[g].map(t => ({team:t,pts:0,gf:0,gc:0,gd:0})))},
    "nextMatch": "${fixtures[g]?.split(",")[0]?.trim()}"
  }`).join(",\n  ")}
}
Solo JSON.`;

  return await callClaude(prompt, 1800);
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log("🚀 Iniciando actualización...");
  const today = getChileDate();
  const todayShort = getChileDateShort();
  console.log("📅 Fecha Chile:", today);

  // 1. Pronósticos de partidos por lotes de 6
  console.log("⚽ Generando pronósticos de partidos...");
  const allPredictions = [];
  const batchSize = 6;
  for (let i = 0; i < ALL_FIXTURES.length; i += batchSize) {
    const batch = ALL_FIXTURES.slice(i, i + batchSize);
    console.log(`  Lote ${Math.floor(i/batchSize)+1}: ${batch.map(m=>m.home+" vs "+m.away).join(", ")}`);
    const preds = await getMatchPredictions(batch, today);
    allPredictions.push(...preds);
    console.log(`  ✅ ${preds.length} pronósticos generados`);
  }
  console.log(`✅ Total pronósticos: ${allPredictions.length}`);

  // 2. Grupos por lotes de 4
  console.log("📊 Generando análisis de grupos...");
  const [groupsAD, groupsEH, groupsIL] = await Promise.all([
    getGroups(["A","B","C","D"], today),
    getGroups(["E","F","G","H"], today),
    getGroups(["I","J","K","L"], today),
  ]);
  console.log("✅ Grupos generados");

  // 3. Noticias y candidatos
  console.log("📰 Generando noticias y candidatos...");
  const meta = await callClaude(`Mundial 2026, hoy ${today}.
Lesiones: Rodrygo(Brasil,LCA), Militao(Brasil), Grealish(Inglaterra), Gvardiol(Croacia), Malagón(México), Gnabry(Alemania), Foyth(Argentina), Panichelli(Argentina).
Colombia ganó 2-0 a Jordania (Jhon Arias x2).

JSON:
{
  "headline": "titular del dia",
  "globalFavorite": "Francia",
  "globalFavoriteChange": "estable",
  "topNews": [
    {"title":"texto","impact":"alto","team":"pais","type":"lesión","detail":"contexto"}
  ],
  "titleContenders": [
    {"team":"pais","odds":20,"trend":"estable","reason":"razon"}
  ]
}
Max 6 noticias, 6 candidatos. Solo JSON.`, 1500);
  console.log("✅ Meta generado");

  // 4. Partidos de hoy y próximos 3 días
  const todayMatches = ALL_FIXTURES.filter(f => f.date === todayShort);
  const upcomingDates = [...new Set(
    ALL_FIXTURES
      .filter(f => f.date >= todayShort)
      .map(f => f.date)
  )].slice(0, 3);
  const upcomingMatches = ALL_FIXTURES.filter(f => upcomingDates.includes(f.date));

  // 5. Combinar todo
  const analysis = {
    lastUpdated: today,
    lastUpdatedShort: todayShort,
    headline: meta.headline || "Mundial 2026 - Análisis en vivo",
    globalFavorite: meta.globalFavorite || "Francia",
    globalFavoriteChange: meta.globalFavoriteChange || "estable",
    topNews: meta.topNews || [],
    titleContenders: meta.titleContenders || [],
    groups: { ...groupsAD, ...groupsEH, ...groupsIL },
    predictions: allPredictions,
    todayMatches: todayMatches.map(m => ({
      ...m,
      prediction: allPredictions.find(p =>
        p.match?.includes(m.home) && p.match?.includes(m.away)
      ) || null
    })),
    upcomingMatches: upcomingMatches.map(m => ({
      ...m,
      prediction: allPredictions.find(p =>
        p.match?.includes(m.home) && p.match?.includes(m.away)
      ) || null
    })),
  };

  // 6. Guardar
  const outputDir = path.join(__dirname, "..", "public", "data");
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(
    path.join(outputDir, "mundial-data.json"),
    JSON.stringify(analysis, null, 2), "utf8"
  );

  console.log("✅ Guardado en public/data/mundial-data.json");
  console.log("⚽ Pronósticos:", allPredictions.length);
  console.log("📊 Grupos:", Object.keys(analysis.groups).length);
  console.log("📰 Noticias:", analysis.topNews.length);
  console.log("🏆 Candidatos:", analysis.titleContenders.length);
  console.log("📅 Partidos hoy:", todayMatches.length);
}

main().catch(err => {
  console.error("❌ Error fatal:", err.message);
  process.exit(1);
});
