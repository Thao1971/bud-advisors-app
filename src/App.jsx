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
const appId = "bud_intelligence_v15_final"; // Nueva versión para asegurar limpieza de caché

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

const formatM = (v) => {
  if (v === undefined || v === null || isNaN(v)) return '-';
  const mValue = v / 1000000;
  return new Intl.NumberFormat('es-ES', { 
    minimumFractionDigits: 1,
    maximumFractionDigits: 1 
  }).format(mValue) + ' M€';
};

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
    <svg viewBox="-1 -1 2 2" style={{ transform: 'rotate(-90deg)' }} className="w-24 h-24 shadow-sm rounded-full bg-white">
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
  const [status, setStatus] = useState({ type: 'info', msg: 'Sincronizando HUB BUD Advisors...' });
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

  // 2. ESCUCHA DE DATOS
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
        setStatus({ type: 'success', msg: 'Datos sectoriales actualizados.' });
      } catch (err) { setStatus({ type: 'error', msg: err.message }); }
      finally { setUploading(false); }
    };
    reader.readAsText(file);
  };

  // --- LÓGICA DE INTELIGENCIA ---
  const aggregates = useMemo(() => {
    const totalRev = data.reduce((acc, curr) => acc + getRevenue(curr), 0);
    const totalEbitda = data.reduce((acc, curr) => acc + cleanValue(curr['EBITDA']), 0);
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
    <div className="min-h-screen bg-[#FDFDFD] text-slate-900 font-sans antialiased selection:bg-yellow-100">
      {/* NAVBAR */}
      <nav className="bg-black text-white px-8 py-5 border-b-2 border-yellow-400 sticky top-0 z-[60] flex justify-between items-center shadow-xl">
        <div className="flex items-center gap-4">
          <div className="bg-yellow-400 p-1.5 rounded-sm"><Building2 className="text-black w-6 h-6" /></div>
          <div className="flex flex-col leading-none">
            <span className="font-black text-2xl tracking-tighter uppercase italic">BUD <span className="text-yellow-400">ADVISORS</span></span>
            <span className="text-[10px] tracking-[0.4em] text-slate-500 font-bold uppercase mt-1 italic">Intelligence Terminal</span>
          </div>
        </div>
        <label className="bg-yellow-400 hover:bg-yellow-300 text-black px-6 py-3 font-black text-xs uppercase tracking-widest cursor-pointer transition-all flex items-center gap-2 rounded-sm shadow-md active:scale-95">
          <Upload className="w-4 h-4" /> {uploading ? '...' : 'ACTUALIZAR DB'}
          <input type="file" onChange={handleUpload} className="hidden" accept=".csv" />
        </label>
      </nav>

      {/* MONITOR */}
      <div className={`py-1 text-[8px] font-black uppercase tracking-[0.3em] text-center border-b transition-colors ${status.type === 'error' ? 'bg-red-600 text-white' : 'bg-slate-50 text-slate-400'}`}>
        {status.msg}
      </div>

      <main className="max-w-7xl mx-auto p-10">
        
        {/* --- DASHBOARD M€ --- */}
        <section className="mb-16 animate-in fade-in slide-in-from-bottom-4 duration-700">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
            <div className="bg-black text-white p-10 border-l-[12px] border-yellow-400 shadow-2xl relative overflow-hidden group">
              <DollarSign className="absolute -right-4 -bottom-4 w-28 h-28 text-white/5" />
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-3 italic">Volumen Sector HUB</span>
              <span className="text-4xl lg:text-5xl font-black tabular-nums tracking-tighter truncate leading-none">
                {formatM(aggregates.totalRev)}
              </span>
            </div>
            
            <div className="bg-white p-10 border-l-[12px] border-black shadow-xl group">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-3 italic">EBITDA Consolidado</span>
              <span className="text-4xl font-black text-green-600 tabular-nums tracking-tighter truncate leading-none">
                {formatM(aggregates.totalEbitda)}
              </span>
              <span className="text-[10px] font-black text-slate-400 uppercase mt-4 block italic tracking-widest">
                M. MEDIO: {(aggregates.totalRev > 0 ? (aggregates.totalEbitda / aggregates.totalRev) * 100 : 0).toFixed(1)}%
              </span>
            </div>

            <div className="bg-white p-10 border-l-[12px] border-slate-200 shadow-xl flex flex-col justify-center text-center">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-3 italic">Empresas en HUB</span>
              <span className="text-6xl font-black text-slate-900 tabular-nums tracking-tighter leading-none">{data.length}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
            {/* SECTORES */}
            <div className="lg:col-span-8 bg-white p-12 border border-slate-100 shadow-2xl rounded-sm">
              <h3 className="text-[12px] font-black uppercase tracking-[0.2em] text-slate-400 mb-10 flex items-center gap-4 italic"><PieChart className="w-5 h-5" /> Cuota de Negocio por Sector</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-8">
                {Object.entries(aggregates.cats).sort((a,b) => b[1].revenue - a[1].revenue).slice(0, 6).map(([name, stat]) => (
                  <div key={name} className="group">
                    <div className="flex justify-between text-[11px] font-black uppercase mb-3 tracking-widest leading-none">
                      <span className="text-slate-800 italic truncate max-w-[150px]">{name}</span>
                      <span className="tabular-nums text-slate-500">{(aggregates.totalRev > 0 ? (stat.revenue / aggregates.totalRev) * 100 : 0).toFixed(1)}%</span>
                    </div>
                    <div className="w-full bg-slate-50 h-2.5 rounded-full overflow-hidden border border-slate-100 shadow-inner">
                      <div className="bg-black h-full group-hover:bg-yellow-400 transition-all duration-500" style={{width: `${aggregates.totalRev > 0 ? (stat.revenue / aggregates.totalRev) * 100 : 0}%`}}></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {/* TOP 5 */}
            <div className="lg:col-span-4 bg-slate-900 text-white p-12 shadow-2xl rounded-sm overflow-hidden">
              <h3 className="text-[12px] font-black uppercase tracking-[0.3em] text-yellow-400 mb-10 flex items-center gap-4 italic"><Trophy className="w-5 h-5" /> Top Liderazgo de Facturación</h3>
              <div className="space-y-6">
                {data.slice(0, 5).map((c, i) => (
                  <div key={i} onClick={() => { setSelectedCompany(c); setActiveTab('overview'); }} className="flex items-center justify-between p-4 border-b border-white/5 hover:text-yellow-400 cursor-pointer transition-all group">
                    <div className="flex items-center gap-4 leading-none">
                      <span className="text-yellow-400 font-black italic tabular-nums text-2xl">0{i+1}</span>
                      <span className="font-bold uppercase text-xs tracking-widest truncate max-w-[150px] group-hover:underline">{c['ACRONIMO'] || c['DENOMINACIÓN SOCIAL']}</span>
                    </div>
                    <span className="font-black tabular-nums text-lg tracking-tighter italic">{formatM(getRevenue(c))}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* --- FILTROS --- */}
        <section className="bg-white p-10 shadow-2xl mb-12 border-t-[12px] border-black rounded-sm flex flex-col md:flex-row gap-8 items-center">
          <div className="flex-1 flex items-center gap-6 border-b-4 border-slate-100 pb-4 w-full group">
            <Search className="text-slate-300 w-10 h-10 group-focus-within:text-yellow-500 transition-all" />
            <input className="w-full outline-none font-black text-3xl placeholder-slate-200 bg-transparent uppercase tracking-tighter" placeholder="Identificar Agencia o CIF..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          </div>
          <select className="p-5 bg-slate-50 border-2 border-transparent focus:border-yellow-400 outline-none font-black uppercase tracking-widest text-[10px] cursor-pointer shadow-inner w-full md:w-auto" value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)}>
            {['Todas', ...new Set(data.map(c => c['CATEGORÍA']).filter(Boolean))].map(cat => <option key={cat} value={cat}>{cat}</option>)}
          </select>
        </section>

        {/* --- LISTADO CARDS --- */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
          {filtered.map((c, i) => (
            <div key={i} onClick={() => { setSelectedCompany(c); setActiveTab('overview'); }} className="bg-white border border-slate-100 p-12 hover:shadow-2xl transition-all cursor-pointer border-t-[8px] hover:border-t-yellow-400 group relative shadow-lg overflow-hidden flex flex-col justify-between min-h-[300px]">
              <div>
                <div className="flex justify-between items-start mb-10">
                   <span className="text-[10px] font-black bg-black text-white px-3 py-1 uppercase tracking-widest italic leading-none shadow-md">{c['CATEGORÍA'] || 'EMPRESA'}</span>
                   <span className="text-yellow-600 font-bold text-[10px] italic bg-yellow-50 px-3 py-1 rounded-sm border border-yellow-100 leading-none">{c['EJERCICIO']}</span>
                </div>
                <h3 className="text-3xl font-black text-black group-hover:text-yellow-600 transition-colors uppercase leading-[1] mb-6 tracking-tighter">
                  {c['ACRONIMO'] || c['DENOMINACIÓN SOCIAL']}
                </h3>
                <p className="text-slate-400 text-[11px] font-mono uppercase tracking-tighter italic border-b border-slate-50 pb-6 leading-none">REF ID: {c['CIF EMPRESA']}</p>
              </div>
              <div className="flex justify-between items-baseline pt-8 border-t border-slate-50 mt-4">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest italic leading-none">Net Revenue</span>
                <span className="font-black text-4xl tabular-nums tracking-tighter text-slate-900 group-hover:scale-105 transition-transform duration-500 leading-none">
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
            <div className="p-8 md:p-16 lg:p-20 text-slate-900">
              
              {/* HEADER DOSSIER */}
              <div className="flex justify-between items-start mb-10 gap-12">
                <div className="flex-1 overflow-hidden">
                  <div className="flex items-center gap-5 mb-8">
                    <span className="bg-black text-yellow-400 text-[11px] font-black px-6 py-2 uppercase tracking-[0.5em] shadow-2xl italic">DOSSIER ESTRATÉGICO M&A</span>
                    <Activity className="w-8 h-8 text-yellow-500 animate-pulse" />
                  </div>
                  <h2 className="text-6xl md:text-8xl font-black tracking-tighter uppercase italic leading-[0.85] mb-12 truncate text-black drop-shadow-sm">
                    {selectedCompany['ACRONIMO'] || selectedCompany['DENOMINACIÓN SOCIAL']}
                  </h2>
                </div>
                <button onClick={() => setSelectedCompany(null)} className="p-8 border-4 border-slate-100 rounded-full hover:bg-slate-100 transition-all text-black hover:rotate-90 shadow-2xl bg-white"><X className="w-12 h-12" /></button>
              </div>

              {/* BARRA DE PESTAÑAS (TABS) - AHORA MÁS VISIBLES */}
              <div className="flex gap-2 mb-16 border-b-8 border-slate-100 pb-2 overflow-x-auto scrollbar-hide">
                {[
                  { id: 'overview', label: '1. Diagnóstico Ejecutivo', icon: FileText },
                  { id: 'valuation', label: '2. Valoración M&A', icon: Scale },
                  { id: 'financials', label: '3. Detalle Financiero', icon: Calculator },
                  { id: 'peers', label: '4. Peer Analysis', icon: Layers }
                ].map(tab => (
                  <button 
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-4 px-10 py-5 font-black uppercase text-[10px] tracking-[0.2em] transition-all rounded-t-sm border-x border-t ${activeTab === tab.id ? 'bg-black text-yellow-400 border-black shadow-[-5px_0_20px_rgba(0,0,0,0.1)] scale-105 z-10' : 'bg-slate-50 text-slate-400 border-slate-100 hover:bg-slate-100 hover:text-black'}`}
                  >
                    <tab.icon className={`w-5 h-5 ${activeTab === tab.id ? 'text-yellow-400' : 'text-slate-300'}`} /> {tab.label}
                  </button>
                ))}
              </div>

              {/* CONTENIDO SEGÚN PESTAÑA */}
              <div className="min-h-[550px] animate-in fade-in duration-500">
                
                {/* --- TAB 1: EXECUTIVE SUMMARY --- */}
                {activeTab === 'overview' && (
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-20">
                       <div className="lg:col-span-8 space-y-16">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
                            <div className="bg-slate-50 p-12 border-b-[10px] border-black rounded-sm shadow-xl">
                              <span className="text-[10px] font-black uppercase text-slate-400 block mb-6 italic tracking-widest">Facturación</span>
                              <span className="text-4xl font-black tabular-nums tracking-tighter italic">{formatM(getRevenue(selectedCompany))}</span>
                            </div>
                            <div className="bg-slate-50 p-12 border-b-[10px] border-yellow-400 rounded-sm shadow-xl">
                              <span className="text-[10px] font-black uppercase text-slate-400 block mb-6 italic tracking-widest">EBITDA</span>
                              <span className="text-4xl font-black tabular-nums tracking-tighter text-yellow-600 italic">{formatM(cleanValue(selectedCompany['EBITDA']))}</span>
                            </div>
                            <div className="bg-slate-50 p-12 border-b-[10px] border-black rounded-sm shadow-xl">
                              <span className="text-[10px] font-black uppercase text-slate-400 block mb-6 italic tracking-widest">Margen %</span>
                              <span className="text-4xl font-black tabular-nums tracking-tighter italic underline decoration-yellow-400 decoration-8 underline-offset-8">
                                {companyProAnalysis.marginRatio.toFixed(1)}%
                              </span>
                            </div>
                            <div className="bg-black text-white p-12 border-b-[10px] border-yellow-400 rounded-sm shadow-2xl">
                              <span className="text-[10px] font-black uppercase text-slate-500 block mb-6 italic tracking-widest">Resultado Neto</span>
                              <span className="text-4xl font-black tabular-nums tracking-tighter text-yellow-400 italic">{formatM(cleanValue(selectedCompany['RESULTADO DEL EJERCICIO']))}</span>
                            </div>
                          </div>
                          
                          <div className="bg-slate-50 p-14 border-l-[25px] border-black rounded-sm shadow-2xl group">
                             <div className="flex items-center gap-5 mb-10 text-slate-400 italic uppercase font-black text-[12px] tracking-[0.3em]">
                                <Activity className="w-6 h-6" /> Professional Diagnostic Summary
                             </div>
                             <p className="text-4xl leading-relaxed italic font-serif text-slate-800 font-medium group-hover:text-black transition-colors">
                                "La entidad {selectedCompany['DENOMINACIÓN SOCIAL']} presenta una posición {companyProAnalysis.revDelta > 0 ? 'dominante' : 'estable'} en el ecosistema de {selectedCompany['CATEGORÍA']}, superando en un {Math.abs(companyProAnalysis.revDelta).toFixed(1)}% la media de facturación de su pool competitivo."
                             </p>
                          </div>
                       </div>

                       <div className="lg:col-span-4 space-y-12">
                          <div className="bg-black text-white p-14 rounded-sm shadow-2xl relative overflow-hidden group">
                             <div className="absolute top-0 right-0 p-6 opacity-10"><Zap className="w-16 h-16 text-yellow-400" /></div>
                             <h4 className="text-[11px] font-black uppercase tracking-[0.5em] text-yellow-400 mb-12 italic border-b border-white/10 pb-4">BUD Pulse Rating</h4>
                             <div className="flex flex-col items-center py-10 relative z-10">
                                <span className="text-[120px] font-black leading-none italic drop-shadow-2xl text-white tabular-nums group-hover:scale-105 transition-transform duration-700">{companyProAnalysis.rating}</span>
                                <span className="text-[11px] font-black uppercase tracking-[0.4em] text-slate-500 mt-6 italic underline decoration-yellow-400 decoration-4">EFFICIENCY SCORE / 100</span>
                             </div>
                          </div>
                       </div>
                  </div>
                )}

                {/* --- TAB 2: VALUATION --- */}
                {activeTab === 'valuation' && (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-20">
                     <div className="bg-white border-2 border-slate-100 p-14 shadow-2xl rounded-sm group">
                        <div className="flex items-center gap-6 mb-14">
                           <div className="bg-black p-3 rounded-sm text-yellow-400 shadow-lg group-hover:rotate-12 transition-transform"><Scale className="w-8 h-8" /></div>
                           <h4 className="text-3xl font-black uppercase tracking-tighter italic">Enterprise Value Simulator</h4>
                        </div>
                        <div className="space-y-12">
                           <div>
                              <div className="flex justify-between mb-6">
                                 <label className="text-[11px] font-black uppercase tracking-[0.3em] italic text-slate-500">Múltiplo de EBITDA Aplicado</label>
                                 <span className="bg-black text-yellow-400 px-5 py-1.5 text-sm font-black italic shadow-2xl tracking-widest">{valuationMultiple}x</span>
                              </div>
                              <input type="range" min="4" max="15" step="0.5" value={valuationMultiple} onChange={(e) => setValuationMultiple(parseFloat(e.target.value))} className="w-full h-4 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-black" />
                              <div className="flex justify-between mt-4 text-[9px] font-black text-slate-300 uppercase tracking-widest italic"><span>4x (Conservador)</span><span>15x (Crecimiento Alto)</span></div>
                           </div>
                           <div className="pt-14 border-t-4 border-slate-50 space-y-8">
                              <div className="flex justify-between items-baseline group/row">
                                 <span className="text-[12px] font-black uppercase italic tracking-[0.2em] text-slate-500">Enterprise Value (EV)</span>
                                 <span className="text-5xl font-black tabular-nums tracking-tighter italic group-hover/row:text-yellow-600 transition-colors">{formatFull(cleanValue(selectedCompany['EBITDA']) * valuationMultiple)}</span>
                              </div>
                              <div className="bg-black text-white p-12 border-l-[25px] border-yellow-400 flex justify-between items-center shadow-2xl">
                                 <div className="flex flex-col">
                                    <span className="text-[12px] font-black uppercase italic tracking-[0.3em] text-yellow-400">Equity Purchase Value</span>
                                    <p className="text-[9px] text-slate-500 uppercase mt-1 font-bold">Valor de compra estimado del 100% (Cash Free / Debt Free)</p>
                                 </div>
                                 <span className="text-6xl font-black text-yellow-400 tabular-nums tracking-tighter italic drop-shadow-xl">{formatFull(Math.max(0, (cleanValue(selectedCompany['EBITDA']) * valuationMultiple) - (cleanValue(selectedCompany['PASIVO CORRIENTE']) - cleanValue(selectedCompany['ACTIVO CORRIENTE']))))}</span>
                              </div>
                           </div>
                        </div>
                     </div>
                     <div className="bg-slate-50 p-16 shadow-2xl rounded-sm flex flex-col items-center justify-center text-center relative overflow-hidden">
                        <h4 className="text-[11px] font-black uppercase tracking-[0.4em] text-slate-400 mb-14 italic border-b border-slate-200 pb-4">Operating Leverage Analysis</h4>
                        <DonutChart data={[companyProAnalysis.pers, companyProAnalysis.others]} colors={['#000', '#FACC15']} />
                        <div className="mt-16 grid grid-cols-2 gap-16 w-full text-left pt-14 border-t-2 border-slate-200">
                           <div>
                              <div className="flex items-center gap-3 mb-2 font-black uppercase tracking-widest text-[10px] italic"><div className="w-3 h-3 bg-black"></div>Talento</div>
                              <span className="text-3xl font-black tabular-nums italic text-slate-900">{formatFull(companyProAnalysis.pers)}</span>
                           </div>
                           <div>
                              <div className="flex items-center gap-3 mb-2 font-black uppercase tracking-widest text-[10px] italic"><div className="w-3 h-3 bg-yellow-400"></div>Estructura</div>
                              <span className="text-3xl font-black tabular-nums italic text-slate-900">{formatFull(companyProAnalysis.others)}</span>
                           </div>
                        </div>
                     </div>
                  </div>
                )}

                {/* --- TAB 3: FINANCIALS --- */}
                {activeTab === 'financials' && (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-24">
                     <div className="space-y-12">
                        <h4 className="text-4xl font-black uppercase border-b-[15px] border-black pb-6 italic">P&L Consolidated Cascade</h4>
                        <div className="space-y-4">
                           <div className="flex justify-between p-10 bg-slate-900 text-white rounded-sm border-l-[20px] border-yellow-400 shadow-2xl items-center">
                              <span className="uppercase text-[11px] font-black italic tracking-[0.4em] flex items-center gap-6"><ArrowUpRight className="w-8 h-8 text-yellow-400" /> (+) Business Revenue</span>
                              <span className="text-5xl font-black tabular-nums italic tracking-tighter drop-shadow-xl">{formatFull(getRevenue(selectedCompany))}</span>
                           </div>
                           <div className="flex justify-between px-12 py-8 text-red-600 border-b-4 border-slate-100 italic">
                              <span className="uppercase text-sm font-black tracking-[0.2em] italic">(-) Personnel Expenditure</span>
                              <span className="text-3xl font-black tabular-nums tracking-tighter">{formatFull(cleanValue(selectedCompany['GASTOS DE PERSONAL']))}</span>
                           </div>
                           <div className="flex justify-between p-16 bg-yellow-400/10 border-x-[30px] border-yellow-400 shadow-inner items-center my-14 group">
                              <span className="text-5xl font-black uppercase italic tracking-tighter text-slate-800 leading-none">(=) EBITDA</span>
                              <span className="text-8xl font-black text-yellow-600 tabular-nums italic drop-shadow-2xl">{formatFull(cleanValue(selectedCompany['EBITDA']))}</span>
                           </div>
                        </div>
                     </div>
                     <div className="space-y-16">
                        <h4 className="text-4xl font-black uppercase border-b-[15px] border-black pb-6 italic">Balance Sheet Strength</h4>
                        <div className="bg-black text-white p-14 border-b-[20px] border-yellow-600 flex justify-between items-center shadow-2xl rounded-sm">
                           <div className="flex flex-col relative z-10 pl-8 border-l-4 border-yellow-400">
                              <span className="text-sm font-black uppercase italic tracking-[0.4em]">Working Capital</span>
                              <span className="text-[11px] font-bold text-slate-500 uppercase mt-4 italic tracking-[0.3em]">Caja neta tras pasivo corriente</span>
                           </div>
                           <span className={`text-7xl font-black tabular-nums tracking-tighter italic ${cleanValue(selectedCompany['ACTIVO CORRIENTE']) - cleanValue(selectedCompany['PASIVO CORRIENTE']) > 0 ? 'text-green-400' : 'text-red-500'}`}>
                              {formatFull(cleanValue(selectedCompany['ACTIVO CORRIENTE']) - cleanValue(selectedCompany['PASIVO CORRIENTE']))}
                           </span>
                        </div>
                        <div className="bg-slate-50 p-12 border-l-[15px] border-slate-200 shadow-2xl rounded-sm">
                          <h5 className="text-[12px] font-black uppercase tracking-[0.6em] text-slate-400 mb-10 flex items-center gap-6 italic"><Briefcase className="w-8 h-8 text-slate-400" /> Registro de Actividad</h5>
                          <p className="text-3xl leading-relaxed italic font-serif text-slate-800 font-medium">"{String(selectedCompany['OBJETO SOCIAL'] || 'Descripción no disponible.')}"</p>
                        </div>
                     </div>
                  </div>
                )}

                {/* --- TAB 4: PEERS --- */}
                {activeTab === 'peers' && (
                  <div className="space-y-16">
                    <div className="flex flex-col gap-4 border-l-[15px] border-yellow-400 pl-10 py-2">
                      <h4 className="text-5xl font-black uppercase tracking-tighter italic text-black">Peer Comparison Intelligence</h4>
                      <p className="text-slate-400 text-xs font-black uppercase tracking-[0.5em] italic">Universo comparable: {companyProAnalysis.peerCount} entidades analizadas en {selectedCompany['CATEGORÍA']}</p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12">
                      {similarCompanies.map((c, i) => (
                        <div key={i} onClick={() => { setSelectedCompany(c); setActiveTab('overview'); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="bg-white border-2 border-slate-100 hover:border-yellow-400 hover:shadow-2xl transition-all cursor-pointer group flex flex-col justify-between min-h-[400px] shadow-xl relative overflow-hidden rounded-sm">
                          <div className="absolute -right-6 -bottom-6 w-32 h-32 text-slate-50 opacity-10 group-hover:text-yellow-400 group-hover:opacity-20 transition-all duration-1000"><Zap className="w-full h-full" /></div>
                          <div className="p-12">
                             <span className="text-[10px] font-black bg-black text-white px-5 py-1.5 uppercase tracking-[0.3em] mb-12 inline-block shadow-xl">{c['CATEGORÍA']}</span>
                             <h5 className="font-black uppercase text-3xl group-hover:text-yellow-600 transition-all tracking-tighter mb-6 italic">{c['ACRONIMO'] || c['DENOMINACIÓN SOCIAL']}</h5>
                             <p className="text-slate-400 text-[10px] font-mono italic tracking-[0.3em] uppercase border-b border-slate-50 pb-8">{c['CIF EMPRESA']}</p>
                          </div>
                          <div className="p-12 border-t-8 border-slate-50 bg-slate-50/50 group-hover:bg-white transition-colors">
                             <span className="text-[11px] font-black text-slate-400 uppercase block mb-4 italic tracking-[0.4em]">Current Revenue</span>
                             <span className="font-black text-4xl tabular-nums tracking-tighter text-slate-900 group-hover:text-black italic leading-none">{formatM(getRevenue(c))}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* FOOTER MODAL */}
              <div className="mt-40 pt-16 border-t-[10px] border-slate-50 flex justify-center pb-32">
                <button onClick={() => setSelectedCompany(null)} className="bg-black text-white px-96 py-18 font-black uppercase tracking-[1.2em] text-sm hover:bg-yellow-400 hover:text-black transition-all shadow-2xl active:scale-95 border-b-[30px] border-yellow-600 rounded-sm italic group">
                  CLOSE STRATEGIC DOSSIER <ArrowRight className="inline-block ml-6 w-6 h-6 group-hover:translate-x-6 transition-transform" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}