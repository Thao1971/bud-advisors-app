import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Search, Upload, Building2, TrendingUp, Users, 
  BarChart3, Filter, X, Database, AlertCircle, 
  Trophy, LayoutDashboard, CheckCircle2, 
  Target, Briefcase, DollarSign, PieChart, 
  ArrowUpRight, Globe, Calculator,
  Wallet, ShieldCheck, Activity, TrendingDown,
  Layers, Zap, Info, FileText, Scale, Gauge, Sparkles, 
  ArrowRight, MessageSquare, Send, Bot, Loader2,
  Star, MousePointer2, Download, TrendingUp as TrendUpIcon
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, onSnapshot } from 'firebase/firestore';

// --- FIREBASE SETUP ---
const getFirebaseConfig = () => {
  let config = null;
  try { config = import.meta.env.VITE_FIREBASE_CONFIG; } catch (e) {}
  if (!config && typeof __firebase_config !== 'undefined') config = __firebase_config;
  if (typeof config === 'string') return JSON.parse(config);
  return config;
};

const firebaseConfig = getFirebaseConfig();
const app = firebaseConfig ? initializeApp(firebaseConfig) : null;
const auth = app ? getAuth(app) : null;
const db = app ? getFirestore(app) : null;
const appId = "bud_intelligence_v19_final_fix"; 

// --- UTILIDADES DE FORMATEO (ESPAÑA) ---
const cleanValue = (val) => {
  if (!val) return 0;
  if (typeof val === 'number') return val;
  const cleaned = val.toString().replace(/[€\s%]/g, '').replace(/\./g, '').replace(',', '.'); 
  return parseFloat(cleaned) || 0;
};

const getRevenue = (c) => cleanValue(c?.['IMPORTE NETO DE LA CIFRA DE NEGOCIOS'] || c?.['IMPORTE NETO DE LA CIFRA DE NEGOCIO'] || c?.['IMPORTEN NETO DE LA CIFRA DE NEGOCIO'] || 0);

const formatM = (v) => {
  if (!v || isNaN(v)) return '0 M€';
  return new Intl.NumberFormat('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(v / 1000000) + ' M€';
};

const formatFull = (v) => {
  if (!v || isNaN(v)) return '0 €';
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v);
};

// --- COMPONENTES VISUALES ---

