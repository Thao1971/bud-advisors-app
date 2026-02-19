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
  Star, GitCompare, MousePointer2, Download
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, onSnapshot } from 'firebase/firestore';

// --- CONFIGURACIÓN DE FIREBASE ---
const getFirebaseConfig = () => {
  let config = null;
  try {
    const env = import.meta.env.VITE_FIREBASE_CONFIG;
    if (env) config = typeof env === 'string' ? JSON.parse(env) : env;
  } catch (e) {}
  if (!config && typeof __firebase_config !== 'undefined' && __firebase_config) {
    try { config = typeof __firebase_config === 'string' ? JSON.parse(__firebase_config) : __firebase_config; } catch (e) {}
  }
  return config;
};

const firebaseConfig = getFirebaseConfig();
const app = firebaseConfig ? initializeApp(firebaseConfig) : null;
const auth = app ? getAuth(app) : null;
const db = app ? getFirestore(app) : null;
const appId = "bud_intelligence_v18_ultimate_pro"; 

// --- MOTOR DE DATOS Y FORMATO ---
const cleanValue = (val) => {
  if (val === undefined || val === null || val === '') return 0;
  if (typeof val === 'number') return val;
  const cleaned = val.toString().replace(/[€\s%]/g, '').replace(/\./g, '').replace(',', '.'); 
  return parseFloat(cleaned) || 0;
};

const getRevenue = (c) => cleanValue(c?.['IMPORTE NETO DE LA CIFRA DE NEGOCIOS'] || c?.['IMPORTE NETO DE LA CIFRA DE NEGOCIO'] || 0);

const formatM = (v) => {
  if (v === undefined || v === null || isNaN(v)) return '-';
  return new Intl.NumberFormat('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(v / 1000000) + ' M€';
};

const formatFull = (v) => {
  if (v === undefined || v === null || isNaN(v)) return '-';
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v);
};

// --- COMPONENTES DE VISUALIZACIÓN AVANZADA ---

// 1. Radar Chart (Spider) - Compara 5 ejes
const RadarChart = ({ company, averages }) => {
  const axes = [
    { label: 'Rentabilidad', val: (cleanValue(company.EBITDA) / (getRevenue(company) || 1)) / (averages.margin || 0.1) },
    { label: 'Liquidez', val: (cleanValue(company['ACTIVO CORRIENTE']) / (cleanValue(company['PASIVO CORRIENTE']) || 1)) / 1.5 },
    { label: 'Eficiencia', val: (getRevenue(company) / (Math.abs(cleanValue(company['GASTOS DE PERSONAL'])) || 1)) / (averages.efficiency || 2) },
    { label: 'Volumen', val: getRevenue(company) / (averages.revenue || 1000000) },
    { label: 'Solvencia', val: (cleanValue(company['PATRIMONIO NETO']) / (cleanValue(company['PASIVO CORRIENTE']) + cleanValue(company['PASIVO NO CORRIENTE']) || 1)) }
  ];

  const points = axes.map((ax, i) => {
    const angle = (i * 2 * Math.PI) / axes.length - Math.PI / 2;
    const r = Math.min(0.9, ax.val * 0.4); 
    return `${Math.cos(angle) * r},${Math.sin(angle) * r}`;
  }).join(' ');

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="-1.2 -1.2 2.4 2.4" className="w-full max-w-[280px] h-auto drop-shadow-lg">
        {[0.2, 0.4, 0.6, 0.8, 1].map(r => (
          <circle key={r} cx="0" cy="0" r={r} fill="none" stroke="#e2e8f0" strokeWidth="0.01" />
        ))}
        {axes.map((ax, i) => {
          const angle = (i * 2 * Math.PI) / axes.length - Math.PI / 2;
          return <line key={i} x1="0" y1="0" x2={Math.cos(angle)} y2={Math.sin(angle)} stroke="#cbd5e1" strokeWidth="0.01" />;
        })}
        <polygon points={points} fill="rgba(250, 204, 21, 0.4)" stroke="#eab308" strokeWidth="0.03" />
      </svg>
      <div className="grid grid-cols-3 gap-2 mt-4 w-full">
        {axes.map((ax, i) => (
          <div key={i} className="text-center">
            <p className="text-[7px] font-black uppercase text-slate-400 tracking-widest">{ax.label}</p>
            <p className="text-[9px] font-bold">{(ax.val * 100).toFixed(0)}%</p>
          </div>
        ))}
      </div>
    </div>
  );
};

// 2. Heatmap de Competitividad (Scatter Plot)
const CompetitivenessMap = ({ data, onSelect }) => {
  const maxRev = Math.max(...data.map(getRevenue));
  const maxMargin = Math.max(...data.map(c => cleanValue(c.EBITDA) / (getRevenue(c) || 1)));
  
  return (
    <div className="bg-slate-50 p-6 rounded-sm border border-slate-200 relative h-64 md:h-80 group">
      <div className="absolute left-4 top-0 bottom-10 border-l-2 border-slate-300 flex flex-col justify-between text-[7px] font-black text-slate-400 py-2">
        <span>MAX MARGEN</span><span>0%</span>
      </div>
      <div className="absolute left-10 right-4 bottom-6 border-b-2 border-slate-300 flex justify-between text-[7px] font-black text-slate-400 px-2">
        <span>0€</span><span>MAX FACTURACIÓN</span>
      </div>
      <div className="absolute inset-10 overflow-hidden">
        {data.slice(0, 50).map((c, i) => {
          const x = (getRevenue(c) / maxRev) * 100;
          const m = (cleanValue(c.EBITDA) / (getRevenue(c) || 1));
          const y = 100 - (m / (maxMargin || 0.5)) * 100;
          return (
            <button 
              key={i} 
              onClick={() => onSelect(c)}
              className="absolute w-2 h-2 md:w-3 md:h-3 rounded-full bg-black border border-yellow-400 hover:scale-150 hover:bg-yellow-400 transition-all cursor-pointer group/dot"
              style={{ left: `${x}%`, top: `${y}%` }}
              title={`${c.ACRONIMO}: ${formatM(getRevenue(c))}`}
            >
              <span className="hidden group-hover/dot:block absolute bottom-full left-1/2 -translate-x-1/2 bg-black text-white text-[8px] p-1 whitespace-nowrap z-50 rounded-sm">{c.ACRONIMO}</span>
            </button>
          );
        })}
      </div>
      <p className="absolute bottom-1 right-4 text-[7px] font-bold text-slate-400 uppercase italic tracking-widest">Heatmap: Facturación (X) vs Margen EBITDA (Y)</p>
    </div>
  );
};

