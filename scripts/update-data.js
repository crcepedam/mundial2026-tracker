// scripts/update-data.js
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// ── Claude call helper ────────────────────────────────────────────────────────
async function callClaude(prompt) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude API ${res.status}: ${err.slice(0, 200)}`);
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
  const end = text.lastIndexOf("}");
  if (start === -1) throw new Error("No JSON en respuesta");
  return JSON.parse(text.slice(start, end + 1));
}

// ── Prompt base para grupos ───────────────────────────────────────────────────
function makeGroupPrompt(groups) {
  const today = new Date().toLocaleDateString("es-CL", {
    weekday: "long", year: "numeric", month: "long", day: "numeric"
  });

  const groupList = groups.join(", ");
  const fixtures = {
    A: "Mexico vs Sudafrica 11jun, Corea vs RepCheca 11jun",
    B: "Canada vs Bosnia 12jun, Qatar vs Suiza 13jun",
    C: "Brasil vs Marruecos 13jun, Haiti vs Escocia 13jun",
    D: "EEUU vs Paraguay 12jun, Australia vs Turquia 13jun",
    E: "Alemania vs Curazao 14jun, CMarfil vs Ecuador 14jun",
    F: "PBajos vs Japon 14jun, Suecia vs Tunez 14jun",
    G: "Belgica vs Egipto 15jun, Iran vs NZelanda 15jun",
    H: "Espana vs CaboVerde 15jun, ArabSaudita vs Uruguay 15jun",
    I: "Francia vs Senegal 16jun, Irak vs Noruega 16jun",
    J: "Argentina vs Argelia 16jun, Austria vs Jordania 16jun",
    K: "Portugal vs RDCongo 17jun, Uzbekistan vs Colombia 17jun",
    L: "Inglaterra vs Croacia 17jun, Ghana vs Panama 17jun",
  };

  const injuries = "Lesiones: Rodrygo(Brasil,LCA), Militao(Brasil,muscular), Grealish(Inglaterra,pie), Gvardiol(Croacia,pierna), Malagon(Mexico,Aquiles), Gnabry(Alemania), Foyth(Argentina,Aquiles), Panichelli(Argentina,LCA)";

  const selected = groups.reduce((acc, g) => {
    acc[g] = fixtures[g] || "";
    return acc;
  }, {});

  return `Mundial FIFA 2026, hoy ${today}. Torneo inicia 11 junio.
${injuries}

Genera JSON con SOLO estos grupos: ${groupList}
Partidos: ${JSON.stringify(selected)}

Formato EXACTO (sin espacios extra, sin emojis en keys):
{
  ${groups.map(g => `"${g}": {
    "teams": ["Pais1","Pais2","Pais3","Pais4"],
    "favorite": "Pais",
    "favoriteOdds": 65,
    "trend": "estable",
    "keyNews": "texto corto",
    "alert": null,
    "standings": [
      {"team":"Pais1","pts":0,"gf":0,"gc":0,"gd":0},
      {"team":"Pais2","pts":0,"gf":0,"gc":0,"gd":0},
      {"team":"Pais3","pts":0,"gf":0,"gc":0,"gd":0},
      {"team":"Pais4","pts":0,"gf":0,"gc":0,"gd":0}
    ],
    "nextMatch": "EquipoA vs EquipoB - DD/MM"
  }`).join(",\n  ")}
}

Solo JSON valido. Sin texto adicional.`;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log("🚀 Iniciando actualización...");
  console.log("⏰", new Date().toLocaleString("es-CL"));

  const today = new Date().toLocaleDateString("es-CL", {
    weekday: "long", year: "numeric", month: "long", day: "numeric"
  });

  // Generar grupos en 3 lotes de 4
  console.log("📊 Generando grupos A-D...");
  const groupsAD = await callClaude(makeGroupPrompt(["A","B","C","D"]));
  console.log("✅ Grupos A-D OK");

  console.log("📊 Generando grupos E-H...");
  const groupsEH = await callClaude(makeGroupPrompt(["E","F","G","H"]));
  console.log("✅ Grupos E-H OK");

  console.log("📊 Generando grupos I-L...");
  const groupsIL = await callClaude(makeGroupPrompt(["I","J","K","L"]));
  console.log("✅ Grupos I-L OK");

  // Generar noticias y candidatos
  console.log("📰 Generando noticias y candidatos...");
  const meta = await callClaude(`Mundial 2026, hoy ${today}.
Lesiones: Rodrygo(Brasil,LCA), Militao(Brasil), Grealish(Inglaterra), Gvardiol(Croacia), Malagon(Mexico), Gnabry(Alemania), Foyth(Argentina), Panichelli(Argentina).
Colombia gano 2-0 a Jordania (Jhon Arias x2). Argentina entrena en Texas.

Genera JSON con:
{
  "headline": "titular impactante del dia",
  "globalFavorite": "Francia",
  "globalFavoriteChange": "estable",
  "topNews": [
    {"title":"texto","impact":"alto","team":"pais","type":"lesion","detail":"contexto"}
  ],
  "titleContenders": [
    {"team":"pais","odds":20,"trend":"estable","reason":"razon corta"}
  ]
}
Maximo 6 noticias, 6 candidatos. Solo JSON.`);
  console.log("✅ Meta OK");

  // Combinar todo
  const analysis = {
    lastUpdated: today,
    headline: meta.headline || "Mundial 2026 inicia el 11 de junio",
    globalFavorite: meta.globalFavorite || "Francia",
    globalFavoriteChange: meta.globalFavoriteChange || "estable",
    topNews: meta.topNews || [],
    groups: {
      ...groupsAD,
      ...groupsEH,
      ...groupsIL,
    },
    titleContenders: meta.titleContenders || [],
  };

  // Guardar
  const outputDir = path.join(__dirname, "..", "public", "data");
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const outputPath = path.join(outputDir, "mundial-data.json");
  fs.writeFileSync(outputPath, JSON.stringify(analysis, null, 2), "utf8");

  console.log("✅ Guardado en public/data/mundial-data.json");
  console.log("📊 Grupos:", Object.keys(analysis.groups).join(", "));
  console.log("📰 Noticias:", analysis.topNews.length);
  console.log("🏆 Candidatos:", analysis.titleContenders.length);
}

main().catch(err => {
  console.error("❌ Error fatal:", err.message);
  process.exit(1);
});
