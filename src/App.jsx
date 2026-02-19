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
const appId = "bud_intelligence_v9_compact"; 

// --- MOTOR DE LIMPIEZA Y FORMATO ---
const cleanValue = (val) => {
  if (val === undefined || val === null || val === '') return 0;
  if (typeof val === 'number') return val;
  const cleaned = val.toString()
    .replace(/[€\s%]/g, '')
    .replace(/\./g, '')
    .replace(',', '.');
  return parseFloat(cleaned) || 0;
};

// Formatea en k€ (dividido por 1000) para ahorrar espacio
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
  const [status, setStatus] = useState({ type: 'info', msg: 'Sincronizando Terminal...' });
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Todas');
  const [selectedSubcategory, setSelectedSubcategory] = useState('Todas');
  const [selectedCompany, setSelectedCompany] = useState(null);

  // 1. AUTENTICACIÓN
  useEffect(() => {
    if (!auth) {
      setStatus({ type: 'error', msg: 'Falta configuración en Netlify.' });
      setLoading(false);
      return;
    }
    signInAnonymously(auth).catch(err => setStatus({ type: 'error', msg: `Error: ${err.message}` }));
    return onAuthStateChanged(auth, setUser);
  }, []);

  // 2. ESCUCHA DE DATOS (COLUMNAS EXACTAS CSV)
  useEffect(() => {
    if (!db || !user) return;
    const q = collection(db, 'artifacts', appId, 'public', 'data', 'companies');
    const unsubscribe = onSnapshot(q, (snap) => {
      const docs = snap.docs.map(d => d.data());
      // Ordenar por IMPORTE NETO DE LA CIFRA DE NEGOCIOS
      docs.sort((a, b) => cleanValue(b['IMPORTE NETO DE LA CIFRA DE NEGOCIOS']) - cleanValue(a['IMPORTE NETO DE LA CIFRA DE NEGOCIOS']));
      setData(docs);
      setLoading(false);
      if (docs.length > 0) setStatus({ type: 'success', msg: 'TERMINAL ONLINE' });
    }, (err) => {
      setLoading(false);
      setStatus({ type: 'error', msg: 'Fallo en la nube.' });
    });
    return () => unsubscribe();
  }, [user]);

  // 3. CARGA DE CSV
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
      } catch (err) { setStatus({ type: 'error', msg: `Error: ${err.message}` }); }
      finally { setUploading(false); }
    };
    reader.readAsText(file);
  };

  // --- LÓGICA AGREGADA ---
  const aggregates = useMemo(() => {
    const totalRev = data.reduce((acc, curr) => acc + (cleanValue(curr['IMPORTE NETO DE LA CIFRA DE NEGOCIOS'])), 0);
    const totalEbitda = data.reduce((acc, curr) => acc + (cleanValue(curr['EBITDA'])), 0);
    const totalTalent = data.reduce((acc, curr) => acc + (cleanValue(curr['GASTOS DE PERSONAL'])), 0);
    
    const cats = {};
    data.forEach(c => {
      const cat = c['CATEGORÍA'] || 'General';
      if (!cats[cat]) cats[cat] = { count: 0, revenue: 0 };
      cats[cat].count++;
      cats[cat].revenue += cleanValue(c['IMPORTE NETO DE LA CIFRA DE NEGOCIOS']);
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
    const currentRev = cleanValue(selectedCompany['IMPORTE NETO DE LA CIFRA DE NEGOCIOS']);
    const currentCat = selectedCompany['CATEGORÍA'];
    return data
      .filter(c => c['CIF EMPRESA'] !== selectedCompany['CIF EMPRESA'])
      .map(c => {
        const score = (Math.abs(currentRev - cleanValue(c['IMPORTE NETO DE LA CIFRA DE NEGOCIOS'])) / (currentRev || 1)) + (c['CATEGORÍA'] === currentCat ? 0 : 1);
        return { ...c, score };
      })
      .sort((a, b) => a.score - b.score)
      .slice(0, 4);
  }, [selectedCompany, data]);

  return (
    <div className="min-h-screen bg-[#FDFDFD] text-slate-900 font-sans antialiased selection:bg-yellow-100">
      {/* NAVBAR ULTRA-COMPACTO */}
      <nav className="bg-black text-white px-6 py-3 border-b-2 border-yellow-400 sticky top-0 z-[60] shadow-md flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="bg-yellow-400 p-1 rounded-sm"><Building2 className="text-black w-4 h-4" /></div>
          <div className="flex flex-col leading-none">
            <span className="font-black text-lg tracking-tighter uppercase italic">BUD <span className="text-yellow-400">ADVISORS</span></span>
            <span className="text-[7px] tracking-[0.4em] text-slate-400 font-bold uppercase">Market Intelligence</span>
          </div>
        </div>
        <label className="bg-yellow-400 hover:bg-yellow-300 text-black px-3 py-1.5 font-black text-[9px] uppercase tracking-widest cursor-pointer transition-all flex items-center gap-2 rounded-sm">
          <Upload className="w-3 h-3" /> {uploading ? '...' : 'CARGAR CSV'}
          <input type="file" onChange={handleUpload} className="hidden" accept=".csv" />
        </label>
      </nav>

      {/* MONITOR STATUS */}
      <div className={`py-1 text-[7px] font-black uppercase tracking-[0.4em] text-center border-b ${status.type === 'error' ? 'bg-red-600 text-white' : 'bg-slate-50 text-slate-400'}`}>
        {status.msg}
      </div>

      <main className="max-w-6xl mx-auto p-6">
        
        {/* --- DASHBOARD COMPACTO --- */}
        <section className="mb-10">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <div className="bg-black text-white p-5 border-l-4 border-yellow-400 shadow flex flex-col justify-center">
              <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mb-1 italic">V. Negocio Total</span>
              <span className="text-xl font-black tabular-nums tracking-tighter overflow-hidden whitespace-nowrap">
                {formatK(aggregates.totalRev)}
              </span>
            </div>
            <div className="bg-white p-5 border-l-4 border-black shadow flex flex-col justify-center">
              <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest mb-1 italic">EBITDA Agregado</span>
              <span className="text-xl font-black text-green-600 tabular-nums tracking-tighter overflow-hidden whitespace-nowrap">
                {formatK(aggregates.totalEbitda)}
              </span>
            </div>
            <div className="bg-white p-5 border-l-4 border-slate-200 shadow flex flex-col justify-center">
              <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest mb-1 italic">Talento (k€)</span>
              <span className="text-xl font-black text-slate-900 tabular-nums tracking-tighter overflow-hidden whitespace-nowrap">
                {formatK(Math.abs(aggregates.totalTalent))}
              </span>
            </div>
            <div className="bg-white p-5 border-l-4 border-slate-200 shadow flex flex-col justify-center">
              <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest mb-1 italic">Nº Agencias</span>
              <span className="text-2xl font-black text-slate-900 tabular-nums">{data.length}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* DISTRIBUCIÓN POR SECTOR */}
            <div className="lg:col-span-7 bg-white p-6 border border-slate-100 shadow-sm rounded-sm">
              <h3 className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-4 flex items-center gap-2 italic"><PieChart className="w-3 h-3" /> Distribución Sectorial</h3>
              <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                {Object.entries(aggregates.cats).sort((a,b) => b[1].revenue - a[1].revenue).slice(0, 6).map(([name, stat]) => (
                  <div key={name}>
                    <div className="flex justify-between text-[8px] font-black uppercase mb-1 tracking-tight">
                      <span className="text-slate-600 truncate max-w-[100px]">{name}</span>
                      <span className="tabular-nums text-slate-400">{((stat.revenue / (aggregates.totalRev || 1)) * 100).toFixed(1)}%</span>
                    </div>
                    <div className="w-full bg-slate-50 h-1 rounded-full overflow-hidden border border-slate-100">
                      <div className="bg-black h-full" style={{width: `${(stat.revenue / (aggregates.totalRev || 1)) * 100}%`}}></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {/* RANKING LÍDERES */}
            <div className="lg:col-span-5 bg-slate-900 text-white p-6 shadow-xl rounded-sm">
              <h3 className="text-[9px] font-black uppercase tracking-widest text-yellow-400 mb-4 flex items-center gap-2 italic"><Trophy className="w-3 h-3" /> Top Liderazgo</h3>
              <div className="space-y-2">
                {topFive.map((c, i) => (
                  <div key={i} onClick={() => setSelectedCompany(c)} className="flex items-center justify-between py-1.5 border-b border-white/5 hover:text-yellow-400 cursor-pointer transition-all group">
                    <div className="flex items-center gap-2">
                      <span className="text-yellow-400 font-bold text-[9px] tabular-nums">0{i+1}</span>
                      <span className="font-bold uppercase text-[9px] tracking-tight truncate max-w-[120px]">{c['ACRONIMO'] || c['DENOMINACIÓN SOCIAL']}</span>
                    </div>
                    <span className="font-black tabular-nums text-[10px] tracking-tighter italic">{formatK(c['IMPORTE NETO DE LA CIFRA DE NEGOCIO'])}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* --- FILTROS COMPACTOS --- */}
        <section className="bg-white p-4 shadow-sm mb-6 border-t-2 border-black rounded-sm flex flex-col md:flex-row gap-3">
          <div className="flex-1 flex items-center gap-2 border-b md:border-b-0 md:border-r border-slate-100 pb-1 md:pb-0 md:pr-3">
            <Search className="text-slate-300 w-4 h-4" />
            <input className="w-full outline-none font-bold text-xs placeholder-slate-200 bg-transparent uppercase" placeholder="BUSCAR AGENCIA / CIF..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          </div>
          <select className="text-[9px] font-black uppercase tracking-widest p-1.5 bg-slate-50 outline-none cursor-pointer" value={selectedCategory} onChange={(e) => {setSelectedCategory(e.target.value); setSelectedSubcategory('Todas');}}>
            {categoriesList.map(cat => <option key={cat} value={cat}>{cat}</option>)}
          </select>
          <select className="text-[9px] font-black uppercase tracking-widest p-1.5 bg-slate-50 outline-none cursor-pointer disabled:opacity-30" value={selectedSubcategory} onChange={(e) => setSelectedSubcategory(e.target.value)} disabled={selectedCategory === 'Todas'}>
            {subcategoriesList.map(sub => <option key={sub} value={sub}>{sub}</option>)}
          </select>
        </section>

        {/* --- LISTADO DE CARDS --- */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((c, i) => (
            <div key={i} onClick={() => setSelectedCompany(c)} className="bg-white border border-slate-100 p-5 hover:shadow-lg transition-all cursor-pointer border-t-[3px] hover:border-t-yellow-400 group flex flex-col justify-between min-h-[160px] shadow-sm overflow-hidden">
              <div>
                <div className="flex justify-between items-start mb-3">
                   <span className="text-[7px] font-black bg-black text-white px-2 py-0.5 uppercase tracking-widest italic">{c['CATEGORÍA'] || 'EMPRESA'}</span>
                   <span className="text-yellow-600 font-bold text-[8px] italic">{c['EJERCICIO']}</span>
                </div>
                <h3 className="text-sm font-black text-black group-hover:text-yellow-600 transition-colors uppercase leading-tight truncate mb-1 tracking-tight">
                  {c['ACRONIMO'] || c['DENOMINACIÓN SOCIAL']}
                </h3>
                <p className="text-slate-300 text-[8px] font-mono uppercase tracking-tighter italic">ID: {c['CIF EMPRESA']}</p>
              </div>
              <div className="flex justify-between items-baseline pt-3 border-t border-slate-50">
                <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest italic">Ventas (k€)</span>
                <span className="font-black text-lg tabular-nums tracking-tighter text-slate-900">
                  {formatK(c['IMPORTE NETO DE LA CIFRA DE NEGOCIO'])}
                </span>
              </div>
            </div>
          ))}
        </div>
      </main>

      {/* --- FICHA ESTRATÉGICA (MODAL COMPACTO) --- */}
      {selectedCompany && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[100] flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-4xl my-auto shadow-2xl border-t-[8px] border-yellow-400 animate-in zoom-in duration-300 rounded-sm">
            <div className="p-6 md:p-10 text-slate-900">
              
              <div className="flex justify-between items-start mb-8 gap-6">
                <div className="flex-1 overflow-hidden">
                  <span className="bg-black text-yellow-400 text-[8px] font-black px-2 py-0.5 uppercase tracking-[0.3em] italic mb-4 inline-block shadow-sm">REPORT ESTRATÉGICO M&A</span>
                  <h2 className="text-3xl md:text-4xl font-black tracking-tighter uppercase italic leading-none mb-6 truncate text-black">
                    {selectedCompany['ACRONIMO'] || selectedCompany['DENOMINACIÓN SOCIAL']}
                  </h2>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-slate-400 font-mono text-[8px] border-l-2 border-black pl-6 uppercase">
                    <div className="flex flex-col"><span className="text-black font-black mb-0.5 italic">Legal Name</span><span className="font-bold truncate">{selectedCompany['DENOMINACIÓN SOCIAL']}</span></div>
                    <div className="flex flex-col"><span className="text-black font-black mb-0.5 italic">ID Fiscal</span><span className="text-black font-black text-base tabular-nums">{selectedCompany['CIF EMPRESA']}</span></div>
                    <div className="flex flex-col"><span className="text-black font-black mb-0.5 italic text-yellow-600">Sector</span><span className="text-yellow-600 font-black text-base italic">{selectedCompany['CATEGORÍA']}</span></div>
                    <div className="flex flex-col"><span className="text-black font-black mb-0.5 italic">Ejercicio</span><span className="text-black font-black text-base">{selectedCompany['EJERCICIO']}</span></div>
                  </div>
                </div>
                <button onClick={() => setSelectedCompany(null)} className="p-3 border-2 border-slate-100 rounded-full hover:bg-slate-100 text-black shadow-sm"><X className="w-6 h-6" /></button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mb-10">
                {/* FINANZAS k€ */}
                <div className="lg:col-span-8 space-y-10">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-slate-50 p-4 border-b-4 border-black">
                      <span className="text-[8px] font-black uppercase text-slate-400 block mb-1">Ventas</span>
                      <span className="text-lg font-black tabular-nums tracking-tighter whitespace-nowrap">{formatK(selectedCompany['IMPORTE NETO DE LA CIFRA DE NEGOCIO'])}</span>
                    </div>
                    <div className="bg-slate-50 p-4 border-b-4 border-yellow-400">
                      <span className="text-[8px] font-black uppercase text-slate-400 block mb-1">EBITDA</span>
                      <span className="text-lg font-black tabular-nums tracking-tighter text-yellow-600 whitespace-nowrap">{formatK(selectedCompany['EBITDA'])}</span>
                    </div>
                    <div className="bg-slate-50 p-4 border-b-4 border-black text-center">
                      <span className="text-[8px] font-black uppercase text-slate-400 block mb-1 italic">Margen %</span>
                      <span className="text-lg font-black tabular-nums tracking-tighter">
                        {((cleanValue(selectedCompany['EBITDA']) / (cleanValue(selectedCompany['IMPORTE NETO DE LA CIFRA DE NEGOCIO']) || 1)) * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="bg-black text-white p-4 border-b-4 border-yellow-400">
                      <span className="text-[8px] font-black uppercase text-slate-500 block mb-1 italic">Neto Final</span>
                      <span className="text-lg font-black tabular-nums text-yellow-400 tracking-tighter whitespace-nowrap">{formatK(selectedCompany['RESULTADO DEL EJERCICIO'])}</span>
                    </div>
                  </div>

                  <div className="space-y-6">
                    <h4 className="text-lg font-black uppercase border-b-2 border-black pb-1.5 italic text-black">Cuenta de Resultados (k€)</h4>
                    <div className="space-y-1.5 text-[10px] font-bold">
                      <div className="flex justify-between p-3 bg-slate-900 text-white rounded-sm border-l-8 border-yellow-400">
                        <span className="uppercase tracking-widest italic flex items-center gap-2"><ArrowUpRight className="w-3 h-3 text-yellow-400" /> (+) Ingresos Explotación</span>
                        <span className="text-base font-black tabular-nums italic">{formatK(selectedCompany['IMPORTE NETO DE LA CIFRA DE NEGOCIO'])}</span>
                      </div>
                      <div className="flex justify-between px-4 py-2 text-red-600 border-b border-slate-50 italic">
                        <span className="uppercase tracking-[0.1em]">(-) Gastos de Personal</span>
                        <span className="tabular-nums font-black">{formatK(selectedCompany['GASTOS DE PERSONAL'])}</span>
                      </div>
                      <div className="flex justify-between px-4 py-2 text-red-600 border-b border-slate-50 italic">
                        <span className="uppercase tracking-[0.1em]">(-) Otros Gastos Operativos</span>
                        <span className="tabular-nums font-black">{formatK(selectedCompany['OTROS GASTOS DE EXPLOTACION'])}</span>
                      </div>
                      <div className="flex justify-between p-4 bg-yellow-400/5 border-x-4 border-yellow-400 shadow-inner items-center">
                        <span className="font-black text-sm uppercase italic tracking-tighter">(=) EBITDA Operativo</span>
                        <span className="text-2xl font-black text-yellow-600 tabular-nums tracking-tighter italic">{formatK(selectedCompany['EBITDA'])}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* COLUMNA DERECHA RATIOS */}
                <div className="lg:col-span-4 space-y-8">
                  <div className="bg-black text-white p-6 border-l-[8px] border-yellow-400 shadow-md relative overflow-hidden group">
                    <h5 className="text-[9px] font-black uppercase tracking-widest text-yellow-400 mb-6 flex items-center gap-2 italic">
                       <BarChart3 className="w-3 h-3" /> Talent Index
                    </h5>
                    <div className="space-y-6 relative z-10 font-black">
                      <div className="border-l border-white/20 pl-4">
                        <span className="text-4xl block leading-none mb-1 tracking-tighter italic tabular-nums text-white">
                          {((Math.abs(cleanValue(selectedCompany['GASTOS DE PERSONAL'])) / (cleanValue(selectedCompany['IMPORTE NETO DE LA CIFRA DE NEGOCIO']) || 1)) * 100).toFixed(1)}%
                        </span>
                        <span className="text-[8px] uppercase text-slate-500 tracking-[0.2em] block">Peso Salarial s/ Ventas</span>
                      </div>
                      <div className="border-l border-yellow-400/30 pl-4">
                        <span className="text-2xl block leading-none mb-1 tracking-tighter text-yellow-400 italic tabular-nums">
                          {((cleanValue(selectedCompany['IMPORTE NETO DE LA CIFRA DE NEGOCIO']) / (Math.abs(cleanValue(selectedCompany['GASTOS DE PERSONAL'])) || 1))).toFixed(2)}€
                        </span>
                        <span className="text-[8px] uppercase text-slate-500 tracking-[0.2em] block">Retorno por € Invertido</span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-[#FBFBFB] p-6 border-l-[8px] border-slate-100 shadow-sm">
                    <h5 className="text-[8px] font-black uppercase tracking-[0.3em] text-slate-400 mb-4 flex items-center gap-2 italic"><Briefcase className="w-3 h-3" /> Registro de Actividad</h5>
                    <p className="text-[10px] leading-relaxed italic font-serif text-slate-600">
                      "{String(selectedCompany['OBJETO SOCIAL'] || 'Descripción de actividad comercial no disponible.')}"
                    </p>
                  </div>
                </div>
              </div>

              {/* SECCIÓN PEER ANALYSIS */}
              <div className="pt-8 border-t-2 border-slate-50">
                <div className="flex items-center gap-2 mb-6">
                  <Layers className="w-4 h-4 text-yellow-500" />
                  <h4 className="text-lg font-black uppercase tracking-tighter italic text-black">Peer Analysis: Compañías Similares</h4>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {similarCompanies.map((c, i) => (
                    <div key={i} onClick={() => { setSelectedCompany(c); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="bg-white border border-slate-100 p-4 hover:border-yellow-400 hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between min-h-[110px]">
                      <div>
                        <span className="text-[6px] font-black bg-black text-white px-1.5 py-0.5 uppercase tracking-widest mb-2 inline-block">{c['CATEGORÍA']}</span>
                        <h5 className="font-black uppercase text-[10px] leading-tight group-hover:text-yellow-600 truncate">{c['ACRONIMO'] || c['DENOMINACIÓN SOCIAL']}</h5>
                      </div>
                      <div className="border-t border-slate-50 mt-3 pt-2">
                         <span className="text-[7px] font-black text-slate-400 uppercase block mb-0.5 italic">Ventas</span>
                         <span className="font-black text-sm tabular-nums tracking-tighter text-slate-900 group-hover:text-black">{formatK(c['IMPORTE NETO DE LA CIFRA DE NEGOCIO'])}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-12 flex justify-center pb-6">
                <button onClick={() => setSelectedCompany(null)} className="bg-black text-white px-10 py-4 font-black uppercase tracking-[0.5em] text-[10px] hover:bg-yellow-400 hover:text-black transition-all shadow-xl active:scale-95 border-b-4 border-yellow-600 rounded-sm">Cerrar Expediente</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}