// 3. Sankey Diagram simplificado (Flujo de Caja)
const CashFlowSankey = ({ company }) => {
  const rev = getRevenue(company);
  const pers = Math.abs(cleanValue(company['GASTOS DE PERSONAL']));
  const others = Math.abs(cleanValue(company['OTROS GASTOS DE EXPLOTACION']));
  const ebitda = cleanValue(company.EBITDA);
  
  const h = 100;
  const persH = (pers / rev) * h;
  const othersH = (others / rev) * h;
  const ebitdaH = (ebitda / rev) * h;

  return (
    <div className="w-full space-y-4">
      <div className="h-24 md:h-32 flex gap-1 items-end bg-slate-50 p-4 border border-slate-100 rounded-sm">
        <div className="flex-1 bg-black group relative" style={{ height: '100%' }}>
          <div className="absolute -top-6 left-0 text-[8px] font-black uppercase whitespace-nowrap">Ingresos ({formatM(rev)})</div>
        </div>
        <div className="w-8 flex flex-col justify-between py-2 text-slate-300">
           <ArrowRight className="w-4 h-4" />
        </div>
        <div className="flex-[2] flex flex-col gap-1">
          <div className="bg-red-500/80 relative" style={{ height: `${persH}%` }}>
             <span className="absolute left-2 top-1 text-[7px] text-white font-black truncate">PERS: {formatM(pers)}</span>
          </div>
          <div className="bg-red-400/80 relative" style={{ height: `${othersH}%` }}>
             <span className="absolute left-2 top-1 text-[7px] text-white font-black truncate">OPEX: {formatM(others)}</span>
          </div>
          <div className="bg-green-500 relative" style={{ height: `${ebitdaH}%` }}>
             <span className="absolute left-2 top-1 text-[7px] text-white font-black truncate font-mono">EBITDA: {formatM(ebitda)}</span>
          </div>
        </div>
      </div>
      <p className="text-[8px] text-slate-400 font-bold uppercase tracking-widest leading-relaxed">Sankey: Distribución de ingresos desde la facturación bruta hasta el resultado operativo (EBITDA).</p>
    </div>
  );
};

