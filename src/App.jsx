import { useState, useEffect } from "react";

const trendIcon  = { subió:"↑", bajó:"↓", estable:"→" };
const trendColor = { subió:"#22c55e", bajó:"#ef4444", estable:"#94a3b8" };
const impactColor = { alto:"#ef4444", medio:"#f59e0b", bajo:"#22c55e" };
const typeIcon   = { "lesión":"🤕","resultado":"⚽","táctica":"🧠","otro":"📰" };

function OddsBar({ odds, trend }) {
  const c = trendColor[trend] || "#c8a84b";
  return (
    <div style={{ display:"flex", alignItems:"center", gap:6, marginTop:4 }}>
      <div style={{ flex:1, height:4, background:"rgba(255,255,255,0.08)", borderRadius:2, overflow:"hidden" }}>
        <div style={{ width:`${Math.min(odds,100)}%`, height:"100%", background:c, borderRadius:2 }} />
      </div>
      <span style={{ fontSize:11, fontWeight:800, color:c, minWidth:30 }}>{odds}%</span>
      <span style={{ color:c, fontWeight:700, fontSize:12 }}>{trendIcon[trend]||"→"}</span>
    </div>
  );
}

function MatchCard({ m, pred, showDate=false }) {
  const p = pred;
  if (!p) return (
    <div style={{ background:"rgba(255,255,255,0.02)", borderRadius:10, padding:"12px 14px",
      marginBottom:8, border:"1px solid rgba(255,255,255,0.05)" }}>
      <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, color:"#475569", marginBottom:6 }}>
        <span>Grupo {m.group} · J{m.j || m.jornada}</span>
        <span>{m.date} {m.time && `· ${m.time} hrs`}</span>
      </div>
      <div style={{ display:"flex", justifyContent:"space-between", fontSize:14, fontWeight:600 }}>
        <span>{m.home}</span><span style={{ color:"#475569" }}>vs</span><span>{m.away}</span>
      </div>
    </div>
  );

  const total = (p.probHome||0)+(p.probDraw||0)+(p.probAway||0)||100;
  const pH = Math.round((p.probHome||0)/total*100);
  const pD = Math.round((p.probDraw||0)/total*100);
  const pA = 100-pH-pD;
  const confColor = p.confidence>=70?"#22c55e":p.confidence>=55?"#f59e0b":"#94a3b8";
  const home = m.home || p.match?.split(" vs ")[0] || "";
  const away = m.away || p.match?.split(" vs ")[1] || "";

  return (
    <div style={{ background:"rgba(255,255,255,0.025)", borderRadius:10, padding:"12px 14px",
      marginBottom:8, border:"1px solid rgba(255,255,255,0.06)" }}>

      {/* Header */}
      <div style={{ display:"flex", justifyContent:"space-between", fontSize:10,
        color:"#475569", marginBottom:8, flexWrap:"wrap", gap:4 }}>
        <span>Grupo {m.group || p.group} · J{m.j || m.jornada || p.jornada}</span>
        <span style={{ color:"#64748b" }}>
          {p.date || m.date}
          {(p.time || m.time) && ` · ${p.time || m.time} hrs Chile`}
          {(p.venue || m.venue) && ` · ${p.venue || m.venue}`}
        </span>
      </div>

      {/* Equipos + marcador */}
      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
        <div style={{ flex:1, textAlign:"right" }}>
          <div style={{ fontSize:14, fontWeight:700,
            color: p.favorito===home?"#c8a84b":"#e2e8f0" }}>{home}</div>
        </div>
        <div style={{ textAlign:"center", minWidth:64 }}>
          <div style={{ fontSize:20, fontWeight:900, color:"#c8a84b",
            background:"rgba(200,168,75,0.1)", padding:"3px 10px", borderRadius:7,
            border:"1px solid rgba(200,168,75,0.25)" }}>
            {p.predictedScore||"?-?"}
          </div>
          <div style={{ fontSize:9, color:"#475569", marginTop:2, letterSpacing:1 }}>PRONÓSTICO</div>
          {p.top3Scores && p.top3Scores.length > 0 && (
            <div style={{ display:"flex", gap:3, marginTop:3, justifyContent:"center" }}>
              {p.top3Scores.map((s, i) => (
                <span key={i} style={{
                  fontSize:8, color: i===0 ? "#c8a84b" : "#475569",
                  padding:"1px 4px", borderRadius:4,
                  background: i===0 ? "rgba(200,168,75,0.1)" : "transparent",
                }}>{s.score} {s.prob}%</span>
              ))}
            </div>
          )}
        </div>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:14, fontWeight:700,
            color: p.favorito===away?"#c8a84b":"#e2e8f0" }}>{away}</div>
        </div>
      </div>

      {/* Barra probabilidades */}
      <div style={{ marginBottom:6 }}>
        <div style={{ display:"flex", height:6, borderRadius:4, overflow:"hidden", marginBottom:3 }}>
          <div style={{ width:`${pH}%`, background:"#22c55e" }} />
          <div style={{ width:`${pD}%`, background:"#f59e0b" }} />
          <div style={{ width:`${pA}%`, background:"#ef4444" }} />
        </div>
        <div style={{ display:"flex", justifyContent:"space-between", fontSize:10 }}>
          <span style={{ color:"#22c55e", fontWeight:700 }}>🏠 {pH}%</span>
          <span style={{ color:"#f59e0b", fontWeight:700 }}>🤝 {pD}%</span>
          <span style={{ color:"#ef4444", fontWeight:700 }}>✈️ {pA}%</span>
        </div>
      </div>

      {/* ELO + Confianza + cuotas + factor */}
      {(p.eloHome || p.eloAway) && (
        <div style={{ display:"flex", gap:6, marginBottom:5 }}>
          <span style={{ fontSize:9, color:"#475569" }}>
            ELO: {home} <span style={{ color:"#c8a84b", fontWeight:700 }}>{p.eloHome}</span>
            {" "}&nbsp;·&nbsp;{" "}{away} <span style={{ color:"#c8a84b", fontWeight:700 }}>{p.eloAway}</span>
            {p.eloHome && p.eloAway && (
              <span style={{ color: p.eloHome > p.eloAway ? "#22c55e" : "#ef4444" }}>
                {" "}(Δ {p.eloHome - p.eloAway > 0 ? "+" : ""}{p.eloHome - p.eloAway})
              </span>
            )}
          </span>
        </div>
      )}
      <div style={{ display:"flex", gap:6, alignItems:"center", flexWrap:"wrap" }}>
        <span style={{ fontSize:10, padding:"1px 7px", borderRadius:8,
          background:`${confColor}18`, color:confColor, fontWeight:700 }}>
          ✓ {p.confidence}% confianza
        </span>
        {p.hasBookmakerOdds && (
          <span style={{ fontSize:10, padding:"1px 7px", borderRadius:8,
            background:"rgba(99,102,241,0.15)", color:"#818cf8", fontWeight:700 }}>
            🎲 Bookmakers
          </span>
        )}
        <span style={{ fontSize:9, padding:"1px 6px", borderRadius:8,
          background:"rgba(200,168,75,0.1)", color:"#c8a84b", fontWeight:700 }}>
          📊 {p.sources || "ELO+Claude"}
        </span>
        {p.keyFactor && (
          <span style={{ fontSize:10, color:"#64748b", flex:1 }}>{p.keyFactor}</span>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [activeGroup, setActive] = useState("A");
  const [activeTab, setTab]   = useState("partidos");
  const [matchFilter, setFilter] = useState("todos");

  useEffect(() => {
    fetch("/data/mundial-data.json?t=" + Date.now())
      .then(r => { if (!r.ok) throw new Error("Error cargando datos"); return r.json(); })
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  if (loading) return (
    <div style={{ minHeight:"100vh", background:"#060d1a", display:"flex",
      flexDirection:"column", alignItems:"center", justifyContent:"center" }}>
      <div style={{ fontSize:44 }}>⚽</div>
      <div style={{ fontSize:15, color:"#c8a84b", marginTop:14, fontWeight:700 }}>Cargando...</div>
    </div>
  );
  if (error) return (
    <div style={{ minHeight:"100vh", background:"#060d1a", display:"flex",
      alignItems:"center", justifyContent:"center" }}>
      <div style={{ fontSize:13, color:"#ef4444" }}>⚠️ {error}</div>
    </div>
  );

  const grp = data?.groups?.[activeGroup];
  const groupKeys = data?.groups ? Object.keys(data.groups) : [];
  const allPredictions = data?.predictions || [];
  const fixtures = data?.fixtures || [];

  // Para tab pronósticos: combinar fixtures con predicciones
  const enrichedFixtures = fixtures.map(f => ({
    ...f,
    pred: allPredictions.find(p =>
      p.match && p.match.includes(f.home) && p.match.includes(f.away)
    ) || null
  }));

  const filtered = matchFilter === "todos"
    ? enrichedFixtures
    : enrichedFixtures.filter(f => f.group === matchFilter);

  const byDate = filtered.reduce((acc, f) => {
    if (!acc[f.date]) acc[f.date] = [];
    acc[f.date].push(f); return acc;
  }, {});
  const sortedDates = Object.keys(byDate).sort();
  const uniqueGroups = [...new Set(fixtures.map(f => f.group))].sort();

  return (
    <div style={{ minHeight:"100vh", background:"#060d1a", color:"#e2e8f0", fontFamily:"system-ui,sans-serif" }}>

      {/* Header */}
      <div style={{ background:"linear-gradient(180deg,#0c1f3d,#071428)", borderBottom:"2px solid #c8a84b" }}>
        <div style={{ background:"#c8a84b", textAlign:"center", padding:"3px 8px",
          fontSize:10, letterSpacing:3, color:"#000", fontWeight:700 }}>
          ★ MUNDIAL FIFA 2026 — PRONÓSTICOS EN VIVO ★
        </div>
        <div style={{ padding:"14px 16px 8px", textAlign:"center" }}>
          <div style={{ fontSize:28, fontWeight:900, letterSpacing:-1.5, color:"#fff" }}>⚽ MUNDIAL 2026</div>
          <div style={{ fontSize:10, color:"#c8a84b", letterSpacing:3, marginTop:2, textTransform:"uppercase" }}>
            Pronósticos · Probabilidades · 2x/día
          </div>
          {data?.headline && (
            <div style={{ fontSize:12, color:"#c8a84b", marginTop:7, padding:"4px 12px",
              background:"rgba(200,168,75,0.1)", borderRadius:16, display:"inline-block",
              border:"1px solid rgba(200,168,75,0.2)", maxWidth:460, lineHeight:1.4 }}>
              {data.headline}
            </div>
          )}
          <div style={{ marginTop:5, fontSize:10, color:"#334155" }}>🕒 {data?.lastUpdated}</div>
          {data?.dataSources && (
            <div style={{ marginTop:3, fontSize:9, color:"#1e3a5f" }}>
              Fuentes: {data.dataSources}
            </div>
          )}
        </div>
        <div style={{ display:"flex", justifyContent:"center", gap:1, flexWrap:"wrap" }}>
          {[["partidos","⚽ Pronósticos"],["groups","🗂️ Grupos"],["news","📡 Noticias"],["title","🏆 Candidatos"]].map(([t,l]) => (
            <button key={t} onClick={() => setTab(t)} style={{
              background: activeTab===t?"#c8a84b":"transparent",
              color: activeTab===t?"#000":"#94a3b8",
              border:"none", padding:"8px 13px", fontWeight:700,
              fontSize:11, cursor:"pointer", borderRadius:"6px 6px 0 0",
            }}>{l}</button>
          ))}
        </div>
      </div>

      <div style={{ padding:"12px", maxWidth:960, margin:"0 auto" }}>

        {/* PRONÓSTICOS */}
        {activeTab === "partidos" && (
          <>
            <div style={{ display:"flex", gap:4, flexWrap:"wrap", marginBottom:12 }}>
              <button onClick={()=>setFilter("todos")} style={{
                background:matchFilter==="todos"?"#c8a84b":"rgba(255,255,255,0.05)",
                color:matchFilter==="todos"?"#000":"#94a3b8",
                border:"none", borderRadius:6, padding:"4px 10px", fontWeight:700, fontSize:11, cursor:"pointer"
              }}>Todos</button>
              {uniqueGroups.map(g => (
                <button key={g} onClick={()=>setFilter(g)} style={{
                  background:matchFilter===g?"#c8a84b":"rgba(255,255,255,0.05)",
                  color:matchFilter===g?"#000":"#94a3b8",
                  border:"none", borderRadius:6, padding:"4px 10px", fontWeight:700, fontSize:11, cursor:"pointer"
                }}>G{g}</button>
              ))}
            </div>

            <div style={{ display:"flex", gap:12, fontSize:11, marginBottom:12, color:"#475569", flexWrap:"wrap" }}>
              <span><span style={{color:"#22c55e"}}>■</span> Local</span>
              <span><span style={{color:"#f59e0b"}}>■</span> Empate</span>
              <span><span style={{color:"#ef4444"}}>■</span> Visitante</span>
              <span style={{color:"#334155"}}>· Marcador = resultado más probable · Horarios en Chile</span>
            </div>

            {sortedDates.map(date => (
              <div key={date} style={{ marginBottom:18 }}>
                <div style={{ fontSize:11, fontWeight:700, letterSpacing:2, color:"#c8a84b",
                  textTransform:"uppercase", borderBottom:"1px solid rgba(200,168,75,0.2)",
                  paddingBottom:5, marginBottom:8 }}>
                  📅 {new Date(date+"T12:00:00").toLocaleDateString("es-CL",{weekday:"long",day:"numeric",month:"long"})}
                </div>
                {byDate[date].map((f,i) => (
                  <MatchCard key={i} m={f} pred={f.pred} />
                ))}
              </div>
            ))}
          </>
        )}

        {/* GRUPOS */}
        {activeTab === "groups" && (
          <>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(6,1fr)", gap:5, marginBottom:12 }}>
              {groupKeys.map(g => {
                const gd = data.groups[g];
                const isActive = activeGroup===g;
                return (
                  <button key={g} onClick={()=>setActive(g)} style={{
                    background:isActive?"#c8a84b":"rgba(255,255,255,0.04)",
                    border:isActive?"1.5px solid #c8a84b":"1px solid rgba(255,255,255,0.08)",
                    borderRadius:8, padding:"7px 4px", cursor:"pointer",
                    color:isActive?"#000":"#e2e8f0",
                  }}>
                    <div style={{fontSize:13,fontWeight:900}}>G{g}</div>
                    <div style={{fontSize:9,marginTop:1,fontWeight:700,color:isActive?"#333":trendColor[gd?.trend]}}>
                      {trendIcon[gd?.trend]||"→"} {gd?.favoriteOdds}%
                    </div>
                  </button>
                );
              })}
            </div>

            {grp && (
              <div style={{ background:"rgba(255,255,255,0.02)", border:"1px solid rgba(200,168,75,0.15)",
                borderRadius:12, padding:"14px" }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start",
                  marginBottom:10, flexWrap:"wrap", gap:8 }}>
                  <div>
                    <div style={{fontSize:20,fontWeight:900,color:"#c8a84b"}}>GRUPO {activeGroup}</div>
                    <div style={{fontSize:11,color:"#64748b",marginTop:2}}>{grp.teams?.join(" · ")}</div>
                  </div>
                  <div style={{background:"rgba(34,197,94,0.08)",border:"1px solid #22c55e33",
                    borderRadius:8,padding:"6px 12px",textAlign:"center",minWidth:110}}>
                    <div style={{fontSize:9,color:"#22c55e",letterSpacing:1,textTransform:"uppercase"}}>Favorito</div>
                    <div style={{fontSize:13,fontWeight:800,marginTop:1}}>{grp.favorite}</div>
                    <OddsBar odds={grp.favoriteOdds} trend={grp.trend} />
                  </div>
                </div>
                {grp.keyNews && <div style={{background:"rgba(99,102,241,0.07)",border:"1px solid rgba(99,102,241,0.15)",
                  borderRadius:8,padding:"8px 11px",fontSize:12,color:"#cbd5e1",marginBottom:8,lineHeight:1.5}}>
                  📡 {grp.keyNews}</div>}
                {grp.alert && <div style={{background:"rgba(239,68,68,0.07)",border:"1px solid rgba(239,68,68,0.25)",
                  borderRadius:8,padding:"8px 11px",fontSize:12,color:"#fca5a5",marginBottom:8}}>
                  🚨 {grp.alert}</div>}
                {grp.nextMatch && <div style={{background:"rgba(200,168,75,0.06)",border:"1px solid rgba(200,168,75,0.15)",
                  borderRadius:8,padding:"6px 11px",fontSize:11,color:"#c8a84b",marginBottom:10}}>
                  ⏰ <strong>Próximo:</strong> {grp.nextMatch}</div>}

                {/* Pronósticos del grupo */}
                {(() => {
                  const gf = fixtures.filter(f=>f.group===activeGroup);
                  if (!gf.length) return null;
                  return <div style={{marginTop:12}}>
                    <div style={{fontSize:10,color:"#475569",letterSpacing:2,textTransform:"uppercase",marginBottom:8}}>
                      ⚽ Pronósticos del grupo
                    </div>
                    {gf.map((f,i) => {
                      const pred = allPredictions.find(p=>p.match?.includes(f.home)&&p.match?.includes(f.away));
                      return <MatchCard key={i} m={f} pred={pred} />;
                    })}
                  </div>;
                })()}

                {grp.standings?.length > 0 && (
                  <div style={{marginTop:12,overflowX:"auto"}}>
                    <div style={{fontSize:10,color:"#475569",letterSpacing:2,textTransform:"uppercase",marginBottom:7}}>
                      Tabla de posiciones
                    </div>
                    <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                      <thead>
                        <tr style={{borderBottom:"1px solid rgba(255,255,255,0.07)"}}>
                          {["#","Equipo","PTS","GF","GC","DIF"].map(h=>(
                            <th key={h} style={{padding:"4px 6px",textAlign:h==="Equipo"?"left":"center",
                              color:"#475569",fontSize:9,letterSpacing:1}}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {grp.standings.map((s,i)=>(
                          <tr key={i} style={{borderBottom:"1px solid rgba(255,255,255,0.04)",
                            background:i<2?"rgba(34,197,94,0.03)":"transparent"}}>
                            <td style={{padding:"6px 6px",textAlign:"center",color:i<2?"#22c55e":"#475569",fontWeight:700}}>{i+1}</td>
                            <td style={{padding:"6px 6px",fontWeight:i===0?700:400}}>{s.team}</td>
                            <td style={{padding:"6px 6px",textAlign:"center",fontWeight:800,color:"#c8a84b"}}>{s.pts}</td>
                            <td style={{padding:"6px 6px",textAlign:"center",color:"#94a3b8"}}>{s.gf}</td>
                            <td style={{padding:"6px 6px",textAlign:"center",color:"#94a3b8"}}>{s.gc}</td>
                            <td style={{padding:"6px 6px",textAlign:"center",fontWeight:700,
                              color:s.gd>0?"#22c55e":s.gd<0?"#ef4444":"#94a3b8"}}>
                              {s.gd===0?"—":s.gd>0?`+${s.gd}`:s.gd}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div style={{fontSize:9,color:"#334155",marginTop:5}}>🟢 Top 2 clasifican · 8 mejores terceros también</div>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* NOTICIAS */}
        {activeTab === "news" && (
          <>
            <div style={{fontSize:10,fontWeight:700,letterSpacing:3,color:"#c8a84b",
              textTransform:"uppercase",borderBottom:"1px solid rgba(200,168,75,0.2)",
              paddingBottom:7,marginBottom:12}}>
              📡 Noticias que afectan probabilidades
            </div>
            {(data?.topNews||[]).map((n,i)=>(
              <div key={i} style={{display:"flex",gap:9,alignItems:"flex-start",
                background:"rgba(255,255,255,0.02)",
                border:`1px solid ${impactColor[n.impact]}25`,
                borderLeft:`2px solid ${impactColor[n.impact]}`,
                borderRadius:"0 9px 9px 0",padding:"10px 12px",marginBottom:7}}>
                <span style={{fontSize:18,flexShrink:0}}>{typeIcon[n.type]||"📰"}</span>
                <div style={{flex:1}}>
                  <div style={{fontSize:13,fontWeight:600,color:"#e2e8f0",lineHeight:1.4,marginBottom:3}}>{n.title}</div>
                  {n.detail&&<div style={{fontSize:11,color:"#94a3b8",lineHeight:1.5,marginBottom:4}}>{n.detail}</div>}
                  <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
                    <span style={{fontSize:11,color:"#64748b"}}>{n.team}</span>
                    <span style={{fontSize:9,padding:"1px 6px",borderRadius:8,
                      background:`${impactColor[n.impact]}18`,color:impactColor[n.impact],
                      fontWeight:700,textTransform:"uppercase"}}>
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
            <div style={{fontSize:10,fontWeight:700,letterSpacing:3,color:"#c8a84b",
              textTransform:"uppercase",borderBottom:"1px solid rgba(200,168,75,0.2)",
              paddingBottom:7,marginBottom:12}}>
              🏆 Candidatos al Título — Mundial 2026
            </div>
            {(data?.titleContenders||[]).map((c,i)=>(
              <div key={i} style={{display:"flex",alignItems:"center",gap:12,
                background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.06)",
                borderRadius:10,padding:"11px 13px",marginBottom:7}}>
                <div style={{width:30,height:30,borderRadius:"50%",flexShrink:0,
                  background:i===0?"#FFD700":i===1?"#C0C0C0":i===2?"#CD7F32":"rgba(255,255,255,0.08)",
                  display:"flex",alignItems:"center",justifyContent:"center",
                  fontWeight:900,fontSize:13,color:i<3?"#000":"#888"}}>
                  {i+1}
                </div>
                <div style={{flex:1}}>
                  <div style={{fontSize:15,fontWeight:700,marginBottom:2}}>{c.team}</div>
                  <div style={{fontSize:11,color:"#94a3b8",marginBottom:3,lineHeight:1.4}}>{c.reason}</div>
                  <OddsBar odds={c.odds} trend={c.trend} />
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      <div style={{textAlign:"center",padding:"14px",fontSize:9,color:"#1e293b",
        borderTop:"1px solid rgba(255,255,255,0.04)",marginTop:12}}>
        Actualizado 2x/día · {data?.lastUpdated} · Mundial 2026 · Powered by Claude AI
      </div>
    </div>
  );
}
