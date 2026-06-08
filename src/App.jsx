import { useState, useEffect } from "react";

const trendIcon  = { subió:"↑", bajó:"↓", estable:"→" };
const trendColor = { subió:"#22c55e", bajó:"#ef4444", estable:"#94a3b8" };
const impactColor = { alto:"#ef4444", medio:"#f59e0b", bajo:"#22c55e" };
const typeIcon   = { "lesión":"🤕", "resultado":"⚽", "táctica":"🧠", "otro":"📰" };

function OddsBar({ odds, trend }) {
  const c = trendColor[trend] || "#c8a84b";
  return (
    <div style={{ display:"flex", alignItems:"center", gap:6, marginTop:4 }}>
      <div style={{ flex:1, height:5, background:"rgba(255,255,255,0.08)", borderRadius:3, overflow:"hidden" }}>
        <div style={{ width:`${Math.min(odds,100)}%`, height:"100%", background:c, borderRadius:3 }} />
      </div>
      <span style={{ fontSize:12, fontWeight:800, color:c, minWidth:32 }}>{odds}%</span>
      <span style={{ color:c, fontWeight:700, fontSize:13 }}>{trendIcon[trend]||"→"}</span>
    </div>
  );
}

export default function App() {
  const [data, setData]          = useState(null);
  const [loading, setLoading]    = useState(true);
  const [error, setError]        = useState(null);
  const [activeGroup, setActive] = useState("A");
  const [activeTab, setTab]      = useState("groups");

  useEffect(() => {
    fetch("/data/mundial-data.json?t=" + Date.now())
      .then(r => {
        if (!r.ok) throw new Error("No se pudo cargar el archivo de datos");
        return r.json();
      })
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  if (loading) return (
    <div style={{ minHeight:"100vh", background:"#060d1a", display:"flex",
      flexDirection:"column", alignItems:"center", justifyContent:"center", color:"#e2e8f0" }}>
      <div style={{ fontSize:48 }}>⚽</div>
      <div style={{ fontSize:16, color:"#c8a84b", marginTop:16, fontWeight:700 }}>Cargando datos...</div>
    </div>
  );

  if (error) return (
    <div style={{ minHeight:"100vh", background:"#060d1a", display:"flex",
      flexDirection:"column", alignItems:"center", justifyContent:"center", color:"#e2e8f0" }}>
      <div style={{ fontSize:48 }}>⚠️</div>
      <div style={{ fontSize:14, color:"#ef4444", marginTop:16 }}>{error}</div>
    </div>
  );

  const grp  = data?.groups?.[activeGroup];
  const keys = data?.groups ? Object.keys(data.groups) : [];

  return (
    <div style={{ minHeight:"100vh", background:"#060d1a", color:"#e2e8f0", fontFamily:"Georgia,serif" }}>

      {/* Header */}
      <div style={{ background:"linear-gradient(180deg,#0c1f3d,#071428)", borderBottom:"3px solid #c8a84b" }}>
        <div style={{ background:"#c8a84b", textAlign:"center", padding:"4px 8px",
          fontSize:11, letterSpacing:3, color:"#000", fontWeight:700 }}>
          ★ MUNDIAL FIFA 2026 — ANÁLISIS EN VIVO ★
        </div>
        <div style={{ padding:"18px 16px 10px", textAlign:"center" }}>
          <div style={{ fontSize:32, fontWeight:900, letterSpacing:-2, color:"#fff" }}>⚽ MUNDIAL 2026</div>
          <div style={{ fontSize:11, color:"#c8a84b", letterSpacing:3, marginTop:3, textTransform:"uppercase" }}>
            Tracker · Fase de Grupos · Actualización 2x/día
          </div>
          {data?.headline && (
            <div style={{ fontSize:13, color:"#c8a84b", marginTop:10, padding:"5px 14px",
              background:"rgba(200,168,75,0.1)", borderRadius:20, display:"inline-block",
              border:"1px solid rgba(200,168,75,0.25)", maxWidth:480, lineHeight:1.4 }}>
              {data.headline}
            </div>
          )}
          <div style={{ marginTop:6, fontSize:11, color:"#475569" }}>
            🕒 Actualizado: {data?.lastUpdated || "—"}
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display:"flex", justifyContent:"center", gap:2, paddingBottom:0 }}>
          {[["groups","🗂️ Grupos"],["news","📡 Noticias"],["title","🏆 Candidatos"]].map(([t,label]) => (
            <button key={t} onClick={() => setTab(t)} style={{
              background: activeTab===t ? "#c8a84b" : "transparent",
              color: activeTab===t ? "#000" : "#94a3b8",
              border:"none", padding:"9px 14px", fontWeight:700,
              fontSize:13, cursor:"pointer", borderRadius:"8px 8px 0 0",
            }}>{label}</button>
          ))}
        </div>
      </div>

      <div style={{ padding:"14px", maxWidth:920, margin:"0 auto" }}>

        {/* GRUPOS */}
        {activeTab === "groups" && (
          <>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(6,1fr)", gap:6, marginBottom:14 }}>
              {keys.map(g => {
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
                      color: isActive ? "#333" : trendColor[gd.trend] }}>
                      {trendIcon[gd.trend]||"→"} {gd.favoriteOdds}%
                    </div>
                  </button>
                );
              })}
            </div>

            {grp && (
              <div style={{ background:"rgba(255,255,255,0.02)", border:"1px solid rgba(200,168,75,0.2)",
                borderRadius:14, padding:"16px" }}>
                <div style={{ display:"flex", justifyContent:"space-between",
                  alignItems:"flex-start", marginBottom:12, flexWrap:"wrap", gap:10 }}>
                  <div>
                    <div style={{ fontSize:22, fontWeight:900, color:"#c8a84b" }}>GRUPO {activeGroup}</div>
                    <div style={{ fontSize:11, color:"#64748b", marginTop:2 }}>
                      {grp.teams?.join(" · ")}
                    </div>
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
                    <span style={{ color:"#818cf8", fontWeight:700 }}>📡 </span>{grp.keyNews}
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

                {grp.standings?.length > 0 && (
                  <div style={{ overflowX:"auto" }}>
                    <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
                      <thead>
                        <tr style={{ borderBottom:"1px solid rgba(255,255,255,0.08)" }}>
                          {["#","Equipo","PTS","GF","GC","DIF"].map(h => (
                            <th key={h} style={{ padding:"5px 7px",
                              textAlign: h==="Equipo"?"left":"center",
                              color:"#475569", fontSize:10, letterSpacing:1 }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {grp.standings.map((s, i) => (
                          <tr key={i} style={{ borderBottom:"1px solid rgba(255,255,255,0.04)",
                            background: i<2?"rgba(34,197,94,0.04)":"transparent" }}>
                            <td style={{ padding:"7px 7px", textAlign:"center",
                              color: i<2?"#22c55e":"#475569", fontWeight:700 }}>{i+1}</td>
                            <td style={{ padding:"7px 7px", fontWeight:i===0?700:400 }}>{s.team}</td>
                            <td style={{ padding:"7px 7px", textAlign:"center", fontWeight:800, color:"#c8a84b" }}>{s.pts}</td>
                            <td style={{ padding:"7px 7px", textAlign:"center", color:"#94a3b8" }}>{s.gf}</td>
                            <td style={{ padding:"7px 7px", textAlign:"center", color:"#94a3b8" }}>{s.gc}</td>
                            <td style={{ padding:"7px 7px", textAlign:"center", fontWeight:700,
                              color: s.gd>0?"#22c55e":s.gd<0?"#ef4444":"#94a3b8" }}>
                              {s.gd===0?"—":s.gd>0?`+${s.gd}`:s.gd}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div style={{ fontSize:10, color:"#334155", marginTop:6 }}>
                      🟢 Top 2 clasifican directo · 8 mejores terceros también avanzan
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* NOTICIAS */}
        {activeTab === "news" && (
          <>
            <div style={{ fontSize:11, fontWeight:700, letterSpacing:3, color:"#c8a84b",
              textTransform:"uppercase", borderBottom:"1px solid rgba(200,168,75,0.25)",
              paddingBottom:8, marginBottom:14 }}>
              📡 Noticias que afectan probabilidades
            </div>
            {(data?.topNews || []).map((n, i) => (
              <div key={i} style={{ display:"flex", gap:10, alignItems:"flex-start",
                background:"rgba(255,255,255,0.025)",
                border:`1px solid ${impactColor[n.impact]}30`,
                borderLeft:`3px solid ${impactColor[n.impact]}`,
                borderRadius:"0 10px 10px 0", padding:"12px 13px", marginBottom:8 }}>
                <span style={{ fontSize:20, flexShrink:0 }}>{typeIcon[n.type]||"📰"}</span>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:14, fontWeight:600, color:"#e2e8f0", lineHeight:1.4, marginBottom:4 }}>
                    {n.title}
                  </div>
                  {n.detail && (
                    <div style={{ fontSize:12, color:"#94a3b8", lineHeight:1.5, marginBottom:5 }}>{n.detail}</div>
                  )}
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

        {/* CANDIDATOS */}
        {activeTab === "title" && (
          <>
            <div style={{ fontSize:11, fontWeight:700, letterSpacing:3, color:"#c8a84b",
              textTransform:"uppercase", borderBottom:"1px solid rgba(200,168,75,0.25)",
              paddingBottom:8, marginBottom:14 }}>
              🏆 Candidatos al Título — Mundial 2026
            </div>
            {(data?.titleContenders || []).map((c, i) => (
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
        Actualizado automáticamente 2x/día · Mundial 2026 · Powered by Claude AI + API-Football
      </div>
    </div>
  );
}
