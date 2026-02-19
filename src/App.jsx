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
const appId = "bud_market_intelligence_final_v7"; // Nueva versión estable

// --- UTILIDADES DE FORMATO ---
const formatCurrency = (v) => {
  if (v === undefined || v === null || isNaN(v)) return '-';
  return new Intl.NumberFormat('es-ES', { 
    style: 'currency', 
    currency: 'EUR', 
    maximumFractionDigits: 0 
  }).format(v);
};

const cleanValue = (val) => {
  if (val === undefined || val === null) return 0;
  if (typeof val === 'number') return val;
  const cleaned = val.toString()
    .replace(/[€\s%]/g, '')
    .replace(/\./g, '')
    .replace(',', '.');
  return parseFloat(cleaned) || 0;
};

export default function App() {
  const [data, setData] = useState([]);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState({ type: 'info', msg: 'Sincronizando Hub de Inteligencia...' });
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Todas');
  const [selectedSubcategory, setSelectedSubcategory] = useState('Todas');
  const [selectedCompany, setSelectedCompany] = useState(null);

  // 1. AUTENTICACIÓN
  useEffect(() => {
    if (!auth) {
      setStatus({ type: 'error', msg: 'Falta VITE_FIREBASE_CONFIG en Netlify.' });
      setLoading(false);
      return;
    }
    signInAnonymously(auth).catch(err => setStatus({ type: 'error', msg: `Error Auth: ${err.message}` }));
    return onAuthStateChanged(auth, setUser);
  }, []);

  // 2. SINCRONIZACIÓN DE DATOS
  useEffect(() => {
    if (!db || !user) return;
    const q = collection(db, 'artifacts', appId, 'public', 'data', 'companies');
    const unsubscribe = onSnapshot(q, (snap) => {
      const docs = snap.docs.map(d => d.data());
      // Ordenar por volumen de negocio
      docs.sort((a, b) => cleanValue(b['IMPORTE NETO DE LA CIFRA DE NEGOCIOS']) - cleanValue(a['IMPORTE NETO DE LA CIFRA DE NEGOCIO']));
      setData(docs);
      setLoading(false);
      if (docs.length > 0) setStatus({ type: 'success', msg: 'SISTEMA ONLINE - Inteligencia Activa' });
    }, (err) => {
      setLoading(false);
      setStatus({ type: 'error', msg: 'Error de acceso a la base de datos cloud.' });
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
            const isNumeric = ['IMPORTE', 'GASTOS', 'EBITDA', 'RESULTADO', 'ACTIVO', 'PASIVO', 'PATRIMONIO', 'AMORTIZACION'].some(k => h.toUpperCase().includes(k));
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

  // --- LÓGICA DE NEGOCIO AGREGADA ---
  const aggregates = useMemo(() => {
    const totalRev = data.reduce((acc, curr) => acc + (cleanValue(curr['IMPORTE NETO DE LA CIFRA DE NEGOCIO'])), 0);
    const totalEbitda = data.reduce((acc, curr) => acc + (cleanValue(curr['EBITDA'])), 0);
    const totalTalent = data.reduce((acc, curr) => acc + (cleanValue(curr['GASTOS DE PERSONAL'])), 0);
    
    const cats = {};
    data.forEach(c => {
      const cat = c['CATEGORÍA'] || 'General';
      if (!cats[cat]) cats[cat] = { count: 0, revenue: 0 };
      cats[cat].count++;
      cats[cat].revenue += cleanValue(c['IMPORTE NETO DE LA CIFRA DE NEGOCIO']);
    });

    return { totalRev, totalEbitda, totalTalent, cats };
  }, [data]);

  // --- LÓGICA DE SIMILITUD (PEER ANALYSIS) ---
  const similarCompanies = useMemo(() => {
    if (!selectedCompany) return [];
    const currentRev = cleanValue(selectedCompany['IMPORTE NETO DE LA CIFRA DE NEGOCIO']);
    const currentCat = selectedCompany['CATEGORÍA'];
    
    return data
      .filter(c => c['CIF EMPRESA'] !== selectedCompany['CIF EMPRESA'])
      .map(c => {
        const cRev = cleanValue(c['IMPORTE NETO DE LA CIFRA DE NEGOCIO']);
        const revDiff = Math.abs(currentRev - cRev) / (currentRev || 1);
        const catMatch = c['CATEGORÍA'] === currentCat ? 0 : 1;
        // Scoring: 70% peso facturación (tamaño/vida), 30% sector
        const score = (revDiff * 0.7) + (catMatch * 0.3);
        return { ...c, similarityScore: score };
      })
      .sort((a, b) => a.similarityScore - b.similarityScore)
      .slice(0, 4);
  }, [selectedCompany, data]);

  const topTen = useMemo(() => data.slice(0, 10), [data]);
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

  return (
    <div className="min-h-screen bg-[#FDFDFD] text-slate-900 font-sans selection:bg-yellow-200">
      {/* NAVBAR */}
      <nav className="bg-black text-white p-6 border-b-4 border-yellow-400 sticky top-0 z-[60] shadow-2xl flex justify-between items-center">
        <div className="flex items-center gap-4">
          <div className="bg-yellow-400 p-2 rounded shadow-inner animate-pulse"><Building2 className="text-black w-6 h-6" /></div>
          <div className="flex flex-col leading-none">
            <span className="font-black text-2xl tracking-tighter uppercase italic">BUD <span className="text-yellow-400 font-black">ADVISORS</span></span>
            <span className="text-[10px] tracking-[0.4em] text-slate-400 font-bold uppercase mt-1 italic">Intelligence Hub</span>
          </div>
        </div>
        <label className={`bg-yellow-400 hover:bg-yellow-300 text-black px-6 py-3 font-black text-xs uppercase tracking-widest cursor-pointer transition-all flex items-center gap-2 shadow-lg ${uploading ? 'opacity-50' : ''}`}>
          <Upload className="w-4 h-4" /> {uploading ? 'SINCRONIZANDO...' : 'ACTUALIZAR NUBE'}
          <input type="file" onChange={handleUpload} className="hidden" accept=".csv" disabled={uploading} />
        </label>
      </nav>

      {/* BARRA DE ESTADO */}
      <div className={`p-2.5 text-[10px] font-black uppercase tracking-[0.2em] text-center border-b transition-all duration-700 ${status.type === 'error' ? 'bg-red-600 text-white' : status.type === 'success' ? 'bg-green-600 text-white' : 'bg-blue-600 text-white'}`}>
        <div className="flex items-center justify-center gap-2">
          {status.type === 'error' ? <AlertCircle className="w-3 h-3" /> : <ShieldCheck className="w-3 h-3" />} {status.msg}
        </div>
      </div>

      <main className="max-w-7xl mx-auto p-8">
        
        {/* --- FRONT: RADAR DE MERCADO AGREGADO --- */}
        <section className="mb-20 animate-in fade-in slide-in-from-bottom-4 duration-700">
          <div className="flex items-center gap-3 mb-10 border-b-2 border-black pb-4">
            <LayoutDashboard className="w-6 h-6 text-black" />
            <h2 className="text-lg font-black uppercase tracking-[0.2em] italic">Radar Sectorial BUD Advisors</h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-12">
            <div className="bg-black text-white p-10 border-l-[12px] border-yellow-400 shadow-xl relative overflow-hidden group">
              <DollarSign className="absolute -right-4 -bottom-4 w-28 h-28 text-white/5 group-hover:scale-110 transition-transform" />
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-3">Volumen Negocio Agregado</span>
              <span className="text-3xl lg:text-5xl font-black block tabular-nums tracking-tighter truncate leading-none">
                {formatCurrency(aggregates.totalRev)}
              </span>
            </div>
            
            <div className="bg-white p-10 border-l-[12px] border-black shadow-lg group">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-3">Rentabilidad (EBITDA)</span>
              <span className="text-3xl lg:text-4xl font-black block text-green-600 tabular-nums tracking-tighter truncate">
                {formatCurrency(aggregates.totalEbitda)}
              </span>
              <span className="text-[9px] font-black text-slate-400 uppercase mt-4 block tracking-[0.2em] italic">
                MARGEN MEDIO: {((aggregates.totalEbitda / (aggregates.totalRev || 1)) * 100).toFixed(1)}%
              </span>
            </div>

            <div className="bg-white p-10 border-l-[12px] border-slate-200 shadow-lg">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-3">Talent Pool / Salarios</span>
              <span className="text-3xl lg:text-4xl font-black block text-slate-900 tabular-nums tracking-tighter truncate">
                {formatCurrency(Math.abs(aggregates.totalTalent))}
              </span>
              <div className="w-full bg-slate-100 h-1.5 mt-5 rounded-full overflow-hidden">
                <div className="bg-blue-600 h-full" style={{width: `${Math.min(100, (Math.abs(aggregates.totalTalent)/(aggregates.totalRev || 1))*100)}%`}}></div>
              </div>
            </div>

            <div className="bg-white p-10 border-l-[12px] border-slate-200 shadow-lg flex flex-col justify-center">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-3 text-center">Entidades HUB</span>
              <span className="text-6xl font-black block text-slate-900 tabular-nums text-center leading-none tracking-tighter">{data.length}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
            {/* CUOTA POR SECTOR */}
            <div className="bg-white p-12 border border-slate-100 shadow-xl rounded-sm">
              <h3 className="text-[12px] font-black uppercase tracking-[0.3em] text-slate-400 mb-10 flex items-center gap-4"><PieChart className="w-5 h-5" /> Distribución de Negocio por Sector</h3>
              <div className="space-y-8">
                {Object.entries(aggregates.cats).sort((a,b) => b[1].revenue - a[1].revenue).slice(0, 5).map(([name, stat]) => (
                  <div key={name} className="group">
                    <div className="flex justify-between text-[11px] font-black uppercase mb-3 tracking-widest">
                      <span className="text-slate-800 italic">{name}</span>
                      <span className="tabular-nums text-slate-500">{((stat.revenue / (aggregates.totalRev || 1)) * 100).toFixed(1)}%</span>
                    </div>
                    <div className="w-full bg-slate-50 h-3 border border-slate-100 rounded-full overflow-hidden">
                      <div className="bg-black h-full group-hover:bg-yellow-400 transition-all duration-500" style={{width: `${(stat.revenue / (aggregates.totalRev || 1)) * 100}%`}}></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {/* TOP 5 LIDERAZGO */}
            <div className="bg-black text-white p-12 shadow-2xl rounded-sm relative overflow-hidden">
              <h3 className="text-[12px] font-black uppercase tracking-[0.3em] text-yellow-400 mb-10 flex items-center gap-4"><Trophy className="w-5 h-5" /> Ranking Liderazgo Facturación</h3>
              <div className="space-y-6">
                {topTen.slice(0, 5).map((c, i) => (
                  <div key={i} onClick={() => setSelectedCompany(c)} className="flex items-center justify-between p-5 border-b border-white/10 hover:bg-white/5 cursor-pointer transition-all rounded-sm group">
                    <div className="flex items-center gap-6">
                      <span className="text-yellow-400 font-black italic tabular-nums text-2xl">0{i+1}</span>
                      <span className="font-bold uppercase text-sm tracking-[0.1em] group-hover:text-yellow-400 transition-colors truncate max-w-[200px]">{c['ACRONIMO'] || c['DENOMINACIÓN SOCIAL']}</span>
                    </div>
                    <span className="font-black tabular-nums text-xl tracking-tighter shrink-0">{formatCurrency(c['IMPORTE NETO DE LA CIFRA DE NEGOCIO'])}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* --- FILTROS DE BÚSQUEDA --- */}
        <section className="bg-white p-10 shadow-2xl mb-12 border-t-[12px] border-black rounded-sm">
          <div className="flex items-center gap-6 border-b-4 border-slate-100 pb-8 mb-10 group">
            <Search className="text-slate-300 transition-all w-12 h-12" />
            <input className="w-full outline-none font-black text-3xl lg:text-5xl placeholder-slate-200 bg-transparent uppercase tracking-tighter" placeholder="Localizar Agencia o CIF..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
            <div className="flex flex-col gap-3">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.4em] flex items-center gap-2"><Filter className="w-4 h-4" /> Sector</span>
              <select className="w-full p-6 bg-slate-50 border-2 border-transparent focus:border-yellow-400 outline-none font-bold uppercase tracking-widest shadow-inner cursor-pointer" value={selectedCategory} onChange={(e) => {setSelectedCategory(e.target.value); setSelectedSubcategory('Todas');}}>
                {categoriesList.map(cat => <option key={cat} value={cat}>{cat}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-3">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.4em] flex items-center gap-2"><Target className="w-4 h-4" /> Especialidad</span>
              <select className="w-full p-6 bg-slate-50 border-2 border-transparent focus:border-yellow-400 outline-none font-bold uppercase tracking-widest shadow-inner cursor-pointer disabled:opacity-30" value={selectedSubcategory} onChange={(e) => setSelectedSubcategory(e.target.value)} disabled={selectedCategory === 'Todas'}>
                {subcategoriesList.map(sub => <option key={sub} value={sub}>{sub}</option>)}
              </select>
            </div>
          </div>
        </section>

        {/* --- LISTADO DE CARDS --- */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
          {filtered.map((c, i) => (
            <div key={i} onClick={() => setSelectedCompany(c)} className="bg-white border border-slate-100 p-12 hover:shadow-2xl transition-all cursor-pointer border-t-[8px] hover:border-t-yellow-400 group relative shadow-lg overflow-hidden flex flex-col justify-between min-h-[380px]">
              <div>
                <div className="flex justify-between items-start mb-10">
                   <span className="text-[10px] font-black bg-black text-white px-3 py-1 uppercase tracking-widest">{c['CATEGORÍA'] || 'CORPORACIÓN'}</span>
                   <span className="text-yellow-600 font-black text-[10px] italic bg-yellow-50 px-3 py-1 rounded-sm border border-yellow-100 shadow-sm">{c['EJERCICIO']}</span>
                </div>
                <h3 className="text-3xl font-black text-black group-hover:text-yellow-600 transition-colors uppercase leading-[1.1] mb-6 tracking-tighter">
                  {c['ACRONIMO'] || c['DENOMINACIÓN SOCIAL']}
                </h3>
                <p className="text-slate-400 text-[12px] font-mono mb-12 flex items-center gap-2 border-b border-slate-50 pb-6 uppercase italic tracking-[0.1em]">
                  CIF: {c['CIF EMPRESA']}
                </p>
              </div>
              <div className="flex justify-between items-baseline pt-6">
                <span className="text-[11px] font-black text-slate-400 uppercase tracking-[0.3em] italic">Ventas Netas</span>
                <span className="font-black text-4xl tabular-nums tracking-tighter shrink-0 group-hover:scale-105 transition-transform duration-500">
                  {formatCurrency(c['IMPORTE NETO DE LA CIFRA DE NEGOCIO'])}
                </span>
              </div>
            </div>
          ))}
        </div>
      </main>

      {/* --- FICHA ESTRATÉGICA (MODAL) --- */}
      {selectedCompany && (
        <div className="fixed inset-0 bg-black/98 backdrop-blur-3xl z-[100] flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-7xl my-auto shadow-2xl border-t-[20px] border-yellow-400 animate-in fade-in zoom-in duration-500 rounded-sm">
            <div className="p-8 md:p-24 text-slate-900">
              
              {/* CABECERA EXPEDIENTE */}
              <div className="flex justify-between items-start mb-24 gap-12">
                <div className="flex-1">
                  <div className="flex items-center gap-5 mb-10">
                    <span className="bg-black text-yellow-400 text-[12px] font-black px-6 py-2 uppercase tracking-[0.5em] shadow-2xl italic">REPORT ESTRATÉGICO M&A</span>
                    <Activity className="w-8 h-8 text-yellow-500 animate-pulse" />
                  </div>
                  <h2 className="text-6xl md:text-9xl font-black tracking-tighter uppercase leading-[0.85] mb-12 italic drop-shadow-sm truncate max-w-full">
                    {selectedCompany['ACRONIMO'] || selectedCompany['DENOMINACIÓN SOCIAL']}
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-16 text-slate-500 font-mono text-[10px] border-l-[15px] border-black pl-16 uppercase py-4">
                    <div className="flex flex-col"><span className="text-black font-black mb-2 tracking-[0.2em]">Entidad Legal</span><span className="font-bold text-sm text-slate-800 leading-tight">{selectedCompany['DENOMINACIÓN SOCIAL']}</span></div>
                    <div className="flex flex-col"><span className="text-black font-black mb-2 tracking-[0.2em]">Identificador</span><span className="text-black font-black text-3xl tabular-nums tracking-widest">{selectedCompany['CIF EMPRESA']}</span></div>
                    <div className="flex flex-col"><span className="text-black font-black mb-2 tracking-[0.2em]">Ecosistema</span><span className="text-yellow-600 font-black text-3xl italic tracking-tighter">{selectedCompany['CATEGORÍA']}</span></div>
                    <div className="flex flex-col"><span className="text-black font-black mb-2 tracking-[0.2em]">Auditoría</span><span className="text-black font-black text-3xl italic tabular-nums">{selectedCompany['EJERCICIO']}</span></div>
                  </div>
                </div>
                <button onClick={() => setSelectedCompany(null)} className="p-10 border-4 border-slate-100 rounded-full hover:bg-slate-100 transition-all text-black hover:rotate-90 shadow-2xl bg-white sticky top-0"><X className="w-16 h-16" /></button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-24">
                {/* COLUMNA IZQUIERDA: P&L Y BALANCE */}
                <div className="lg:col-span-8 space-y-24">
                  
                  {/* KPI BOXES */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
                    <div className="bg-slate-50 p-12 border-b-[12px] border-black shadow-xl rounded-sm">
                      <span className="text-[11px] font-black uppercase text-slate-400 block mb-6 tracking-widest">Facturación</span>
                      <span className="text-4xl font-black tabular-nums tracking-tighter block truncate italic">
                        {formatCurrency(selectedCompany['IMPORTE NETO DE LA CIFRA DE NEGOCIO'])}
                      </span>
                    </div>
                    <div className="bg-slate-50 p-12 border-b-[12px] border-yellow-400 shadow-xl rounded-sm">
                      <span className="text-[11px] font-black uppercase text-slate-400 block mb-6 tracking-widest">EBITDA</span>
                      <span className="text-4xl font-black tabular-nums tracking-tighter text-yellow-600 block truncate italic">
                        {formatCurrency(selectedCompany['EBITDA'])}
                      </span>
                    </div>
                    <div className="bg-slate-50 p-12 border-b-[12px] border-black shadow-xl rounded-sm">
                      <span className="text-[11px] font-black uppercase text-slate-400 block mb-6 tracking-widest">M. EBITDA</span>
                      <span className="text-4xl font-black tabular-nums tracking-tighter block italic underline decoration-yellow-400">
                        {((cleanValue(selectedCompany['EBITDA']) / (cleanValue(selectedCompany['IMPORTE NETO DE LA CIFRA DE NEGOCIO']) || 1)) * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="bg-black text-white p-12 border-b-[12px] border-yellow-400 shadow-2xl rounded-sm overflow-hidden">
                      <span className="text-[11px] font-black uppercase text-slate-400 block mb-6 tracking-widest">Resultado</span>
                      <span className="text-4xl font-black tabular-nums tracking-tighter text-yellow-400 block truncate">
                        {formatCurrency(selectedCompany['RESULTADO DEL EJERCICIO'])}
                      </span>
                    </div>
                  </div>

                  {/* CASCADA P&L */}
                  <div className="space-y-12">
                    <h4 className="text-4xl font-black uppercase border-b-[15px] border-black pb-6 flex justify-between items-end italic">
                      <span>Análisis de Explotación Consolidada</span>
                      <span className="text-[12px] text-slate-400 tracking-[0.6em] font-bold uppercase">EUR</span>
                    </h4>
                    <div className="space-y-6 font-bold text-lg">
                      <div className="flex justify-between p-10 bg-slate-900 text-white rounded-sm shadow-2xl items-center border-l-[20px] border-yellow-400 group">
                        <span className="uppercase tracking-[0.4em] italic flex items-center gap-6 text-xs font-black">
                          <ArrowUpRight className="w-8 h-8 text-yellow-400" /> (+) Ingresos Totales Explotación
                        </span>
                        <span className="text-5xl font-black tabular-nums tracking-tighter italic shrink-0">
                          {formatCurrency(selectedCompany['IMPORTE NETO DE LA CIFRA DE NEGOCIO'])}
                        </span>
                      </div>
                      <div className="flex justify-between px-12 py-8 text-red-600 border-b-4 border-slate-100 italic hover:bg-red-50/20 transition-all">
                        <span className="uppercase text-[14px] tracking-[0.3em] font-black">(-) Costes Directos / Aprovisionamientos</span>
                        <span className="tabular-nums font-black text-3xl tracking-tighter">{formatCurrency(selectedCompany['APROVISIONAMIENTOS'])}</span>
                      </div>
                      <div className="flex justify-between px-12 py-8 text-red-600 border-b-4 border-slate-100 italic hover:bg-red-50/20 transition-all">
                        <span className="uppercase text-[14px] tracking-[0.3em] font-black">(-) Estructura Salarial (Talent Cost)</span>
                        <span className="tabular-nums font-black text-3xl tracking-tighter">{formatCurrency(selectedCompany['GASTOS DE PERSONAL'])}</span>
                      </div>
                      <div className="flex justify-between px-12 py-8 text-red-600 border-b-[12px] border-black italic hover:bg-red-50/20 transition-all">
                        <span className="uppercase text-[14px] tracking-[0.3em] font-black">(-) Otros Gastos de Operación</span>
                        <span className="tabular-nums font-black text-3xl tracking-tighter">{formatCurrency(selectedCompany['OTROS GASTOS DE EXPLOTACION'])}</span>
                      </div>
                      <div className="flex justify-between p-16 bg-yellow-400/10 border-x-[30px] border-yellow-400 my-16 shadow-inner items-center">
                        <div className="flex flex-col">
                          <span className="font-black text-5xl uppercase tracking-tighter italic leading-none">(=) EBITDA Operativo</span>
                          <span className="text-[12px] uppercase font-bold text-slate-500 tracking-[0.3em] mt-5 italic">Caja operativa generada por el negocio</span>
                        </div>
                        <span className="text-8xl font-black text-yellow-600 tabular-nums tracking-tighter shrink-0">{formatCurrency(selectedCompany['EBITDA'])}</span>
                      </div>
                    </div>
                  </div>

                  {/* BALANCE */}
                  <div className="space-y-12">
                    <h4 className="text-4xl font-black uppercase border-b-[15px] border-black pb-6 italic">Balance y Estructura de Capital</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-20">
                      <div className="space-y-8">
                        <span className="text-[12px] font-black uppercase text-slate-400 tracking-[0.5em] flex items-center gap-4 italic"><Wallet className="w-6 h-6 text-black" /> Composición Activo</span>
                        <div className="bg-slate-50 p-12 space-y-10 rounded-sm border-2 border-slate-100 shadow-xl">
                          <div className="flex justify-between border-b-4 border-slate-100 pb-6"><span className="text-xs font-black uppercase tracking-[0.2em] text-slate-500 italic">Activo Circulante</span><span className="font-black text-3xl tabular-nums tracking-tighter">{formatCurrency(selectedCompany['ACTIVO CORRIENTE'])}</span></div>
                          <div className="flex justify-between border-b-4 border-slate-100 pb-6"><span className="text-xs font-black uppercase tracking-[0.2em] text-slate-500 italic">Inmovilizado</span><span className="font-black text-3xl tabular-nums tracking-tighter">{formatCurrency(selectedCompany['ACTIVO NO CORRIENTE'])}</span></div>
                        </div>
                      </div>
                      <div className="space-y-8">
                        <span className="text-[12px] font-black uppercase text-slate-400 tracking-[0.5em] flex items-center gap-4 italic"><ShieldCheck className="w-6 h-6 text-yellow-500" /> Fondos y Pasivos</span>
                        <div className="bg-slate-50 p-12 space-y-10 rounded-sm border-2 border-slate-100 shadow-xl">
                          <div className="flex justify-between border-b-4 border-slate-100 pb-6"><span className="text-xs font-black uppercase tracking-[0.2em] text-slate-500 italic">Deuda Total</span><span className="font-black text-3xl tabular-nums tracking-tighter">{formatCurrency(cleanValue(selectedCompany['PASIVO CORRIENTE']) + cleanValue(selectedCompany['PASIVO NO CORRIENTE']))}</span></div>
                          <div className="flex justify-between border-b-4 border-yellow-400 pb-6 bg-yellow-400/5 px-4 -mx-4"><span className="text-xs font-black uppercase tracking-[0.2em] text-yellow-700 italic">Patrimonio Neto</span><span className="font-black text-3xl tabular-nums text-yellow-700 tracking-tighter">{formatCurrency(selectedCompany['PATRIMONIO NETO'])}</span></div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* COLUMNA DERECHA */}
                <div className="lg:col-span-4 space-y-20">
                  {/* EFICIENCIA TALENTO */}
                  <div className="bg-black text-white p-16 border-l-[25px] border-yellow-400 shadow-2xl relative overflow-hidden group rounded-sm">
                    <Calculator className="absolute -right-16 -bottom-16 w-96 h-96 text-white/5 group-hover:scale-125 transition-all duration-1000 rotate-12" />
                    <h5 className="text-[12px] font-black uppercase tracking-[0.6em] text-yellow-400 mb-20 flex items-center gap-5 italic underline underline-offset-8 decoration-4">
                       <BarChart3 className="w-6 h-6" /> Human Capital Index
                    </h5>
                    <div className="space-y-20 relative z-10">
                      <div className="border-l-4 border-white/20 pl-12 group">
                        <span className="text-8xl font-black block leading-none mb-6 tracking-tighter italic tabular-nums group-hover:text-yellow-400 transition-colors">
                          {((Math.abs(cleanValue(selectedCompany['GASTOS DE PERSONAL'])) / (cleanValue(selectedCompany['IMPORTE NETO DE LA CIFRA DE NEGOCIO']) || 1)) * 100).toFixed(1)}%
                        </span>
                        <span className="text-[12px] uppercase font-black text-slate-400 tracking-[0.5em] block">Ratio Salarial s/ Ventas</span>
                      </div>
                      <div className="border-l-4 border-yellow-400/40 pl-12">
                        <span className="text-5xl font-black block leading-none mb-6 tracking-tighter text-yellow-400 italic tabular-nums">
                          {formatCurrency(cleanValue(selectedCompany['IMPORTE NETO DE LA CIFRA DE NEGOCIO']) / (Math.abs(cleanValue(selectedCompany['GASTOS DE PERSONAL'])) || 1))}
                        </span>
                        <span className="text-[12px] uppercase font-black text-slate-400 tracking-[0.5em] block italic">Efficiency per Talent Euro</span>
                      </div>
                    </div>
                  </div>

                  {/* ACTIVIDAD REGISTRADA */}
                  <div className="bg-[#F8F9FA] p-16 border-l-[25px] border-slate-200 shadow-2xl rounded-sm group">
                    <h5 className="text-[12px] font-black uppercase tracking-[0.6em] text-slate-400 mb-16 flex items-center gap-5">
                       <Briefcase className="w-7 h-7 text-slate-400" /> Visión de Registro
                    </h5>
                    <p className="text-3xl leading-relaxed italic font-serif text-slate-800 font-medium group-hover:text-black transition-colors">
                      "{String(selectedCompany['OBJETO SOCIAL'] || 'Descripción comercial no disponible.')}"
                    </p>
                    <div className="mt-20 pt-14 border-t-4 border-slate-200 flex flex-col gap-10">
                      <div className="flex items-center gap-6 text-slate-400 group cursor-pointer hover:text-black transition-all">
                        <Globe className="w-8 h-8 group-hover:text-yellow-500" />
                        <span className="text-[12px] font-black uppercase tracking-[0.4em] truncate">{selectedCompany['URL'] || 'WEBSITE_PENDING'}</span>
                      </div>
                      <div className="flex items-center gap-6 text-slate-300 italic">
                        <Database className="w-8 h-8" />
                        <span className="text-[12px] font-black uppercase tracking-[0.4em]">CNAE: {selectedCompany['CODIGO CNAE']}</span>
                      </div>
                    </div>
                  </div>

                  {/* ACCIONES */}
                  <div className="grid grid-cols-2 gap-8">
                    <button className="bg-black text-white p-12 font-black uppercase text-[11px] tracking-[0.4em] hover:bg-yellow-400 hover:text-black transition-all shadow-2xl flex flex-col items-center gap-6 group">
                      <ArrowUpRight className="w-10 h-10 group-hover:rotate-45 transition-transform" /> Export M&A
                    </button>
                    <button className="border-4 border-black p-12 font-black uppercase text-[11px] tracking-[0.4em] hover:bg-black hover:text-white transition-all shadow-2xl flex flex-col items-center gap-6">
                      <TrendingDown className="w-10 h-10" /> Benchmarking
                    </button>
                  </div>
                </div>
              </div>

              {/* SECCIÓN: COMPAÑÍAS SIMILARES (PEER ANALYSIS) */}
              <div className="mt-40 pt-24 border-t-8 border-slate-50">
                <div className="flex items-center gap-6 mb-16">
                  <Layers className="w-10 h-10 text-yellow-500" />
                  <h4 className="text-5xl font-black uppercase tracking-tighter italic">Peer Analysis: Compañías Similares</h4>
                </div>
                <div className="bg-slate-50 p-6 mb-12 flex items-center gap-4 border-l-8 border-yellow-400 shadow-sm">
                   <Info className="w-5 h-5 text-yellow-600" />
                   <p className="text-slate-500 text-[11px] font-black uppercase tracking-[0.3em]">Criterio de Similitud: Proximidad de Facturación (+/- 25%) y afinidad de Sector en Ejercicio {selectedCompany['EJERCICIO']}</p>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10">
                  {similarCompanies.map((c, i) => (
                    <div 
                      key={i} 
                      onClick={() => { setSelectedCompany(c); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                      className="bg-white p-10 border-2 border-slate-100 hover:border-yellow-400 hover:shadow-2xl transition-all cursor-pointer group flex flex-col justify-between min-h-[300px] shadow-lg rounded-sm"
                    >
                      <div>
                        <div className="flex justify-between items-start mb-8">
                           <span className="text-[10px] font-black bg-black text-white px-3 py-1 uppercase tracking-widest italic">{c['CATEGORÍA']}</span>
                           <Zap className="w-5 h-5 text-yellow-400 opacity-0 group-hover:opacity-100 transition-all duration-500 group-hover:scale-110" />
                        </div>
                        <h5 className="font-black uppercase text-xl leading-tight mb-4 group-hover:text-yellow-600 transition-colors truncate">{c['ACRONIMO'] || c['DENOMINACIÓN SOCIAL']}</h5>
                        <p className="text-slate-400 text-[10px] font-mono italic tracking-[0.2em]">{c['CIF EMPRESA']}</p>
                      </div>
                      <div className="border-t-2 border-slate-50 pt-8 mt-4">
                         <span className="text-[10px] font-black text-slate-500 uppercase block mb-2 italic">Volumen Negocio</span>
                         <span className="font-black text-2xl tabular-nums tracking-tighter text-slate-900 group-hover:text-black">{formatCurrency(c['IMPORTE NETO DE LA CIFRA DE NEGOCIO'])}</span>
                      </div>
                    </div>
                  ))}
                  {similarCompanies.length === 0 && (
                    <div className="col-span-full py-20 bg-slate-50 border-4 border-dashed border-slate-200 text-center rounded-lg">
                      <span className="text-slate-300 font-black uppercase tracking-[0.4em] text-xl italic">No hay suficientes pares comparables</span>
                    </div>
                  )}
                </div>
              </div>

              {/* CIERRE DE FICHA */}
              <div className="mt-40 flex justify-center pb-32">
                <button 
                  onClick={() => setSelectedCompany(null)} 
                  className="bg-black text-white px-80 py-14 font-black uppercase tracking-[0.9em] text-sm hover:bg-yellow-400 hover:text-black transition-all shadow-2xl active:scale-95 border-b-[25px] border-yellow-600 rounded-sm"
                >
                  Cerrar Expediente Estratégico
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}