export default function App() {
  const [data, setData] = useState([]);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState({ type: 'info', msg: 'Estableciendo Terminal...' });
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Todas');
  const [selectedCompany, setSelectedCompany] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [valuationMultiple, setValuationMultiple] = useState(8);
  const [salaryAdjustment, setSalaryAdjustment] = useState(0); // Sandbox %
  const [watchlist, setWatchlist] = useState([]);
  const [isAiOpen, setIsAiOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState([{ role: 'assistant', text: 'Soy BUD AI. ¿Qué necesitas saber sobre el mercado de agencias?' }]);
  const [userInput, setUserInput] = useState('');
  const [isAiTyping, setIsAiTyping] = useState(false);
  const chatEndRef = useRef(null);

  // 1. AUTH & FIREBASE
  useEffect(() => {
    if (!auth) return;
    signInAnonymously(auth).catch(e => setStatus({ type: 'error', msg: e.message }));
    return onAuthStateChanged(auth, setUser);
  }, []);

  useEffect(() => {
    if (!db || !user) return;
    const q = collection(db, 'artifacts', appId, 'public', 'data', 'companies');
    const unsubscribe = onSnapshot(q, (snap) => {
      const docs = snap.docs.map(d => d.data());
      docs.sort((a, b) => getRevenue(b) - getRevenue(a));
      setData(docs);
      setLoading(false);
      if (docs.length > 0) setStatus({ type: 'success', msg: 'TERMINAL ONLINE - M&A UNIT' });
    }, () => setLoading(false));
    return () => unsubscribe();
  }, [user]);

  const handleUpload = (e) => {
    const file = e.target.files[0];
    if (!file || !db || !user) return;
    setUploading(true);
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const text = ev.target.result;
        const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        const delimiter = lines[0].includes(';') ? ';' : ',';
        const headers = lines[0].split(delimiter).map(h => h.trim().replace(/^"|"$/g, ''));
        for (let i = 1; i < lines.length; i++) {
          const values = lines[i].split(delimiter);
          if (values.length < headers.length) continue;
          const obj = {};
          headers.forEach((h, idx) => {
            let val = values[idx]?.trim().replace(/^"|"$/g, '');
            const isNumeric = ['IMPORTE', 'GASTOS', 'EBITDA', 'RESULTADO', 'ACTIVO', 'PASIVO', 'PATRIMONIO'].some(k => h.toUpperCase().includes(k));
            obj[h] = (isNumeric && val) ? cleanValue(val) : val;
          });
          if (obj['CIF EMPRESA']) {
            const docId = String(obj['CIF EMPRESA']).replace(/[^a-zA-Z0-9]/g, '');
            await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'companies', docId), obj);
          }
        }
        setStatus({ type: 'success', msg: 'Base de datos sincronizada.' });
      } catch (err) { setStatus({ type: 'error', msg: err.message }); }
      finally { setUploading(false); }
    };
    reader.readAsText(file);
  };

  // --- LÓGICA DE INTELIGENCIA ---
  const aggregates = useMemo(() => {
    const totalRev = data.reduce((acc, curr) => acc + getRevenue(curr), 0);
    const totalEbitda = data.reduce((acc, curr) => acc + cleanValue(curr['EBITDA']), 0);
    const totalPers = data.reduce((acc, curr) => acc + Math.abs(cleanValue(curr['GASTOS DE PERSONAL'])), 0);
    const cats = {};
    data.forEach(c => {
      const cat = c['CATEGORÍA'] || 'General';
      if (!cats[cat]) cats[cat] = { count: 0, revenue: 0 };
      cats[cat].count++;
      cats[cat].revenue += getRevenue(c);
    });
    const avgEfficiency = totalRev / (totalPers || 1);
    const avgMargin = totalEbitda / (totalRev || 1);
    return { totalRev, totalEbitda, totalPers, cats, avgEfficiency, avgMargin };
  }, [data]);

  const companyProAnalysis = useMemo(() => {
    if (!selectedCompany) return null;
    const rev = getRevenue(selectedCompany);
    const ebitda = cleanValue(selectedCompany['EBITDA']);
    const persRaw = Math.abs(cleanValue(selectedCompany['GASTOS DE PERSONAL']));
    const others = Math.abs(cleanValue(selectedCompany['OTROS GASTOS DE EXPLOTACION']));
    
    // Sandbox Salary Adjustment
    const pers = persRaw * (1 + salaryAdjustment / 100);
    const adjEbitda = ebitda - (pers - persRaw);
    
    const marginRatio = (adjEbitda / (rev || 1)) * 100;
    const talentEfficiency = rev / (pers || 1);
    const rating = Math.round(Math.min(100, (marginRatio * 1.5) + (talentEfficiency * 15) + 15));
    const sectorPeers = data.filter(c => c['CATEGORÍA'] === selectedCompany['CATEGORÍA']);
    const avgRev = sectorPeers.reduce((a, b) => a + getRevenue(b), 0) / (sectorPeers.length || 1);
    const revDelta = ((rev / avgRev) - 1) * 100;
    
    return { rating, revDelta, peerCount: sectorPeers.length, pers, others, marginRatio, adjEbitda };
  }, [selectedCompany, data, salaryAdjustment]);

  const filtered = data.filter(c => {
    const s = searchTerm.toLowerCase();
    const mSearch = String(c['DENOMINACIÓN SOCIAL'] || '').toLowerCase().includes(s) || String(c['CIF EMPRESA'] || '').toLowerCase().includes(s) || String(c['ACRONIMO'] || '').toLowerCase().includes(s);
    const mCat = selectedCategory === 'Todas' || c['CATEGORÍA'] === selectedCategory;
    return mSearch && mCat;
  });

  // --- IA CHAT ---
  const handleSendMessage = async () => {
    if (!userInput.trim() || isAiTyping) return;
    setChatMessages(p => [...p, { role: 'user', text: userInput }]);
    const query = userInput;
    setUserInput('');
    setIsAiTyping(true);

    try {
      const topContext = data.slice(0, 15).map(c => `${c.ACRONIMO}: ${formatM(getRevenue(c))} Ventas, ${formatM(cleanValue(c.EBITDA))} EBITDA`).join('; ');
      const systemPrompt = `Eres BUD AI, consultor experto en M&A. Responde de forma muy concisa. Datos mercado actual: ${topContext}`;
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: query }] }], systemInstruction: { parts: [{ text: systemPrompt }] } })
      });
      const result = await response.json();
      setChatMessages(p => [...p, { role: 'assistant', text: result.candidates?.[0]?.content?.parts?.[0]?.text || "No hay respuesta." }]);
    } catch (e) {
      setChatMessages(p => [...p, { role: 'assistant', text: "Error de conexión estratégica." }]);
    } finally { setIsAiTyping(false); }
  };

  return (
    <div className="min-h-screen bg-[#FDFDFD] text-slate-900 font-sans antialiased overflow-x-hidden selection:bg-yellow-200">
      
      {/* HEADER DINÁMICO */}
      <nav className="bg-black text-white px-6 md:px-10 py-5 border-b-2 border-yellow-400 sticky top-0 z-[60] flex flex-wrap justify-between items-center gap-6 shadow-2xl">
        <div className="flex items-center gap-4 group">
          <div className="bg-yellow-400 p-2 rounded-sm group-hover:rotate-12 transition-transform"><Building2 className="text-black w-6 h-6" /></div>
          <div className="flex flex-col leading-none">
            <span className="font-black text-xl md:text-3xl tracking-tighter uppercase italic leading-none">BUD <span className="text-yellow-400">ADVISORS</span></span>
            <span className="text-[8px] md:text-[10px] tracking-[0.4em] text-slate-500 font-bold uppercase mt-1 italic">Diagnostic Terminal</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
           <label className="bg-yellow-400 hover:bg-yellow-300 text-black px-5 py-2.5 font-black text-[10px] md:text-xs uppercase tracking-widest cursor-pointer transition-all flex items-center gap-2 rounded-sm shadow-xl active:scale-95">
             <Upload className="w-4 h-4" /> {uploading ? 'PROCESANDO...' : 'SUBIR CSV ESTRATÉGICO'}
             <input type="file" onChange={handleUpload} className="hidden" accept=".csv" />
           </label>
        </div>
      </nav>

      {/* MONITOR STATUS */}
      <div className={`py-1 text-[8px] font-black uppercase tracking-[0.5em] text-center border-b ${status.type === 'error' ? 'bg-red-600 text-white' : 'bg-slate-50 text-slate-400'}`}>
        {status.msg}
      </div>

      <main className="max-w-7xl mx-auto p-6 md:p-12 space-y-16">
        
        {/* --- HUB DASHBOARD (M€) --- */}
        <section className="animate-in fade-in slide-in-from-bottom-6 duration-700">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 md:gap-6 mb-12">
            <div className="bg-black text-white p-8 md:p-10 border-l-[12px] border-yellow-400 shadow-2xl relative overflow-hidden group">
              <DollarSign className="absolute -right-4 -bottom-4 w-24 h-24 text-white/5 group-hover:scale-110 transition-transform" />
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-2 italic">Total Market Revenue</span>
              <span className="text-2xl md:text-4xl lg:text-5xl font-black tabular-nums tracking-tighter truncate block leading-none">{formatM(aggregates.totalRev)}</span>
              <p className="text-[7px] text-slate-500 mt-4 font-black uppercase tracking-[0.2em] italic">Facturación bruta agregada del HUB.</p>
            </div>
            
            <div className="bg-white p-8 md:p-10 border-l-[12px] border-black shadow-xl group flex flex-col justify-between">
              <div>
                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block mb-2 italic">Operating EBITDA Pool</span>
                <span className="text-2xl md:text-4xl font-black text-green-600 tabular-nums tracking-tighter truncate block leading-none">{formatM(aggregates.totalEbitda)}</span>
              </div>
              <p className="text-[7px] text-slate-400 mt-6 font-black uppercase tracking-[0.2em] italic leading-relaxed border-t border-slate-100 pt-3">Margen medio sectorial detectado: {(aggregates.avgMargin * 100).toFixed(1)}%.</p>
            </div>

            <div className="bg-white p-8 md:p-10 border-l-[12px] border-slate-200 shadow-xl overflow-hidden flex flex-col justify-between">
              <div>
                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block mb-2 italic">Talent Pool Value</span>
                <span className="text-2xl md:text-4xl font-black text-slate-900 tabular-nums tracking-tighter truncate block leading-none">{formatM(aggregates.totalPers)}</span>
              </div>
              <div className="w-full bg-slate-50 h-1 mt-6 rounded-full overflow-hidden border border-slate-100">
                <div className="bg-blue-600 h-full transition-all duration-1000" style={{width: `${Math.min(100, (aggregates.totalPers / (aggregates.totalRev || 1)) * 100)}%`}}></div>
              </div>
            </div>

            <div className="bg-white p-8 md:p-10 border-l-[12px] border-slate-200 shadow-xl flex flex-col justify-center text-center">
              <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block mb-2 italic">Entities Registered</span>
              <span className="text-5xl md:text-6xl font-black text-slate-900 tabular-nums leading-none tracking-tighter">{data.length}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
            {/* HEATMAP DE COMPETITIVIDAD */}
            <div className="lg:col-span-8 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                 <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 flex items-center gap-4 italic leading-none"><MousePointer2 className="w-4 h-4 text-black" /> Competitive Matrix (Rev vs EBITDA)</h3>
                 <span className="text-[8px] font-bold text-slate-300 uppercase italic tracking-widest">Interactive Market Pulse</span>
              </div>
              <CompetitivenessMap data={data} onSelect={setSelectedCompany} />
              <p className="text-[8px] text-slate-400 font-bold uppercase tracking-widest leading-relaxed italic text-center">Mapa de calor que posiciona a las agencias según su facturación (X) y rentabilidad (Y). Las gemas ocultas aparecen en la esquina superior izquierda.</p>
            </div>
            {/* WATCHLIST / RANKING */}
            <div className="lg:col-span-4 bg-slate-900 text-white p-10 shadow-2xl rounded-sm flex flex-col justify-between">
              <div>
                <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-yellow-400 mb-8 flex items-center gap-4 italic border-b border-white/5 pb-4 leading-none"><Trophy className="w-4 h-4" /> Leadership Watchlist</h3>
                <div className="space-y-5">
                  {data.slice(0, 6).map((c, i) => (
                    <div key={i} onClick={() => { setSelectedCompany(c); setActiveTab('overview'); }} className="flex items-center justify-between p-3 border-b border-white/5 hover:bg-white/10 cursor-pointer transition-all rounded-sm group">
                      <div className="flex items-center gap-4">
                        <span className="text-yellow-400 font-black italic tabular-nums text-xl leading-none">0{i+1}</span>
                        <span className="font-bold uppercase text-[10px] tracking-widest truncate max-w-[120px] group-hover:underline">{c.ACRONIMO || c['DENOMINACIÓN SOCIAL']}</span>
                      </div>
                      <span className="font-black tabular-nums text-sm md:text-lg tracking-tighter italic leading-none">{formatM(getRevenue(c))}</span>
                    </div>
                  ))}
                </div>
              </div>
              <p className="text-[8px] text-slate-500 mt-8 font-black uppercase tracking-widest leading-relaxed italic border-t border-white/5 pt-4">Ranking dinámico por volumen neto. Haz clic para informe M&A.</p>
            </div>
          </div>
        </section>

        {/* --- FILTROS & SEARCH --- */}
        <section className="bg-white p-8 md:p-12 shadow-2xl border-t-[15px] border-black rounded-sm flex flex-col md:flex-row gap-10 items-center">
          <div className="flex-1 flex items-center gap-6 border-b-4 border-slate-100 pb-4 w-full group">
            <Search className="text-slate-200 w-10 h-10 group-focus-within:text-yellow-500 transition-all" />
            <input className="w-full outline-none font-black text-2xl md:text-5xl placeholder-slate-100 bg-transparent uppercase tracking-tighter" placeholder="Localizar Entidad, CIF o Acrónimo..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          </div>
          <div className="flex flex-col gap-3 w-full md:w-auto">
             <span className="text-[8px] font-black uppercase text-slate-300 tracking-[0.5em] italic ml-1">Ecosistema Sectorial</span>
             <select className="p-5 bg-slate-50 border-2 border-transparent focus:border-yellow-400 outline-none font-black uppercase tracking-widest text-[10px] md:text-xs cursor-pointer shadow-inner min-w-[240px]" value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)}>
               {['Todas', ...new Set(data.map(c => c['CATEGORÍA']).filter(Boolean))].map(cat => <option key={cat} value={cat}>{cat}</option>)}
             </select>
          </div>
        </section>

        {/* --- CARDS LIST --- */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8 md:gap-12">
          {filtered.map((c, i) => (
            <div key={i} onClick={() => { setSelectedCompany(c); setActiveTab('overview'); }} className="bg-white border border-slate-100 p-10 md:p-14 hover:shadow-2xl transition-all cursor-pointer border-t-[10px] hover:border-t-yellow-400 group relative shadow-lg flex flex-col justify-between min-h-[280px] md:min-h-[350px]">
              <div>
                <div className="flex justify-between items-start mb-12">
                   <span className="text-[9px] md:text-[10px] font-black bg-black text-white px-4 py-1 uppercase tracking-[0.2em] italic leading-none shadow-xl">{c['CATEGORÍA'] || 'ENTITY'}</span>
                   <div className="flex items-center gap-3">
                      <span className="text-yellow-600 font-bold text-[10px] italic leading-none">{c['EJERCICIO']}</span>
                      <Star className={`w-4 h-4 ${watchlist.includes(c['CIF EMPRESA']) ? 'fill-yellow-400 text-yellow-400' : 'text-slate-200'}`} onClick={(e) => { e.stopPropagation(); setWatchlist(prev => prev.includes(c['CIF EMPRESA']) ? prev.filter(id => id !== c['CIF EMPRESA']) : [...prev, c['CIF EMPRESA']]); }} />
                   </div>
                </div>
                <h3 className="text-3xl md:text-4xl font-black text-black group-hover:text-yellow-600 transition-colors uppercase leading-[0.9] mb-6 tracking-tighter italic">
                  {c['ACRONIMO'] || c['DENOMINACIÓN SOCIAL']}
                </h3>
                <p className="text-slate-400 text-[10px] md:text-[11px] font-mono uppercase tracking-widest italic border-b border-slate-50 pb-8 leading-none truncate">REF ID: {c['CIF EMPRESA']}</p>
              </div>
              <div className="flex justify-between items-baseline pt-8 border-t border-slate-50 mt-4 leading-none">
                <span className="text-[10px] font-black text-slate-300 uppercase tracking-[0.3em] italic leading-none">Net Revenue</span>
                <span className="font-black text-4xl md:text-5xl tabular-nums tracking-tighter text-slate-900 group-hover:scale-105 transition-transform duration-500 leading-none">
                  {formatM(getRevenue(c))}
                </span>
              </div>
            </div>
          ))}
        </div>
      </main>

      {/* --- FICHA MAESTRA BUD INTELLIGENCE PRO (MODAL) --- */}
      {selectedCompany && (
        <div className="fixed inset-0 bg-black/98 backdrop-blur-3xl z-[100] flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-7xl my-auto shadow-2xl border-t-[25px] border-yellow-400 animate-in zoom-in duration-300 rounded-sm relative overflow-hidden">
            
            <div className="p-8 md:p-24 text-slate-900 relative z-10">
              
              {/* HEADER ESTRATÉGICO */}
              <div className="flex justify-between items-start mb-16 gap-12">
                <div className="flex-1 overflow-hidden">
                  <div className="flex items-center gap-5 mb-10 leading-none">
                    <span className="bg-black text-yellow-400 text-[11px] font-black px-6 py-2 uppercase tracking-[0.5em] shadow-2xl italic leading-none">BUD STRATEGIC DOSSIER M&A</span>
                    <Activity className="w-10 h-10 text-yellow-500 animate-pulse" />
                  </div>
                  <h2 className="text-6xl md:text-9xl font-black tracking-tighter uppercase italic leading-[0.8] mb-12 truncate text-black drop-shadow-sm">
                    {selectedCompany['ACRONIMO'] || selectedCompany['DENOMINACIÓN SOCIAL']}
                  </h2>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-12 text-slate-500 font-mono text-[10px] border-l-[15px] border-black pl-16 uppercase py-4">
                    <div className="flex flex-col"><span className="text-black font-black mb-2 tracking-widest uppercase italic">Full Legal Name</span><span className="font-bold text-xs text-slate-800 break-words leading-tight">{selectedCompany['DENOMINACIÓN SOCIAL']}</span></div>
                    <div className="flex flex-col"><span className="text-black font-black mb-2 tracking-widest uppercase italic leading-none">Tax Id Code</span><span className="text-black font-black text-3xl tabular-nums leading-none tracking-widest">{selectedCompany['CIF EMPRESA']}</span></div>
                    <div className="flex flex-col"><span className="text-black font-black mb-2 tracking-widest text-yellow-600 uppercase italic leading-none">Segment Class</span><span className="text-yellow-600 font-black text-3xl italic tracking-tighter leading-none">{selectedCompany['CATEGORÍA']}</span></div>
                    <div className="flex flex-col"><span className="text-black font-black mb-2 tracking-widest uppercase italic leading-none">Audit Exerc.</span><span className="text-black font-black text-3xl italic tabular-nums leading-none">{selectedCompany['EJERCICIO']}</span></div>
                  </div>
                </div>
                <div className="flex flex-col gap-4">
                  <button onClick={() => setSelectedCompany(null)} className="p-8 border-4 border-slate-100 rounded-full hover:bg-slate-100 transition-all text-black hover:rotate-90 shadow-2xl bg-white"><X className="w-16 h-16" /></button>
                  <button className="p-8 border-4 border-slate-100 rounded-full hover:bg-black hover:text-white transition-all shadow-2xl bg-white group"><Download className="w-10 h-10 group-hover:animate-bounce" /></button>
                </div>
              </div>

              {/* TABS ESTRATÉGICOS - ALTO IMPACTO */}
              <div className="flex gap-2 mb-20 border-b-8 border-slate-100 pb-2 overflow-x-auto scrollbar-hide">
                {[
                  { id: 'overview', label: '1. Executive Diagnostic', icon: FileText },
                  { id: 'valuation', label: '2. M&A Valuation Tool', icon: Scale },
                  { id: 'financials', label: '3. Full Financials', icon: Calculator },
                  { id: 'peers', label: '4. Peer Intelligence', icon: Layers }
                ].map(tab => (
                  <button 
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-6 px-12 py-6 font-black uppercase text-[11px] md:text-[13px] tracking-[0.3em] transition-all rounded-t-sm border-x-2 border-t-2 ${activeTab === tab.id ? 'bg-black text-yellow-400 border-black shadow-[-10px_0_40px_rgba(0,0,0,0.2)] scale-105 z-10' : 'bg-slate-50 text-slate-400 border-slate-100 hover:bg-slate-100 hover:text-black'}`}
                  >
                    <tab.icon className={`w-6 h-6 ${activeTab === tab.id ? 'text-yellow-400' : 'text-slate-300'}`} /> {tab.label}
                  </button>
                ))}
              </div>

              {/* CONTENIDO TABS */}
              <div className="min-h-[600px] animate-in fade-in duration-500">
                
                {/* --- TAB 1: EXECUTIVE --- */}
                {activeTab === 'overview' && (
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-20">
                       <div className="lg:col-span-8 space-y-16">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
                            {[
                              { label: 'Facturación', val: formatM(getRevenue(selectedCompany)), color: 'black' },
                              { label: 'EBITDA', val: formatM(cleanValue(selectedCompany['EBITDA'])), color: 'yellow-400' },
                              { label: 'Margen %', val: (getRevenue(selectedCompany) > 0 ? ((cleanValue(selectedCompany['EBITDA']) / getRevenue(selectedCompany)) * 100).toFixed(1) : 0) + '%', color: 'black' },
                              { label: 'Bº Neto', val: formatM(cleanValue(selectedCompany['RESULTADO DEL EJERCICIO'])), color: 'yellow-400', inv: true }
                            ].map((k, i) => (
                              <div key={i} className={`${k.inv ? 'bg-black text-white' : 'bg-slate-50'} p-12 border-b-[12px] border-${k.color} rounded-sm shadow-2xl group overflow-hidden`}>
                                <span className="text-[10px] font-black uppercase text-slate-400 block mb-8 italic tracking-widest leading-none underline decoration-yellow-400/20">{k.label}</span>
                                <span className={`text-4xl md:text-5xl font-black tabular-nums tracking-tighter italic leading-none block truncate ${!k.inv && k.color === 'yellow-400' ? 'text-yellow-600' : ''}`}>{k.val}</span>
                              </div>
                            ))}
                          </div>
                          
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                            <div className="bg-slate-50 p-14 border-l-[30px] border-black rounded-sm shadow-2xl group flex flex-col justify-between min-h-[300px]">
                               <div>
                                  <div className="flex items-center gap-5 mb-10 text-slate-400 italic uppercase font-black text-[12px] tracking-[0.4em] leading-none">
                                     <Activity className="w-7 h-7 text-black" /> Professional Executive Diagnostic
                                  </div>
                                  <p className="text-3xl md:text-4xl leading-relaxed italic font-serif text-slate-800 font-medium group-hover:text-black transition-colors leading-normal">
                                     "La entidad {selectedCompany['DENOMINACIÓN SOCIAL']} presenta una posición {companyProAnalysis.revDelta > 0 ? 'dominante' : 'estable'} en el ecosistema de {selectedCompany['CATEGORÍA']}."
                                  </p>
                               </div>
                               <p className="text-[8px] text-slate-400 mt-10 font-black uppercase tracking-[0.4em] italic border-t border-slate-200 pt-6">Interpretación automatizada basada en pool sectorial ({companyProAnalysis.peerCount} pares).</p>
                            </div>
                            <div className="bg-white p-14 border-2 border-slate-100 rounded-sm shadow-2xl flex flex-col items-center justify-center text-center">
                               <h5 className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-400 mb-10 italic leading-none border-b border-slate-100 pb-4">Benchmarking Analysis Radar</h5>
                               <RadarChart company={selectedCompany} averages={aggregates} />
                               <p className="text-[8px] text-slate-300 mt-10 font-black uppercase tracking-[0.2em] italic">Comparativa 5 ejes vs Media Market.</p>
                            </div>
                          </div>
                       </div>

                       <div className="lg:col-span-4 space-y-16">
                          <div className="bg-black text-white p-16 rounded-sm shadow-2xl relative overflow-hidden group h-full flex flex-col justify-center border-b-[20px] border-yellow-600">
                             <div className="absolute top-0 right-0 p-8 opacity-10"><Zap className="w-20 h-20 text-yellow-400" /></div>
                             <h4 className="text-[12px] font-black uppercase tracking-[0.6em] text-yellow-400 mb-16 italic border-b border-white/10 pb-6 leading-none">BUD Pulse Score</h4>
                             <div className="flex flex-col items-center py-10 relative z-10 group-hover:scale-110 transition-transform duration-1000">
                                <span className="text-[140px] md:text-[180px] font-black leading-none italic drop-shadow-2xl text-white tabular-nums">{companyProAnalysis.rating}</span>
                                <span className="text-[12px] font-black uppercase tracking-[0.5em] text-slate-500 mt-10 italic underline decoration-yellow-400 decoration-8 underline-offset-8">EFFICIENCY INDEX / 100</span>
                             </div>
                             <div className="mt-16 space-y-8 border-t border-white/10 pt-16">
                                <div className="flex justify-between items-baseline text-[11px] font-black uppercase tracking-[0.3em] italic"><span>Market Rank</span><span className="text-yellow-400 font-mono">TOP 5%</span></div>
                                <div className="flex justify-between items-baseline text-[11px] font-black uppercase tracking-[0.3em] italic"><span>Financial Risk</span><span className="text-green-400 font-mono">MINIMAL</span></div>
                             </div>
                          </div>
                       </div>
                  </div>
                )}

                {/* --- TAB 2: VALUATION ENGINE --- */}
                {activeTab === 'valuation' && (
                  <div className="animate-in fade-in slide-in-from-right-4 duration-500 space-y-20">
                     <div className="grid grid-cols-1 lg:grid-cols-2 gap-24">
                        <div className="bg-white border-4 border-slate-50 p-16 shadow-2xl rounded-sm group relative overflow-hidden">
                           <div className="absolute top-0 left-0 w-2 h-full bg-black"></div>
                           <div className="flex items-center gap-8 mb-16 leading-none">
                              <div className="bg-black p-4 rounded-sm text-yellow-400 shadow-xl group-hover:rotate-6 transition-transform"><Scale className="w-10 h-10" /></div>
                              <h4 className="text-4xl font-black uppercase tracking-tighter italic">Enterprise Value Simulation</h4>
                           </div>
                           <div className="space-y-16">
                              {/* Sliders de Sensibilidad */}
                              <div className="space-y-12">
                                <div>
                                   <div className="flex justify-between mb-8 leading-none">
                                      <label className="text-[12px] font-black uppercase tracking-[0.4em] italic text-slate-500">Múltiplo EBITDA (Market Multiplier)</label>
                                      <span className="bg-black text-yellow-400 px-6 py-2 text-base font-black italic shadow-2xl tracking-[0.2em]">{valuationMultiple}x</span>
                                   </div>
                                   <input type="range" min="4" max="15" step="0.5" value={valuationMultiple} onChange={(e) => setValuationMultiple(parseFloat(e.target.value))} className="w-full h-5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-black" />
                                </div>
                                <div>
                                   <div className="flex justify-between mb-8 leading-none">
                                      <label className="text-[12px] font-black uppercase tracking-[0.4em] italic text-slate-500">Optimización Salarial (%)</label>
                                      <span className="bg-yellow-400 text-black px-6 py-2 text-base font-black italic shadow-2xl tracking-[0.2em]">{salaryAdjustment > 0 ? '+' : ''}{salaryAdjustment}%</span>
                                   </div>
                                   <input type="range" min="-30" max="30" step="1" value={salaryAdjustment} onChange={(e) => setSalaryAdjustment(parseFloat(e.target.value))} className="w-full h-5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-yellow-500" />
                                </div>
                              </div>

                              <div className="pt-16 border-t-8 border-slate-50 space-y-10">
                                 <div className="flex justify-between items-baseline group/row leading-none">
                                    <div className="flex flex-col gap-2">
                                       <span className="text-[14px] font-black uppercase italic tracking-[0.3em] text-slate-500">Enterprise Value (EV)</span>
                                       <span className="text-[8px] font-bold text-slate-300 uppercase tracking-widest leading-none">EBITDA Proyectado × Múltiplo</span>
                                    </div>
                                    <span className="text-5xl md:text-6xl font-black tabular-nums tracking-tighter italic group-hover/row:text-yellow-600 transition-colors leading-none">{formatFull(companyProAnalysis.adjEbitda * valuationMultiple)}</span>
                                 </div>
                                 <div className="bg-black text-white p-14 border-l-[30px] border-yellow-400 flex flex-wrap justify-between items-center gap-8 shadow-2xl rounded-sm transform group-hover:translate-x-2 transition-transform">
                                    <div className="flex flex-col gap-3">
                                       <span className="text-[14px] font-black uppercase italic tracking-[0.4em] text-yellow-400 leading-none">Equity Purchase Price</span>
                                       <p className="text-[9px] text-slate-500 uppercase font-black tracking-[0.2em] leading-none underline decoration-yellow-400/20">Estimated Value 100% (Equity)</p>
                                    </div>
                                    <span className="text-6xl md:text-8xl font-black text-yellow-400 tabular-nums tracking-tighter italic drop-shadow-2xl leading-none">{formatFull(Math.max(0, (companyProAnalysis.adjEbitda * valuationMultiple) - (cleanValue(selectedCompany['PASIVO CORRIENTE']) - cleanValue(selectedCompany['ACTIVO CORRIENTE']))))}</span>
                                 </div>
                              </div>
                           </div>
                        </div>

                        <div className="bg-slate-50 p-20 shadow-2xl rounded-sm flex flex-col items-center justify-center text-center relative overflow-hidden group">
                           <h4 className="text-[12px] font-black uppercase tracking-[0.6em] text-slate-400 mb-16 italic border-b border-slate-200 pb-6 leading-none">P&L Operating Sensitivity</h4>
                           <DonutChart data={[companyProAnalysis.pers, companyProAnalysis.others]} colors={['#000', '#FACC15']} />
                           <div className="mt-20 grid grid-cols-1 md:grid-cols-2 gap-20 w-full text-left pt-16 border-t-4 border-slate-200">
                              <div className="leading-none space-y-4">
                                 <div className="flex items-center gap-4 font-black uppercase tracking-[0.3em] text-[11px] italic text-slate-500 leading-none"><div className="w-4 h-4 bg-black shadow-xl"></div>Talento Cost</div>
                                 <span className="text-4xl font-black tabular-nums italic text-slate-900 leading-none block truncate">{formatFull(companyProAnalysis.pers)}</span>
                                 <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest italic">{((companyProAnalysis.pers / (companyProAnalysis.pers + companyProAnalysis.others || 1)) * 100).toFixed(1)}% del Gasto Total.</p>
                              </div>
                              <div className="leading-none space-y-4">
                                 <div className="flex items-center gap-4 font-black uppercase tracking-[0.3em] text-[11px] italic text-slate-500 leading-none"><div className="w-4 h-4 bg-yellow-400 shadow-xl"></div>Infra Cost</div>
                                 <span className="text-4xl font-black tabular-nums italic text-slate-900 leading-none block truncate">{formatFull(companyProAnalysis.others)}</span>
                                 <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest italic">{((companyProAnalysis.others / (companyProAnalysis.pers + companyProAnalysis.others || 1)) * 100).toFixed(1)}% del Gasto Total.</p>
                              </div>
                           </div>
                        </div>
                     </div>
                  </div>
                )}

                {/* --- TAB 3: ACCOUNTING CASCADE --- */}
                {activeTab === 'financials' && (
                  <div className="animate-in fade-in slide-in-from-bottom-8 duration-500 space-y-24">
                     <div className="grid grid-cols-1 lg:grid-cols-2 gap-24 items-start">
                        <div className="space-y-16">
                           <h4 className="text-5xl font-black uppercase border-b-[20px] border-black pb-8 italic leading-none">Sankey Flow: P&L Cascade</h4>
                           <CashFlowSankey company={selectedCompany} />
                           <div className="bg-black text-white p-14 border-b-[25px] border-yellow-600 flex flex-wrap justify-between items-center gap-8 shadow-2xl rounded-sm">
                              <div className="flex flex-col relative z-10 pl-10 border-l-8 border-yellow-400 leading-none">
                                 <span className="text-base font-black uppercase italic tracking-[0.5em] leading-none underline decoration-yellow-400/50 decoration-8 underline-offset-8">Net Working Capital</span>
                                 <span className="text-[12px] font-black text-slate-500 uppercase mt-6 italic tracking-[0.4em] leading-none">Liquidez Inmediata Proyectada</span>
                              </div>
                              <span className={`text-6xl md:text-8xl font-black tabular-nums tracking-tighter italic leading-none drop-shadow-2xl ${cleanValue(selectedCompany['ACTIVO CORRIENTE']) - cleanValue(selectedCompany['PASIVO CORRIENTE']) > 0 ? 'text-green-400' : 'text-red-500'}`}>
                                 {formatFull(cleanValue(selectedCompany['ACTIVO CORRIENTE']) - cleanValue(selectedCompany['PASIVO CORRIENTE']))}
                              </span>
                           </div>
                        </div>
                        <div className="space-y-16">
                           <h4 className="text-5xl font-black uppercase border-b-[20px] border-black pb-8 italic leading-none">Full Accounting Ledger</h4>
                           <div className="space-y-4 font-mono text-[10px] md:text-[11px] font-black uppercase tracking-widest italic">
                              {[
                                { l: '(+) Cifra Neta de Negocio', v: getRevenue(selectedCompany), bold: true, bg: 'bg-slate-900 text-white p-6' },
                                { l: '(-) Aprovisionamientos', v: cleanValue(selectedCompany.APROVISIONAMIENTOS) },
                                { l: '(-) Gastos de Personal', v: cleanValue(selectedCompany['GASTOS DE PERSONAL']) },
                                { l: '(-) Otros Gastos Explotación', v: cleanValue(selectedCompany['OTROS GASTOS DE EXPLOTACION']) },
                                { l: '(=) EBITDA Operativo', v: cleanValue(selectedCompany.EBITDA), color: 'text-yellow-600', bold: true, border: 'border-y-4 border-yellow-400 py-6' },
                                { l: '(-) Amortizaciones', v: cleanValue(selectedCompany['AMORTIZACION DEL INMOVILIZADO']) },
                                { l: '(=) Resultado Ejercicio', v: cleanValue(selectedCompany['RESULTADO DEL EJERCICIO']), bg: 'bg-black text-white p-8 mt-10' }
                              ].map((row, idx) => (
                                <div key={idx} className={`flex justify-between items-center ${row.bg || ''} ${row.border || 'border-b border-slate-100 pb-4'} ${row.color || ''}`}>
                                   <span>{row.l}</span>
                                   <span className="tabular-nums">{formatFull(row.v)}</span>
                                </div>
                              ))}
                           </div>
                        </div>
                     </div>
                  </div>
                )}

                {/* --- TAB 4: PEER COMPARISON --- */}
                {activeTab === 'peers' && (
                  <div className="space-y-20 animate-in zoom-in duration-500">
                    <div className="flex flex-col gap-6 border-l-[25px] border-yellow-400 pl-16 py-4 leading-none">
                      <h4 className="text-5xl md:text-7xl font-black uppercase tracking-tighter italic text-black leading-none italic">Peer Comparison Unit</h4>
                      <p className="text-slate-400 text-[12px] font-black uppercase tracking-[0.6em] italic leading-none">Pool de Análisis: {companyProAnalysis.peerCount} competidores detectados en {selectedCompany['CATEGORÍA']}.</p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12">
                      {similarCompanies.map((c, i) => (
                        <div key={i} onClick={() => { setSelectedCompany(c); setActiveTab('overview'); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="bg-white border-4 border-slate-50 hover:border-yellow-400 hover:shadow-2xl transition-all cursor-pointer group flex flex-col justify-between min-h-[450px] shadow-2xl relative overflow-hidden rounded-sm">
                          <div className="absolute -right-8 -bottom-8 w-40 h-40 text-slate-50 opacity-10 group-hover:text-yellow-400 group-hover:opacity-30 transition-all duration-1000"><Zap className="w-full h-full" /></div>
                          <div className="p-14 leading-none">
                             <span className="text-[11px] font-black bg-black text-white px-6 py-2 uppercase tracking-[0.4em] mb-12 inline-block italic leading-none shadow-2xl">{c['CATEGORÍA']}</span>
                             <h5 className="font-black uppercase text-3xl md:text-4xl group-hover:text-yellow-600 transition-all tracking-tighter mb-8 italic leading-[0.9] overflow-hidden line-clamp-3">{c.ACRONIMO || c['DENOMINACIÓN SOCIAL']}</h5>
                             <p className="text-slate-400 text-[11px] font-mono italic tracking-[0.4em] uppercase border-b-2 border-slate-50 pb-10 leading-none">{c['CIF EMPRESA']}</p>
                          </div>
                          <div className="p-14 border-t-[10px] border-slate-50 bg-slate-50 group-hover:bg-white transition-colors leading-none mt-auto">
                             <span className="text-[12px] font-black text-slate-400 uppercase block mb-6 italic tracking-[0.5em] leading-none">Net Revenue Est.</span>
                             <span className="font-black text-4xl md:text-5xl tabular-nums tracking-tighter text-slate-900 group-hover:text-black italic leading-none block truncate">{formatM(getRevenue(c))}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* FOOTER DOSSIER */}
              <div className="mt-40 pt-16 border-t-[15px] border-slate-50 flex justify-center pb-32">
                <button onClick={() => setSelectedCompany(null)} className="bg-black text-white px-20 md:px-96 py-10 md:py-18 font-black uppercase tracking-[1.4em] text-[11px] md:text-sm hover:bg-yellow-400 hover:text-black transition-all shadow-2xl active:scale-95 border-b-[40px] border-yellow-600 rounded-sm italic group flex items-center justify-center gap-12 leading-none">
                  CLOSE STRATEGIC DOSSIER <ArrowRight className="hidden md:inline-block w-10 h-10 group-hover:translate-x-10 transition-transform" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- CHAT GPT BUD AI TERMINAL --- */}
      <div className={`fixed bottom-10 right-10 z-[150] transition-all duration-700 ease-in-out ${isAiOpen ? 'w-[450px] h-[700px]' : 'w-24 h-24'}`}>
        {isAiOpen ? (
          <div className="bg-white w-full h-full shadow-[0_40px_150px_rgba(0,0,0,0.5)] rounded-2xl border-4 border-black flex flex-col overflow-hidden animate-in zoom-in slide-in-from-bottom-20">
            <div className="bg-black p-8 flex justify-between items-center text-white">
              <div className="flex items-center gap-4">
                <Bot className="w-8 h-8 text-yellow-400" />
                <div className="flex flex-col leading-none">
                   <span className="font-black uppercase tracking-[0.3em] text-[12px]">BUD AI CORE</span>
                   <span className="text-[8px] font-black text-slate-500 uppercase mt-1 tracking-widest">Market Intelligence Node</span>
                </div>
              </div>
              <button onClick={() => setIsAiOpen(false)} className="hover:rotate-90 hover:bg-white/10 p-2 rounded-full transition-all"><X className="w-7 h-7" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-8 space-y-8 bg-slate-50/30 scrollbar-hide">
              {chatMessages.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-${m.role === 'user' ? 'right' : 'left'}-4 duration-500`}>
                  <div className={`max-w-[90%] p-6 rounded-2xl text-[11px] md:text-xs font-black tracking-widest leading-[1.8] shadow-2xl italic ${m.role === 'user' ? 'bg-black text-white rounded-tr-none border-l-4 border-yellow-400' : 'bg-white border-2 border-slate-100 text-slate-800 rounded-tl-none border-l-4 border-black'}`}>
                    {m.text}
                  </div>
                </div>
              ))}
              {isAiTyping && (
                <div className="flex justify-start">
                  <div className="bg-white border-2 border-slate-100 p-6 rounded-2xl rounded-tl-none shadow-2xl flex items-center gap-4 border-l-4 border-yellow-400">
                    <Loader2 className="w-6 h-6 animate-spin text-yellow-500" />
                    <span className="text-[10px] font-black uppercase tracking-[0.5em] text-slate-400 animate-pulse">Analizando Red de Datos...</span>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
            <div className="p-6 bg-white border-t-4 border-black flex gap-4">
              <input 
                className="flex-1 bg-slate-50 border-4 border-slate-100 p-4 rounded-xl outline-none focus:border-yellow-400 font-black text-xs transition-all uppercase tracking-widest"
                placeholder="Pregunta a la IA sobre eficiencia o valoración..."
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
              />
              <button onClick={handleSendMessage} className="bg-black text-white p-5 rounded-xl hover:bg-yellow-400 hover:text-black transition-all shadow-2xl active:scale-90"><Send className="w-6 h-6" /></button>
            </div>
          </div>
        ) : (
          <button 
            onClick={() => setIsAiOpen(true)}
            className="w-24 h-24 bg-black text-yellow-400 rounded-full flex items-center justify-center shadow-[0_20px_60px_rgba(0,0,0,0.4)] hover:scale-110 active:scale-90 transition-all group border-4 border-yellow-400 relative overflow-hidden"
          >
            <div className="absolute inset-0 bg-yellow-400/10 animate-pulse"></div>
            <MessageSquare className="w-10 h-10 group-hover:rotate-12 transition-transform" />
            <span className="absolute -top-1 -right-1 bg-red-600 text-white text-[8px] font-black px-2 py-1 rounded-full animate-bounce">AI</span>
          </button>
        )}
      </div>
    </div>
  );
}