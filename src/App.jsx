import React, { useState, useEffect, useMemo } from 'react';
import { 
  Search, Upload, Building2, TrendingUp, Users, 
  BarChart3, Filter, X, Database, AlertCircle, 
  Trophy, LayoutDashboard, CheckCircle2, 
  Target, Briefcase, DollarSign, PieChart, 
  ArrowUpRight, Globe, Fingerprint, Calculator,
  Wallet, ShieldCheck, Activity
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, onSnapshot } from 'firebase/firestore';

// --- CONFIGURACIÓN DE FIREBASE (MANTENIENDO TU ESTRUCTURA ACTUAL) ---
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
const appId = "bud_market_intelligence_v3"; // Nueva versión para evitar conflictos

// --- UTILIDADES DE FORMATO ---
const formatCurrency = (v) => (!v || isNaN(v)) ? '-' : new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v);
const formatPercent = (v) => (!v || isNaN(v)) ? '-' : new Intl.NumberFormat('es-ES', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(v / 100);
const formatNum = (v) => (!v || isNaN(v)) ? '0' : new Intl.NumberFormat('es-ES').format(v);

export default function App() {
  const [data, setData] = useState([]);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState({ type: 'info', msg: 'Sincronizando HUB de Inteligencia...' });
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Todas');
  const [selectedSubcategory, setSelectedSubcategory] = useState('Todas');
  const [selectedCompany, setSelectedCompany] = useState(null);

  // 1. AUTENTICACIÓN
  useEffect(() => {
    if (!auth) {
      setStatus({ type: 'error', msg: 'Configuración de Firebase no detectada.' });
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
      // Ordenar por facturación descendente (Ranking por defecto)
      docs.sort((a, b) => (Number(b['IMPORTE NETO DE LA CIFRA DE NEGOCIOS']) || 0) - (Number(a['IMPORTE NETO DE LA CIFRA DE NEGOCIO']) || 0));
      setData(docs);
      setLoading(false);
    }, (err) => {
      setLoading(false);
      setStatus({ type: 'error', msg: 'Error de acceso a la base de datos.' });
    });
    return () => unsubscribe();
  }, [user]);

  // 3. CARGA DE CSV (ADAPTADA AL FICHERO REAL)
  const handleUpload = (e) => {
    const file = e.target.files[0];
    if (!file || !db || !user) return;
    setUploading(true);
    setStatus({ type: 'info', msg: 'Procesando datos estratégicos...' });
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const text = ev.target.result;
        const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        const delimiter = lines[0].includes(';') ? ';' : ',';
        const headers = lines[0].split(delimiter).map(h => h.trim().replace(/^"|"$/g, ''));
        
        let count = 0;
        for (let i = 1; i < lines.length; i++) {
          const values = lines[i].split(delimiter).map(v => v.trim().replace(/^"|"$/g, ''));
          if (values.length < headers.length) continue;
          const obj = {};
          headers.forEach((h, idx) => {
            let val = values[idx];
            if (val && !isNaN(val.replace(/[€\s.]/g, '').replace(',', '.'))) {
              val = parseFloat(val.replace(/\./g, '').replace(',', '.'));
            }
            obj[h] = val;
          });
          if (obj['CIF EMPRESA']) {
            const docId = String(obj['CIF EMPRESA']).replace(/[^a-zA-Z0-9]/g, '');
            await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'companies', docId), obj);
            count++;
          }
        }
        setStatus({ type: 'success', msg: `¡Éxito! ${count} agencias sincronizadas.` });
      } catch (err) { setStatus({ type: 'error', msg: err.message }); }
      finally { setUploading(false); }
    };
    reader.readAsText(file);
  };

  // --- INTELIGENCIA DE MERCADO (AGREGADOS) ---
  const marketStats = useMemo(() => {
    const totalRev = data.reduce((acc, curr) => acc + (Number(curr['IMPORTE NETO DE LA CIFRA DE NEGOCIOS']) || 0), 0);
    const totalEbitda = data.reduce((acc, curr) => acc + (Number(curr['EBITDA']) || 0), 0);
    const totalTalent = data.reduce((acc, curr) => acc + (Number(curr['GASTOS DE PERSONAL']) || 0), 0);
    const avgMargin = totalRev > 0 ? (totalEbitda / totalRev) * 100 : 0;
    
    const catAnalysis = {};
    data.forEach(c => {
      const cat = c['CATEGORÍA'] || 'Sin clasificar';
      if (!catAnalysis[cat]) catAnalysis[cat] = { count: 0, revenue: 0 };
      catAnalysis[cat].count++;
      catAnalysis[cat].revenue += (Number(c['IMPORTE NETO DE LA CIFRA DE NEGOCIOS']) || 0);
    });

    return { totalRev, totalEbitda, totalTalent, avgMargin, catAnalysis };
  }, [data]);

  const topTen = useMemo(() => data.slice(0, 10), [data]);
  const categories = useMemo(() => ['Todas', ...new Set(data.map(c => c['CATEGORÍA']).filter(Boolean))], [data]);
  const subcategories = useMemo(() => ['Todas', ...new Set(data.filter(c => selectedCategory === 'Todas' || c['CATEGORÍA'] === selectedCategory).map(c => c['SUBCATEGORÍA']).filter(Boolean))], [data, selectedCategory]);

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
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-yellow-100">
      {/* HEADER DE MARCA */}
      <nav className="bg-black text-white p-6 border-b-4 border-yellow-400 sticky top-0 z-[60] shadow-2xl flex justify-between items-center">
        <div className="flex items-center gap-4">
          <div className="bg-yellow-400 p-2 rounded shadow-inner"><Building2 className="text-black w-6 h-6" /></div>
          <div className="flex flex-col leading-none">
            <span className="font-black text-2xl tracking-tighter uppercase italic">BUD <span className="text-yellow-400 font-black">ADVISORS</span></span>
            <span className="text-[10px] tracking-[0.4em] text-gray-400 font-bold uppercase mt-1">Intelligence Hub</span>
          </div>
        </div>
        <label className={`bg-yellow-400 hover:bg-yellow-300 text-black px-6 py-3 font-black text-xs uppercase tracking-widest cursor-pointer transition-all flex items-center gap-2 shadow-lg ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
          <Upload className="w-4 h-4" /> {uploading ? 'PROCESANDO...' : 'CARGAR CSV'}
          <input type="file" onChange={handleUpload} className="hidden" accept=".csv" disabled={uploading} />
        </label>
      </nav>

      <div className={`p-2 text-[10px] font-black uppercase tracking-[0.2em] text-center border-b transition-all duration-700 ${status.type === 'error' ? 'bg-red-600 text-white' : status.type === 'success' ? 'bg-green-600 text-white' : 'bg-blue-600 text-white'}`}>
        <div className="flex items-center justify-center gap-2">
          {status.type === 'error' ? <AlertCircle className="w-3 h-3" /> : <ShieldCheck className="w-3 h-3" />} {status.msg}
        </div>
      </div>

      <main className="max-w-7xl mx-auto p-8">
        
        {/* --- BLOQUE 1: CENTRO DE INTELIGENCIA DE MERCADO (AGREGADOS) --- */}
        <section className="mb-16">
          <div className="flex items-center gap-3 mb-8 border-b-4 border-black pb-3">
            <LayoutDashboard className="w-6 h-6" />
            <h2 className="text-xl font-black uppercase tracking-tighter italic text-black">Radar de Mercado Agregado</h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <div className="bg-black text-white p-8 border-l-[10px] border-yellow-400 shadow-xl relative overflow-hidden group">
              <DollarSign className="absolute -right-4 -bottom-4 w-24 h-24 text-white/5 group-hover:scale-110 transition-transform" />
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-2">Volumen de Negocio Total</span>
              <span className="text-4xl font-black block tabular-nums leading-none tracking-tighter">{formatCurrency(marketStats.totalRev)}</span>
            </div>
            
            <div className="bg-white p-8 border-l-[10px] border-black shadow-lg hover:shadow-2xl transition-all group">
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-2">Rentabilidad Operativa (EBITDA)</span>
              <span className="text-3xl font-black block text-green-600 tabular-nums">{formatCurrency(marketStats.totalEbitda)}</span>
              <span className="text-[10px] font-black text-slate-400 uppercase mt-2 block">Margen Medio: {marketStats.avgMargin.toFixed(1)}%</span>
            </div>

            <div className="bg-white p-8 border-l-[10px] border-slate-200 shadow-lg group">
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-2">Inversión en Talento</span>
              <span className="text-3xl font-black block text-slate-900 tabular-nums">{formatCurrency(Math.abs(marketStats.totalTalent))}</span>
              <div className="w-full bg-slate-100 h-1.5 mt-4 rounded-full overflow-hidden">
                <div className="bg-blue-500 h-full" style={{width: `${Math.min(100, (Math.abs(marketStats.totalTalent)/marketStats.totalRev)*100)}%`}}></div>
              </div>
            </div>

            <div className="bg-white p-8 border-l-[10px] border-slate-200 shadow-lg">
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-2">Densidad de Empresas</span>
              <span className="text-5xl font-black block text-slate-900">{data.length}</span>
              <span className="text-[10px] font-black text-slate-400 uppercase mt-2 block">Agencias en HUB</span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="bg-white p-8 border border-slate-200 shadow-md">
              <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-6 flex items-center gap-2"><PieChart className="w-4 h-4" /> Cuota de Mercado por Categoría</h3>
              <div className="space-y-4">
                {Object.entries(marketStats.catAnalysis).sort((a,b) => b[1].revenue - a[1].revenue).slice(0, 5).map(([name, stat]) => (
                  <div key={name}>
                    <div className="flex justify-between text-[10px] font-black uppercase mb-1">
                      <span>{name}</span>
                      <span>{((stat.revenue / marketStats.totalRev) * 100).toFixed(1)}%</span>
                    </div>
                    <div className="w-full bg-slate-50 h-3 border border-slate-100 rounded-sm">
                      <div className="bg-black h-full" style={{width: `${(stat.revenue / marketStats.totalRev) * 100}%`}}></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-black text-white p-8 shadow-xl">
              <h3 className="text-[11px] font-black uppercase tracking-widest text-yellow-400 mb-6 flex items-center gap-2"><Trophy className="w-4 h-4" /> Top 5 Liderazgo por Facturación</h3>
              <div className="space-y-4">
                {topTen.slice(0, 5).map((c, i) => (
                  <div key={i} onClick={() => setSelectedCompany(c)} className="flex items-center justify-between p-3 border-b border-white/10 hover:bg-white/5 cursor-pointer transition-all">
                    <div className="flex items-center gap-4">
                      <span className="text-yellow-400 font-black italic">#0{i+1}</span>
                      <span className="font-bold uppercase text-sm truncate max-w-[200px]">{c['ACRONIMO'] || c['DENOMINACIÓN SOCIAL']}</span>
                    </div>
                    <span className="font-black tabular-nums">{formatCurrency(c['IMPORTE NETO DE LA CIFRA DE NEGOCIOS'])}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* --- FILTROS DE BÚSQUEDA --- */}
        <section className="bg-white p-10 shadow-2xl mb-12 border-t-[12px] border-black rounded-sm flex flex-col gap-10">
          <div className="flex items-center gap-6 border-b-4 border-gray-100 pb-8 group">
            <Search className="text-gray-300 group-focus-within:text-yellow-500 transition-all w-12 h-12" />
            <input 
              className="w-full outline-none font-black text-4xl placeholder-gray-200 bg-transparent uppercase tracking-tighter"
              placeholder="Identificar Agencia, CIF o Acrónimo..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
            <div className="flex flex-col gap-3">
              <span className="text-[11px] font-black text-gray-400 uppercase tracking-[0.4em] flex items-center gap-2">
                <Filter className="w-3.5 h-3.5" /> Filtrar por Sector Principal
              </span>
              <select 
                className="w-full p-5 bg-slate-50 border-2 border-transparent focus:border-yellow-400 outline-none font-bold text-sm cursor-pointer transition-all uppercase tracking-widest"
                value={selectedCategory} 
                onChange={(e) => {setSelectedCategory(e.target.value); setSelectedSubcategory('Todas');}}
              >
                {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-3">
              <span className="text-[11px] font-black text-gray-400 uppercase tracking-[0.4em] flex items-center gap-2">
                <Target className="w-3.5 h-3.5" /> Especialidad / Subcategoría
              </span>
              <select 
                className="w-full p-5 bg-slate-50 border-2 border-transparent focus:border-yellow-400 outline-none font-bold text-sm cursor-pointer transition-all disabled:opacity-30 uppercase tracking-widest"
                value={selectedSubcategory} 
                onChange={(e) => setSelectedSubcategory(e.target.value)} 
                disabled={selectedCategory === 'Todas'}
              >
                {subcategories.map(sub => <option key={sub} value={sub}>{sub}</option>)}
              </select>
            </div>
          </div>
        </section>

        {/* --- LISTADO DE AGENCIAS --- */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
          {filtered.map((c, i) => (
            <div key={i} onClick={() => setSelectedCompany(c)} className="bg-white border-2 border-slate-100 p-10 hover:shadow-2xl transition-all cursor-pointer border-t-[8px] hover:border-t-yellow-400 group relative">
              <div className="flex justify-between items-start mb-6">
                <span className="text-[10px] font-black bg-black text-white px-3 py-1 uppercase tracking-[0.2em]">
                  {c['CATEGORÍA'] || 'Corporación'}
                </span>
                <span className="text-yellow-500 font-black text-xs italic">{c['EJERCICIO']}</span>
              </div>
              <h3 className="text-2xl font-black text-black group-hover:text-yellow-600 transition-colors uppercase leading-tight mb-4 truncate tracking-tighter">
                {c['ACRONIMO'] || c['DENOMINACIÓN SOCIAL']}
              </h3>
              <p className="text-slate-400 text-[12px] font-mono mb-10 flex items-center gap-2 border-b border-slate-50 pb-4 italic uppercase">
                CIF: {c['CIF EMPRESA']}
              </p>
              <div className="flex justify-between items-baseline pt-4">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.3em]">Cifra de Negocio</span>
                <span className="font-black text-3xl tabular-nums tracking-tighter">{formatCurrency(c['IMPORTE NETO DE LA CIFRA DE NEGOCIOS'])}</span>
              </div>
            </div>
          ))}
        </div>
      </main>

      {/* --- BLOQUE 2: FICHA DE INTELIGENCIA ESTRATÉGICA (MODAL) --- */}
      {selectedCompany && (
        <div className="fixed inset-0 bg-black/98 backdrop-blur-3xl z-[100] flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-7xl my-auto shadow-2xl border-t-[20px] border-yellow-400 animate-in fade-in zoom-in duration-500 rounded-sm">
            <div className="p-8 md:p-16 lg:p-20 text-slate-900">
              
              {/* CABECERA ESTRATÉGICA */}
              <div className="flex justify-between items-start mb-16 gap-8">
                <div className="flex-1">
                  <div className="flex items-center gap-4 mb-8">
                    <span className="bg-black text-yellow-400 text-[12px] font-black px-5 py-2 uppercase tracking-[0.4em] shadow-xl italic">EXPEDIENTE DE INTELIGENCIA</span>
                    <Activity className="w-6 h-6 text-yellow-500 animate-pulse" />
                  </div>
                  <h2 className="text-6xl md:text-8xl font-black tracking-tighter uppercase leading-none mb-8 italic drop-shadow-sm">
                    {selectedCompany['ACRONIMO'] || selectedCompany['DENOMINACIÓN SOCIAL']}
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-8 text-slate-500 font-mono text-xs border-l-8 border-black pl-10 uppercase py-2">
                    <div className="flex flex-col"><span className="text-black font-black mb-1">Denominación Legal</span><span className="font-bold truncate">{selectedCompany['DENOMINACIÓN SOCIAL']}</span></div>
                    <div className="flex flex-col"><span className="text-black font-black mb-1">Identificación CIF</span><span className="text-black font-black text-xl">{selectedCompany['CIF EMPRESA']}</span></div>
                    <div className="flex flex-col"><span className="text-black font-black mb-1">Sector Principal</span><span className="text-yellow-600 font-black text-xl">{selectedCompany['CATEGORÍA']}</span></div>
                    <div className="flex flex-col"><span className="text-black font-black mb-1">Cierre Fiscal</span><span className="text-black font-black text-xl italic">{selectedCompany['EJERCICIO']}</span></div>
                  </div>
                </div>
                <button onClick={() => setSelectedCompany(null)} className="p-6 border-4 border-slate-100 rounded-full hover:bg-slate-100 transition-all text-black hover:rotate-90 group sticky top-0 shadow-lg bg-white">
                  <X className="w-12 h-12 group-hover:scale-110" />
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-16">
                
                {/* COLUMNA IZQUIERDA: P&L Y BALANCE */}
                <div className="lg:col-span-8 space-y-16">
                  
                  {/* EL CORAZÓN FINANCIERO (KPIs) */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    <div className="bg-slate-50 p-8 border-b-8 border-black shadow-md">
                      <span className="text-[10px] font-black uppercase text-slate-400 block mb-2">Ventas Netas</span>
                      <span className="text-3xl font-black tabular-nums tracking-tighter">{formatCurrency(selectedCompany['IMPORTE NETO DE LA CIFRA DE NEGOCIOS'])}</span>
                    </div>
                    <div className="bg-slate-50 p-8 border-b-8 border-yellow-400 shadow-md">
                      <span className="text-[10px] font-black uppercase text-slate-400 block mb-2">EBITDA</span>
                      <span className="text-3xl font-black tabular-nums tracking-tighter text-yellow-600">{formatCurrency(selectedCompany['EBITDA'])}</span>
                    </div>
                    <div className="bg-slate-50 p-8 border-b-8 border-black shadow-md">
                      <span className="text-[10px] font-black uppercase text-slate-400 block mb-2">Margen EBITDA</span>
                      <span className="text-3xl font-black tabular-nums tracking-tighter">
                        {((Number(selectedCompany['EBITDA']) / (Number(selectedCompany['IMPORTE NETO DE LA CIFRA DE NEGOCIOS']) || 1)) * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="bg-black text-white p-8 border-b-8 border-yellow-400 shadow-md">
                      <span className="text-[10px] font-black uppercase text-gray-400 block mb-2">Resultado Neto</span>
                      <span className="text-3xl font-black tabular-nums tracking-tighter text-yellow-400">{formatCurrency(selectedCompany['RESULTADO DEL EJERCICIO'])}</span>
                    </div>
                  </div>

                  {/* CUENTA DE RESULTADOS (P&L DINÁMICO) */}
                  <div className="space-y-8">
                    <h4 className="text-2xl font-black uppercase border-b-8 border-black pb-4 flex justify-between items-end italic">
                      <span>Cuenta de Resultados Consolidada</span>
                      <span className="text-[11px] text-slate-400 tracking-[0.4em] font-bold">MONEDA: EUR</span>
                    </h4>
                    <div className="space-y-3 font-bold text-sm">
                      <div className="flex justify-between p-6 bg-slate-900 text-white rounded shadow-xl">
                        <span className="uppercase tracking-widest italic flex items-center gap-3"><ArrowUpRight className="w-5 h-5 text-yellow-400" /> (+) Importe Neto Cifra de Negocio</span>
                        <span className="text-2xl font-black tabular-nums">{formatCurrency(selectedCompany['IMPORTE NETO DE LA CIFRA DE NEGOCIOS'])}</span>
                      </div>
                      <div className="flex justify-between px-6 py-4 text-red-600 border-b-2 border-slate-100 italic">
                        <span className="uppercase text-[11px] tracking-widest">(-) Aprovisionamientos / Coste Ventas</span>
                        <span className="tabular-nums font-black">{formatCurrency(selectedCompany['APROVISIONAMIENTOS'])}</span>
                      </div>
                      <div className="flex justify-between px-6 py-4 text-red-600 border-b-2 border-slate-100 italic">
                        <span className="uppercase text-[11px] tracking-widest">(-) Gastos de Personal (Estructura)</span>
                        <span className="tabular-nums font-black">{formatCurrency(selectedCompany['GASTOS DE PERSONAL'])}</span>
                      </div>
                      <div className="flex justify-between px-6 py-4 text-red-600 border-b-4 border-black italic">
                        <span className="uppercase text-[11px] tracking-widest">(-) Otros Gastos de Explotación</span>
                        <span className="tabular-nums font-black">{formatCurrency(selectedCompany['OTROS GASTOS DE EXPLOTACION'])}</span>
                      </div>
                      <div className="flex justify-between p-10 bg-yellow-400/10 border-x-[12px] border-yellow-400 my-8 shadow-inner items-center">
                        <div className="flex flex-col">
                          <span className="font-black text-3xl uppercase tracking-tighter italic">(=) EBITDA Operativo</span>
                          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-widest mt-1">Beneficio antes de intereses, tasas, depreciaciones y amortizaciones</span>
                        </div>
                        <span className="text-5xl font-black text-yellow-600 tabular-nums tracking-tighter">{formatCurrency(selectedCompany['EBITDA'])}</span>
                      </div>
                    </div>
                  </div>

                  {/* ESTRUCTURA DE BALANCE (FORTALEZA) */}
                  <div className="space-y-8">
                    <h4 className="text-2xl font-black uppercase border-b-8 border-black pb-4 italic">Solvencia y Estructura de Balance</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                      <div className="space-y-4">
                        <span className="text-[11px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-2"><Wallet className="w-4 h-4" /> Composición del Activo</span>
                        <div className="bg-slate-50 p-6 space-y-4 rounded-sm border border-slate-100">
                          <div className="flex justify-between border-b pb-2"><span className="text-xs font-bold uppercase">Activo Corriente</span><span className="font-black">{formatCurrency(selectedCompany['ACTIVO CORRIENTE'])}</span></div>
                          <div className="flex justify-between border-b pb-2"><span className="text-xs font-bold uppercase">Activo No Corriente</span><span className="font-black">{formatCurrency(selectedCompany['ACTIVO NO CORRIENTE'])}</span></div>
                        </div>
                      </div>
                      <div className="space-y-4">
                        <span className="text-[11px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-2"><ShieldCheck className="w-4 h-4" /> Pasivo y Fondos Propios</span>
                        <div className="bg-slate-50 p-6 space-y-4 rounded-sm border border-slate-100">
                          <div className="flex justify-between border-b pb-2"><span className="text-xs font-bold uppercase">Pasivo Total</span><span className="font-black">{formatCurrency(Number(selectedCompany['PASIVO CORRIENTE']) + Number(selectedCompany['PASIVO NO CORRIENTE']))}</span></div>
                          <div className="flex justify-between border-b pb-2"><span className="text-xs font-bold uppercase text-yellow-600 italic">Patrimonio Neto</span><span className="font-black text-yellow-600">{formatCurrency(selectedCompany['PATRIMONIO NETO'])}</span></div>
                        </div>
                      </div>
                    </div>
                    {/* INDICADOR DE FONDO DE MANIOBRA */}
                    <div className="bg-black text-white p-8 flex justify-between items-center shadow-2xl">
                      <div>
                        <span className="text-[10px] font-black uppercase text-yellow-400 tracking-[0.3em] block mb-1">Fondo de Maniobra (Liquidez)</span>
                        <p className="text-xs text-gray-400 font-bold uppercase italic">Activo Corriente - Pasivo Corriente</p>
                      </div>
                      <span className={`text-4xl font-black tabular-nums ${Number(selectedCompany['ACTIVO CORRIENTE']) - Number(selectedCompany['PASIVO CORRIENTE']) > 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {formatCurrency(Number(selectedCompany['ACTIVO CORRIENTE']) - Number(selectedCompany['PASIVO CORRIENTE']))}
                      </span>
                    </div>
                  </div>
                </div>

                {/* COLUMNA DERECHA: NARRATIVA Y RATIOS EXTRA */}
                <div className="lg:col-span-4 space-y-12">
                  
                  {/* RATIOS ESTRATÉGICOS CALCULADOS */}
                  <div className="bg-black text-white p-12 border-l-[15px] border-yellow-400 shadow-2xl relative overflow-hidden group rounded-sm">
                    <Calculator className="absolute -right-10 -bottom-10 w-60 h-60 text-white/5 group-hover:scale-125 transition-transform duration-1000 rotate-12" />
                    <h5 className="text-[12px] font-black uppercase tracking-[0.5em] text-yellow-400 mb-12 flex items-center gap-3">
                       <BarChart3 className="w-4 h-4" /> Inteligencia de Eficiencia
                    </h5>
                    <div className="space-y-12 relative z-10">
                      <div className="border-l-4 border-white/20 pl-6">
                        <span className="text-6xl font-black block leading-none mb-3 tracking-tighter italic">
                          {((Math.abs(Number(selectedCompany['GASTOS DE PERSONAL'])) / (Number(selectedCompany['IMPORTE NETO DE LA CIFRA DE NEGOCIOS']) || 1)) * 100).toFixed(1)}%
                        </span>
                        <span className="text-[11px] uppercase font-bold text-gray-400 tracking-[0.3em] block">Peso Gastos Personal / Ventas</span>
                      </div>
                      <div className="border-l-4 border-yellow-400/20 pl-6">
                        <span className="text-3xl font-black block leading-none mb-3 tracking-tighter text-yellow-400 italic">
                          {formatCurrency(Number(selectedCompany['IMPORTE NETO DE LA CIFRA DE NEGOCIOS']) / (Math.abs(Number(selectedCompany['GASTOS DE PERSONAL'])) || 1))}
                        </span>
                        <span className="text-[11px] uppercase font-bold text-gray-400 tracking-[0.3em] block">Retorno por € de Personal</span>
                      </div>
                    </div>
                  </div>

                  {/* OBJETO SOCIAL (NARRATIVA) */}
                  <div className="bg-slate-50 p-12 border-l-[15px] border-slate-300 shadow-lg">
                    <h5 className="text-[12px] font-black uppercase tracking-[0.5em] text-slate-400 mb-10 flex items-center gap-3">
                       <Briefcase className="w-5 h-5 text-slate-400" /> Objeto Social Registrado
                    </h5>
                    <p className="text-xl leading-relaxed italic font-serif text-slate-700 font-medium">
                      "{String(selectedCompany['OBJETO SOCIAL'] || 'Descripción comercial no disponible en el registro del último ejercicio consolidado.')}"
                    </p>
                    <div className="mt-8 pt-8 border-t border-slate-200">
                      <div className="flex items-center gap-3 text-slate-400">
                        <Globe className="w-4 h-4" />
                        <span className="text-[10px] font-black uppercase tracking-widest">{selectedCompany['URL'] || 'Web no registrada'}</span>
                      </div>
                    </div>
                  </div>

                  {/* ACCIONES DE EXPEDIENTE */}
                  <div className="grid grid-cols-2 gap-4">
                    <button className="bg-black text-white p-6 font-black uppercase text-xs tracking-widest hover:bg-yellow-400 hover:text-black transition-all flex items-center justify-center gap-3 shadow-xl">
                      <ArrowUpRight className="w-4 h-4" /> Exportar M&A
                    </button>
                    <button className="border-4 border-black p-6 font-black uppercase text-xs tracking-widest hover:bg-black hover:text-white transition-all flex items-center justify-center gap-3 shadow-xl">
                      Comparar Unidad
                    </button>
                  </div>
                </div>
              </div>

              <div className="mt-28 flex justify-center pb-12">
                <button 
                  onClick={() => setSelectedCompany(null)} 
                  className="bg-black text-white px-40 py-10 font-black uppercase tracking-[0.6em] text-sm hover:bg-yellow-400 hover:text-black transition-all shadow-2xl active:scale-95 border-b-[15px] border-yellow-600 rounded-sm"
                >
                  Cerrar Expediente de Inteligencia
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}