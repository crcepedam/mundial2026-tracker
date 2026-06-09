import { useState, useEffect } from "react";

const trendIcon  = { subió:"↑", bajó:"↓", estable:"→" };
const trendColor = { subió:"#22c55e", bajó:"#ef4444", estable:"#94a3b8" };
const impactColor = { alto:"#ef4444", medio:"#f59e0b", bajo:"#22c55e" };
const typeIcon   = { "lesión":"🤕","resultado":"⚽","táctica":"🧠","otro":"📰" };

function OddsBar({ odds, trend }) {
  const c = trendColor[trend] || "#c8a84b";
  return (
    <div style={{ display:"flex", alignItems:"center", gap:6, marginTop:4 }}>
      <div style={{ flex:1, height:5, background:"rgba(255,255,255,0.08)", borderRadius:3, overflow:"hidden" }}>
        <div style={{ width:`${Math.min(odds,100)}%`, height:"100%", background:c, borderRadius:3 }} />
      </div>
      <span style={{ fontSize:12, fontWeight:800, color:c, minWidth:32 }}>{odds}%</span>
      <span style={{ color:c, fontWeight:700 }}>{trendIcon[trend]||"→"}</span>
    </div>
  );
}

function MatchCard({ m, showDate = false }) {
  const p = m.prediction;
  if (!p) return null;

  const total = (p.probHome||0) + (p.probDraw||0) + (p.probAway||0);
  const pH = Math.round((p.probHome||0) / total * 100);
  const pD = Math.round((p.probDraw||0) / total * 100);
  const pA = 100 - pH - pD;

  const confColor = p.confidence >= 70 ? "#22c55e" : p.confidence >= 55 ? "#f59e0b" : "#94a3b8";

  return (
    <div style={{
      background:"rgba(255,255,255,0.03)",
      border:"1px solid rgba(255,255,255,0.08)",
      borderRadius:14, padding:"14px 16px", marginBottom:10,
    }}>
      {showDate && (
        <div style={{ fontSize:10, color:"#475569", marginBottom:6, letterSpacing:1, textTransform:"uppercase" }}>
          {m.date} · Grupo {m.group} · Jornada {m.jornada || m.j}
        </div>
      )}

      {/* Equipos y marcador */}
      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
        <div style={{ flex:1, textAlign:"right" }}>
          <div style={{ fontSize:15, fontWeight:700, color: p.favorito===m.home?"#c8a84b":"#e2e8f0" }}>{m.home}</div>
          <div style={{ fontSize:11, color:"#475569" }}>Local</div>
        </div>
        <div style={{ textAlign:"center", minWidth:80 }}>
          <div style={{
            fontSize:22, fontWeight:900, color:"#c8a84b",
            background:"rgba(200,168,75,0.12)",
            padding:"4px 12px", borderRadius:8,
            border:"1px solid rgba(200,168,75,0.3)",
          }}>
            {p.predictedScore || "?-?"}
          </div>
          <div style={{ fontSize:10, color:"#475569", marginTop:3 }}>Pronóstico</div>
        </div>
        <div style={{ flex:1, textAlign:"left" }}>
          <div style={{ fontSize:15, fontWeight:700, color: p.favorito===m.away?"#c8a84b":"#e2e8f0" }}>{m.away}</div>
          <div style={{ fontSize:11, color:"#475569" }}>Visitante</div>
        </div>
      </div>

      {/* Barra de probabilidades */}
      <div style={{ marginBottom:8 }}>
        <div style={{ display:"flex", height:8, borderRadius:6, overflow:"hidden", marginBottom:4 }}>
          <div style={{ width:`${pH}%`, background:"#22c55e" }} title={`Local ${pH}%`} />
          <div style={{ width:`${pD}%`, background:"#f59e0b" }} title={`Empate ${pD}%`} />
          <div style={{ width:`${pA}%`, background:"#ef4444" }} title={`Visitante ${pA}%`} />
        </div>
        <div style={{ display:"flex", justifyContent:"space-between", fontSize:11 }}>
          <span style={{ color:"#22c55e", fontWeight:700 }}>🏠 {pH}%</span>
          <span style={{ color:"#f59e0b", fontWeight:700 }}>🤝 {pD}%</span>
          <span style={{ color:"#ef4444", fontWeight:700 }}>✈️ {pA}%</span>
        </div>
      </div>

      {/* Confianza y factor clave */}
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" }}>
        <span style={{
          fontSize:11, padding:"2px 8px", borderRadius:10,
          background:`${confColor}22`, color:confColor, fontWeight:700,
        }}>
          Confianza: {p.confidence}%
        </span>
        <span style={{ fontSize:11, color:"#64748b", flex:1 }}>
          {p.keyFactor}
        </span>
      </div>
    </div>
  );
}

