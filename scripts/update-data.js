// scripts/update-data.js - DIAGNÓSTICO v2
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const FOOTBALL_API_KEY = process.env.FOOTBALL_API_KEY;

async function main() {
  console.log("🔍 DIAGNÓSTICO DE APIs");
  console.log("=".repeat(50));

  // Test 1: Verificar que las keys existen
  console.log("\n1. VERIFICANDO KEYS:");
  console.log("ANTHROPIC_API_KEY existe:", !!ANTHROPIC_API_KEY);
  console.log("ANTHROPIC_API_KEY longitud:", ANTHROPIC_API_KEY?.length || 0);
  console.log("ANTHROPIC_API_KEY primeros 10 chars:", ANTHROPIC_API_KEY?.substring(0, 10) || "VACÍA");
  console.log("FOOTBALL_API_KEY existe:", !!FOOTBALL_API_KEY);
  console.log("FOOTBALL_API_KEY primeros 10 chars:", FOOTBALL_API_KEY?.substring(0, 10) || "VACÍA");

  // Test 2: Llamada mínima a Claude
  console.log("\n2. PROBANDO CLAUDE API:");
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 50,
        messages: [{ role: "user", content: "Di solo: OK" }],
      }),
    });

    console.log("Status HTTP:", res.status);
    const body = await res.text();
    console.log("Respuesta completa:", body.substring(0, 500));

  } catch (err) {
    console.log("Error de red:", err.message);
  }

  // Test 3: Llamada a API-Football
  console.log("\n3. PROBANDO API-FOOTBALL:");
  try {
    const res = await fetch("https://v3.football.api-sports.io/status", {
      headers: { "x-apisports-key": FOOTBALL_API_KEY }
    });
    console.log("Status HTTP:", res.status);
    const body = await res.text();
    console.log("Respuesta:", body.substring(0, 300));
  } catch (err) {
    console.log("Error de red:", err.message);
  }

  console.log("\n=".repeat(50));
  console.log("✅ Diagnóstico completado");
}

main().catch(err => {
  console.error("Error:", err.message);
  process.exit(1);
});