const RadarChart = ({ company, data }) => {
  const rev = getRevenue(company);
  const ebitda = cleanValue(company.EBITDA);
  const sector = company['CATEGORÍA'];
  const peers = data.filter(c => c['CATEGORÍA'] === sector);
  const avgRev = peers.reduce((a, b) => a + getRevenue(b), 0) / (peers.length || 1);
  
  const axes = [
    { label: 'Volumen', val: Math.min(1, rev / (avgRev * 2)) },
    { label: 'Margen', val: Math.min(1, (ebitda / (rev || 1)) / 0.25) },
    { label: 'Caja', val: Math.min(1, (cleanValue(company['ACTIVO CORRIENTE']) / (cleanValue(company['PASIVO CORRIENTE']) || 1)) / 2) },
    { label: 'Eficiencia', val: Math.min(1, (rev / (Math.abs(cleanValue(company['GASTOS DE PERSONAL'])) || 1)) / 3) },
    { label: 'Patrimonio', val: Math.min(1, cleanValue(company['PATRIMONIO NETO']) / 5000000) }
  ];

  const points = axes.map((ax, i) => {
    const angle = (i * 2 * Math.PI) / axes.length - Math.PI / 2;
    const r = ax.val * 0.8;
    return `${Math.cos(angle) * r},${Math.sin(angle) * r}`;
  }).join(' ');

  return (
    <div className="flex flex-col items-center p-4">
      <svg viewBox="-1.2 -1.2 2.4 2.4" className="w-48 h-48 md:w-56 md:h-56">
        {[0.2, 0.4, 0.6, 0.8].map(r => <circle key={r} cx="0" cy="0" r={r} fill="none" stroke="#e2e8f0" strokeWidth="0.01" />)}
        {axes.map((ax, i) => {
          const angle = (i * 2 * Math.PI) / axes.length - Math.PI / 2;
          return <line key={i} x1="0" y1="0" x2={Math.cos(angle)} y2={Math.sin(angle)} stroke="#cbd5e1" strokeWidth="0.01" />;
        })}
        <polygon points={points} fill="rgba(250, 204, 21, 0.4)" stroke="#eab308" strokeWidth="0.04" />
      </svg>
      <div className="grid grid-cols-3 gap-4 mt-6 w-full">
        {axes.map((ax, i) => (
          <div key={i} className="text-center">
            <p className="text-[8px] font-black uppercase text-slate-400 tracking-tighter">{ax.label}</p>
            <p className="text-[10px] font-bold">{(ax.val * 100).toFixed(0)}%</p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default function App() {
  const [data, setData] = useState([]);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState({ type: 'info', msg: 'Analizando Mercado...' });
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Todas');
  const [selectedCompany, setSelectedCompany] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [valuationMultiple, setValuationMultiple] = useState(8);
  const [salaryAdj, setSalaryAdj] = useState(0);

  // Chat IA
  const [isAiOpen, setIsAiOpen] = useState(false);
  const [chatHistory, setChatHistory] = useState([{ role: 'assistant', text: 'Hola, soy BUD AI. Analizo tus datos financieros en tiempo real. ¿Qué deseas saber?' }]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);

  // 1. AUTH
  useEffect(() => {
    if (!auth) return;
    signInAnonymously(auth).catch(e => setStatus({ type: 'error', msg: 'Error de conexión Cloud' }));
    return onAuthStateChanged(auth, setUser);
  }, []);

  // 2. DATA SNAPSHOT
  useEffect(() => {
    if (!db || !user) return;
    const q = collection(db, 'artifacts', appId, 'public', 'data', 'companies');
    return onSnapshot(q, (snap) => {
      const docs = snap.docs.map(d => d.data());
      docs.sort((a, b) => getRevenue(b) - getRevenue(a));
      setData(docs);
      setLoading(false);
      if (docs.length > 0) setStatus({ type: 'success', msg: 'TERMINAL ONLINE' });
    }, () => setLoading(false));
  }, [user]);

  // 3. UPLOAD
  const handleUpload = (e) => {
    const file = e.target.files[0];
    if (!file || !db || !user) return;
    setUploading(true);
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const lines = ev.target.result.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        const delimiter = lines[0].includes(';') ? ';' : ',';
        const headers = lines[0].split(delimiter).map(h => h.trim().replace(/^"|"$/g, ''));
        for (let i = 1; i < lines.length; i++) {
          const values = lines[i].split(delimiter);
          if (values.length < headers.length) continue;
          const obj = {};
          headers.forEach((h, idx) => {
            let val = values[idx]?.trim().replace(/^"|"$/g, '');
            const isNum = ['IMPORTE', 'GASTOS', 'EBITDA', 'RESULTADO', 'ACTIVO', 'PASIVO', 'PATRIMONIO'].some(k => h.toUpperCase().includes(k));
            obj[h] = isNum ? cleanValue(val) : val;
          });
          if (obj['CIF EMPRESA']) {
            await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'companies', obj['CIF EMPRESA'].replace(/[^a-zA-Z0-9]/g, '')), obj);
          }
        }
        setStatus({ type: 'success', msg: 'Datos Sincronizados' });
      } catch (err) { setStatus({ type: 'error', msg: err.message }); }
      finally { setUploading(false); }
    };
    reader.readAsText(file);
  };

  // --- LÓGICA AGREGADA ---
  const stats = useMemo(() => {
    const totalRev = data.reduce((acc, curr) => acc + getRevenue(curr), 0);
    const totalEbitda = data.reduce((acc, curr) => acc + cleanValue(curr.EBITDA), 0);
    const cats = {};
    data.forEach(c => {
      const cat = c['CATEGORÍA'] || 'General';
      if (!cats[cat]) cats[cat] = { count: 0, revenue: 0 };
      cats[cat].count++;
      cats[cat].revenue += getRevenue(c);
    });
    return { totalRev, totalEbitda, cats };
  }, [data]);

  const filtered = data.filter(c => {
    const s = searchTerm.toLowerCase();
    const matchSearch = (c.ACRONIMO || '').toLowerCase().includes(s) || (c['DENOMINACIÓN SOCIAL'] || '').toLowerCase().includes(s) || (c['CIF EMPRESA'] || '').toLowerCase().includes(s);
    const matchCat = selectedCategory === 'Todas' || c['CATEGORÍA'] === selectedCategory;
    return matchSearch && matchCat;
  });

  const topFive = data.slice(0, 5);

  const similar = useMemo(() => {
    if (!selectedCompany) return [];
    const rev = getRevenue(selectedCompany);
    return data
      .filter(c => c['CIF EMPRESA'] !== selectedCompany['CIF EMPRESA'])
      .map(c => ({ ...c, diff: Math.abs(rev - getRevenue(c)) }))
      .sort((a, b) => a.diff - b.diff).slice(0, 4);
  }, [selectedCompany, data]);

  // --- IA CHAT HANDLER ---
  const askAI = async () => {
    if (!input.trim() || isTyping) return;
    setChatHistory(p => [...p, { role: 'user', text: input }]);
    const question = input;
    setInput('');
    setIsTyping(true);
    try {
      const context = data.slice(0, 10).map(c => `${c.ACRONIMO}: ${formatM(getRevenue(c))} ventas`).join(', ');
      const prompt = `Eres BUD AI Core. Responde de forma muy concisa. Datos actuales: ${context}. Pregunta: ${question}`;
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      });
      const res = await response.json();
      setChatHistory(p => [...p, { role: 'assistant', text: res.candidates?.[0]?.content?.parts?.[0]?.text || 'No pude procesar la consulta.' }]);
    } catch (e) { setChatHistory(p => [...p, { role: 'assistant', text: 'Error de núcleo IA.' }]); }
    finally { setIsTyping(false); }
  };

  return (
    <div className="min-h-screen bg-[#FDFDFD] text-slate-900 font-sans selection:bg-yellow-200 overflow-x-hidden">
      
      {/* NAVBAR RESPONSIVE COMPACTO */}
      <nav className="bg-black text-white px-4 md:px-8 py-3 border-b border-yellow-400 sticky top-0 z-[100] flex justify-between items-center shadow-lg">
        <div className="flex items-center gap-3">
          <div className="bg-yellow-400 p-1 rounded-sm"><Building2 className="text-black w-4 h-4" /></div>
          <div className="flex flex-col leading-none">
            <span className="font-black text-lg md:text-xl tracking-tighter uppercase italic">BUD <span className="text-yellow-400">ADVISORS</span></span>
            <span className="text-[7px] tracking-[0.4em] text-slate-500 font-bold uppercase">M&A Unit</span>
          </div>
        </div>
        <label className="bg-yellow-400 hover:bg-yellow-300 text-black px-3 py-1.5 font-black text-[9px] uppercase tracking-widest cursor-pointer transition-all flex items-center gap-2 rounded-sm active:scale-95">
          <Upload className="w-3 h-3" /> {uploading ? '...' : 'CSV'}
          <input type="file" onChange={handleUpload} className="hidden" accept=".csv" />
        </label>
      </nav>

      {/* MONITOR STATUS */}
      <div className={`py-1 text-[7px] font-black uppercase tracking-[0.4em] text-center border-b ${status.type === 'error' ? 'bg-red-600 text-white' : 'bg-slate-50 text-slate-400'}`}>
        {status.msg}
      </div>

      <main className="max-w-7xl mx-auto p-4 md:p-10 space-y-12">
        
        {/* --- DASHBOARD EJECUTIVO --- */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-8">
           <div className="bg-black text-white p-6 md:p-10 border-l-[10px] border-yellow-400 shadow-2xl relative overflow-hidden group">
              <DollarSign className="absolute -right-4 -bottom-4 w-20 h-20 text-white/5" />
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Volumen Agregado</span>
              <span className="text-3xl md:text-5xl font-black tabular-nums tracking-tighter block truncate">{formatM(stats.totalRev)}</span>
              <p className="text-[8px] text-slate-500 mt-4 font-bold uppercase leading-relaxed italic">Suma de facturación de todas las agencias en el HUB.</p>
           </div>
           <div className="bg-white p-6 md:p-10 border-l-[10px] border-black shadow-xl flex flex-col justify-between">
              <div>
                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block mb-1">EBITDA Total</span>
                <span className="text-3xl md:text-4xl font-black text-green-600 tabular-nums tracking-tighter block truncate">{formatM(stats.totalEbitda)}</span>
              </div>
              <p className="text-[8px] text-slate-400 mt-4 font-bold uppercase leading-relaxed italic border-t pt-2">Capacidad neta de generación de caja del sector.</p>
           </div>
           <div className="bg-white p-6 md:p-10 border-l-[10px] border-slate-200 shadow-xl text-center flex flex-col justify-center">
              <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block mb-1">Unidades</span>
              <span className="text-5xl md:text-6xl font-black text-slate-900 tabular-nums leading-none tracking-tighter">{data.length}</span>
           </div>
        </section>

        {/* --- HEATMAP & RANKING --- */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 md:gap-10">
           <div className="lg:col-span-8 bg-white border border-slate-100 p-8 shadow-2xl rounded-sm space-y-6">
              <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 flex items-center gap-3 italic"><MousePointer2 className="w-4 h-4 text-black" /> Competitive Matrix (Rev vs EBITDA)</h3>
              <div className="bg-slate-50 h-64 md:h-80 relative rounded-sm border border-slate-200 overflow-hidden">
                 <div className="absolute inset-8">
                    {data.slice(0, 60).map((c, i) => {
                      const x = (getRevenue(c) / (getRevenue(data[0]) || 1)) * 100;
                      const m = (cleanValue(c.EBITDA) / (getRevenue(c) || 1));
                      const y = 100 - (Math.min(1, m / 0.4) * 100);
                      return (
                        <div key={i} 
                             onClick={() => { setSelectedCompany(c); setActiveTab('overview'); }}
                             className="absolute w-2 h-2 md:w-3 md:h-3 rounded-full bg-black border border-yellow-400 cursor-pointer hover:scale-150 hover:bg-yellow-400 transition-all group/dot"
                             style={{ left: `${x}%`, top: `${y}%` }}>
                           <span className="hidden group-hover/dot:block absolute bottom-full left-1/2 -translate-x-1/2 bg-black text-white text-[8px] p-1 px-2 rounded-sm z-[200] whitespace-nowrap">{c.ACRONIMO}</span>
                        </div>
                      );
                    })}
                 </div>
                 <div className="absolute bottom-2 right-4 text-[7px] font-bold text-slate-300 uppercase">Facturación →</div>
                 <div className="absolute left-2 top-4 text-[7px] font-bold text-slate-300 uppercase rotate-90 origin-left">Margen ↑</div>
              </div>
           </div>
           <div className="lg:col-span-4 bg-slate-900 text-white p-8 md:p-10 shadow-2xl rounded-sm">
              <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-yellow-400 mb-8 border-b border-white/10 pb-4 flex items-center gap-3 italic"><Trophy className="w-4 h-4" /> Market Leaders</h3>
              <div className="space-y-4">
                {topFive.map((c, i) => (
                  <div key={i} onClick={() => { setSelectedCompany(c); setActiveTab('overview'); }} className="flex justify-between items-center py-2 border-b border-white/5 cursor-pointer group hover:text-yellow-400 transition-colors">
                    <div className="flex items-center gap-3">
                      <span className="text-yellow-400 font-bold tabular-nums text-[10px]">0{i+1}</span>
                      <span className="font-bold uppercase text-[9px] tracking-widest truncate max-w-[120px]">{c.ACRONIMO || c['DENOMINACIÓN SOCIAL']}</span>
                    </div>
                    <span className="font-black tabular-nums text-xs italic tracking-tighter">{formatM(getRevenue(c))}</span>
                  </div>
                ))}
              </div>
           </div>
        </section>

        {/* --- FILTROS --- */}
        <section className="bg-white p-6 md:p-8 shadow-xl border-t-[10px] border-black flex flex-col md:flex-row gap-6 items-center">
           <div className="flex-1 flex items-center gap-4 border-b-2 border-slate-100 pb-2 w-full group">
              <Search className="text-slate-200 w-8 h-8 group-focus-within:text-yellow-500 transition-all" />
              <input className="w-full outline-none font-black text-2xl md:text-3xl placeholder-slate-100 bg-transparent uppercase tracking-tighter" placeholder="Localizar Entidad..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
           </div>
           <select className="p-4 bg-slate-50 border-2 border-transparent focus:border-yellow-400 outline-none font-black uppercase text-[10px] w-full md:w-auto cursor-pointer" value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)}>
             {['Todas', ...new Set(data.map(c => c['CATEGORÍA']).filter(Boolean))].map(cat => <option key={cat} value={cat}>{cat}</option>)}
           </select>
        </section>

        {/* --- GRID DE CARDS --- */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-10">
          {filtered.map((c, i) => (
            <div key={i} onClick={() => { setSelectedCompany(c); setActiveTab('overview'); }} className="bg-white border border-slate-100 p-8 md:p-10 hover:shadow-2xl transition-all cursor-pointer border-t-[6px] hover:border-t-yellow-400 group relative shadow-lg flex flex-col justify-between min-h-[220px]">
              <div>
                <div className="flex justify-between items-start mb-6">
                   <span className="text-[8px] font-black bg-black text-white px-2 py-0.5 uppercase italic">{c['CATEGORÍA'] || 'EMPRESA'}</span>
                   <span className="text-yellow-600 font-bold text-[9px] italic">{c['EJERCICIO']}</span>
                </div>
                <h3 className="text-xl md:text-2xl font-black text-black group-hover:text-yellow-600 transition-colors uppercase leading-[1.1] mb-2 tracking-tighter truncate italic">
                  {c.ACRONIMO || c['DENOMINACIÓN SOCIAL']}
                </h3>
                <p className="text-slate-400 text-[9px] font-mono uppercase tracking-widest truncate">CIF: {c['CIF EMPRESA']}</p>
              </div>
              <div className="flex justify-between items-baseline pt-6 border-t border-slate-50 mt-4 leading-none overflow-hidden">
                <span className="text-[9px] font-bold text-slate-300 uppercase italic">Revenue</span>
                <span className="font-black text-2xl md:text-3xl tabular-nums tracking-tighter text-slate-900 leading-none truncate">
                  {formatM(getRevenue(c))}
                </span>
              </div>
            </div>
          ))}
        </div>
      </main>

      {/* --- FICHA MODAL: ARQUITECTURA PRO --- */}
      {selectedCompany && (
        <div className="fixed inset-0 bg-black/95 backdrop-blur-xl z-[200] flex items-center justify-center p-2 md:p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-6xl my-auto shadow-2xl border-t-[15px] border-yellow-400 rounded-sm animate-in zoom-in duration-300">
            <div className="p-6 md:p-16 text-slate-900">
              
              <div className="flex justify-between items-start mb-8 gap-6">
                <div className="flex-1 overflow-hidden">
                  <span className="bg-black text-yellow-400 text-[9px] font-black px-4 py-1 uppercase tracking-[0.3em] italic mb-6 inline-block">M&A STRATEGIC ANALYSIS</span>
                  <h2 className="text-4xl md:text-6xl font-black tracking-tighter uppercase italic leading-[0.9] truncate drop-shadow-sm">
                    {selectedCompany.ACRONIMO || selectedCompany['DENOMINACIÓN SOCIAL']}
                  </h2>
                </div>
                <button onClick={() => setSelectedCompany(null)} className="p-4 border-2 border-slate-100 rounded-full hover:bg-slate-100 transition-all text-black"><X className="w-10 h-10" /></button>
              </div>

              {/* TABS NAVEGACIÓN: REFORZADAS */}
              <div className="flex bg-slate-50 p-1 mb-10 border border-slate-100 rounded-sm overflow-x-auto scrollbar-hide">
                {[
                  { id: 'overview', label: 'Resumen Ejecutivo', icon: FileText },
                  { id: 'valuation', label: 'Valoración M&A', icon: Scale },
                  { id: 'financials', label: 'Contabilidad', icon: Calculator },
                  { id: 'peers', label: 'Similares', icon: Layers }
                ].map(t => (
                  <button 
                    key={t.id} 
                    onClick={() => setActiveTab(t.id)}
                    className={`flex-1 flex items-center justify-center gap-3 px-6 py-4 font-black uppercase text-[10px] tracking-widest transition-all ${activeTab === t.id ? 'bg-black text-yellow-400 shadow-xl scale-[1.02]' : 'text-slate-400 hover:text-black'}`}
                  >
                    <t.icon className="w-4 h-4" /> <span className="hidden md:inline">{t.label}</span>
                  </button>
                ))}
              </div>

              <div className="min-h-[450px]">
                 {activeTab === 'overview' && (
                   <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 animate-in fade-in duration-500">
                      <div className="lg:col-span-8 space-y-10">
                         <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div className="bg-slate-50 p-6 md:p-8 border-b-8 border-black">
                               <span className="text-[8px] font-black uppercase text-slate-400 block mb-2 italic">Facturación</span>
                               <span className="text-xl md:text-3xl font-black tabular-nums tracking-tighter truncate block leading-none">{formatM(getRevenue(selectedCompany))}</span>
                            </div>
                            <div className="bg-slate-50 p-6 md:p-8 border-b-8 border-yellow-400">
                               <span className="text-[8px] font-black uppercase text-slate-400 block mb-2 italic">EBITDA</span>
                               <span className="text-xl md:text-3xl font-black tabular-nums tracking-tighter truncate block text-yellow-600 leading-none">{formatM(cleanValue(selectedCompany.EBITDA))}</span>
                            </div>
                            <div className="bg-slate-50 p-6 md:p-8 border-b-8 border-black">
                               <span className="text-[8px] font-black uppercase text-slate-400 block mb-2 italic">Margen %</span>
                               <span className="text-xl md:text-3xl font-black tabular-nums tracking-tighter block leading-none italic underline decoration-yellow-400">{companyProAnalysis.marginRatio.toFixed(1)}%</span>
                            </div>
                            <div className="bg-black text-white p-6 md:p-8 border-b-8 border-yellow-400">
                               <span className="text-[8px] font-black uppercase text-slate-500 block mb-2 italic">Resultado</span>
                               <span className="text-xl md:text-3xl font-black tabular-nums tracking-tighter truncate block text-yellow-400 leading-none">{formatM(cleanValue(selectedCompany['RESULTADO DEL EJERCICIO']))}</span>
                            </div>
                         </div>
                         <div className="bg-[#FBFBFB] p-10 border-l-[20px] border-black shadow-xl">
                            <h5 className="text-[10px] font-black uppercase italic text-slate-400 mb-6 flex items-center gap-3"><Sparkles className="w-4 h-4 text-black" /> Executive Summary Diagnostic</h5>
                            <p className="text-2xl md:text-3xl leading-relaxed italic font-serif text-slate-700 font-medium">
                               "La entidad {selectedCompany['DENOMINACIÓN SOCIAL']} presenta una posición {companyProAnalysis.revDelta > 0 ? 'dominante' : 'estable'} en el ecosistema de {selectedCompany['CATEGORÍA']}."
                            </p>
                            <div className="mt-8 grid grid-cols-2 gap-8 pt-8 border-t border-slate-100">
                               <div className="flex flex-col"><span className="text-[9px] font-black text-slate-400 uppercase italic">Identidad Fiscal</span><span className="text-sm font-bold font-mono uppercase">{selectedCompany['CIF EMPRESA']}</span></div>
                               <div className="flex flex-col"><span className="text-[9px] font-black text-slate-400 uppercase italic">Web Oficial</span><span className="text-sm font-bold lowercase truncate underline decoration-yellow-400/30">{selectedCompany['URL'] || 'no-registrada.com'}</span></div>
                            </div>
                         </div>
                      </div>
                      <div className="lg:col-span-4 bg-black text-white p-10 shadow-2xl relative overflow-hidden flex flex-col justify-center border-b-[15px] border-yellow-600">
                         <div className="absolute top-0 right-0 p-4 opacity-10"><Zap className="w-16 h-16 text-yellow-400" /></div>
                         <h4 className="text-[11px] font-black uppercase tracking-[0.4em] text-yellow-400 mb-10 italic border-b border-white/10 pb-4">BUD Rating Pulse</h4>
                         <div className="flex flex-col items-center">
                            <span className="text-[100px] md:text-[130px] font-black leading-none italic drop-shadow-2xl tabular-nums">{companyProAnalysis.rating}</span>
                            <span className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-500 mt-6 underline decoration-yellow-400 decoration-4">Score Efficiency / 100</span>
                         </div>
                      </div>
                   </div>
                 )}

                 {activeTab === 'valuation' && (
                   <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 animate-in slide-in-from-right-4 duration-500">
                      <div className="bg-white border-2 border-slate-50 p-10 shadow-xl space-y-12 group">
                         <div className="flex items-center gap-5 mb-10">
                            <div className="bg-black p-2 rounded-sm text-yellow-400"><Scale className="w-8 h-8" /></div>
                            <h4 className="text-2xl font-black uppercase tracking-tighter italic">Enterprise Value Simulation</h4>
                         </div>
                         <div className="space-y-10">
                            <div className="space-y-8">
                               <div>
                                  <div className="flex justify-between mb-4"><label className="text-[10px] font-black uppercase text-slate-500 italic">Múltiplo EBITDA (x)</label><span className="bg-black text-yellow-400 px-4 py-1 text-xs font-black italic">{valuationMultiple}x</span></div>
                                  <input type="range" min="4" max="15" step="0.5" value={valuationMultiple} onChange={(e) => setValuationMultiple(parseFloat(e.target.value))} className="w-full h-4 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-black" />
                               </div>
                               <div>
                                  <div className="flex justify-between mb-4"><label className="text-[10px] font-black uppercase text-slate-500 italic">Optimización OPEX (%)</label><span className="bg-yellow-400 text-black px-4 py-1 text-xs font-black italic">{salaryAdj}%</span></div>
                                  <input type="range" min="-30" max="30" step="1" value={salaryAdj} onChange={(e) => setSalaryAdj(parseFloat(e.target.value))} className="w-full h-4 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-yellow-400" />
                               </div>
                            </div>
                            <div className="pt-8 border-t-4 border-slate-50">
                               <div className="bg-black text-white p-10 border-l-[20px] border-yellow-400 flex flex-wrap justify-between items-center gap-6 shadow-2xl">
                                  <div className="flex flex-col"><span className="text-[11px] font-black uppercase italic tracking-widest text-yellow-400">Equity Value Estimate</span><p className="text-[8px] text-slate-500 uppercase mt-2 font-bold leading-none">Valor estimado del 100% (Equity Price)</p></div>
                                  <span className="text-5xl md:text-6xl font-black text-yellow-400 tabular-nums tracking-tighter italic">{formatFull(Math.max(0, (companyProAnalysis.adjEbitda * valuationMultiple) - (cleanValue(selectedCompany['PASIVO CORRIENTE']) - cleanValue(selectedCompany['ACTIVO CORRIENTE']))))}</span>
                               </div>
                            </div>
                         </div>
                      </div>
                      <div className="bg-slate-50 p-12 shadow-xl flex flex-col items-center justify-center text-center">
                         <h4 className="text-[11px] font-black uppercase text-slate-400 mb-12 italic border-b pb-4 border-slate-200">Operating Cost Sensitivity</h4>
                         <DonutChart data={[companyProAnalysis.pers, companyProAnalysis.others]} colors={['#000', '#FACC15']} />
                         <div className="mt-12 grid grid-cols-2 gap-12 w-full text-left pt-10 border-t-2 border-slate-200">
                            <div><div className="flex items-center gap-3 mb-2 text-[10px] font-black uppercase italic text-slate-500 leading-none"><div className="w-3 h-3 bg-black"></div>Talento</div><span className="text-2xl font-black tabular-nums italic text-slate-900 block truncate">{formatFull(companyProAnalysis.pers)}</span></div>
                            <div><div className="flex items-center gap-3 mb-2 text-[10px] font-black uppercase italic text-slate-500 leading-none"><div className="w-3 h-3 bg-yellow-400"></div>Estructura</div><span className="text-2xl font-black tabular-nums italic text-slate-900 block truncate">{formatFull(companyProAnalysis.others)}</span></div>
                         </div>
                      </div>
                   </div>
                 )}

                 {activeTab === 'financials' && (
                   <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 animate-in slide-in-from-bottom-4 duration-500">
                      <div className="space-y-10">
                         <h4 className="text-4xl font-black uppercase border-b-[15px] border-black pb-4 italic">Cash-Flow Sankey Logic</h4>
                         <CashFlowSankey company={selectedCompany} />
                         <div className="bg-black text-white p-10 border-b-[15px] border-yellow-600 flex justify-between items-center shadow-2xl rounded-sm">
                            <div className="flex flex-col relative z-10 pl-6 border-l-4 border-yellow-400"><span className="text-xs font-black uppercase italic tracking-[0.4em]">Working Capital</span><span className="text-[9px] font-bold text-slate-500 uppercase mt-3 italic">Lote de liquidez neta</span></div>
                            <span className={`text-5xl md:text-7xl font-black tabular-nums tracking-tighter italic ${cleanValue(selectedCompany['ACTIVO CORRIENTE']) - cleanValue(selectedCompany['PASIVO CORRIENTE']) > 0 ? 'text-green-400' : 'text-red-500'}`}>{formatFull(cleanValue(selectedCompany['ACTIVO CORRIENTE']) - cleanValue(selectedCompany['PASIVO CORRIENTE']))}</span>
                         </div>
                      </div>
                      <div className="space-y-10">
                         <h4 className="text-4xl font-black uppercase border-b-[15px] border-black pb-4 italic">Accounting Registry</h4>
                         <div className="space-y-3 font-mono text-[10px] font-black uppercase tracking-widest italic">
                            {[
                              { l: '(+) Business Revenue', v: getRevenue(selectedCompany), bg: 'bg-slate-900 text-white p-4' },
                              { l: '(-) Personnel Cost', v: cleanValue(selectedCompany['GASTOS DE PERSONAL']) },
                              { l: '(-) Structural Cost', v: cleanValue(selectedCompany['OTROS GASTOS DE EXPLOTACION']) },
                              { l: '(=) EBITDA Operativo', v: cleanValue(selectedCompany.EBITDA), color: 'text-yellow-600', border: 'border-y-2 border-yellow-400 py-4' },
                              { l: '(=) Profit for Exercise', v: cleanValue(selectedCompany['RESULTADO DEL EJERCICIO']), bg: 'bg-black text-white p-6 mt-8' }
                            ].map((r, idx) => (
                              <div key={idx} className={`flex justify-between items-center ${r.bg || ''} ${r.border || 'border-b border-slate-50 pb-2'} ${r.color || ''}`}>
                                 <span>{r.l}</span><span className="tabular-nums">{formatFull(r.v)}</span>
                              </div>
                            ))}
                         </div>
                         <div className="bg-slate-50 p-8 border-l-[15px] border-slate-200 shadow-xl rounded-sm">
                            <h5 className="text-[10px] font-black uppercase italic text-slate-400 mb-6 flex items-center gap-3 leading-none border-b border-slate-100 pb-3"><Briefcase className="w-4 h-4 text-slate-400" /> Activity Purpose Registry</h5>
                            <p className="text-xl md:text-2xl leading-relaxed italic font-serif text-slate-800 font-medium">"{String(selectedCompany['OBJETO SOCIAL'] || 'Descripción no disponible.')}"</p>
                         </div>
                      </div>
                   </div>
                 )}

                 {activeTab === 'peers' && (
                   <div className="space-y-12 animate-in zoom-in duration-500">
                      <div className="flex flex-col gap-3 border-l-[15px] border-yellow-400 pl-10 py-2">
                        <h4 className="text-4xl md:text-6xl font-black uppercase tracking-tighter italic leading-none">Comparable Peer Group</h4>
                        <p className="text-slate-400 text-[10px] font-black uppercase tracking-[0.4em] italic">Pool de Análisis: {companyProAnalysis.peerCount} competidores en {selectedCompany['CATEGORÍA']}.</p>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10">
                        {similar.map((c, i) => (
                          <div key={i} onClick={() => { setSelectedCompany(c); setActiveTab('overview'); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="bg-white border-2 border-slate-100 hover:border-yellow-400 hover:shadow-2xl transition-all cursor-pointer group flex flex-col justify-between min-h-[350px] shadow-xl relative overflow-hidden rounded-sm">
                            <div className="absolute -right-6 -bottom-6 w-32 h-32 text-slate-50 opacity-10 group-hover:text-yellow-400 group-hover:opacity-20 transition-all duration-1000"><Zap className="w-full h-full" /></div>
                            <div className="p-10 leading-none">
                               <span className="text-[9px] font-black bg-black text-white px-4 py-1 uppercase tracking-widest mb-10 inline-block italic leading-none shadow-xl">{c['CATEGORÍA']}</span>
                               <h5 className="font-black uppercase text-2xl md:text-3xl group-hover:text-yellow-600 transition-all tracking-tighter mb-4 italic leading-[1] truncate">{c.ACRONIMO || c['DENOMINACIÓN SOCIAL']}</h5>
                               <p className="text-slate-400 text-[10px] font-mono italic tracking-[0.2em] uppercase border-b border-slate-50 pb-6 leading-none">{c['CIF EMPRESA']}</p>
                            </div>
                            <div className="p-10 border-t-8 border-slate-50 bg-slate-50 group-hover:bg-white transition-colors leading-none mt-auto">
                               <span className="text-[10px] font-black text-slate-400 uppercase block mb-3 italic tracking-[0.4em] leading-none">Revenue Estimate</span>
                               <span className="font-black text-2xl md:text-4xl tabular-nums tracking-tighter text-slate-900 group-hover:text-black italic leading-none block truncate">{formatM(getRevenue(c))}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                   </div>
                 )}
              </div>

              {/* FOOTER MODAL */}
              <div className="mt-32 pt-12 border-t-[10px] border-slate-50 flex justify-center pb-24">
                <button onClick={() => setSelectedCompany(null)} className="bg-black text-white px-20 md:px-96 py-10 md:py-16 font-black uppercase tracking-[1.4em] text-[10px] md:text-xs hover:bg-yellow-400 hover:text-black transition-all shadow-2xl active:scale-95 border-b-[30px] border-yellow-600 rounded-sm italic group flex items-center justify-center gap-12 leading-none">
                  CLOSE DOSSIER <ArrowRight className="hidden md:inline-block w-10 h-10 group-hover:translate-x-10 transition-transform" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- PANEL GPT BUD AI --- */}
      <div className={`fixed bottom-10 right-10 z-[1000] transition-all duration-700 ease-in-out ${isAiOpen ? 'w-[450px] h-[700px]' : 'w-24 h-24'}`}>
        {isAiOpen ? (
          <div className="bg-white w-full h-full shadow-[0_40px_150px_rgba(0,0,0,0.6)] rounded-2xl border-4 border-black flex flex-col overflow-hidden animate-in zoom-in slide-in-from-bottom-20">
            <div className="bg-black p-8 flex justify-between items-center text-white">
              <div className="flex items-center gap-4">
                <Bot className="w-8 h-8 text-yellow-400 animate-bounce" />
                <div className="flex flex-col leading-none">
                   <span className="font-black uppercase tracking-[0.3em] text-[12px]">BUD AI CORE</span>
                   <span className="text-[8px] font-black text-slate-500 uppercase mt-1 tracking-widest">Intelligence Node Node</span>
                </div>
              </div>
              <button onClick={() => setIsAiOpen(false)} className="hover:rotate-90 hover:bg-white/10 p-2 rounded-full transition-all duration-500"><X className="w-7 h-7" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-8 space-y-8 bg-slate-50/50 scrollbar-hide">
              {chatHistory.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[90%] p-6 rounded-2xl text-[11px] font-black tracking-widest leading-[1.8] shadow-2xl italic ${m.role === 'user' ? 'bg-black text-white rounded-tr-none border-l-4 border-yellow-400' : 'bg-white border-2 border-slate-100 text-slate-800 rounded-tl-none border-l-4 border-black'}`}>
                    {m.text}
                  </div>
                </div>
              ))}
              {isTyping && (
                <div className="flex justify-start">
                  <div className="bg-white border-2 border-slate-100 p-6 rounded-2xl rounded-tl-none shadow-2xl flex items-center gap-4 border-l-4 border-yellow-400">
                    <Loader2 className="w-6 h-6 animate-spin text-yellow-500" />
                    <span className="text-[10px] font-black uppercase tracking-[0.5em] text-slate-400 animate-pulse">Analizando Mercado...</span>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
            <div className="p-6 bg-white border-t-4 border-black flex gap-4">
              <input className="flex-1 bg-slate-50 border-4 border-slate-100 p-4 rounded-xl outline-none focus:border-yellow-400 font-black text-xs transition-all uppercase" placeholder="Consulta a BUD AI..." value={input} onChange={(e) => setInput(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && askAI()} />
              <button onClick={askAI} className="bg-black text-white p-5 rounded-xl hover:bg-yellow-400 hover:text-black transition-all shadow-2xl active:scale-90"><Send className="w-6 h-6" /></button>
            </div>
          </div>
        ) : (
          <button onClick={() => setIsAiOpen(true)} className="w-24 h-24 bg-black text-yellow-400 rounded-full flex items-center justify-center shadow-[0_20px_60px_rgba(0,0,0,0.4)] hover:scale-110 active:scale-90 transition-all group border-4 border-yellow-400 relative overflow-hidden">
            <div className="absolute inset-0 bg-yellow-400/10 animate-pulse"></div>
            <MessageSquare className="w-10 h-10 group-hover:rotate-12 transition-transform" />
            <span className="absolute -top-1 -right-1 bg-red-600 text-white text-[8px] font-black px-2 py-1 rounded-full animate-bounce">AI</span>
          </button>
        )}
      </div>
    </div>
  );
}