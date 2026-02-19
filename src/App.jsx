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
  Star, MousePointer2, Download
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, onSnapshot, query } from 'firebase/firestore';

// --- CONFIGURACIÓN DE FIREBASE ---
const firebaseConfig = JSON.parse(__firebase_config);
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// REGLA 1: Sanitización de appId para evitar errores de segmentos de ruta (debe ser impar)
const rawAppId = typeof __app_id !== 'undefined' ? __app_id : 'bud_intelligence_v23';
const appId = rawAppId.replace(/\//g, '_'); 

// --- MOTOR DE DATOS Y FORMATO (100% ESPAÑA) ---
const cleanValue = (val) => {
  if (val === undefined || val === null || val === '') return 0;
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

// --- COMPONENTES DE VISUALIZACIÓN ---

const RadarChart = ({ company, data }) => {
  if (!company) return null;
  const rev = getRevenue(company);
  const ebitda = cleanValue(company.EBITDA);
  const sector = company['CATEGORÍA'] || 'General';
  const peers = data.filter(c => c['CATEGORÍA'] === sector);
  const avgRev = peers.length > 0 ? peers.reduce((a, b) => a + getRevenue(b), 0) / peers.length : 1000000;
  
  const axes = [
    { label: 'Volumen', val: Math.min(1, rev / (avgRev * 2)) },
    { label: 'Margen', val: Math.min(1, (ebitda / (rev || 1)) / 0.3) },
    { label: 'Caja', val: Math.min(1, (cleanValue(company['ACTIVO CORRIENTE']) / (cleanValue(company['PASIVO CORRIENTE']) || 1)) / 2) },
    { label: 'Eficiencia', val: Math.min(1, (rev / (Math.abs(cleanValue(company['GASTOS DE PERSONAL'])) || 1)) / 4) },
    { label: 'Solvencia', val: Math.min(1, cleanValue(company['PATRIMONIO NETO']) / 5000000) }
  ];

  const points = axes.map((ax, i) => {
    const angle = (i * 2 * Math.PI) / axes.length - Math.PI / 2;
    const r = ax.val * 0.85;
    return `${Math.cos(angle) * r},${Math.sin(angle) * r}`;
  }).join(' ');

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="-1.2 -1.2 2.4 2.4" className="w-full max-w-[240px] drop-shadow-2xl">
        {[0.2, 0.4, 0.6, 0.8, 1].map(r => <circle key={r} cx="0" cy="0" r={r} fill="none" stroke="#f1f5f9" strokeWidth="0.01" />)}
        {axes.map((ax, i) => {
          const angle = (i * 2 * Math.PI) / axes.length - Math.PI / 2;
          return <line key={i} x1="0" y1="0" x2={Math.cos(angle)} y2={Math.sin(angle)} stroke="#cbd5e1" strokeWidth="0.01" />;
        })}
        <polygon points={points} fill="rgba(250, 204, 21, 0.4)" stroke="#eab308" strokeWidth="0.04" />
      </svg>
      <div className="grid grid-cols-5 gap-0.5 mt-4 w-full">
        {axes.map((ax, i) => (
          <div key={i} className="text-center">
            <p className="text-[6px] font-black uppercase text-slate-400 leading-none mb-1">{ax.label}</p>
            <p className="text-[8px] font-bold">{(ax.val * 100).toFixed(0)}%</p>
          </div>
        ))}
      </div>
    </div>
  );
};

const SankeyFlow = ({ company }) => {
  if (!company) return null;
  const rev = getRevenue(company);
  const pers = Math.abs(cleanValue(company['GASTOS DE PERSONAL']));
  const opex = Math.abs(cleanValue(company['OTROS GASTOS DE EXPLOTACION']));
  const ebitda = cleanValue(company.EBITDA);
  const totalOut = pers + opex + Math.max(0, ebitda);

  return (
    <div className="space-y-6">
      <div className="h-40 flex items-stretch gap-1 bg-slate-50 p-6 border border-slate-200 rounded-sm overflow-hidden">
        <div className="w-1/3 bg-black flex items-center justify-center relative">
           <span className="text-[10px] font-black text-white uppercase -rotate-90">Ingresos</span>
        </div>
        <div className="flex-1 flex flex-col gap-1">
           <div className="bg-red-500/90 relative" style={{ height: `${(pers / (totalOut || 1)) * 100}%` }}>
             <span className="absolute inset-0 flex items-center pl-4 text-[9px] font-black text-white uppercase italic">Talento</span>
           </div>
           <div className="bg-red-400/80 relative" style={{ height: `${(opex / (totalOut || 1)) * 100}%` }}>
             <span className="absolute inset-0 flex items-center pl-4 text-[9px] font-black text-white uppercase italic">Estructura</span>
           </div>
           <div className="bg-green-500 relative" style={{ height: `${(ebitda / (totalOut || 1)) * 100}%` }}>
             <span className="absolute inset-0 flex items-center pl-4 text-[9px] font-black text-white uppercase italic font-mono">EBITDA</span>
           </div>
        </div>
      </div>
      <p className="text-[8px] text-slate-400 font-bold uppercase tracking-widest italic border-l-2 border-yellow-400 pl-4">
        Análisis proporcional de costes operativos vs beneficio.
      </p>
    </div>
  );
};

export default function App() {
  const [data, setData] = useState([]);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState({ type: 'info', msg: 'Iniciando sistema...' });
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Todas');
  const [selectedCompany, setSelectedCompany] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [valMult, setValMult] = useState(8);
  const [salarySens, setSalarySens] = useState(0);
  const [watchlist, setWatchlist] = useState([]);

  const [isAiOpen, setIsAiOpen] = useState(false);
  const [chat, setChat] = useState([{ role: 'assistant', text: 'Soy BUD AI Expert. Analizo el mercado por ti. ¿Qué necesitas saber?' }]);
  const [chatIn, setChatIn] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const chatEndRef = useRef(null);

  // REGLA 3: Autenticación primero
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        setStatus({ type: 'error', msg: 'Fallo en autenticación' });
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  // REGLA 1 & 2: Sincronización con rutas estrictas
  useEffect(() => {
    if (!user) return;
    const colRef = collection(db, 'artifacts', appId, 'public', 'data', 'companies');
    const unsubscribe = onSnapshot(colRef, (snap) => {
      const docs = snap.docs.map(d => d.data());
      // Ordenación en memoria (Regla 2)
      docs.sort((a, b) => getRevenue(b) - getRevenue(a));
      setData(docs);
      setLoading(false);
      setStatus({ type: 'success', msg: 'TERMINAL ONLINE - M&A UNIT' });
    }, (err) => {
      setStatus({ type: 'error', msg: 'Error de acceso a datos' });
    });
    return () => unsubscribe();
  }, [user]);

  const handleUpload = (e) => {
    const file = e.target.files[0];
    if (!file || !user) return;
    setUploading(true);
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const lines = ev.target.result.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        const delimiter = lines[0].includes(';') ? ';' : ',';
        const headers = lines[0].split(delimiter).map(h => h.trim().replace(/^"|"$/g, ''));
        for (let i = 1; i < lines.length; i++) {
          const vals = lines[i].split(delimiter);
          if (vals.length < headers.length) continue;
          const obj = {};
          headers.forEach((h, idx) => {
            let val = vals[idx]?.trim().replace(/^"|"$/g, '');
            const isN = ['IMPORTE', 'GASTOS', 'EBITDA', 'RESULTADO', 'ACTIVO', 'PASIVO', 'PATRIMONIO', 'EMPLEADOS'].some(k => h.toUpperCase().includes(k));
            obj[h] = isN ? cleanValue(val) : val;
          });
          if (obj['CIF EMPRESA']) {
            const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'companies', obj['CIF EMPRESA'].replace(/[^a-zA-Z0-9]/g, ''));
            await setDoc(docRef, obj);
          }
        }
        setStatus({ type: 'success', msg: 'Base de datos sincronizada' });
      } catch (err) { setStatus({ type: 'error', msg: err.message }); }
      finally { setUploading(false); }
    };
    reader.readAsText(file);
  };

  // --- DERIVADOS ---
  const globalStats = useMemo(() => {
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

  const companyProAnalysis = useMemo(() => {
    if (!selectedCompany) return null;
    const rev = getRevenue(selectedCompany);
    const ebitda = cleanValue(selectedCompany.EBITDA);
    const persRaw = Math.abs(cleanValue(selectedCompany['GASTOS DE PERSONAL']));
    const others = Math.abs(cleanValue(selectedCompany['OTROS GASTOS DE EXPLOTACION']));
    
    const persAdj = persRaw * (1 + salarySens / 100);
    const ebitdaAdj = ebitda - (persAdj - persRaw);
    const margin = (ebitdaAdj / (rev || 1)) * 100;
    const rating = Math.round(Math.min(100, (margin * 1.5) + (rev / (persAdj || 1) * 8) + 15));
    
    const peers = data.filter(c => c['CATEGORÍA'] === selectedCompany['CATEGORÍA']);
    const avgRev = peers.reduce((a, b) => a + getRevenue(b), 0) / (peers.length || 1);

    return { rating, revDelta: ((rev / avgRev) - 1) * 100, persAdj, ebitdaAdj, margin, peerCount: peers.length, others };
  }, [selectedCompany, data, salarySens]);

  const filtered = data.filter(c => {
    const s = searchTerm.toLowerCase();
    return (c.ACRONIMO || '').toLowerCase().includes(s) || (c['DENOMINACIÓN SOCIAL'] || '').toLowerCase().includes(s);
  }).filter(c => selectedCategory === 'Todas' || c['CATEGORÍA'] === selectedCategory);

  const askAI = async () => {
    if (!chatIn.trim() || isTyping) return;
    const currentInput = chatIn;
    setChat(p => [...p, { role: 'user', text: currentInput }]);
    setChatIn('');
    setIsTyping(true);
    try {
      const topCtx = data.slice(0, 10).map(c => `${c.ACRONIMO}: ${formatM(getRevenue(c))}`).join(', ');
      const systemMsg = `Eres BUD AI Expert. Analista M&A. Responde en español de forma muy concisa. Contexto: ${topCtx}`;
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          contents: [{ parts: [{ text: currentInput }] }], 
          systemInstruction: { parts: [{ text: systemMsg }] } 
        })
      });
      const result = await response.json();
      const text = result.candidates?.[0]?.content?.parts?.[0]?.text || "Error de respuesta IA";
      setChat(p => [...p, { role: 'assistant', text: String(text) }]);
    } catch (e) {
      setChat(p => [...p, { role: 'assistant', text: 'Kernel IA fuera de línea.' }]);
    } finally { setIsTyping(false); }
  };

  return (
    <div className="min-h-screen bg-[#FDFDFD] text-slate-900 font-sans antialiased overflow-x-hidden selection:bg-yellow-200">
      
      <style>{`
        .terminal-shadow { box-shadow: 0 40px 100px -30px rgba(0,0,0,0.3); }
        .tab-active { background: #000 !important; color: #fbbf24 !important; border-bottom: 6px solid #fbbf24 !important; transform: scale(1.02); }
        .fluid-title { font-size: clamp(1.8rem, 5.5vw, 4.5rem); line-height: 0.95; }
        .tabular-nums { font-variant-numeric: tabular-nums; }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        input[type="range"]::-webkit-slider-thumb { appearance: none; width: 22px; height: 22px; background: #000; border: 3px solid #fbbf24; border-radius: 50%; cursor: pointer; }
      `}</style>

      {/* NAVBAR */}
      <nav className="bg-black text-white px-6 md:px-10 py-4 border-b-2 border-yellow-400 sticky top-0 z-[100] flex justify-between items-center shadow-2xl">
        <div className="flex items-center gap-4 cursor-pointer" onClick={() => window.scrollTo({top:0, behavior:'smooth'})}>
          <div className="bg-yellow-400 p-2 rounded-sm"><Building2 className="text-black w-6 h-6" /></div>
          <div className="flex flex-col leading-none">
            <span className="font-black text-xl md:text-2xl tracking-tighter uppercase italic">BUD <span className="text-yellow-400">ADVISORS</span></span>
            <span className="text-[7px] tracking-[0.4em] text-slate-500 font-bold uppercase mt-1">Intelligence Terminal</span>
          </div>
        </div>
        <label className="bg-yellow-400 hover:bg-yellow-300 text-black px-4 py-2 font-black text-[9px] md:text-[11px] uppercase tracking-widest cursor-pointer transition-all flex items-center gap-2 rounded-sm shadow-xl">
          <Upload className="w-3.5 h-3.5" /> {uploading ? '...' : 'SUBIR DATOS'}
          <input type="file" onChange={handleUpload} className="hidden" accept=".csv" />
        </label>
      </nav>

      <div className={`py-1 text-[7px] font-black uppercase tracking-[0.4em] text-center border-b ${status.type === 'error' ? 'bg-red-600 text-white' : 'bg-slate-50 text-slate-400'}`}>
        {String(status.msg)}
      </div>

      <main className="max-w-7xl mx-auto p-4 md:p-10 space-y-16">
        
        {/* DASHBOARD */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
           <div className="bg-black text-white p-8 border-l-[12px] border-yellow-400 shadow-2xl relative overflow-hidden group">
              <DollarSign className="absolute -right-4 -bottom-4 w-20 h-20 text-white/5 group-hover:scale-110 transition-transform" />
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-2 italic">Total Market Revenue</span>
              <span className="text-3xl md:text-5xl font-black tabular-nums tracking-tighter block truncate leading-none">{formatM(globalStats.totalRev)}</span>
           </div>
           <div className="bg-white p-8 border-l-[12px] border-black shadow-xl flex flex-col justify-between">
              <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block mb-2 italic">Operating EBITDA Pool</span>
              <span className="text-3xl md:text-5xl font-black text-green-600 tabular-nums tracking-tighter block truncate leading-none">{formatM(globalStats.totalEbitda)}</span>
           </div>
           <div className="bg-white p-8 border-l-[12px] border-slate-200 shadow-xl text-center flex flex-col justify-center">
              <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block mb-2 italic">Registered Entities</span>
              <span className="text-5xl md:text-7xl font-black text-slate-900 tabular-nums leading-none tracking-tighter">{data.length}</span>
           </div>
        </section>

        {/* HEATMAP */}
        <section className="bg-white p-8 md:p-12 border border-slate-100 shadow-2xl rounded-sm space-y-8">
           <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 flex items-center gap-4 italic leading-none"><MousePointer2 className="w-5 h-5 text-black" /> Competitive Matrix (Revenue vs Profitability)</h3>
           <div className="bg-[#F8F9FA] h-[400px] relative rounded-sm border border-slate-200 overflow-hidden cursor-crosshair">
              <div className="absolute inset-12">
                 {data.slice(0, 80).map((c, i) => {
                   const rev = getRevenue(c);
                   const maxRev = getRevenue(data[0]) || 1;
                   const x = (rev / maxRev) * 100;
                   const m = (cleanValue(c.EBITDA) / (rev || 1));
                   const y = 100 - (Math.min(1, m / 0.4) * 100);
                   return (
                     <div key={i} 
                          onClick={() => { setSelectedCompany(c); setActiveTab('overview'); }}
                          className="absolute w-3 h-3 rounded-full bg-black border-2 border-yellow-400 hover:scale-[3.5] hover:bg-yellow-400 hover:z-[150] transition-all duration-300 group shadow-lg"
                          style={{ left: `${x}%`, top: `${y}%` }}>
                        <div className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 bg-black text-white text-[9px] font-black p-1.5 px-3 rounded-sm whitespace-nowrap mb-3 shadow-2xl border border-yellow-400 z-[200]">
                           {String(c.ACRONIMO || c['DENOMINACIÓN SOCIAL'])}
                        </div>
                     </div>
                   );
                 })}
              </div>
              <div className="absolute bottom-4 right-12 text-[10px] font-black text-slate-300 uppercase tracking-widest">Revenue Size →</div>
              <div className="absolute left-4 top-12 text-[10px] font-black text-slate-300 uppercase rotate-90 origin-left tracking-widest">EBITDA Margin ↑</div>
           </div>
        </section>

        {/* LISTADO */}
        <section className="bg-white p-8 shadow-2xl border-t-[15px] border-black flex flex-col md:flex-row gap-10 items-center">
           <div className="flex-1 flex items-center gap-6 border-b-4 border-slate-100 pb-4 w-full group">
              <Search className="text-slate-200 w-10 h-10 group-focus-within:text-yellow-500 transition-all" />
              <input className="w-full outline-none font-black text-2xl md:text-4xl placeholder-slate-100 bg-transparent uppercase tracking-tighter" placeholder="Buscar Agencia..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
           </div>
           <select className="p-5 bg-slate-50 border-2 border-slate-100 focus:border-yellow-400 outline-none font-black uppercase text-xs cursor-pointer shadow-inner min-w-[280px]" value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)}>
             <option value="Todas">Todas las Categorías</option>
             {[...new Set(data.map(c => c['CATEGORÍA']).filter(Boolean))].map(cat => <option key={cat} value={cat}>{cat}</option>)}
           </select>
        </section>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8 md:gap-12">
          {filtered.map((c, i) => (
            <div key={i} onClick={() => { setSelectedCompany(c); setActiveTab('overview'); }} className="bg-white border border-slate-100 p-10 hover:shadow-2xl transition-all cursor-pointer border-t-[10px] hover:border-t-yellow-400 group relative shadow-lg flex flex-col justify-between min-h-[320px]">
              <div>
                <span className="text-[10px] font-black bg-black text-white px-3 py-0.5 uppercase italic mb-8 inline-block">{String(c['CATEGORÍA'] || 'CORPORACIÓN')}</span>
                <h3 className="text-2xl md:text-3xl font-black text-black group-hover:text-yellow-600 transition-colors uppercase leading-[0.95] mb-4 tracking-tighter italic line-clamp-2">
                  {String(c.ACRONIMO || c['DENOMINACIÓN SOCIAL'])}
                </h3>
                <p className="text-slate-400 text-[10px] font-mono tracking-widest uppercase truncate border-b pb-6 italic">{String(c['CIF EMPRESA'])}</p>
              </div>
              <div className="flex justify-between items-baseline pt-6 border-t">
                <span className="text-[10px] font-black text-slate-300 uppercase italic">Net Revenue</span>
                <span className="font-black text-3xl md:text-4xl tabular-nums tracking-tighter text-slate-900 group-hover:scale-105 transition-transform truncate">
                  {formatM(getRevenue(c))}
                </span>
              </div>
            </div>
          ))}
        </div>
      </main>

      {/* MODAL */}
      {selectedCompany && (
        <div className="fixed inset-0 bg-black/98 backdrop-blur-2xl z-[500] flex items-center justify-center p-2 md:p-6 overflow-y-auto">
          <div className="bg-white w-full max-w-7xl my-auto shadow-2xl border-t-[15px] border-yellow-400 rounded-sm animate-in zoom-in duration-300 flex flex-col max-h-[95vh] overflow-hidden">
            
            <div className="p-8 md:p-16 lg:p-20 text-slate-900 overflow-y-auto no-scrollbar">
              
              <div className="flex justify-between items-start mb-12 gap-8">
                <div className="flex-1 overflow-hidden">
                  <span className="bg-black text-yellow-400 text-[10px] font-black px-6 py-2 uppercase tracking-[0.4em] italic mb-8 inline-block">STRATEGIC DOSSIER</span>
                  <h2 className="fluid-title font-black tracking-tighter uppercase italic mb-8 truncate text-black">
                    {String(selectedCompany.ACRONIMO || selectedCompany['DENOMINACIÓN SOCIAL'])}
                  </h2>
                </div>
                <button onClick={() => setSelectedCompany(null)} className="p-6 border-4 border-slate-100 rounded-full hover:bg-slate-100 transition-all text-black"><X className="w-10 h-10" /></button>
              </div>

              {/* TABS */}
              <div className="flex gap-2 mb-16 border-b-8 border-slate-100 pb-2 overflow-x-auto no-scrollbar z-[600]">
                {[
                  { id: 'overview', label: 'Diagnóstico', icon: FileText },
                  { id: 'valuation', label: 'Valoración', icon: Scale },
                  { id: 'financials', label: 'Contabilidad', icon: Calculator },
                  { id: 'peers', label: 'Similares', icon: Layers }
                ].map(t => (
                  <button 
                    key={t.id} 
                    onClick={(e) => { e.preventDefault(); setActiveTab(t.id); }}
                    className={`flex-1 flex items-center justify-center gap-4 px-10 py-6 font-black uppercase text-[11px] md:text-[13px] tracking-[0.2em] transition-all border-x-2 border-t-2 rounded-t-sm whitespace-nowrap ${activeTab === t.id ? 'tab-active' : 'bg-slate-50 text-slate-400 hover:text-black'}`}
                  >
                    {String(t.label)}
                  </button>
                ))}
              </div>

              <div className="min-h-[500px]">
                 {activeTab === 'overview' && (
                   <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 animate-in fade-in duration-500">
                      <div className="lg:col-span-8 space-y-12">
                         <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                            {[
                              { l: 'Facturación', v: formatM(getRevenue(selectedCompany)), c: 'black' },
                              { l: 'EBITDA', v: formatM(cleanValue(selectedCompany.EBITDA)), c: 'yellow-400' },
                              { l: 'Margen %', v: String(companyProAnalysis.margin.toFixed(1))+'%', c: 'black' },
                              { l: 'Bº Neto', v: formatM(cleanValue(selectedCompany['RESULTADO DEL EJERCICIO'])), c: 'yellow-400', inv: true }
                            ].map((k, i) => (
                              <div key={i} className={`${k.inv ? 'bg-black text-white' : 'bg-slate-50'} p-10 border-b-[10px] border-${k.c} rounded-sm shadow-xl flex flex-col justify-between overflow-hidden group`}>
                                 <span className="text-[10px] font-black uppercase text-slate-400 block mb-6 italic tracking-widest">{String(k.l)}</span>
                                 <span className="text-3xl md:text-4xl font-black tabular-nums tracking-tighter italic truncate">{String(k.v)}</span>
                              </div>
                            ))}
                         </div>
                         <div className="bg-slate-50 p-12 border-l-[30px] border-black shadow-2xl">
                            <p className="text-3xl md:text-5xl leading-relaxed italic font-serif text-slate-800 font-medium">
                               "{String(selectedCompany['DENOMINACIÓN SOCIAL'])} presenta una posición estratégica {companyProAnalysis.revDelta > 0 ? 'dominante' : 'estable'}."
                            </p>
                         </div>
                      </div>
                      <div className="lg:col-span-4 bg-white border-2 border-slate-50 p-12 shadow-2xl rounded-sm flex flex-col items-center justify-center">
                         <RadarChart company={selectedCompany} data={data} />
                      </div>
                   </div>
                 )}

                 {activeTab === 'valuation' && (
                   <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 animate-in slide-in-from-right-8 duration-500">
                      <div className="bg-white border-2 border-slate-50 p-12 shadow-2xl space-y-16">
                         <div className="space-y-12">
                            <div>
                               <div className="flex justify-between mb-6 leading-none"><label className="text-[11px] font-black uppercase text-slate-500 italic">Múltiplo EBITDA</label><span className="bg-black text-yellow-400 px-5 py-1.5 text-sm font-black italic">{valuationMultiple}x</span></div>
                               <input type="range" min="4" max="15" step="0.5" value={valMult} onChange={(e) => setValMult(parseFloat(e.target.value))} className="w-full h-5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-black" />
                            </div>
                            <div>
                               <div className="flex justify-between mb-6 leading-none"><label className="text-[11px] font-black uppercase text-slate-500 italic">Optimización OPEX (%)</label><span className="bg-yellow-400 text-black px-5 py-1.5 text-sm font-black italic">{salarySens}%</span></div>
                               <input type="range" min="-30" max="30" step="1" value={salarySens} onChange={(e) => setSalarySens(parseFloat(e.target.value))} className="w-full h-5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-yellow-500" />
                            </div>
                         </div>
                         <div className="bg-black text-white p-14 border-l-[30px] border-yellow-400 flex flex-wrap justify-between items-center gap-10">
                            <span className="text-[14px] font-black uppercase italic text-yellow-400">Equity Value Est.</span>
                            <span className="text-6xl md:text-8xl font-black text-yellow-400 tabular-nums tracking-tighter italic">{formatFull(Math.max(0, (companyProAnalysis.ebitdaAdj * valMult) - (cleanValue(selectedCompany['PASIVO CORRIENTE']) - cleanValue(selectedCompany['ACTIVO CORRIENTE']))))}</span>
                         </div>
                      </div>
                      <div className="bg-slate-50 p-16 shadow-xl flex flex-col items-center justify-center">
                         <h4 className="text-[12px] font-black uppercase text-slate-400 mb-16 italic border-b-2 pb-6 border-slate-200">OPEX Sensitivity Analysis</h4>
                         <p className="text-4xl font-black tabular-nums italic text-slate-900 mb-8">{formatFull(companyProAnalysis.persAdj)}</p>
                         <p className="text-[10px] font-black uppercase text-slate-400 italic">Coste de Talento Proyectado</p>
                      </div>
                   </div>
                 )}

                 {activeTab === 'financials' && (
                   <div className="grid grid-cols-1 lg:grid-cols-2 gap-20 animate-in slide-in-from-bottom-8 duration-500">
                      <SankeyFlow company={selectedCompany} />
                      <div className="space-y-4 font-mono text-[11px] font-black uppercase tracking-widest italic">
                         {[
                           { l: '(+) Net Business Revenue', v: getRevenue(selectedCompany), bg: 'bg-slate-900 text-white p-6 border-l-[15px] border-yellow-400' },
                           { l: '(-) Cost of Talent', v: cleanValue(selectedCompany['GASTOS DE PERSONAL']) },
                           { l: '(=) Operating EBITDA', v: cleanValue(selectedCompany.EBITDA), color: 'text-yellow-600', border: 'border-y-4 border-yellow-400 py-8 my-8' },
                           { l: '(=) Result', v: cleanValue(selectedCompany['RESULTADO DEL EJERCICIO']), bg: 'bg-black text-white p-10 mt-12' }
                         ].map((r, idx) => (
                           <div key={idx} className={`flex justify-between items-center ${r.bg || ''} ${r.border || 'border-b border-slate-100 pb-4'} ${r.color || ''}`}>
                              <span>{String(r.l)}</span><span className="tabular-nums text-xl leading-none">{formatFull(r.v)}</span>
                           </div>
                         ))}
                      </div>
                   </div>
                 )}

                 {activeTab === 'peers' && (
                   <div className="space-y-16 animate-in zoom-in duration-500">
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-12">
                        {similar.map((c, i) => (
                          <div key={i} onClick={() => { setSelectedCompany(c); setActiveTab('overview'); }} className="bg-white border-4 border-slate-50 hover:border-yellow-400 hover:shadow-2xl transition-all cursor-pointer group flex flex-col justify-between min-h-[450px] shadow-2xl relative overflow-hidden">
                            <div className="p-14 leading-none">
                               <span className="text-[9px] font-black bg-black text-white px-6 py-2 uppercase tracking-[0.4em] mb-12 inline-block leading-none italic">{String(c['CATEGORÍA'])}</span>
                               <h5 className="font-black uppercase text-3xl md:text-4xl group-hover:text-yellow-600 transition-all tracking-tighter mb-8 italic line-clamp-3">{String(c.ACRONIMO || c['DENOMINACIÓN SOCIAL'])}</h5>
                            </div>
                            <div className="p-14 border-t-[10px] border-slate-50 bg-slate-50 mt-auto leading-none">
                               <span className="font-black text-4xl tabular-nums tracking-tighter text-slate-900 block truncate">{formatM(getRevenue(c))}</span>
                            </div>
                        </div>
                        ))}
                      </div>
                   </div>
                 )}
              </div>

              <div className="mt-32 pt-12 border-t-[15px] border-slate-50 flex justify-center pb-40">
                <button onClick={() => setSelectedCompany(null)} className="bg-black text-white px-20 md:px-96 py-10 md:py-16 font-black uppercase tracking-[1.4em] text-xs hover:bg-yellow-400 hover:text-black transition-all shadow-2xl border-b-[40px] border-yellow-600 italic">CLOSE DOSSIER</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PANEL AI */}
      <div className={`fixed bottom-10 right-10 z-[1000] transition-all duration-700 ${isAiOpen ? 'w-[450px] h-[750px]' : 'w-24 h-24'}`}>
        {isAiOpen ? (
          <div className="bg-white w-full h-full shadow-[0_50px_200px_rgba(0,0,0,0.7)] rounded-2xl border-4 border-black flex flex-col overflow-hidden animate-in zoom-in slide-in-from-bottom-20">
            <div className="bg-black p-8 flex justify-between items-center text-white">
              <span className="font-black uppercase tracking-[0.3em] text-[13px]">BUD AI ENGINE</span>
              <button onClick={() => setIsAiOpen(false)} className="hover:rotate-90 transition-all"><X className="w-8 h-8" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-10 space-y-10 bg-slate-50/40 scrollbar-hide">
              {chat.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[90%] p-8 rounded-2xl text-[11px] md:text-xs font-black tracking-widest leading-[1.8] shadow-2xl italic ${m.role === 'user' ? 'bg-black text-white border-l-4 border-yellow-400' : 'bg-white border-2 border-black text-slate-900 border-l-[15px] border-black'}`}>
                    {String(m.text)}
                  </div>
                </div>
              ))}
              {isTyping && <Loader2 className="w-8 h-8 animate-spin text-yellow-500 mx-auto" />}
              <div ref={chatEndRef} />
            </div>
            <div className="p-8 bg-white border-t-4 border-black flex gap-6">
              <input className="flex-1 bg-slate-50 border-4 border-slate-100 p-6 rounded-xl outline-none focus:border-yellow-400 font-black text-xs transition-all uppercase" placeholder="Consulta..." value={chatIn} onChange={(e) => setChatIn(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && askAI()} />
              <button onClick={askAI} className="bg-black text-white p-6 rounded-xl hover:bg-yellow-400 hover:text-black transition-all shadow-2xl active:scale-90"><Send className="w-8 h-8" /></button>
            </div>
          </div>
        ) : (
          <button onClick={() => setIsAiOpen(true)} className="w-24 h-24 bg-black text-yellow-400 rounded-full flex items-center justify-center shadow-2xl hover:scale-110 transition-all border-[6px] border-yellow-400 relative">
            <MessageSquare className="w-12 h-12" />
          </button>
        )}
      </div>
    </div>
  );
}