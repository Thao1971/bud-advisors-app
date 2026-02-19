import React, { useState, useEffect, useMemo } from 'react';
import { 
  Search, Upload, Building2, TrendingUp, Users, 
  BarChart3, Filter, X, Database, AlertCircle, 
  Trophy, LayoutDashboard, CheckCircle2, 
  Target, Briefcase, DollarSign, PieChart, 
  ArrowUpRight, Globe, Calculator,
  Wallet, ShieldCheck, Activity, TrendingDown,
  Layers, Zap
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
const appId = "bud_market_intelligence_v6"; // Versión actualizada con Similitud

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
    signInAnonymously(auth).catch(err => setStatus({ type: 'error', msg: `Error de Acceso: ${err.message}` }));
    return onAuthStateChanged(auth, setUser);
  }, []);

  // 2. SINCRONIZACIÓN DE DATOS
  useEffect(() => {
    if (!db || !user) return;
    const q = collection(db, 'artifacts', appId, 'public', 'data', 'companies');
    const unsubscribe = onSnapshot(q, (snap) => {
      const docs = snap.docs.map(d => d.data());
      docs.sort((a, b) => cleanValue(b['IMPORTE NETO DE LA CIFRA DE NEGOCIO']) - cleanValue(a['IMPORTE NETO DE LA CIFRA DE NEGOCIO']));
      setData(docs);
      setLoading(false);
      if (docs.length > 0) setStatus({ type: 'success', msg: 'SISTEMA ONLINE - Inteligencia Activa' });
    }, (err) => {
      setLoading(false);
      setStatus({ type: 'error', msg: 'Error al conectar con la base de datos cloud.' });
    });
    return () => unsubscribe();
  }, [user]);

  // 3. CARGA DE CSV (SOPORTE PUNTO Y COMA)
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
        setStatus({ type: 'success', msg: 'Base de datos actualizada correctamente.' });
      } catch (err) { setStatus({ type: 'error', msg: `Error: ${err.message}` }); }
      finally { setUploading(false); }
    };
    reader.readAsText(file);
  };

  // --- LÓGICA AGREGADA ---
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

  // --- LÓGICA DE SIMILITUD ---
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
        // Puntuación: menor es más similar
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
      <nav className="bg-black text-white p-6 border-b-4 border-yellow-400 sticky top-0 z-[60] shadow-2xl flex justify-between items-center">
        <div className="flex items-center gap-4">
          <div className="bg-yellow-400 p-2 rounded shadow-inner animate-pulse"><Building2 className="text-black w-6 h-6" /></div>
          <div className="flex flex-col leading-none">
            <span className="font-black text-2xl tracking-tighter uppercase italic">BUD <span className="text-yellow-400 font-black">ADVISORS</span></span>
            <span className="text-[10px] tracking-[0.4em] text-slate-400 font-bold uppercase mt-1">Intelligence Hub</span>
          </div>
        </div>
        <label className="bg-yellow-400 hover:bg-yellow-300 text-black px-6 py-3 font-black text-xs uppercase tracking-widest cursor-pointer transition-all flex items-center gap-2 shadow-lg">
          <Upload className="w-4 h-4" /> {uploading ? 'SUBIENDO...' : 'ACTUALIZAR DATABASE'}
          <input type="file" onChange={handleUpload} className="hidden" accept=".csv" />
        </label>
      </nav>

      <div className={`p-2.5 text-[10px] font-black uppercase tracking-[0.2em] text-center border-b ${status.type === 'error' ? 'bg-red-600 text-white' : 'bg-blue-600 text-white'}`}>
        {status.msg}
      </div>

      <main className="max-w-7xl mx-auto p-8">
        {/* DASHBOARD AGREGADO */}
        <section className="mb-16">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-12">
            <div className="bg-black text-white p-8 border-l-[10px] border-yellow-400 shadow-xl overflow-hidden group">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-2">Volumen de Negocio HUB</span>
              <span className="text-3xl lg:text-4xl font-black block tabular-nums tracking-tighter truncate">{formatCurrency(aggregates.totalRev)}</span>
            </div>
            <div className="bg-white p-8 border-l-[10px] border-black shadow-lg">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-2">EBITDA Consolidado</span>
              <span className="text-3xl font-black block text-green-600 tabular-nums tracking-tighter truncate">{formatCurrency(aggregates.totalEbitda)}</span>
            </div>
            <div className="bg-white p-8 border-l-[10px] border-slate-200 shadow-lg">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-2">Suma Gastos de Personal</span>
              <span className="text-3xl font-black block text-slate-900 tabular-nums tracking-tighter truncate">{formatCurrency(Math.abs(aggregates.totalTalent))}</span>
            </div>
            <div className="bg-white p-8 border-l-[10px] border-slate-200 shadow-lg text-center">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-2">Empresas Analizadas</span>
              <span className="text-5xl font-black block text-slate-900 tabular-nums">{data.length}</span>
            </div>
          </div>
        </section>

        {/* BUSCADOR */}
        <section className="bg-white p-10 shadow-2xl mb-12 border-t-[12px] border-black rounded-sm">
          <div className="flex items-center gap-6 border-b-4 border-slate-100 pb-8 mb-10 group">
            <Search className="text-slate-300 transition-all w-10 h-10" />
            <input className="w-full outline-none font-black text-3xl placeholder-slate-200 bg-transparent uppercase tracking-tighter" placeholder="Identificar Agencia..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
            <select className="p-5 bg-slate-50 border-2 border-transparent focus:border-yellow-400 outline-none font-bold uppercase" value={selectedCategory} onChange={(e) => {setSelectedCategory(e.target.value); setSelectedSubcategory('Todas');}}>
              {categoriesList.map(cat => <option key={cat} value={cat}>{cat}</option>)}
            </select>
            <select className="p-5 bg-slate-50 border-2 border-transparent focus:border-yellow-400 outline-none font-bold uppercase" value={selectedSubcategory} onChange={(e) => setSelectedSubcategory(e.target.value)} disabled={selectedCategory === 'Todas'}>
              {subcategoriesList.map(sub => <option key={sub} value={sub}>{sub}</option>)}
            </select>
          </div>
        </section>

        {/* LISTADO */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
          {filtered.map((c, i) => (
            <div key={i} onClick={() => setSelectedCompany(c)} className="bg-white border border-slate-100 p-12 hover:shadow-2xl transition-all cursor-pointer border-t-[8px] hover:border-t-yellow-400 group relative shadow-lg">
              <span className="text-[10px] font-black bg-black text-white px-3 py-1 uppercase tracking-widest mb-6 inline-block">{c['CATEGORÍA'] || 'EMPRESA'}</span>
              <h3 className="text-2xl font-black text-black group-hover:text-yellow-600 transition-colors uppercase leading-tight mb-4 truncate tracking-tighter">{c['ACRONIMO'] || c['DENOMINACIÓN SOCIAL']}</h3>
              <p className="text-slate-400 text-[11px] font-mono mb-12 border-b border-slate-50 pb-5 uppercase">CIF: {c['CIF EMPRESA']}</p>
              <div className="flex justify-between items-baseline pt-5">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest italic">Ventas</span>
                <span className="font-black text-3xl tabular-nums tracking-tighter truncate max-w-[200px]">{formatCurrency(c['IMPORTE NETO DE LA CIFRA DE NEGOCIO'])}</span>
              </div>
            </div>
          ))}
        </div>
      </main>

      {/* FICHA INTERNA ESTRATÉGICA */}
      {selectedCompany && (
        <div className="fixed inset-0 bg-black/98 backdrop-blur-3xl z-[100] flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-7xl my-auto shadow-2xl border-t-[20px] border-yellow-400 animate-in fade-in zoom-in duration-500">
            <div className="p-8 md:p-20 text-slate-900">
              
              <div className="flex justify-between items-start mb-20 gap-12">
                <div className="flex-1">
                  <span className="bg-black text-yellow-400 text-[11px] font-black px-5 py-2 uppercase tracking-[0.4em] shadow-xl italic mb-10 inline-block">EXPEDIENTE ESTRATÉGICO M&A</span>
                  <h2 className="text-6xl md:text-8xl font-black tracking-tighter uppercase leading-[0.9] mb-10 italic truncate">{selectedCompany['ACRONIMO'] || selectedCompany['DENOMINACIÓN SOCIAL']}</h2>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-12 text-slate-500 font-mono text-[10px] border-l-[12px] border-black pl-12 uppercase py-3">
                    <div className="flex flex-col"><span className="text-black font-black mb-1">Nombre Legal</span><span className="font-bold text-xs text-slate-800 break-words">{selectedCompany['DENOMINACIÓN SOCIAL']}</span></div>
                    <div className="flex flex-col"><span className="text-black font-black mb-1">CIF</span><span className="text-black font-black text-2xl tabular-nums">{selectedCompany['CIF EMPRESA']}</span></div>
                    <div className="flex flex-col"><span className="text-black font-black mb-1 text-yellow-600">Categorización</span><span className="text-yellow-600 font-black text-2xl italic">{selectedCompany['CATEGORÍA']}</span></div>
                    <div className="flex flex-col"><span className="text-black font-black mb-1">Auditoría</span><span className="text-black font-black text-2xl italic">{selectedCompany['EJERCICIO']}</span></div>
                  </div>
                </div>
                <button onClick={() => setSelectedCompany(null)} className="p-8 border-4 border-slate-100 rounded-full hover:bg-slate-100 shadow-lg bg-white sticky top-0"><X className="w-12 h-12" /></button>
              </div>

              {/* BLOQUE FINANCIERO */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-20">
                <div className="lg:col-span-8 space-y-20">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
                    <div className="bg-slate-50 p-10 border-b-[10px] border-black shadow-xl">
                      <span className="text-[11px] font-black uppercase text-slate-400 block mb-4 tracking-widest italic">Ventas</span>
                      <span className="text-3xl font-black tabular-nums tracking-tighter">{formatCurrency(selectedCompany['IMPORTE NETO DE LA CIFRA DE NEGOCIO'])}</span>
                    </div>
                    <div className="bg-slate-50 p-10 border-b-[10px] border-yellow-400 shadow-xl">
                      <span className="text-[11px] font-black uppercase text-slate-400 block mb-4 tracking-widest italic">EBITDA</span>
                      <span className="text-3xl font-black tabular-nums tracking-tighter text-yellow-600">{formatCurrency(selectedCompany['EBITDA'])}</span>
                    </div>
                    <div className="bg-slate-50 p-10 border-b-[10px] border-black shadow-xl">
                      <span className="text-[11px] font-black uppercase text-slate-400 block mb-4 tracking-widest italic">M. EBITDA</span>
                      <span className="text-3xl font-black tabular-nums tracking-tighter">{((cleanValue(selectedCompany['EBITDA']) / (cleanValue(selectedCompany['IMPORTE NETO DE LA CIFRA DE NEGOCIO']) || 1)) * 100).toFixed(1)}%</span>
                    </div>
                    <div className="bg-black text-white p-10 border-b-[10px] border-yellow-400 shadow-xl">
                      <span className="text-[11px] font-black uppercase text-slate-400 block mb-4 tracking-widest italic">Resultado</span>
                      <span className="text-3xl font-black tabular-nums tracking-tighter text-yellow-400">{formatCurrency(selectedCompany['RESULTADO DEL EJERCICIO'])}</span>
                    </div>
                  </div>

                  <div className="space-y-10">
                    <h4 className="text-3xl font-black uppercase border-b-[12px] border-black pb-5 italic">Cuenta de Resultados (P&L)</h4>
                    <div className="space-y-4 font-bold text-base">
                      <div className="flex justify-between p-8 bg-slate-900 text-white border-l-[15px] border-yellow-400 items-center">
                        <span className="uppercase tracking-[0.3em] italic text-xs font-black">(+) Cifra de Negocio</span>
                        <span className="text-4xl font-black tabular-nums tracking-tighter">{formatCurrency(selectedCompany['IMPORTE NETO DE LA CIFRA DE NEGOCIO'])}</span>
                      </div>
                      <div className="flex justify-between px-10 py-6 text-red-600 border-b-2 border-slate-100 italic">
                        <span className="uppercase text-[12px] tracking-[0.2em] font-black">(-) Aprovisionamientos</span>
                        <span className="tabular-nums font-black text-2xl tracking-tighter">{formatCurrency(selectedCompany['APROVISIONAMIENTOS'])}</span>
                      </div>
                      <div className="flex justify-between px-10 py-6 text-red-600 border-b-2 border-slate-100 italic">
                        <span className="uppercase text-[12px] tracking-[0.2em] font-black">(-) Gastos de Personal</span>
                        <span className="tabular-nums font-black text-2xl tracking-tighter">{formatCurrency(selectedCompany['GASTOS DE PERSONAL'])}</span>
                      </div>
                      <div className="flex justify-between p-12 bg-yellow-400/10 border-x-[25px] border-yellow-400 my-12 shadow-inner">
                        <span className="font-black text-4xl uppercase tracking-tighter italic">(=) EBITDA Operativo</span>
                        <span className="text-6xl font-black text-yellow-600 tabular-nums tracking-tighter">{formatCurrency(selectedCompany['EBITDA'])}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="lg:col-span-4 space-y-16">
                  <div className="bg-black text-white p-14 border-l-[20px] border-yellow-400 shadow-2xl">
                    <h5 className="text-[12px] font-black uppercase tracking-[0.5em] text-yellow-400 mb-16 flex items-center gap-4 italic underline decoration-yellow-400/50 decoration-4 underline-offset-8"><Calculator className="w-5 h-5" /> Inteligencia de Talento</h5>
                    <div className="space-y-16 relative z-10 font-black">
                      <div className="border-l-4 border-white/10 pl-10">
                        <span className="text-7xl block leading-none mb-4 tracking-tighter italic tabular-nums">{((Math.abs(cleanValue(selectedCompany['GASTOS DE PERSONAL'])) / (cleanValue(selectedCompany['IMPORTE NETO DE LA CIFRA DE NEGOCIO']) || 1)) * 100).toFixed(1)}%</span>
                        <span className="text-[11px] uppercase text-slate-400 tracking-[0.4em] block">Carga Salarial / Ventas</span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-[#F8F9FA] p-14 border-l-[20px] border-slate-200 shadow-xl">
                    <h5 className="text-[12px] font-black uppercase tracking-[0.5em] text-slate-400 mb-12 flex items-center gap-4"><Briefcase className="w-6 h-6" /> Registro de Actividad</h5>
                    <p className="text-2xl leading-relaxed italic font-serif text-slate-800 font-medium italic leading-relaxed">"{String(selectedCompany['OBJETO SOCIAL'] || 'Descripción no disponible.')}"</p>
                  </div>
                </div>
              </div>

              {/* SECCIÓN DE COMPAÑÍAS SIMILARES (NUEVO) */}
              <div className="mt-32 pt-20 border-t-8 border-slate-50">
                <div className="flex items-center gap-4 mb-12">
                  <Layers className="w-8 h-8 text-yellow-500" />
                  <h4 className="text-4xl font-black uppercase tracking-tighter italic">Peer Analysis: Compañías Similares</h4>
                </div>
                <p className="text-slate-400 text-xs font-bold uppercase tracking-[0.3em] mb-10 border-l-4 border-yellow-400 pl-4">Similitud calculada por facturación bruta y afinidad de sector (Ejercicio {selectedCompany['EJERCICIO']})</p>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                  {similarCompanies.map((c, i) => (
                    <div 
                      key={i} 
                      onClick={() => { setSelectedCompany(c); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                      className="bg-[#F8F9FA] p-8 border-2 border-transparent hover:border-yellow-400 hover:bg-white transition-all cursor-pointer shadow-lg group flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex justify-between items-start mb-6">
                           <span className="text-[9px] font-black bg-black text-white px-2 py-0.5 uppercase tracking-widest">{c['CATEGORÍA']}</span>
                           <Zap className="w-4 h-4 text-yellow-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                        <h5 className="font-black uppercase text-lg leading-tight mb-4 group-hover:text-yellow-600 transition-colors truncate">{c['ACRONIMO'] || c['DENOMINACIÓN SOCIAL']}</h5>
                        <p className="text-slate-400 text-[10px] font-mono mb-6 italic">{c['CIF EMPRESA']}</p>
                      </div>
                      <div className="border-t border-slate-200 pt-5">
                         <span className="text-[10px] font-black text-slate-500 uppercase block mb-1">Volumen Negocio</span>
                         <span className="font-black text-xl tabular-nums tracking-tighter">{formatCurrency(c['IMPORTE NETO DE LA CIFRA DE NEGOCIO'])}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-40 flex justify-center pb-24">
                <button onClick={() => setSelectedCompany(null)} className="bg-black text-white px-64 py-12 font-black uppercase tracking-[0.8em] text-sm hover:bg-yellow-400 hover:text-black transition-all shadow-2xl active:scale-95 border-b-[20px] border-yellow-600">Cerrar Expediente</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}