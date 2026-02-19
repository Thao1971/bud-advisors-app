import React, { useState, useEffect, useMemo } from 'react';
import { 
  Search, Upload, Building2, TrendingUp, Users, 
  BarChart3, Filter, X, Database, AlertCircle, 
  Trophy, LayoutDashboard, CheckCircle2, 
  Target, Briefcase, DollarSign, PieChart, 
  ArrowUpRight, Globe, Calculator,
  Wallet, ShieldCheck, Activity, TrendingDown,
  Layers, Zap, Info, FileText, Scale, Gauge, Sparkles, ArrowRight
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
const appId = "bud_intelligence_v16_responsive"; 

// --- MOTOR DE DATOS Y FORMATO ---
const cleanValue = (val) => {
  if (val === undefined || val === null || val === '') return 0;
  if (typeof val === 'number') return val;
  const cleaned = val.toString()
    .replace(/[€\s%]/g, '')
    .replace(/\./g, '') 
    .replace(',', '.'); 
  return parseFloat(cleaned) || 0;
};

const getRevenue = (c) => {
  if (!c) return 0;
  return cleanValue(c['IMPORTE NETO DE LA CIFRA DE NEGOCIOS'] || c['IMPORTE NETO DE LA CIFRA DE NEGOCIO'] || c['IMPORTEN NETO DE LA CIFRA DE NEGOCIO']);
};

// Formato Millones (M€)
const formatM = (v) => {
  if (v === undefined || v === null || isNaN(v)) return '-';
  const mValue = v / 1000000;
  return new Intl.NumberFormat('es-ES', { 
    minimumFractionDigits: 1,
    maximumFractionDigits: 1 
  }).format(mValue) + ' M€';
};

// Formato Completo con Punto para Miles
const formatFull = (v) => {
  if (v === undefined || v === null || isNaN(v)) return '-';
  return new Intl.NumberFormat('es-ES', { 
    style: 'currency', 
    currency: 'EUR', 
    maximumFractionDigits: 0 
  }).format(v);
};

// --- COMPONENTE GRÁFICO DONUT ---
const DonutChart = ({ data, colors }) => {
  const total = data.reduce((a, b) => a + b, 0);
  let cumulativePercent = 0;
  const getCoordinatesForPercent = (percent) => {
    const x = Math.cos(2 * Math.PI * percent);
    const y = Math.sin(2 * Math.PI * percent);
    return [x, y];
  };
  return (
    <svg viewBox="-1 -1 2 2" style={{ transform: 'rotate(-90deg)' }} className="w-20 h-20 md:w-28 md:h-28 shadow-sm rounded-full bg-white">
      {data.map((val, i) => {
        const percent = val / (total || 1);
        const [startX, startY] = getCoordinatesForPercent(cumulativePercent);
        cumulativePercent += percent;
        const [endX, endY] = getCoordinatesForPercent(cumulativePercent);
        const largeArcFlag = percent > 0.5 ? 1 : 0;
        const pathData = [`M ${startX} ${startY}`, `A 1 1 0 ${largeArcFlag} 1 ${endX} ${endY}`, `L 0 0`].join(' ');
        return <path key={i} d={pathData} fill={colors[i]} stroke="white" strokeWidth="0.02" />;
      })}
      <circle cx="0" cy="0" r="0.65" fill="white" />
    </svg>
  );
};

export default function App() {
  const [data, setData] = useState([]);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState({ type: 'info', msg: 'Estableciendo conexión estratégica...' });
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Todas');
  const [selectedCompany, setSelectedCompany] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [valuationMultiple, setValuationMultiple] = useState(8);

  // 1. AUTENTICACIÓN
  useEffect(() => {
    if (!auth) return;
    signInAnonymously(auth).catch(e => setStatus({ type: 'error', msg: `Error Cloud: ${e.message}` }));
    return onAuthStateChanged(auth, setUser);
  }, []);

  // 2. SINCRONIZACIÓN
  useEffect(() => {
    if (!db || !user) return;
    const q = collection(db, 'artifacts', appId, 'public', 'data', 'companies');
    const unsubscribe = onSnapshot(q, (snap) => {
      const docs = snap.docs.map(d => d.data());
      docs.sort((a, b) => getRevenue(b) - getRevenue(a));
      setData(docs);
      setLoading(false);
      if (docs.length > 0) setStatus({ type: 'success', msg: 'SISTEMA ONLINE - HUB DE INTELIGENCIA' });
    }, () => setLoading(false));
    return () => unsubscribe();
  }, [user]);

  // 3. CARGA CSV
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
        setStatus({ type: 'success', msg: 'Registros actualizados correctamente.' });
      } catch (err) { setStatus({ type: 'error', msg: err.message }); }
      finally { setUploading(false); }
    };
    reader.readAsText(file);
  };

  // --- LÓGICA AGREGADA ---
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
    return { totalRev, totalEbitda, totalPers, cats };
  }, [data]);

  const companyProAnalysis = useMemo(() => {
    if (!selectedCompany) return null;
    const rev = getRevenue(selectedCompany);
    const ebitda = cleanValue(selectedCompany['EBITDA']);
    const pers = Math.abs(cleanValue(selectedCompany['GASTOS DE PERSONAL']));
    const others = Math.abs(cleanValue(selectedCompany['OTROS GASTOS DE EXPLOTACION']));
    const marginRatio = (ebitda / (rev || 1)) * 100;
    const talentEfficiency = rev / (pers || 1);
    const rating = Math.round(Math.min(100, (marginRatio * 2) + (talentEfficiency * 10) + 20));
    const sectorPeers = data.filter(c => c['CATEGORÍA'] === selectedCompany['CATEGORÍA']);
    const avgRev = sectorPeers.reduce((a, b) => a + getRevenue(b), 0) / (sectorPeers.length || 1);
    const revDelta = ((rev / avgRev) - 1) * 100;
    return { rating, revDelta, peerCount: sectorPeers.length, pers, others, marginRatio };
  }, [selectedCompany, data]);

  const filtered = data.filter(c => {
    const s = searchTerm.toLowerCase();
    const mSearch = String(c['DENOMINACIÓN SOCIAL'] || '').toLowerCase().includes(s) || String(c['CIF EMPRESA'] || '').toLowerCase().includes(s) || String(c['ACRONIMO'] || '').toLowerCase().includes(s);
    const mCat = selectedCategory === 'Todas' || c['CATEGORÍA'] === selectedCategory;
    return mSearch && mCat;
  });

  const similarCompanies = useMemo(() => {
    if (!selectedCompany) return [];
    const currentRev = getRevenue(selectedCompany);
    return data
      .filter(c => c['CIF EMPRESA'] !== selectedCompany['CIF EMPRESA'])
      .map(c => ({
        ...c,
        score: (Math.abs(currentRev - getRevenue(c)) / (currentRev || 1)) + (c['CATEGORÍA'] === selectedCompany['CATEGORÍA'] ? 0 : 1)
      }))
      .sort((a, b) => a.score - b.score).slice(0, 4);
  }, [selectedCompany, data]);

  return (
    <div className="min-h-screen bg-[#FDFDFD] text-slate-900 font-sans antialiased selection:bg-yellow-200 overflow-x-hidden">
      {/* NAVBAR RESPONSIVE */}
      <nav className="bg-black text-white px-4 md:px-8 py-4 border-b-2 border-yellow-400 sticky top-0 z-[60] flex flex-wrap justify-between items-center gap-4 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="bg-yellow-400 p-1.5 rounded-sm"><Building2 className="text-black w-5 h-5" /></div>
          <div className="flex flex-col leading-none">
            <span className="font-black text-lg md:text-2xl tracking-tighter uppercase italic">BUD <span className="text-yellow-400">ADVISORS</span></span>
            <span className="text-[7px] md:text-[9px] tracking-[0.4em] text-slate-500 font-bold uppercase mt-1 italic leading-none">Intelligence Terminal</span>
          </div>
        </div>
        <label className="bg-yellow-400 hover:bg-yellow-300 text-black px-4 py-2 font-black text-[9px] md:text-[11px] uppercase tracking-widest cursor-pointer transition-all flex items-center gap-2 rounded-sm shadow-md active:scale-95">
          <Upload className="w-3 h-3 md:w-4 md:h-4" /> {uploading ? 'PROCESANDO...' : 'SUBIR CSV'}
          <input type="file" onChange={handleUpload} className="hidden" accept=".csv" />
        </label>
      </nav>

      {/* MONITOR STATUS */}
      <div className={`py-1 text-[8px] font-black uppercase tracking-[0.3em] text-center border-b ${status.type === 'error' ? 'bg-red-600 text-white' : 'bg-slate-50 text-slate-400'}`}>
        {status.msg}
      </div>

      <main className="max-w-7xl mx-auto p-4 md:p-10">
        
        {/* --- HUB DASHBOARD (M€) --- */}
        <section className="mb-12 md:mb-16">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6 mb-8 md:mb-12">
            <div className="bg-black text-white p-6 md:p-10 border-l-[12px] border-yellow-400 shadow-2xl relative overflow-hidden group">
              <DollarSign className="absolute -right-4 -bottom-4 w-20 h-20 md:w-32 md:h-32 text-white/5" />
              <div className="relative z-10">
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-2 italic">Volumen Sectorial</span>
                <span className="text-3xl md:text-5xl font-black tabular-nums tracking-tighter truncate leading-none block">
                  {formatM(aggregates.totalRev)}
                </span>
                <p className="text-[8px] text-slate-500 mt-3 font-bold uppercase tracking-widest leading-relaxed">Suma total de facturación bruta del ecosistema analizado.</p>
              </div>
            </div>
            
            <div className="bg-white p-6 md:p-10 border-l-[12px] border-black shadow-xl group">
              <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block mb-2 italic">EBITDA Pool</span>
              <span className="text-3xl md:text-4xl font-black text-green-600 tabular-nums tracking-tighter truncate leading-none block">
                {formatM(aggregates.totalEbitda)}
              </span>
              <div className="flex items-center gap-2 mt-4">
                <span className="text-[10px] font-black text-slate-400 uppercase italic">Media: {(aggregates.totalRev > 0 ? (aggregates.totalEbitda / aggregates.totalRev) * 100 : 0).toFixed(1)}%</span>
              </div>
              <p className="text-[8px] text-slate-400 mt-4 font-bold uppercase tracking-widest leading-relaxed">Resultado operativo total. Mide la capacidad de generar caja del sector.</p>
            </div>

            <div className="bg-white p-6 md:p-10 border-l-[12px] border-slate-200 shadow-xl flex flex-col justify-center">
              <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block mb-2 italic">Talento (Inversión)</span>
              <span className="text-3xl md:text-4xl font-black text-slate-900 tabular-nums tracking-tighter truncate leading-none block">
                {formatM(aggregates.totalPers)}
              </span>
              <p className="text-[8px] text-slate-400 mt-4 font-bold uppercase tracking-widest leading-relaxed">Gasto total en personal. Representa la fuerza productiva del HUB.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 md:gap-10">
            {/* CUOTA SECTORIAL */}
            <div className="lg:col-span-8 bg-white p-8 md:p-12 border border-slate-100 shadow-2xl rounded-sm">
              <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 mb-8 flex items-center gap-4 italic leading-none border-b border-slate-50 pb-4"><PieChart className="w-5 h-5 text-black" /> Market Share by Segment</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-6 md:gap-y-8">
                {Object.entries(aggregates.cats).sort((a,b) => b[1].revenue - a[1].revenue).slice(0, 6).map(([name, stat]) => (
                  <div key={name} className="group">
                    <div className="flex justify-between text-[10px] font-black uppercase mb-2 tracking-widest leading-none">
                      <span className="text-slate-800 italic truncate max-w-[150px]">{name}</span>
                      <span className="tabular-nums text-slate-500">{(aggregates.totalRev > 0 ? (stat.revenue / aggregates.totalRev) * 100 : 0).toFixed(1)}%</span>
                    </div>
                    <div className="w-full bg-slate-50 h-2 rounded-full overflow-hidden border border-slate-100 shadow-inner">
                      <div className="bg-black h-full group-hover:bg-yellow-400 transition-all duration-500" style={{width: `${aggregates.totalRev > 0 ? (stat.revenue / aggregates.totalRev) * 100 : 0}%`}}></div>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-[9px] text-slate-400 mt-10 font-bold uppercase tracking-widest leading-relaxed italic border-t border-slate-50 pt-4">Concentración de facturación por tipología de agencia. Ayuda a detectar saturación o nichos de oportunidad.</p>
            </div>
            {/* TOP 5 */}
            <div className="lg:col-span-4 bg-slate-900 text-white p-8 md:p-12 shadow-2xl rounded-sm relative overflow-hidden flex flex-col justify-between">
              <div>
                <h3 className="text-[11px] font-black uppercase tracking-[0.3em] text-yellow-400 mb-10 flex items-center gap-4 italic border-b border-white/5 pb-4"><Trophy className="w-5 h-5" /> Top Leadership Ranking</h3>
                <div className="space-y-4 md:space-y-6">
                  {data.slice(0, 5).map((c, i) => (
                    <div key={i} onClick={() => { setSelectedCompany(c); setActiveTab('overview'); }} className="flex items-center justify-between p-3 md:p-4 border-b border-white/5 hover:text-yellow-400 cursor-pointer transition-all group">
                      <div className="flex items-center gap-4 leading-none">
                        <span className="text-yellow-400 font-black italic tabular-nums text-xl md:text-2xl">0{i+1}</span>
                        <span className="font-bold uppercase text-[9px] md:text-xs tracking-widest truncate max-w-[120px] md:max-w-[150px] group-hover:underline">{c['ACRONIMO'] || c['DENOMINACIÓN SOCIAL']}</span>
                      </div>
                      <span className="font-black tabular-nums text-sm md:text-lg tracking-tighter italic">{formatM(getRevenue(c))}</span>
                    </div>
                  ))}
                </div>
              </div>
              <p className="text-[9px] text-slate-500 mt-8 font-bold uppercase tracking-widest leading-relaxed italic border-t border-white/5 pt-4">Las 5 entidades con mayor volumen de negocio neto en el último ejercicio fiscal analizado.</p>
            </div>
          </div>
        </section>

        {/* --- FILTROS --- */}
        <section className="bg-white p-6 md:p-10 shadow-2xl mb-12 border-t-[12px] border-black rounded-sm flex flex-col md:flex-row gap-6 md:gap-8 items-center">
          <div className="flex-1 flex items-center gap-4 md:gap-6 border-b-4 border-slate-100 pb-4 w-full group">
            <Search className="text-slate-300 w-8 h-8 md:w-10 md:h-10 group-focus-within:text-yellow-500 transition-all" />
            <input className="w-full outline-none font-black text-2xl md:text-3xl placeholder-slate-200 bg-transparent uppercase tracking-tighter" placeholder="Identificar Entidad o CIF..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          </div>
          <select className="p-4 md:p-5 bg-slate-50 border-2 border-transparent focus:border-yellow-400 outline-none font-black uppercase tracking-widest text-[9px] md:text-[11px] cursor-pointer shadow-inner w-full md:w-auto" value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)}>
            {['Todas', ...new Set(data.map(c => c['CATEGORÍA']).filter(Boolean))].map(cat => <option key={cat} value={cat}>{cat}</option>)}
          </select>
        </section>

        {/* --- LISTADO CARDS --- */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-10">
          {filtered.map((c, i) => (
            <div key={i} onClick={() => { setSelectedCompany(c); setActiveTab('overview'); }} className="bg-white border border-slate-100 p-8 md:p-10 hover:shadow-2xl transition-all cursor-pointer border-t-[8px] hover:border-t-yellow-400 group relative shadow-lg flex flex-col justify-between min-h-[250px] md:min-h-[300px]">
              <div>
                <div className="flex justify-between items-start mb-8">
                   <span className="text-[9px] font-black bg-black text-white px-3 py-0.5 uppercase tracking-widest italic leading-none">{c['CATEGORÍA'] || 'EMPRESA'}</span>
                   <span className="text-yellow-600 font-bold text-[9px] italic bg-yellow-50 px-2 py-0.5 rounded-sm border border-yellow-100 leading-none">{c['EJERCICIO']}</span>
                </div>
                <h3 className="text-xl md:text-3xl font-black text-black group-hover:text-yellow-600 transition-colors uppercase leading-[1.1] mb-4 tracking-tighter">
                  {c['ACRONIMO'] || c['DENOMINACIÓN SOCIAL']}
                </h3>
                <p className="text-slate-400 text-[10px] font-mono uppercase tracking-tighter italic border-b border-slate-50 pb-4 leading-none truncate">REF ID: {c['CIF EMPRESA']}</p>
              </div>
              <div className="flex justify-between items-baseline pt-6 border-t border-slate-50 mt-4">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest italic leading-none">Net Revenue</span>
                <span className="font-black text-2xl md:text-4xl tabular-nums tracking-tighter text-slate-900 group-hover:scale-105 transition-transform duration-500 leading-none">
                  {formatM(getRevenue(c))}
                </span>
              </div>
            </div>
          ))}
        </div>
      </main>

      {/* --- FICHA ESTRATÉGICA CON PESTAÑAS (MODAL) --- */}
      {selectedCompany && (
        <div className="fixed inset-0 bg-black/98 backdrop-blur-3xl z-[100] flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-7xl my-auto shadow-2xl border-t-[20px] border-yellow-400 animate-in zoom-in duration-300 rounded-sm">
            <div className="p-6 md:p-16 lg:p-20 text-slate-900">
              
              {/* HEADER MODAL */}
              <div className="flex justify-between items-start mb-8 gap-8">
                <div className="flex-1 overflow-hidden">
                  <div className="flex items-center gap-4 mb-6">
                    <span className="bg-black text-yellow-400 text-[10px] font-black px-4 py-1 uppercase tracking-[0.4em] shadow-xl italic">STRATEGIC REPORT M&A</span>
                    <Activity className="w-6 h-6 text-yellow-500 animate-pulse" />
                  </div>
                  <h2 className="text-4xl md:text-6xl lg:text-8xl font-black tracking-tighter uppercase italic leading-[0.85] mb-8 truncate text-black drop-shadow-sm">
                    {selectedCompany['ACRONIMO'] || selectedCompany['DENOMINACIÓN SOCIAL']}
                  </h2>
                </div>
                <button onClick={() => setSelectedCompany(null)} className="p-4 md:p-8 border-4 border-slate-100 rounded-full hover:bg-slate-100 transition-all text-black hover:rotate-90 shadow-2xl bg-white"><X className="w-10 h-10" /></button>
              </div>

              {/* TABS DE NAVEGACIÓN (VISIBILIDAD MEJORADA) */}
              <div className="flex gap-2 mb-12 border-b-8 border-slate-100 pb-2 overflow-x-auto scrollbar-hide">
                {[
                  { id: 'overview', label: '1. Diagnóstico', icon: FileText },
                  { id: 'valuation', label: '2. Valoración', icon: Scale },
                  { id: 'financials', label: '3. Finanzas', icon: Calculator },
                  { id: 'peers', label: '4. Comparativa', icon: Layers }
                ].map(tab => (
                  <button 
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-3 px-6 md:px-10 py-4 font-black uppercase text-[9px] md:text-[11px] tracking-[0.2em] transition-all rounded-t-sm border-x border-t whitespace-nowrap ${activeTab === tab.id ? 'bg-black text-yellow-400 border-black shadow-[-5px_0_20px_rgba(0,0,0,0.1)] scale-105 z-10' : 'bg-slate-50 text-slate-400 border-slate-100 hover:bg-slate-100 hover:text-black'}`}
                  >
                    <tab.icon className={`w-4 h-4 md:w-5 md:h-5 ${activeTab === tab.id ? 'text-yellow-400' : 'text-slate-300'}`} /> {tab.label}
                  </button>
                ))}
              </div>

              {/* CONTENIDO TABS */}
              <div className="min-h-[500px] animate-in fade-in duration-500">
                
                {/* --- TAB 1: EXECUTIVE --- */}
                {activeTab === 'overview' && (
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 md:gap-16">
                       <div className="lg:col-span-8 space-y-12">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-8">
                            <div className="bg-slate-50 p-6 md:p-10 border-b-[10px] border-black rounded-sm shadow-xl">
                              <span className="text-[9px] font-black uppercase text-slate-400 block mb-4 italic tracking-widest">Facturación</span>
                              <span className="text-xl md:text-3xl font-black tabular-nums tracking-tighter italic block overflow-hidden">{formatM(getRevenue(selectedCompany))}</span>
                            </div>
                            <div className="bg-slate-50 p-6 md:p-10 border-b-[10px] border-yellow-400 rounded-sm shadow-xl">
                              <span className="text-[9px] font-black uppercase text-slate-400 block mb-4 italic tracking-widest">EBITDA</span>
                              <span className="text-xl md:text-3xl font-black tabular-nums tracking-tighter text-yellow-600 italic block overflow-hidden">{formatM(cleanValue(selectedCompany['EBITDA']))}</span>
                            </div>
                            <div className="bg-slate-50 p-6 md:p-10 border-b-[10px] border-black rounded-sm shadow-xl">
                              <span className="text-[9px] font-black uppercase text-slate-400 block mb-4 italic tracking-widest">Margen %</span>
                              <span className="text-xl md:text-3xl font-black tabular-nums tracking-tighter italic block overflow-hidden underline decoration-yellow-400">
                                {companyProAnalysis.marginRatio.toFixed(1)}%
                              </span>
                            </div>
                            <div className="bg-black text-white p-6 md:p-10 border-b-[10px] border-yellow-400 rounded-sm shadow-2xl">
                              <span className="text-[9px] font-black uppercase text-slate-500 block mb-4 italic tracking-widest">Net Profit</span>
                              <span className="text-xl md:text-3xl font-black tabular-nums tracking-tighter text-yellow-400 italic block overflow-hidden">{formatM(cleanValue(selectedCompany['RESULTADO DEL EJERCICIO']))}</span>
                            </div>
                          </div>
                          
                          <div className="bg-slate-50 p-10 md:p-14 border-l-[20px] border-black rounded-sm shadow-2xl group">
                             <div className="flex items-center gap-4 mb-8 text-slate-400 italic uppercase font-black text-[11px] tracking-[0.3em]">
                                <Activity className="w-6 h-6" /> Professional Diagnostic Summary
                             </div>
                             <p className="text-2xl md:text-4xl leading-relaxed italic font-serif text-slate-800 font-medium group-hover:text-black transition-colors leading-normal">
                                "La entidad {selectedCompany['DENOMINACIÓN SOCIAL']} presenta una posición {companyProAnalysis.revDelta > 0 ? 'dominante' : 'estable'} en el ecosistema de {selectedCompany['CATEGORÍA']}, superando en un {Math.abs(companyProAnalysis.revDelta).toFixed(1)}% la media de facturación de su pool competitivo."
                             </p>
                          </div>
                       </div>

                       <div className="lg:col-span-4 space-y-12">
                          <div className="bg-black text-white p-10 md:p-14 rounded-sm shadow-2xl relative overflow-hidden group h-full flex flex-col justify-center">
                             <div className="absolute top-0 right-0 p-6 opacity-10"><Zap className="w-12 h-12 text-yellow-400" /></div>
                             <h4 className="text-[11px] font-black uppercase tracking-[0.5em] text-yellow-400 mb-10 italic border-b border-white/10 pb-4">BUD Pulse Rating</h4>
                             <div className="flex flex-col items-center py-6 relative z-10">
                                <span className="text-[80px] md:text-[110px] font-black leading-none italic drop-shadow-2xl text-white tabular-nums">{companyProAnalysis.rating}</span>
                                <span className="text-[11px] font-black uppercase tracking-[0.4em] text-slate-500 mt-6 italic underline decoration-yellow-400 decoration-4">EFFICIENCY SCORE / 100</span>
                             </div>
                             <p className="text-[9px] text-slate-500 mt-10 font-bold uppercase tracking-widest leading-relaxed text-center italic">Algoritmo propio que cruza rentabilidad operativa, eficiencia de personal y salud de balance.</p>
                          </div>
                       </div>
                  </div>
                )}

                {/* --- TAB 2: VALUATION --- */}
                {activeTab === 'valuation' && (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 md:gap-20">
                     <div className="bg-white border-2 border-slate-100 p-8 md:p-14 shadow-2xl rounded-sm group">
                        <div className="flex items-center gap-4 mb-10 md:mb-14">
                           <div className="bg-black p-2 rounded-sm text-yellow-400 shadow-lg group-hover:rotate-12 transition-transform"><Scale className="w-8 h-8" /></div>
                           <h4 className="text-2xl md:text-3xl font-black uppercase tracking-tighter italic">Enterprise Value Simulator</h4>
                        </div>
                        <div className="space-y-10 md:space-y-12">
                           <div>
                              <div className="flex justify-between mb-4 md:mb-6">
                                 <label className="text-[10px] font-black uppercase tracking-[0.3em] italic text-slate-500 leading-none">Múltiplo EBITDA (Sectorial)</label>
                                 <span className="bg-black text-yellow-400 px-4 py-1 text-xs font-black italic shadow-2xl tracking-widest">{valuationMultiple}x</span>
                              </div>
                              <input type="range" min="4" max="15" step="0.5" value={valuationMultiple} onChange={(e) => setValuationMultiple(parseFloat(e.target.value))} className="w-full h-4 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-black" />
                              <div className="flex justify-between mt-3 text-[8px] font-black text-slate-300 uppercase tracking-widest italic"><span>4x Conservative</span><span>15x Scale-up</span></div>
                           </div>
                           <div className="pt-10 border-t-4 border-slate-50 space-y-6 md:space-y-8">
                              <div className="flex justify-between items-baseline group/row overflow-hidden">
                                 <span className="text-[11px] font-black uppercase italic tracking-[0.2em] text-slate-500">Enterprise Value</span>
                                 <span className="text-2xl md:text-4xl font-black tabular-nums tracking-tighter italic group-hover/row:text-yellow-600 transition-colors">{formatFull(cleanValue(selectedCompany['EBITDA']) * valuationMultiple)}</span>
                              </div>
                              <div className="bg-black text-white p-8 md:p-12 border-l-[15px] border-yellow-400 flex flex-wrap justify-between items-center gap-4 shadow-2xl rounded-sm">
                                 <div className="flex flex-col">
                                    <span className="text-[11px] font-black uppercase italic tracking-[0.3em] text-yellow-400 leading-none">Purchase Price Estimate</span>
                                    <p className="text-[8px] text-slate-500 uppercase mt-2 font-bold leading-none">Valor estimado del 100% de las acciones</p>
                                 </div>
                                 <span className="text-4xl md:text-6xl font-black text-yellow-400 tabular-nums tracking-tighter italic drop-shadow-xl">{formatFull(Math.max(0, (cleanValue(selectedCompany['EBITDA']) * valuationMultiple) - (cleanValue(selectedCompany['PASIVO CORRIENTE']) - cleanValue(selectedCompany['ACTIVO CORRIENTE']))))}</span>
                              </div>
                           </div>
                        </div>
                     </div>
                     <div className="bg-slate-50 p-10 md:p-16 shadow-2xl rounded-sm flex flex-col items-center justify-center text-center relative overflow-hidden">
                        <h4 className="text-[11px] font-black uppercase tracking-[0.4em] text-slate-400 mb-10 italic border-b border-slate-200 pb-4">Operating Leverage Analysis</h4>
                        <DonutChart data={[companyProAnalysis.pers, companyProAnalysis.others]} colors={['#000', '#FACC15']} />
                        <div className="mt-12 grid grid-cols-2 gap-10 md:gap-16 w-full text-left pt-10 border-t-2 border-slate-200">
                           <div className="overflow-hidden">
                              <div className="flex items-center gap-2 mb-1 font-black uppercase tracking-widest text-[9px] italic"><div className="w-2.5 h-2.5 bg-black shadow-lg"></div>Talento</div>
                              <span className="text-xl md:text-3xl font-black tabular-nums italic text-slate-900 block overflow-hidden">{formatM(companyProAnalysis.pers)}</span>
                           </div>
                           <div className="overflow-hidden">
                              <div className="flex items-center gap-2 mb-1 font-black uppercase tracking-widest text-[9px] italic"><div className="w-2.5 h-2.5 bg-yellow-400 shadow-lg"></div>Estructura</div>
                              <span className="text-xl md:text-3xl font-black tabular-nums italic text-slate-900 block overflow-hidden">{formatM(companyProAnalysis.others)}</span>
                           </div>
                        </div>
                        <p className="text-[8px] text-slate-400 mt-10 font-bold uppercase tracking-widest leading-relaxed text-center italic">Desglose porcentual del Gasto Operativo (OPEX). Permite evaluar la escalabilidad del modelo de negocio.</p>
                     </div>
                  </div>
                )}

                {/* --- TAB 3: FINANCIALS --- */}
                {activeTab === 'financials' && (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 md:gap-24">
                     <div className="space-y-8 md:space-y-12">
                        <h4 className="text-3xl md:text-4xl font-black uppercase border-b-[10px] border-black pb-4 italic">P&L Consolidated</h4>
                        <div className="space-y-4">
                           <div className="flex justify-between p-6 md:p-10 bg-slate-900 text-white rounded-sm border-l-[15px] border-yellow-400 shadow-2xl items-center overflow-hidden">
                              <span className="uppercase text-[9px] font-black italic tracking-[0.4em] flex items-center gap-4"><ArrowUpRight className="w-6 h-6 text-yellow-400" /> (+) Business Revenue</span>
                              <span className="text-2xl md:text-5xl font-black tabular-nums italic tracking-tighter drop-shadow-xl">{formatFull(getRevenue(selectedCompany))}</span>
                           </div>
                           <div className="flex justify-between px-8 py-6 text-red-600 border-b-4 border-slate-100 italic font-black text-xs md:text-sm">
                              <span className="uppercase tracking-[0.2em] italic leading-none">(-) Personnel Expenditure</span>
                              <span className="tabular-nums tracking-tighter leading-none">{formatFull(cleanValue(selectedCompany['GASTOS DE PERSONAL']))}</span>
                           </div>
                           <div className="flex justify-between p-10 md:p-16 bg-yellow-400/10 border-x-[20px] md:border-x-[30px] border-yellow-400 shadow-inner items-center my-10 overflow-hidden group">
                              <span className="text-3xl md:text-5xl font-black uppercase italic tracking-tighter text-slate-800 leading-none">(=) EBITDA</span>
                              <span className="text-4xl md:text-8xl font-black text-yellow-600 tabular-nums italic drop-shadow-2xl group-hover:scale-105 transition-transform">{formatFull(cleanValue(selectedCompany['EBITDA']))}</span>
                           </div>
                        </div>
                        <p className="text-[9px] text-slate-400 mt-4 font-bold uppercase tracking-widest leading-relaxed italic border-t border-slate-100 pt-4">Cuenta de Resultados detallada. El EBITDA refleja la rentabilidad pura del negocio antes de factores contables o financieros.</p>
                     </div>
                     <div className="space-y-12 md:space-y-16">
                        <h4 className="text-3xl md:text-4xl font-black uppercase border-b-[15px] border-black pb-4 italic">Balance Sheet Strength</h4>
                        <div className="bg-black text-white p-10 md:p-14 border-b-[20px] border-yellow-600 flex flex-wrap justify-between items-center gap-6 shadow-2xl rounded-sm">
                           <div className="flex flex-col relative z-10 pl-6 border-l-4 border-yellow-400">
                              <span className="text-sm font-black uppercase italic tracking-[0.4em]">Working Capital</span>
                              <span className="text-[10px] font-bold text-slate-500 uppercase mt-3 italic tracking-[0.3em] leading-none">Fondo de Maniobra Neto</span>
                           </div>
                           <span className={`text-5xl md:text-7xl font-black tabular-nums tracking-tighter italic ${cleanValue(selectedCompany['ACTIVO CORRIENTE']) - cleanValue(selectedCompany['PASIVO CORRIENTE']) > 0 ? 'text-green-400' : 'text-red-500'}`}>
                              {formatFull(cleanValue(selectedCompany['ACTIVO CORRIENTE']) - cleanValue(selectedCompany['PASIVO CORRIENTE']))}
                           </span>
                        </div>
                        <div className="bg-slate-50 p-8 md:p-12 border-l-[15px] border-slate-200 shadow-2xl rounded-sm">
                          <h5 className="text-[11px] font-black uppercase tracking-[0.5em] text-slate-400 mb-10 flex items-center gap-4 italic leading-none border-b border-slate-100 pb-4"><Briefcase className="w-6 h-6 text-slate-400" /> Registro de Actividad</h5>
                          <p className="text-xl md:text-3xl leading-relaxed italic font-serif text-slate-800 font-medium">"{String(selectedCompany['OBJETO SOCIAL'] || 'Descripción no disponible.')}"</p>
                        </div>
                     </div>
                  </div>
                )}

                {/* --- TAB 4: PEERS --- */}
                {activeTab === 'peers' && (
                  <div className="space-y-12 md:space-y-16">
                    <div className="flex flex-col gap-3 border-l-[15px] border-yellow-400 pl-10 py-2">
                      <h4 className="text-3xl md:text-5xl font-black uppercase tracking-tighter italic text-black">Peer Intelligence Analysis</h4>
                      <p className="text-slate-400 text-[10px] font-black uppercase tracking-[0.5em] italic">Pool Comparativo: {companyProAnalysis.peerCount} unidades identificadas.</p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 md:gap-10">
                      {similarCompanies.map((c, i) => (
                        <div key={i} onClick={() => { setSelectedCompany(c); setActiveTab('overview'); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="bg-white border-2 border-slate-100 hover:border-yellow-400 hover:shadow-2xl transition-all cursor-pointer group flex flex-col justify-between min-h-[350px] md:min-h-[400px] shadow-xl relative overflow-hidden rounded-sm">
                          <div className="absolute -right-6 -bottom-6 w-32 h-32 text-slate-50 opacity-10 group-hover:text-yellow-400 group-hover:opacity-20 transition-all duration-1000"><Zap className="w-full h-full" /></div>
                          <div className="p-8 md:p-12">
                             <span className="text-[9px] font-black bg-black text-white px-4 py-1 uppercase tracking-[0.2em] mb-10 inline-block italic leading-none shadow-xl">{c['CATEGORÍA']}</span>
                             <h5 className="font-black uppercase text-xl md:text-3xl group-hover:text-yellow-600 transition-all tracking-tighter mb-4 italic leading-tight overflow-hidden line-clamp-3">{c['ACRONIMO'] || c['DENOMINACIÓN SOCIAL']}</h5>
                             <p className="text-slate-400 text-[9px] font-mono italic tracking-[0.2em] uppercase border-b border-slate-50 pb-6 truncate">{c['CIF EMPRESA']}</p>
                          </div>
                          <div className="p-8 md:p-12 border-t-8 border-slate-50 bg-slate-50/50 group-hover:bg-white transition-colors mt-auto">
                             <span className="text-[10px] font-black text-slate-400 uppercase block mb-2 italic tracking-[0.3em]">Revenue</span>
                             <span className="font-black text-2xl md:text-4xl tabular-nums tracking-tighter text-slate-900 group-hover:text-black italic leading-none overflow-hidden block truncate">{formatM(getRevenue(c))}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest leading-relaxed text-center italic max-w-2xl mx-auto">Selección automatizada de agencias con perfil de facturación similar (+/- 25%) dentro de la misma categoría funcional.</p>
                  </div>
                )}
              </div>

              {/* FOOTER MODAL */}
              <div className="mt-20 pt-10 border-t-[10px] border-slate-50 flex justify-center pb-24">
                <button onClick={() => setSelectedCompany(null)} className="bg-black text-white px-10 md:px-64 py-8 md:py-14 font-black uppercase tracking-[0.8em] text-[10px] md:text-xs hover:bg-yellow-400 hover:text-black transition-all shadow-2xl active:scale-95 border-b-[20px] border-yellow-600 rounded-sm italic group flex items-center justify-center gap-6">
                  CLOSE STRATEGIC DOSSIER <ArrowRight className="hidden md:inline-block w-6 h-6 group-hover:translate-x-6 transition-transform" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}