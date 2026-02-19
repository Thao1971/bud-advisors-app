import React, { useState, useEffect, useMemo } from 'react';
import { 
  Search, Upload, Building2, TrendingUp, Users, 
  BarChart3, Filter, X, Database, AlertCircle, 
  Trophy, LayoutDashboard, CheckCircle2, 
  Target, Briefcase, DollarSign, PieChart
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, onSnapshot } from 'firebase/firestore';

// --- SISTEMA DE CONFIGURACIÓN DE ALTA DISPONIBILIDAD ---
const getFirebaseConfig = () => {
  let config = null;
  
  // 1. Intentar leer de Netlify (Vite)
  try {
    const env = import.meta.env.VITE_FIREBASE_CONFIG;
    if (env) {
      // Si Netlify entrega un objeto o un string JSON válido
      config = typeof env === 'string' ? JSON.parse(env) : env;
    }
  } catch (e) {
    console.warn("Detección de configuración en fase de reintento...");
  }

  // 2. Intentar leer de variable global (Entorno Canvas/Desarrollo)
  if (!config && typeof __firebase_config !== 'undefined' && __firebase_config) {
    try {
      config = typeof __firebase_config === 'string' ? JSON.parse(__firebase_config) : __firebase_config;
    } catch (e) {}
  }

  return config;
};

const firebaseConfig = getFirebaseConfig();
const app = firebaseConfig ? initializeApp(firebaseConfig) : null;
const auth = app ? getAuth(app) : null;
const db = app ? getFirestore(app) : null;

// ID de aplicación saneado para evitar errores de ruta en Firestore (Regla 1)
const rawAppId = typeof __app_id !== 'undefined' ? __app_id : "bud_advisors_market_intelligence";
const appId = rawAppId.replace(/[^a-zA-Z0-9]/g, '_');

// --- UTILIDADES ---
const formatCurrency = (v) => (!v || isNaN(v)) ? '-' : new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v);

