import React, { useState, useEffect, useMemo } from 'react';
import { 
  Search, Upload, Building2, TrendingUp, Users, 
  BarChart3, Filter, X, Database, AlertCircle, 
  Trophy, LayoutDashboard, CheckCircle2, 
  Target, Briefcase, DollarSign, PieChart, 
  ArrowUpRight, Globe, Calculator,
  Wallet, ShieldCheck, Activity, TrendingDown,
  Layers, Zap, Info
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
const appId = "bud_intelligence_v10_terminal"; 

// --- MOTOR DE DATOS REFORZADO ---
const cleanValue = (val) => {
  if (val === undefined || val === null || val === '') return 0;
  if (typeof val === 'number') return val;
  const cleaned = val.toString()
    .replace(/[€\s%]/g, '')
    .replace(/\./g, '')
    .replace(',', '.');
  return parseFloat(cleaned) || 0;
};

// Función para encontrar la facturación independientemente de si es plural o singular
const getRevenue = (company) => {
  return cleanValue(company['IMPORTE NETO DE LA CIFRA DE NEGOCIOS'] || company['IMPORTE NETO DE LA CIFRA DE NEGOCIO'] || company['IMPORTEN NETO DE LA CIFRA DE NEGOCIO']);
};

// Formatea en Millones (M€) para Hub principal
const formatM = (v) => {
  if (v === undefined || v === null || isNaN(v)) return '-';
  const mValue = v / 1000000;
  return new Intl.NumberFormat('es-ES', { 
    minimumFractionDigits: 1,
    maximumFractionDigits: 1 
  }).format(mValue) + ' M€';
};

// Formatea en Miles (k€) para tarjetas secundarias
const formatK = (v) => {
  if (v === undefined || v === null || isNaN(v)) return '-';
  const kValue = v / 1000;
  return new Intl.NumberFormat('es-ES', { 
    maximumFractionDigits: 0 
  }).format(kValue) + ' k€';
};

// Formato moneda completo para fichas internas
const formatFull = (v) => {
  if (v === undefined || v === null || isNaN(v)) return '-';
  return new Intl.NumberFormat('es-ES', { 
    style: 'currency', 
    currency: 'EUR', 
    maximumFractionDigits: 0 
  }).format(v);
};

export default function App() {
  const [data, setData] = useState([]);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState({ type: 'info', msg: 'Estableciendo terminal...' });
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Todas');
  const [selectedSubcategory, setSelectedSubcategory] = useState('Todas');
  const [selectedCompany, setSelectedCompany] = useState(null);

  // 1. AUTENTICACIÓN
  useEffect(() => {
    if (!auth) {
      setStatus({ type: 'error', msg: 'Error de configuración.' });
      setLoading(false);
      return;
    }
    signInAnonymously(auth).catch(err => setStatus({ type: 'error', msg: `Error: ${err.message}` }));
    return onAuthStateChanged(auth, setUser);
  }, []);

  // 2. SINCRONIZACIÓN CLOUD
  useEffect(() => {
    if (!db || !user) return;
    const q = collection(db, 'artifacts', appId, 'public', 'data', 'companies');
    const unsubscribe = onSnapshot(q, (snap) => {
      const docs = snap.docs.map(d => d.data());
      docs.sort((a, b) => getRevenue(b) - getRevenue(a));
      setData(docs);
      setLoading(false);
      if (docs.length > 0) setStatus({ type: 'success', msg: 'TERMINAL ONLINE' });
    }, (err) => {
      setLoading(false);
      setStatus({ type: 'error', msg: 'Error de sincronización.' });
    });
    return () => unsubscribe();
  }, [user]);

  // 3. CARGA DE CSV INTELIGENTE
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
        setStatus({ type: 'success', msg: 'Base de datos actualizada.' });
      } catch (err) { setStatus({ type: 'error', msg: `Error en carga: ${err.message}` }); }
      finally { setUploading(false); }
    };
    reader.readAsText(file);
  };

  // --- LÓGICA DE NEGOCIO AGREGADA ---
  const aggregates = useMemo(() => {
    const totalRev = data.reduce((acc, curr) => acc + getRevenue(curr), 0);
    const totalEbitda = data.reduce((acc, curr) => acc + (cleanValue(curr['EBITDA'])), 0);
    const totalTalent = data.reduce((acc, curr) => acc + (cleanValue(curr['GASTOS DE PERSONAL'])), 0);
    
    const cats = {};
    data.forEach(c => {
      const cat = c['CATEGORÍA'] || 'General';
      if (!cats[cat]) cats[cat] = { count: 0, revenue: 0 };
      cats[cat].count++;
      cats[cat].revenue += getRevenue(c);
    });
    return { totalRev, totalEbitda, totalTalent, cats };
  }, [data]);

  const topFive = useMemo(() => data.slice(0, 5), [data]);
  const categoriesList = useMemo(() => ['Todas', ...new Set(data.map(c => c['CATEGORÍA']).filter(Boolean))], [data]);
  const subcategoriesList = useMemo(() => ['Todas', ...new Set(data.filter(c => selectedCategory === 'Todas' || c['CATEGORÍA'] === selectedCategory).map(c => c['SUBCATEGORÍA']).filter(Boolean))], [data, selectedCategory]);

  const filtered = useMemo(() => {
    return data.filter(c => {
      const s = searchTerm.toLowerCase();
      const mSearch = String(c['DENOMINACIÓN SOCIAL'] || '').toLowerCase().includes(s) || String(c['CIF EMPRESA'] || '').toLowerCase().includes(s) || String(c['ACRONIMO'] || '').toLowerCase().includes(s);
      const mCat = selectedCategory === 'Todas' || c['CATEGORÍA'] === selectedCategory;
      const mSub = selectedSubcategory === 'Todas' || c['SUBCATEGORÍA'] === selectedSubcategory;
      return mSearch && mCat && mSub;
    });
  }, [data, searchTerm, selectedCategory, selectedSubcategory]);

  const similarCompanies = useMemo(() => {
    if (!selectedCompany) return [];
    const currentRev = getRevenue(selectedCompany);
    const currentCat = selectedCompany['CATEGORÍA'];
    return data
      .filter(c => c['CIF EMPRESA'] !== selectedCompany['CIF EMPRESA'])
      .map(c => {
        const cRev = getRevenue(c);
        const score = (Math.abs(currentRev - cRev) / (currentRev || 1)) + (c['CATEGORÍA'] === currentCat ? 0 : 1);
        return { ...c, score };
      })
      .sort((a, b) => a.score - b.score)
      .slice(0, 4);
  }, [selectedCompany, data]);

  return (
    <div className="min-h-screen bg-[#FDFDFD] text-slate-900 font-sans antialiased selection:bg-yellow-100">
      {/* NAVBAR MINIMALISTA */}
      <nav className="bg-black text-white px-6 py-2 border-b border-yellow-400 sticky top-0 z-[60] shadow-sm flex justify-between items-center">
        <div className="flex items-center gap-2">
          <div className="bg-yellow-400 p-1 rounded-sm"><Building2 className="text-black w-3.5 h-3.5" /></div>
          <div className="flex flex-col leading-none">
            <span className="font-black text-sm tracking-tighter uppercase italic">BUD <span className="text-yellow-400">ADVISORS</span></span>
            <span className="text-[6px] tracking-[0.4em] text-slate-500 font-bold uppercase italic">Intelligence Unit</span>
          </div>
        </div>
        <label className="bg-yellow-400 hover:bg-yellow-300 text-black px-2.5 py-1 font-black text-[8px] uppercase tracking-widest cursor-pointer transition-all flex items-center gap-1.5 rounded-sm">
          <Upload className="w-2.5 h-2.5" /> {uploading ? '...' : 'UPLOAD CSV'}
          <input type="file" onChange={handleUpload} className="hidden" accept=".csv" />
        </label>
      </nav>

      {/* MONITOR STATUS */}
      <div className={`py-0.5 text-[6px] font-black uppercase tracking-[0.4em] text-center border-b ${status.type === 'error' ? 'bg-red-600 text-white' : 'bg-slate-50 text-slate-400'}`}>
        {status.msg}
      </div>

      <main className="max-w-6xl mx-auto p-4 lg:p-6">
        
        {/* --- DASHBOARD EJECUTIVO --- */}
        <section className="mb-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <div className="bg-black text-white p-4 border-l-2 border-yellow-400 shadow-sm flex flex-col justify-center overflow-hidden">
              <span className="text-[7px] font-bold text-slate-500 uppercase tracking-widest mb-0.5 italic">Total Market Volume</span>
              <span className="text-lg font-black tabular-nums tracking-tighter truncate leading-none">
                {formatM(aggregates.totalRev)}
              </span>
            </div>
            <div className="bg-white p-4 border-l-2 border-black shadow-sm flex flex-col justify-center overflow-hidden">
              <span className="text-[7px] font-bold text-slate-400 uppercase tracking-widest mb-0.5 italic">Total EBITDA</span>
              <span className="text-lg font-black text-green-600 tabular-nums tracking-tighter truncate leading-none">
                {formatM(aggregates.totalEbitda)}
              </span>
            </div>
            <div className="bg-white p-4 border-l-2 border-slate-200 shadow-sm flex flex-col justify-center overflow-hidden">
              <span className="text-[7px] font-bold text-slate-400 uppercase tracking-widest mb-0.5 italic">Talent Pool Cost</span>
              <span className="text-lg font-black text-slate-900 tabular-nums tracking-tighter truncate leading-none">
                {formatM(Math.abs(aggregates.totalTalent))}
              </span>
            </div>
            <div className="bg-white p-4 border-l-2 border-slate-200 shadow-sm flex items-center justify-between overflow-hidden">
              <span className="text-[7px] font-bold text-slate-400 uppercase tracking-widest italic">Units</span>
              <span className="text-xl font-black text-slate-900 tabular-nums leading-none tracking-tighter">{data.length}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
            {/* DISTRIBUCIÓN POR SECTOR */}
            <div className="lg:col-span-8 bg-white p-5 border border-slate-100 shadow-sm rounded-sm">
              <h3 className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-4 flex items-center gap-2 italic"><PieChart className="w-3 h-3" /> Distribution by Sector</h3>
              <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                {Object.entries(aggregates.cats).sort((a,b) => b[1].revenue - a[1].revenue).slice(0, 6).map(([name, stat]) => (
                  <div key={name} className="flex flex-col">
                    <div className="flex justify-between text-[7px] font-black uppercase mb-1 tracking-tight">
                      <span className="text-slate-600 truncate max-w-[120px]">{name}</span>
                      <span className="tabular-nums text-slate-400">{(aggregates.totalRev > 0 ? (stat.revenue / aggregates.totalRev) * 100 : 0).toFixed(1)}%</span>
                    </div>
                    <div className="w-full bg-slate-50 h-0.5 rounded-full overflow-hidden">
                      <div className="bg-black h-full" style={{width: `${aggregates.totalRev > 0 ? (stat.revenue / aggregates.totalRev) * 100 : 0}%`}}></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {/* RANKING LÍDERES */}
            <div className="lg:col-span-4 bg-slate-900 text-white p-5 shadow-lg rounded-sm overflow-hidden">
              <h3 className="text-[8px] font-black uppercase tracking-widest text-yellow-400 mb-4 flex items-center gap-2 italic"><Trophy className="w-3 h-3" /> Leadership Ranking</h3>
              <div className="space-y-1.5">
                {topFive.map((c, i) => (
                  <div key={i} onClick={() => setSelectedCompany(c)} className="flex items-center justify-between py-1 border-b border-white/5 hover:text-yellow-400 cursor-pointer transition-all group">
                    <div className="flex items-center gap-2">
                      <span className="text-yellow-400 font-bold text-[8px] tabular-nums">0{i+1}</span>
                      <span className="font-bold uppercase text-[8px] tracking-tight truncate max-w-[100px]">{c['ACRONIMO'] || c['DENOMINACIÓN SOCIAL']}</span>
                    </div>
                    <span className="font-black tabular-nums text-[9px] tracking-tighter italic">{formatM(getRevenue(c))}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* --- FILTROS --- */}
        <section className="bg-white p-3 shadow-sm mb-4 border-t border-black rounded-sm flex flex-col md:flex-row gap-2">
          <div className="flex-1 flex items-center gap-2 border-b md:border-b-0 md:border-r border-slate-100 pb-1 md:pb-0 md:pr-2">
            <Search className="text-slate-300 w-3 h-3" />
            <input className="w-full outline-none font-bold text-[10px] placeholder-slate-200 bg-transparent uppercase" placeholder="SEARCH ENTITY / ID..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          </div>
          <select className="text-[8px] font-black uppercase tracking-widest p-1 bg-slate-50 outline-none cursor-pointer border border-transparent hover:border-slate-200 transition-all" value={selectedCategory} onChange={(e) => {setSelectedCategory(e.target.value); setSelectedSubcategory('Todas');}}>
            {categoriesList.map(cat => <option key={cat} value={cat}>{cat}</option>)}
          </select>
        </section>

        {/* --- LISTADO DE CARDS --- */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((c, i) => (
            <div key={i} onClick={() => setSelectedCompany(c)} className="bg-white border border-slate-100 p-4 hover:shadow-md transition-all cursor-pointer border-t-2 hover:border-t-yellow-400 group flex flex-col justify-between min-h-[140px] shadow-sm">
              <div>
                <div className="flex justify-between items-start mb-2">
                   <span className="text-[6px] font-black bg-black text-white px-1.5 py-0.5 uppercase tracking-widest italic">{c['CATEGORÍA'] || 'ENTITY'}</span>
                   <span className="text-yellow-600 font-bold text-[7px] italic">{c['EJERCICIO']}</span>
                </div>
                <h3 className="text-[11px] font-black text-black group-hover:text-yellow-600 transition-colors uppercase leading-tight truncate mb-0.5 tracking-tight">
                  {c['ACRONIMO'] || c['DENOMINACIÓN SOCIAL']}
                </h3>
                <p className="text-slate-300 text-[7px] font-mono uppercase tracking-tighter italic">REF: {c['CIF EMPRESA']}</p>
              </div>
              <div className="flex justify-between items-baseline pt-2 border-t border-slate-50">
                <span className="text-[7px] font-bold text-slate-400 uppercase tracking-widest italic">Net Revenue</span>
                <span className="font-black text-sm tabular-nums tracking-tighter text-slate-900 leading-none">
                  {formatM(getRevenue(c))}
                </span>
              </div>
            </div>
          ))}
        </div>
      </main>

      {/* --- FICHA ESTRATÉGICA (MODAL COMPACTO) --- */}
      {selectedCompany && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-2 overflow-y-auto">
          <div className="bg-white w-full max-w-4xl my-auto shadow-2xl border-t-[6px] border-yellow-400 animate-in zoom-in duration-300 rounded-sm">
            <div className="p-5 md:p-8 text-slate-900">
              
              <div className="flex justify-between items-start mb-6 gap-4">
                <div className="flex-1 overflow-hidden">
                  <span className="bg-black text-yellow-400 text-[7px] font-black px-1.5 py-0.5 uppercase tracking-[0.3em] italic mb-3 inline-block shadow-sm">M&A STRATEGIC REPORT</span>
                  <h2 className="text-xl md:text-2xl font-black tracking-tighter uppercase italic leading-none mb-4 truncate text-black">
                    {selectedCompany['ACRONIMO'] || selectedCompany['DENOMINACIÓN SOCIAL']}
                  </h2>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-slate-400 font-mono text-[7px] border-l border-black pl-4 uppercase">
                    <div className="flex flex-col"><span className="text-black font-black mb-0.5">Corporate Name</span><span className="font-bold truncate">{selectedCompany['DENOMINACIÓN SOCIAL']}</span></div>
                    <div className="flex flex-col"><span className="text-black font-black mb-0.5">Tax ID</span><span className="text-black font-black text-xs tabular-nums">{selectedCompany['CIF EMPRESA']}</span></div>
                    <div className="flex flex-col"><span className="text-black font-black mb-0.5 text-yellow-600">Classification</span><span className="text-yellow-600 font-black text-xs italic">{selectedCompany['CATEGORÍA']}</span></div>
                    <div className="flex flex-col"><span className="text-black font-black mb-0.5">Audit Cycle</span><span className="text-black font-black text-xs">{selectedCompany['EJERCICIO']}</span></div>
                  </div>
                </div>
                <button onClick={() => setSelectedCompany(null)} className="p-2 border border-slate-100 rounded-full hover:bg-slate-50 text-black"><X className="w-4 h-4" /></button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-8">
                {/* FINANZAS M€ */}
                <div className="lg:col-span-8 space-y-8">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    <div className="bg-slate-50 p-3 border-b-2 border-black">
                      <span className="text-[7px] font-black uppercase text-slate-400 block mb-1">Revenue</span>
                      <span className="text-sm font-black tabular-nums tracking-tighter whitespace-nowrap">{formatM(getRevenue(selectedCompany))}</span>
                    </div>
                    <div className="bg-slate-50 p-3 border-b-2 border-yellow-400">
                      <span className="text-[7px] font-black uppercase text-slate-400 block mb-1">EBITDA</span>
                      <span className="text-sm font-black tabular-nums tracking-tighter text-yellow-600 whitespace-nowrap">{formatM(cleanValue(selectedCompany['EBITDA']))}</span>
                    </div>
                    <div className="bg-slate-50 p-3 border-b-2 border-black">
                      <span className="text-[7px] font-black uppercase text-slate-400 block mb-1">Margin %</span>
                      <span className="text-sm font-black tabular-nums tracking-tighter">
                        {getRevenue(selectedCompany) > 0 ? ((cleanValue(selectedCompany['EBITDA']) / getRevenue(selectedCompany)) * 100).toFixed(1) : 0}%
                      </span>
                    </div>
                    <div className="bg-black text-white p-3 border-b-2 border-yellow-400">
                      <span className="text-[7px] font-black uppercase text-slate-500 block mb-1">Net Income</span>
                      <span className="text-sm font-black tabular-nums text-yellow-400 tracking-tighter whitespace-nowrap">{formatM(cleanValue(selectedCompany['RESULTADO DEL EJERCICIO']))}</span>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h4 className="text-xs font-black uppercase border-b border-black pb-1 italic text-black tracking-widest">P&L Account (Full)</h4>
                    <div className="space-y-1 text-[9px] font-bold">
                      <div className="flex justify-between p-2 bg-slate-900 text-white border-l-4 border-yellow-400">
                        <span className="uppercase tracking-widest italic flex items-center gap-2 leading-none">(+) Business Turnover</span>
                        <span className="text-xs font-black tabular-nums italic leading-none">{formatFull(getRevenue(selectedCompany))}</span>
                      </div>
                      <div className="flex justify-between px-3 py-1.5 text-red-600 border-b border-slate-50 italic leading-none">
                        <span className="uppercase tracking-[0.1em]">(-) Personnel Expenditure</span>
                        <span className="tabular-nums font-black leading-none">{formatFull(cleanValue(selectedCompany['GASTOS DE PERSONAL']))}</span>
                      </div>
                      <div className="flex justify-between px-3 py-1.5 text-red-600 border-b border-slate-50 italic leading-none">
                        <span className="uppercase tracking-[0.1em]">(-) Operating Expenses</span>
                        <span className="tabular-nums font-black leading-none">{formatFull(cleanValue(selectedCompany['OTROS GASTOS DE EXPLOTACION']))}</span>
                      </div>
                      <div className="flex justify-between p-3 bg-yellow-400/5 border-x-2 border-yellow-400 items-center leading-none">
                        <span className="font-black text-[10px] uppercase italic tracking-tighter leading-none">(=) Operating EBITDA</span>
                        <span className="text-lg font-black text-yellow-600 tabular-nums tracking-tighter italic leading-none">{formatFull(cleanValue(selectedCompany['EBITDA']))}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* COLUMNA DERECHA RATIOS */}
                <div className="lg:col-span-4 space-y-6">
                  <div className="bg-black text-white p-5 border-l-[6px] border-yellow-400 shadow-md relative overflow-hidden group">
                    <h5 className="text-[8px] font-black uppercase tracking-widest text-yellow-400 mb-4 flex items-center gap-2 italic">
                       <BarChart3 className="w-2.5 h-2.5" /> Performance Index
                    </h5>
                    <div className="space-y-4 relative z-10 font-black">
                      <div className="border-l border-white/20 pl-3">
                        <span className="text-2xl block leading-none mb-0.5 tracking-tighter italic tabular-nums text-white">
                          {getRevenue(selectedCompany) > 0 ? ((Math.abs(cleanValue(selectedCompany['GASTOS DE PERSONAL'])) / getRevenue(selectedCompany)) * 100).toFixed(1) : 0}%
                        </span>
                        <span className="text-[7px] uppercase text-slate-500 tracking-[0.1em] block">Salarial Cost / Revenue</span>
                      </div>
                      <div className="border-l border-yellow-400/30 pl-3">
                        <span className="text-xl block leading-none mb-0.5 tracking-tighter text-yellow-400 italic tabular-nums">
                          {(getRevenue(selectedCompany) > 0 ? (getRevenue(selectedCompany) / (Math.abs(cleanValue(selectedCompany['GASTOS DE PERSONAL'])) || 1)) : 0).toFixed(2)}€
                        </span>
                        <span className="text-[7px] uppercase text-slate-500 tracking-[0.1em] block">Return per Talent Euro</span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-[#FBFBFB] p-5 border-l-[6px] border-slate-100 shadow-sm">
                    <h5 className="text-[7px] font-black uppercase tracking-[0.3em] text-slate-400 mb-3 flex items-center gap-2 italic"><Briefcase className="w-2.5 h-2.5" /> Activity Scope</h5>
                    <p className="text-[9px] leading-relaxed italic font-serif text-slate-600 line-clamp-6">
                      "{String(selectedCompany['OBJETO SOCIAL'] || 'Commercial description not available.')}"
                    </p>
                  </div>
                </div>
              </div>

              {/* PEER ANALYSIS */}
              <div className="pt-6 border-t border-slate-50">
                <div className="flex items-center gap-2 mb-4">
                  <Layers className="w-3.5 h-3.5 text-yellow-500" />
                  <h4 className="text-sm font-black uppercase tracking-tighter italic text-black">Peer Analysis: Comparable Units</h4>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                  {similarCompanies.map((c, i) => (
                    <div key={i} onClick={() => { setSelectedCompany(c); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="bg-white border border-slate-50 p-3 hover:border-yellow-400 hover:shadow-sm transition-all cursor-pointer group flex flex-col justify-between min-h-[80px]">
                      <div>
                        <span className="text-[5px] font-black bg-black text-white px-1 py-0.5 uppercase tracking-widest mb-1 inline-block leading-none italic">{c['CATEGORÍA']}</span>
                        <h5 className="font-black uppercase text-[8px] leading-tight group-hover:text-yellow-600 truncate tracking-tight">{c['ACRONIMO'] || c['DENOMINACIÓN SOCIAL']}</h5>
                      </div>
                      <div className="border-t border-slate-50 mt-2 pt-1.5">
                         <span className="text-[6px] font-black text-slate-400 uppercase block leading-none mb-0.5 italic">Revenue</span>
                         <span className="font-black text-[10px] tabular-nums tracking-tighter text-slate-900 group-hover:text-black leading-none">{formatM(getRevenue(c))}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-8 flex justify-center">
                <button onClick={() => setSelectedCompany(null)} className="bg-black text-white px-8 py-3 font-black uppercase tracking-[0.5em] text-[8px] hover:bg-yellow-400 hover:text-black transition-all shadow-md active:scale-95 border-b-2 border-yellow-600 rounded-sm">CLOSE REPORT</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}