export default function App() {
  const [data, setData]          = useState(null);
  const [loading, setLoading]    = useState(true);
  const [error, setError]        = useState(null);
  const [activeGroup, setActive] = useState("A");
  const [activeTab, setTab]      = useState("partidos");
  const [matchFilter, setFilter] = useState("todos");

  useEffect(() => {
    fetch("/data/mundial-data.json?t=" + Date.now())
      .then(r => { if (!r.ok) throw new Error("Error cargando datos"); return r.json(); })
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  if (loading) return (
    <div style={{ minHeight:"100vh", background:"#060d1a", display:"flex", flexDirection:"column",
      alignItems:"center", justifyContent:"center", color:"#e2e8f0" }}>
      <div style={{ fontSize:48 }}>⚽</div>
      <div style={{ fontSize:16, color:"#c8a84b", marginTop:16, fontWeight:700 }}>Cargando...</div>
    </div>
  );

  if (error) return (
    <div style={{ minHeight:"100vh", background:"#060d1a", display:"flex", flexDirection:"column",
      alignItems:"center", justifyContent:"center", color:"#e2e8f0" }}>
      <div style={{ fontSize:14, color:"#ef4444" }}>⚠️ {error}</div>
    </div>
  );

  const grp = data?.groups?.[activeGroup];
  const groupKeys = data?.groups ? Object.keys(data.groups) : [];

  // Filtrar partidos
  const allPredictions = data?.predictions || [];
  const filteredMatches = matchFilter === "todos"
    ? allPredictions
    : allPredictions.filter(p => p.group === matchFilter);

  // Agrupar por fecha
  const matchesByDate = filteredMatches.reduce((acc, p) => {
    const d = p.date || "sin fecha";
    if (!acc[d]) acc[d] = [];
    acc[d].push(p);
    return acc;
  }, {});

  const sortedDates = Object.keys(matchesByDate).sort();
  const uniqueGroups = [...new Set(allPredictions.map(p => p.group))].sort();

  return (
    <div style={{ minHeight:"100vh", background:"#060d1a", color:"#e2e8f0", fontFamily:"Georgia,serif" }}>

      {/* Header */}
      <div style={{ background:"linear-gradient(180deg,#0c1f3d,#071428)", borderBottom:"3px solid #c8a84b" }}>
        <div style={{ background:"#c8a84b", textAlign:"center", padding:"4px 8px",
          fontSize:11, letterSpacing:3, color:"#000", fontWeight:700 }}>
          ★ MUNDIAL FIFA 2026 — PRONÓSTICOS Y ANÁLISIS ★
        </div>
        <div style={{ padding:"16px 16px 10px", textAlign:"center" }}>
          <div style={{ fontSize:30, fontWeight:900, letterSpacing:-2, color:"#fff" }}>⚽ MUNDIAL 2026</div>
          <div style={{ fontSize:11, color:"#c8a84b", letterSpacing:3, marginTop:3, textTransform:"uppercase" }}>
            Pronósticos · Probabilidades · Actualización 2x/día
          </div>
          {data?.headline && (
            <div style={{ fontSize:13, color:"#c8a84b", marginTop:8, padding:"5px 14px",
              background:"rgba(200,168,75,0.1)", borderRadius:20, display:"inline-block",
              border:"1px solid rgba(200,168,75,0.25)", maxWidth:500, lineHeight:1.4 }}>
              {data.headline}
            </div>
          )}
          <div style={{ marginTop:6, fontSize:11, color:"#475569" }}>
            🕒 {data?.lastUpdated}
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display:"flex", justifyContent:"center", gap:2, paddingBottom:0, flexWrap:"wrap" }}>
          {[
            ["partidos","⚽ Pronósticos"],
            ["groups","🗂️ Grupos"],
            ["news","📡 Noticias"],
            ["title","🏆 Candidatos"],
          ].map(([t,label]) => (
            <button key={t} onClick={() => setTab(t)} style={{
              background: activeTab===t ? "#c8a84b" : "transparent",
              color: activeTab===t ? "#000" : "#94a3b8",
              border:"none", padding:"9px 14px", fontWeight:700,
              fontSize:12, cursor:"pointer", borderRadius:"8px 8px 0 0",
            }}>{label}</button>
          ))}
        </div>
      </div>

      <div style={{ padding:"14px", maxWidth:960, margin:"0 auto" }}>

        {/* ── PRONÓSTICOS ── */}
        {activeTab === "partidos" && (
          <>
            {/* Leyenda */}
            <div style={{ display:"flex", gap:16, marginBottom:12, fontSize:12, flexWrap:"wrap" }}>
              <span><span style={{ color:"#22c55e" }}>■</span> Victoria local</span>
              <span><span style={{ color:"#f59e0b" }}>■</span> Empate</span>
              <span><span style={{ color:"#ef4444" }}>■</span> Victoria visitante</span>
              <span style={{ color:"#64748b" }}>· Marcador = resultado más probable</span>
            </div>

            {/* Filtro por grupo */}
            <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:16 }}>
              <button onClick={() => setFilter("todos")} style={{
                background: matchFilter==="todos" ? "#c8a84b" : "rgba(255,255,255,0.06)",
                color: matchFilter==="todos" ? "#000" : "#94a3b8",
                border:"none", borderRadius:8, padding:"5px 12px",
                fontWeight:700, fontSize:12, cursor:"pointer",
              }}>Todos</button>
              {uniqueGroups.map(g => (
                <button key={g} onClick={() => setFilter(g)} style={{
                  background: matchFilter===g ? "#c8a84b" : "rgba(255,255,255,0.06)",
                  color: matchFilter===g ? "#000" : "#94a3b8",
                  border:"none", borderRadius:8, padding:"5px 12px",
                  fontWeight:700, fontSize:12, cursor:"pointer",
                }}>G{g}</button>
              ))}
            </div>

            {/* Partidos agrupados por fecha */}
            {sortedDates.map(date => (
              <div key={date} style={{ marginBottom:20 }}>
                <div style={{
                  fontSize:12, fontWeight:700, letterSpacing:2, color:"#c8a84b",
                  textTransform:"uppercase", borderBottom:"1px solid rgba(200,168,75,0.25)",
                  paddingBottom:6, marginBottom:10,
                }}>
                  📅 {new Date(date + "T12:00:00").toLocaleDateString("es-CL", {
                    weekday:"long", day:"numeric", month:"long"
                  })}
                </div>
                {matchesByDate[date].map((p, i) => {
                  const fixture = { home: p.match?.split(" vs ")[0] || "", away: p.match?.split(" vs ")[1] || "",
                    date: p.date, group: p.group, j: p.jornada, prediction: p };
                  return <MatchCard key={i} m={fixture} showDate={false} />;
                })}
              </div>
            ))}

            {filteredMatches.length === 0 && (
              <div style={{ textAlign:"center", padding:"40px", color:"#334155" }}>
                No hay pronósticos disponibles para este grupo
              </div>
            )}
          </>
        )}

        {/* ── GRUPOS ── */}
        {activeTab === "groups" && (
          <>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(6,1fr)", gap:6, marginBottom:14 }}>
              {groupKeys.map(g => {
                const gd = data.groups[g];
                const isActive = activeGroup === g;
                return (
                  <button key={g} onClick={() => setActive(g)} style={{
                    background: isActive ? "#c8a84b" : "rgba(255,255,255,0.04)",
                    border: isActive ? "2px solid #c8a84b" : "1px solid rgba(255,255,255,0.1)",
                    borderRadius:10, padding:"8px 4px",
                    cursor:"pointer", color: isActive ? "#000" : "#e2e8f0",
                  }}>
                    <div style={{ fontSize:14, fontWeight:900 }}>G{g}</div>
                    <div style={{ fontSize:9, marginTop:1, fontWeight:700,
                      color: isActive?"#333":trendColor[gd?.trend] }}>
                      {trendIcon[gd?.trend]||"→"} {gd?.favoriteOdds}%
                    </div>
                  </button>
                );
              })}
            </div>

            {grp && (
              <div style={{ background:"rgba(255,255,255,0.02)", border:"1px solid rgba(200,168,75,0.2)",
                borderRadius:14, padding:"16px" }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start",
                  marginBottom:12, flexWrap:"wrap", gap:10 }}>
                  <div>
                    <div style={{ fontSize:22, fontWeight:900, color:"#c8a84b" }}>GRUPO {activeGroup}</div>
                    <div style={{ fontSize:11, color:"#64748b", marginTop:2 }}>{grp.teams?.join(" · ")}</div>
                  </div>
                  <div style={{ background:"rgba(34,197,94,0.08)", border:"1px solid #22c55e44",
                    borderRadius:10, padding:"8px 14px", textAlign:"center", minWidth:120 }}>
                    <div style={{ fontSize:9, color:"#22c55e", letterSpacing:1, textTransform:"uppercase" }}>Favorito</div>
                    <div style={{ fontSize:14, fontWeight:800, marginTop:2 }}>{grp.favorite}</div>
                    <OddsBar odds={grp.favoriteOdds} trend={grp.trend} />
                  </div>
                </div>
                {grp.keyNews && (
                  <div style={{ background:"rgba(99,102,241,0.08)", border:"1px solid rgba(99,102,241,0.2)",
                    borderRadius:9, padding:"9px 12px", fontSize:13, color:"#cbd5e1",
                    marginBottom:10, lineHeight:1.5 }}>
                    📡 {grp.keyNews}
                  </div>
                )}
                {grp.alert && (
                  <div style={{ background:"rgba(239,68,68,0.08)", border:"1px solid rgba(239,68,68,0.3)",
                    borderRadius:9, padding:"9px 12px", fontSize:13, color:"#fca5a5", marginBottom:10 }}>
                    🚨 {grp.alert}
                  </div>
                )}
                {grp.nextMatch && (
                  <div style={{ background:"rgba(200,168,75,0.07)", border:"1px solid rgba(200,168,75,0.2)",
                    borderRadius:9, padding:"7px 12px", fontSize:12, color:"#c8a84b", marginBottom:10 }}>
                    ⏰ <strong>Próximo:</strong> {grp.nextMatch}
                  </div>
                )}

                {/* Pronósticos de este grupo */}
                {(() => {
                  const groupMatches = allPredictions.filter(p => p.group === activeGroup);
                  if (groupMatches.length === 0) return null;
                  return (
                    <div style={{ marginTop:14 }}>
                      <div style={{ fontSize:11, color:"#64748b", letterSpacing:2,
                        textTransform:"uppercase", marginBottom:10 }}>
                        ⚽ Pronósticos del grupo
                      </div>
                      {groupMatches.map((p, i) => {
                        const fixture = { home: p.match?.split(" vs ")[0]||"", away: p.match?.split(" vs ")[1]||"",
                          date:p.date, group:p.group, j:p.jornada, prediction:p };
                        return <MatchCard key={i} m={fixture} showDate={true} />;
                      })}
                    </div>
                  );
                })()}

                {/* Standings */}
                {grp.standings?.length > 0 && (
                  <div style={{ marginTop:14, overflowX:"auto" }}>
                    <div style={{ fontSize:11, color:"#64748b", letterSpacing:2, textTransform:"uppercase", marginBottom:8 }}>
                      Tabla de posiciones
                    </div>
                    <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
                      <thead>
                        <tr style={{ borderBottom:"1px solid rgba(255,255,255,0.08)" }}>
                          {["#","Equipo","PTS","GF","GC","DIF"].map(h => (
                            <th key={h} style={{ padding:"5px 7px", textAlign:h==="Equipo"?"left":"center",
                              color:"#475569", fontSize:10, letterSpacing:1 }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {grp.standings.map((s, i) => (
                          <tr key={i} style={{ borderBottom:"1px solid rgba(255,255,255,0.04)",
                            background: i<2?"rgba(34,197,94,0.04)":"transparent" }}>
                            <td style={{ padding:"7px 7px", textAlign:"center",
                              color:i<2?"#22c55e":"#475569", fontWeight:700 }}>{i+1}</td>
                            <td style={{ padding:"7px 7px", fontWeight:i===0?700:400 }}>{s.team}</td>
                            <td style={{ padding:"7px 7px", textAlign:"center", fontWeight:800, color:"#c8a84b" }}>{s.pts}</td>
                            <td style={{ padding:"7px 7px", textAlign:"center", color:"#94a3b8" }}>{s.gf}</td>
                            <td style={{ padding:"7px 7px", textAlign:"center", color:"#94a3b8" }}>{s.gc}</td>
                            <td style={{ padding:"7px 7px", textAlign:"center", fontWeight:700,
                              color:s.gd>0?"#22c55e":s.gd<0?"#ef4444":"#94a3b8" }}>
                              {s.gd===0?"—":s.gd>0?`+${s.gd}`:s.gd}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div style={{ fontSize:10, color:"#334155", marginTop:6 }}>
                      🟢 Top 2 clasifican · 8 mejores terceros también avanzan
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* ── NOTICIAS ── */}
        {activeTab === "news" && (
          <>
            <div style={{ fontSize:11, fontWeight:700, letterSpacing:3, color:"#c8a84b",
              textTransform:"uppercase", borderBottom:"1px solid rgba(200,168,75,0.25)",
              paddingBottom:8, marginBottom:14 }}>
              📡 Noticias que afectan probabilidades
            </div>
            {(data?.topNews||[]).map((n,i) => (
              <div key={i} style={{ display:"flex", gap:10, alignItems:"flex-start",
                background:"rgba(255,255,255,0.025)",
                border:`1px solid ${impactColor[n.impact]}30`,
                borderLeft:`3px solid ${impactColor[n.impact]}`,
                borderRadius:"0 10px 10px 0", padding:"12px 13px", marginBottom:8 }}>
                <span style={{ fontSize:20, flexShrink:0 }}>{typeIcon[n.type]||"📰"}</span>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:14, fontWeight:600, color:"#e2e8f0", lineHeight:1.4, marginBottom:4 }}>{n.title}</div>
                  {n.detail && <div style={{ fontSize:12, color:"#94a3b8", lineHeight:1.5, marginBottom:5 }}>{n.detail}</div>}
                  <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" }}>
                    <span style={{ fontSize:12, color:"#64748b" }}>{n.team}</span>
                    <span style={{ fontSize:10, padding:"1px 7px", borderRadius:10,
                      background:`${impactColor[n.impact]}22`, color:impactColor[n.impact],
                      fontWeight:700, textTransform:"uppercase" }}>
                      Impacto {n.impact}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </>
        )}

        {/* ── CANDIDATOS ── */}
        {activeTab === "title" && (
          <>
            <div style={{ fontSize:11, fontWeight:700, letterSpacing:3, color:"#c8a84b",
              textTransform:"uppercase", borderBottom:"1px solid rgba(200,168,75,0.25)",
              paddingBottom:8, marginBottom:14 }}>
              🏆 Candidatos al Título
            </div>
            {(data?.titleContenders||[]).map((c,i) => (
              <div key={i} style={{ display:"flex", alignItems:"center", gap:14,
                background:"rgba(255,255,255,0.025)", border:"1px solid rgba(255,255,255,0.07)",
                borderRadius:12, padding:"13px 15px", marginBottom:8 }}>
                <div style={{ width:32, height:32, borderRadius:"50%", flexShrink:0,
                  background:i===0?"#FFD700":i===1?"#C0C0C0":i===2?"#CD7F32":"rgba(255,255,255,0.08)",
                  display:"flex", alignItems:"center", justifyContent:"center",
                  fontWeight:900, fontSize:14, color:i<3?"#000":"#888" }}>
                  {i+1}
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:16, fontWeight:700, marginBottom:2 }}>{c.team}</div>
                  <div style={{ fontSize:12, color:"#94a3b8", marginBottom:4, lineHeight:1.4 }}>{c.reason}</div>
                  <OddsBar odds={c.odds} trend={c.trend} />
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      <div style={{ textAlign:"center", padding:"16px", fontSize:10, color:"#1e293b",
        borderTop:"1px solid rgba(255,255,255,0.04)", marginTop:14 }}>
        Actualizado 2x/día · {data?.lastUpdated} · Mundial 2026
      </div>
    </div>
  );
}