export default function App() {
  const [data, setData] = useState([]);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState({ type: 'info', msg: 'Analizando enlace con Google Cloud...' });
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Todas');
  const [selectedSubcategory, setSelectedSubcategory] = useState('Todas');
  const [selectedCompany, setSelectedCompany] = useState(null);

  // 1. AUTENTICACIÓN (REGLA 3: Auth primero)
  useEffect(() => {
    if (!auth) {
      setStatus({ type: 'error', msg: 'ERROR: Configuración de Firebase no detectada. Revisa la variable VITE_FIREBASE_CONFIG en Netlify.' });
      setLoading(false);
      return;
    }
    signInAnonymously(auth).catch(err => {
      setStatus({ type: 'error', msg: `ERROR DE FIREBASE: ${err.message}` });
      setLoading(false);
    });
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (u) setStatus({ type: 'success', msg: 'SISTEMA ONLINE - Base de Datos Sincronizada' });
    });
  }, []);

  // 2. ESCUCHA DE DATOS (REGLA 1 y 3)
  useEffect(() => {
    if (!db || !user) return;

    // Ruta de 5 segmentos para la colección: artifacts / {id} / public / data / companies
    const q = collection(db, 'artifacts', appId, 'public', 'data', 'companies');
    
    const unsubscribe = onSnapshot(q, 
      (snap) => {
        const docs = snap.docs.map(d => d.data());
        // Ordenar por facturación descendente (Ranking por defecto)
        docs.sort((a, b) => (Number(b['IMPORTEN NETO DE LA CIFRA DE NEGOCIO']) || 0) - (Number(a['IMPORTEN NETO DE LA CIFRA DE NEGOCIO']) || 0));
        setData(docs);
        setLoading(false);
      },
      (err) => {
        setLoading(false);
        if (err.code === 'permission-denied') {
          setStatus({ type: 'error', msg: 'PERMISOS DENEGADOS: Revisa las REGLAS en tu consola de Firebase.' });
        } else {
          setStatus({ type: 'error', msg: `Error Firestore: ${err.message}` });
        }
      }
    );
    return () => unsubscribe();
  }, [user]);

  // 3. CARGA DE DATOS CSV
  const handleUpload = (e) => {
    const file = e.target.files[0];
    if (!file || !db || !user) return;
    
    setUploading(true);
    setStatus({ type: 'info', msg: 'Procesando registros estratégicos...' });
    
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const text = ev.target.result;
        const lines = text.split('\n').filter(l => l.trim());
        if (lines.length < 2) throw new Error("El archivo CSV no contiene datos válidos.");

        const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
        let count = 0;

        for (let i = 1; i < lines.length; i++) {
          const values = lines[i].split(',');
          const obj = {};
          headers.forEach((h, idx) => {
            let val = values[idx]?.trim().replace(/^"|"$/g, '');
            if (val && !isNaN(val.replace(',', '.'))) val = parseFloat(val.replace(',', '.'));
            obj[h] = val;
          });
          
          if (obj['CIF EMPRESA']) {
            const docId = String(obj['CIF EMPRESA']).replace(/[^a-zA-Z0-9]/g, '');
            await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'companies', docId), obj);
            count++;
          }
        }
        setStatus({ type: 'success', msg: `¡Éxito! ${count} agencias actualizadas en el servidor.` });
      } catch (err) {
        setStatus({ type: 'error', msg: `Fallo en carga: ${err.message}` });
      } finally {
        setUploading(false);
      }
    };
    reader.readAsText(file);
  };

  // --- LÓGICA DE NEGOCIO ---
  const stats = useMemo(() => {
    const counts = {};
    let rev2024 = 0;
    data.forEach(c => {
      if (c['CATEGORÍA']) counts[c['CATEGORÍA']] = (counts[c['CATEGORÍA']] || 0) + 1;
      if (String(c['EJERCICIO']) === '2024') {
        rev2024 += (Number(c['IMPORTEN NETO DE LA CIFRA DE NEGOCIO']) || 0);
      }
    });
    return { counts, rev2024 };
  }, [data]);

  const topTen = useMemo(() => data.slice(0, 10), [data]);

  const categories = useMemo(() => ['Todas', ...new Set(data.map(c => c['CATEGORÍA']).filter(Boolean))], [data]);
  const subcategories = useMemo(() => ['Todas', ...new Set(data.filter(c => selectedCategory === 'Todas' || c['CATEGORÍA'] === selectedCategory).map(c => c['SUBCATEGORÍA']).filter(Boolean))], [data, selectedCategory]);

  const filtered = useMemo(() => {
    return data.filter(c => {
      const s = searchTerm.toLowerCase();
      const matchSearch = String(c['DENOMINACIÓN SOCIAL'] || '').toLowerCase().includes(s) || 
                         String(c['CIF EMPRESA'] || '').toLowerCase().includes(s) ||
                         String(c['ACRONIMO'] || '').toLowerCase().includes(s);
      const matchCat = selectedCategory === 'Todas' || c['CATEGORÍA'] === selectedCategory;
      const matchSub = selectedSubcategory === 'Todas' || c['SUBCATEGORÍA'] === selectedSubcategory;
      return matchSearch && matchCat && matchSub;
    });
  }, [data, searchTerm, selectedCategory, selectedSubcategory]);

  return (
    <div className="min-h-screen bg-[#f9f9f9] text-slate-900 font-sans selection:bg-yellow-100">
      {/* NAVEGACIÓN */}
      <nav className="bg-black text-white p-6 border-b-4 border-yellow-400 sticky top-0 z-50 shadow-2xl">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-4">
            <div className="bg-yellow-400 p-2 rounded-sm"><Building2 className="text-black w-6 h-6" /></div>
            <div className="flex flex-col">
              <span className="font-black text-2xl tracking-tighter uppercase leading-none">BUD <span className="text-yellow-400">ADVISORS</span></span>
              <span className="text-[10px] tracking-[0.4em] text-gray-400 font-bold uppercase mt-1">Intelligence Unit</span>
            </div>
          </div>
          <label className={`bg-yellow-400 hover:bg-yellow-300 text-black px-6 py-3 font-black text-xs uppercase tracking-widest cursor-pointer transition-all flex items-center gap-2 shadow-lg hover:scale-105 active:scale-95 ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
            <Upload className="w-4 h-4" />
            {uploading ? 'SINCRONIZANDO...' : 'ACTUALIZAR NUBE'}
            <input type="file" onChange={handleUpload} className="hidden" accept=".csv" disabled={uploading} />
          </label>
        </div>
      </nav>

      {/* MONITOR DE CONEXIÓN */}
      <div className={`p-2.5 text-[10px] font-black uppercase tracking-[0.2em] text-center border-b transition-all duration-700 ${
        status.type === 'error' ? 'bg-red-600 text-white shadow-inner' : 
        status.type === 'success' ? 'bg-green-600 text-white shadow-inner' : 'bg-blue-600 text-white'
      }`}>
        <div className="flex items-center justify-center gap-2">
          {status.type === 'error' ? <AlertCircle className="w-3.5 h-3.5" /> : <Database className="w-3.5 h-3.5" />}
          {status.msg}
        </div>
      </div>

      <main className="max-w-7xl mx-auto p-8">
        
        {/* SECCIÓN 1: DASHBOARD DE MÉTRICAS */}
        <section className="mb-12">
          <div className="flex items-center gap-3 mb-6 border-b-2 border-black pb-2">
            <LayoutDashboard className="w-5 h-5" />
            <h2 className="text-sm font-black uppercase tracking-widest italic">Visión Global de Mercado</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-black text-white p-8 border-l-8 border-yellow-400 shadow-xl flex flex-col justify-center">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-2">Entidades Cargadas</span>
              <div className="flex items-baseline gap-2">
                <span className="text-6xl font-black leading-none">{data.length}</span>
                <span className="text-xs font-bold text-yellow-400 uppercase italic">Unidades</span>
              </div>
            </div>
            <div className="bg-white p-8 border-l-8 border-black shadow-lg flex flex-col justify-center">
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-2">Volumen Total 2024</span>
              <span className="text-2xl font-black text-green-600 tabular-nums">{formatCurrency(stats.rev2024)}</span>
            </div>
            {Object.entries(stats.counts).slice(0, 2).map(([cat, count]) => (
              <div key={cat} className="bg-white p-8 border-l-8 border-gray-200 shadow-lg group hover:border-yellow-400 transition-all">
                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-2 truncate italic">{cat}</span>
                <span className="text-3xl font-black block leading-none">{count} <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Agencias</span></span>
              </div>
            ))}
          </div>
        </section>

        {/* SECCIÓN 2: RANKING TOP 10 LÍDERES */}
        <section className="mb-16">
          <div className="flex items-center gap-3 mb-6 border-b-2 border-black pb-2">
            <Trophy className="w-5 h-5 text-yellow-500" />
            <h2 className="text-sm font-black uppercase tracking-widest italic">Liderazgo por Facturación (Top 10)</h2>
          </div>
          <div className="flex gap-6 overflow-x-auto pb-8 snap-x scrollbar-hide">
            {topTen.map((c, i) => (
              <div 
                key={i} 
                onClick={() => setSelectedCompany(c)}
                className="min-w-[340px] bg-white border-2 border-gray-100 p-8 shadow-md snap-center hover:border-yellow-400 transition-all cursor-pointer group relative overflow-hidden"
              >
                <div className="absolute top-0 right-0 bg-yellow-400 text-black font-black px-3 py-1.5 text-[10px] italic">#{i + 1}</div>
                <span className="text-[9px] font-black bg-black text-white px-2.5 py-1 uppercase tracking-widest mb-4 inline-block">
                  {c['CATEGORÍA']}
                </span>
                <h3 className="font-black uppercase truncate text-xl mb-6 group-hover:text-yellow-600 transition-colors tracking-tighter">
                  {c['ACRONIMO'] || c['DENOMINACIÓN SOCIAL']}
                </h3>
                <div className="flex justify-between items-baseline border-t border-gray-100 pt-5">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Ventas</span>
                  <span className="font-black text-2xl tabular-nums">{formatCurrency(c['IMPORTEN NETO DE LA CIFRA DE NEGOCIO'])}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* SECCIÓN 3: FILTROS E INTELIGENCIA DE BÚSQUEDA */}
        <section className="bg-white p-10 shadow-2xl mb-12 border-t-[12px] border-black rounded-sm flex flex-col gap-10">
          <div className="flex items-center gap-6 border-b-4 border-gray-100 pb-8 group">
            <Search className="text-gray-300 group-focus-within:text-yellow-500 transition-all w-12 h-12" />
            <input 
              className="w-full outline-none font-black text-4xl placeholder-gray-200 bg-transparent uppercase tracking-tighter"
              placeholder="Buscar por Nombre, CIF o Acrónimo comercial..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
            <div className="flex flex-col gap-3">
              <span className="text-[11px] font-black text-gray-400 uppercase tracking-[0.4em] flex items-center gap-2">
                <Filter className="w-3.5 h-3.5 text-yellow-500" /> Sector de Negocio
              </span>
              <select 
                className="w-full p-5 bg-gray-50 border-2 border-transparent focus:border-yellow-400 outline-none font-bold text-sm cursor-pointer transition-all appearance-none uppercase tracking-widest shadow-inner"
                value={selectedCategory} 
                onChange={(e) => {setSelectedCategory(e.target.value); setSelectedSubcategory('Todas');}}
              >
                {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-3">
              <span className="text-[11px] font-black text-gray-400 uppercase tracking-[0.4em] flex items-center gap-2">
                <Filter className="w-3.5 h-3.5 text-yellow-500" /> Especialidad de la Unidad
              </span>
              <select 
                className="w-full p-5 bg-gray-50 border-2 border-transparent focus:border-yellow-400 outline-none font-bold text-sm cursor-pointer transition-all disabled:opacity-30 appearance-none uppercase tracking-widest shadow-inner"
                value={selectedSubcategory} 
                onChange={(e) => setSelectedSubcategory(e.target.value)} 
                disabled={selectedCategory === 'Todas'}
              >
                {subcategories.map(sub => <option key={sub} value={sub}>{sub}</option>)}
              </select>
            </div>
          </div>
        </section>

        {/* SECCIÓN 4: LISTADO TÁCTICO */}
        <div className="flex justify-between items-end mb-10 border-b-2 border-black pb-4">
          <h2 className="text-sm font-black uppercase tracking-widest italic flex items-center gap-2">
            Base de Inteligencia BUD Advisors <span className="text-yellow-600 bg-yellow-50 px-3 py-1 rounded-sm font-bold shadow-sm">({filtered.length})</span>
          </h2>
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.3em]">Market Records</span>
        </div>
        
        {loading ? (
          <div className="text-center py-40 animate-pulse flex flex-col items-center gap-8">
            <Database className="w-20 h-20 text-gray-200" />
            <span className="font-black text-gray-300 uppercase tracking-[0.6em] text-2xl italic">Sincronizando registros en la nube...</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-12">
            {filtered.map((c, i) => (
              <div 
                key={i} 
                onClick={() => setSelectedCompany(c)} 
                className="bg-white border border-gray-100 p-12 hover:shadow-2xl transition-all cursor-pointer border-t-[8px] hover:border-t-yellow-400 group relative shadow-lg"
              >
                <span className="text-[10px] font-black bg-black text-white px-3 py-1 uppercase tracking-[0.2em] mb-6 inline-block">
                  {c['CATEGORÍA'] || 'CORPORACIÓN'}
                </span>
                <h3 className="text-2xl font-black text-black group-hover:text-yellow-600 transition-colors uppercase leading-tight mb-4 truncate tracking-tighter">
                  {c['ACRONIMO'] || c['DENOMINACIÓN SOCIAL']}
                </h3>
                <p className="text-gray-400 text-[12px] font-mono mb-12 flex items-center gap-2 border-b border-gray-50 pb-4 italic">
                  <Target className="w-3.5 h-3.5 text-yellow-500" /> CIF: {c['CIF EMPRESA']}
                </p>
                <div className="flex justify-between items-baseline pt-4">
                  <span className="text-[11px] font-bold text-gray-400 uppercase tracking-[0.3em]">Cifra de Negocio</span>
                  <span className="font-black text-3xl tabular-nums tracking-tighter">{formatCurrency(c['IMPORTEN NETO DE LA CIFRA DE NEGOCIO'])}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {filtered.length === 0 && !loading && (
          <div className="text-center py-40 bg-white border-4 border-dashed border-gray-100 rounded-lg shadow-inner">
            <Search className="w-20 h-20 text-gray-100 mx-auto mb-8" />
            <p className="font-black text-gray-300 uppercase tracking-[0.5em] text-3xl italic">No se han encontrado coincidencias</p>
          </div>
        )}
      </main>

      {/* MODAL: EXPEDIENTE ESTRATÉGICO P&L */}
      {selectedCompany && (
        <div className="fixed inset-0 bg-black/98 backdrop-blur-3xl z-[100] flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-6xl my-auto shadow-2xl border-t-[20px] border-yellow-400 animate-in fade-in zoom-in duration-500 rounded-sm">
            <div className="p-12 md:p-24">
              <div className="flex justify-between items-start mb-20">
                <div>
                  <div className="flex items-center gap-4 mb-8">
                    <span className="bg-black text-yellow-400 text-[12px] font-black px-5 py-2 uppercase tracking-[0.4em] shadow-xl italic">EXPEDIENTE ESTRATÉGICO</span>
                    <TrendingUp className="w-6 h-6 text-yellow-500" />
                  </div>
                  <h2 className="text-6xl md:text-8xl font-black tracking-tighter uppercase leading-none mb-8 italic">
                    {selectedCompany['DENOMINACIÓN SOCIAL']}
                  </h2>
                  <div className="flex flex-wrap gap-12 text-gray-400 font-mono text-sm border-l-4 border-black pl-8">
                    <div className="flex flex-col"><span className="text-[11px] font-black uppercase text-gray-300 tracking-widest">Identificación CIF</span><span className="text-black font-black text-2xl">{selectedCompany['CIF EMPRESA']}</span></div>
                    <div className="flex flex-col"><span className="text-[11px] font-black uppercase text-gray-300 tracking-widest">Sector Principal</span><span className="text-black font-black text-2xl uppercase tracking-tighter">{selectedCompany['CATEGORÍA']}</span></div>
                    <div className="flex flex-col"><span className="text-[11px] font-black uppercase text-gray-300 tracking-widest">Cierre Fiscal</span><span className="text-yellow-600 font-black text-2xl italic tracking-widest">{selectedCompany['EJERCICIO']}</span></div>
                  </div>
                </div>
                <button 
                  onClick={() => setSelectedCompany(null)} 
                  className="p-6 border-4 border-gray-100 rounded-full hover:bg-gray-100 transition-all text-black hover:rotate-90 group shadow-lg"
                >
                  <X className="w-12 h-12 group-hover:scale-110" />
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-24">
                {/* CUENTA DE RESULTADOS (P&L) */}
                <div className="space-y-12">
                  <h4 className="text-3xl font-black uppercase border-b-[10px] border-black pb-6 flex justify-between items-end italic">
                    <span>Estructura Operativa</span>
                    <span className="text-[12px] text-gray-400 tracking-[0.4em] font-bold uppercase italic">Divisa: EUR</span>
                  </h4>
                  <div className="space-y-6">
                    <div className="flex justify-between p-8 bg-gray-50 border-l-[12px] border-black hover:bg-yellow-50 transition-all shadow-md group">
                      <span className="font-black text-xl uppercase italic tracking-tighter flex items-center gap-3">
                         <BarChart3 className="w-5 h-5 text-gray-300 group-hover:text-black" /> Ventas Netas
                      </span>
                      <span className="text-4xl font-black tabular-nums tracking-tighter">{formatCurrency(selectedCompany['IMPORTEN NETO DE LA CIFRA DE NEGOCIO'])}</span>
                    </div>
                    <div className="flex justify-between px-8 py-5 text-red-600 border-b-2 border-gray-50 italic font-bold">
                      <span className="uppercase text-xs tracking-widest">(-) Gastos de Personal</span>
                      <span className="text-xl tabular-nums">{formatCurrency(selectedCompany['GASTOS DE PERSONAL'])}</span>
                    </div>
                    <div className="flex justify-between px-8 py-5 text-red-600 border-b-2 border-gray-50 italic font-bold">
                      <span className="uppercase text-xs tracking-widest">(-) Gastos Operativos</span>
                      <span className="text-xl tabular-nums">{formatCurrency(selectedCompany['GASTOS DE EXPLOTACIÓN Y OTROS GASTOS DE EXPLOTACIÓN'])}</span>
                    </div>
                    <div className="flex justify-between p-10 bg-yellow-400/10 border-l-[12px] border-yellow-400 mt-10 shadow-inner">
                      <span className="font-black text-2xl uppercase tracking-tighter italic">(=) EBITDA Operativo</span>
                      <span className="text-4xl font-black text-yellow-600 tabular-nums tracking-tighter">{formatCurrency(selectedCompany['EBITDA'])}</span>
                    </div>
                    <div className="flex justify-between p-8 border-t-[10px] border-black bg-black text-white shadow-2xl relative overflow-hidden mt-6">
                      <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-r from-yellow-400/20 to-transparent pointer-events-none"></div>
                      <span className="font-black text-3xl uppercase italic relative z-10 tracking-widest">Resultado Neto</span>
                      <span className="text-5xl font-black tabular-nums text-yellow-400 relative z-10 tracking-tighter">{formatCurrency(selectedCompany['RESULTADO DEL EJERCICIO'])}</span>
                    </div>
                  </div>
                </div>

                {/* MÉTRICAS DE CAPITAL HUMANO Y VISIÓN */}
                <div className="space-y-16">
                  <div className="bg-black text-white p-14 border-l-[15px] border-yellow-400 shadow-2xl relative overflow-hidden group rounded-sm">
                    <div className="absolute -right-20 -bottom-20 w-80 h-80 text-white/5 group-hover:scale-125 transition-transform duration-1000 rotate-12">
                       <Users className="w-full h-full" />
                    </div>
                    <h5 className="text-[12px] font-black uppercase tracking-[0.5em] text-yellow-400 mb-12 flex items-center gap-3">
                       <CheckCircle2 className="w-4 h-4" /> Eficiencia de Capital Humano
                    </h5>
                    <div className="grid grid-cols-2 gap-20 relative z-10">
                      <div>
                        <span className="text-8xl font-black block leading-none mb-4 tracking-tighter italic">{selectedCompany['NÚMERO MEDIO DE EMPLEADOS'] || '-'}</span>
                        <span className="text-[12px] uppercase font-bold text-gray-400 tracking-[0.3em] block">Consultores / Plantilla</span>
                      </div>
                      <div className="border-l border-white/10 pl-10">
                        <span className="text-4xl font-black block leading-none mb-4 tracking-tighter text-yellow-400 italic">
                          {formatCurrency((selectedCompany['IMPORTEN NETO DE LA CIFRA DE NEGOCIO'] || 0) / (selectedCompany['NÚMERO MEDIO DE EMPLEADOS'] || 1))}
                        </span>
                        <span className="text-[12px] uppercase font-bold text-gray-400 tracking-[0.3em] block">Productividad / Pax</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="bg-gray-100 p-14 border-l-[15px] border-slate-300 shadow-md">
                    <h5 className="text-[12px] font-black uppercase tracking-[0.5em] text-gray-400 mb-10 flex items-center gap-3">
                       <Briefcase className="w-5 h-5 text-gray-400" /> Objeto Social Registrado
                    </h5>
                    <p className="text-2xl leading-relaxed italic font-serif text-slate-700 font-medium">
                      "{String(selectedCompany['OBJETO SOCIAL'] || 'Descripción de actividad comercial no detallada en el registro del último ejercicio consolidado.')}"
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-28 flex justify-center">
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