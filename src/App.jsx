import React, { useState, useEffect, useMemo } from 'react';
import { 
  Search, Upload, Building2, TrendingUp, Users, 
  BarChart3, Filter, X, Database, AlertCircle, 
  Trophy, LayoutDashboard, CheckCircle2
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, onSnapshot } from 'firebase/firestore';

// --- SISTEMA DE CONFIGURACIÓN BLINDADO ---
const getFirebaseConfig = () => {
  // 1. Prioridad: Variable global (Entorno Canvas)
  if (typeof __firebase_config !== 'undefined' && __firebase_config) {
    try { 
      return typeof __firebase_config === 'string' ? JSON.parse(__firebase_config) : __firebase_config; 
    } catch (e) { console.error("Error en __firebase_config"); }
  }

  // 2. Netlify (Vite)
  try {
    let env = import.meta.env.VITE_FIREBASE_CONFIG;
    if (!env) return null;

    // Si el usuario olvidó las llaves { } en Netlify, las añadimos
    if (typeof env === 'string' && !env.trim().startsWith('{')) {
      env = `{${env}}`;
    }
    
    // Intentar limpiar comas mal puestas o caracteres extraños
    return typeof env === 'string' ? JSON.parse(env) : env;
  } catch (e) {
    console.error("Error crítico leyendo configuración de Netlify:", e);
    return null;
  }
};

const firebaseConfig = getFirebaseConfig();
const app = firebaseConfig ? initializeApp(firebaseConfig) : null;
const auth = app ? getAuth(app) : null;
const db = app ? getFirestore(app) : null;
const rawAppId = typeof __app_id !== 'undefined' ? __app_id : "bud_intelligence_v1";
const appId = rawAppId.replace(/[^a-zA-Z0-9]/g, '_');

// --- UTILIDADES ---
const formatCurrency = (v) => (!v || isNaN(v)) ? '-' : new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v);

export default function App() {
  const [data, setData] = useState([]);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState({ type: 'info', msg: 'Iniciando sistema de inteligencia...' });
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Todas');
  const [selectedSubcategory, setSelectedSubcategory] = useState('Todas');
  const [selectedCompany, setSelectedCompany] = useState(null);

  // 1. AUTENTICACIÓN
  useEffect(() => {
    if (!auth) {
      setStatus({ type: 'error', msg: 'ERROR: Clave API no detectada o mal formateada en Netlify.' });
      setLoading(false);
      return;
    }
    signInAnonymously(auth).catch(err => {
      setStatus({ type: 'error', msg: `Error de Firebase: ${err.message}` });
      setLoading(false);
    });
    return onAuthStateChanged(auth, setUser);
  }, []);

  // 2. ESCUCHA DE DATOS EN TIEMPO REAL
  useEffect(() => {
    if (!db || !user) return;

    const q = collection(db, 'artifacts', appId, 'public', 'data', 'companies');
    const unsubscribe = onSnapshot(q, 
      (snap) => {
        const docs = snap.docs.map(d => d.data());
        // Ordenación por facturación descendente (Top Ranking)
        docs.sort((a, b) => (Number(b['IMPORTEN NETO DE LA CIFRA DE NEGOCIO']) || 0) - (Number(a['IMPORTEN NETO DE LA CIFRA DE NEGOCIO']) || 0));
        setData(docs);
        setLoading(false);
        setStatus({ type: 'success', msg: 'Conexión Exitosa - Cloud Database Sincronizada' });
      },
      (err) => {
        setLoading(false);
        setStatus({ type: 'error', msg: 'Permisos insuficientes en Firestore.' });
      }
    );
    return () => unsubscribe();
  }, [user]);

  // 3. CARGA DE ARCHIVOS
  const handleUpload = (e) => {
    const file = e.target.files[0];
    if (!file || !db || !user) return;
    setUploading(true);
    setStatus({ type: 'info', msg: 'Actualizando base de datos en la nube de Google...' });
    
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const text = ev.target.result;
        const lines = text.split('\n').filter(l => l.trim());
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
        setStatus({ type: 'success', msg: `¡Éxito! ${count} registros actualizados permanentemente.` });
      } catch (err) {
        setStatus({ type: 'error', msg: `Error procesando el CSV: ${err.message}` });
      } finally {
        setUploading(false);
      }
    };
    reader.readAsText(file);
  };

  // --- LÓGICA DE NEGOCIO (DASHBOARD) ---
  const stats = useMemo(() => {
    const cats = {};
    let total2024 = 0;
    data.forEach(c => {
      if (c['CATEGORÍA']) cats[c['CATEGORÍA']] = (cats[c['CATEGORÍA']] || 0) + 1;
      if (String(c['EJERCICIO']) === '2024') {
        total2024 += (Number(c['IMPORTEN NETO DE LA CIFRA DE NEGOCIO']) || 0);
      }
    });
    return { cats, total2024 };
  }, [data]);

  const topTen = useMemo(() => data.slice(0, 10), [data]);

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

  const categories = ['Todas', ...new Set(data.map(c => c['CATEGORÍA']).filter(Boolean))];
  const subcategories = ['Todas', ...new Set(data.filter(c => selectedCategory === 'Todas' || c['CATEGORÍA'] === selectedCategory).map(c => c['SUBCATEGORÍA']).filter(Boolean))];

  return (
    <div className="min-h-screen bg-[#f9fafb] text-slate-900 font-sans selection:bg-yellow-100">
      {/* NAVBAR */}
      <nav className="bg-black text-white p-6 border-b-4 border-yellow-400 sticky top-0 z-50 shadow-2xl">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-4">
            <div className="bg-yellow-400 p-2 rounded-sm shadow-inner"><Building2 className="text-black w-6 h-6" /></div>
            <div className="flex flex-col">
              <span className="font-black text-2xl tracking-tighter uppercase leading-none italic">BUD <span className="text-yellow-400">ADVISORS</span></span>
              <span className="text-[9px] tracking-[0.4em] text-gray-400 font-bold uppercase mt-1">Intelligence Dashboard</span>
            </div>
          </div>
          <label className={`bg-yellow-400 hover:bg-yellow-300 text-black px-6 py-3 font-black text-xs uppercase tracking-widest cursor-pointer transition-all flex items-center gap-2 shadow-lg hover:scale-105 active:scale-95 ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
            <Upload className="w-4 h-4" />
            {uploading ? 'SINCRONIZANDO...' : 'ACTUALIZAR NUBE'}
            <input type="file" onChange={handleUpload} className="hidden" accept=".csv" disabled={uploading} />
          </label>
        </div>
      </nav>

      {/* MONITOR DE STATUS */}
      <div className={`p-2.5 text-[10px] font-black uppercase tracking-[0.2em] text-center border-b transition-all duration-700 ${
        status.type === 'error' ? 'bg-red-600 text-white' : 
        status.type === 'success' ? 'bg-green-600 text-white' : 'bg-blue-600 text-white'
      }`}>
        <div className="flex items-center justify-center gap-2">
          {status.type === 'error' ? <AlertCircle className="w-3.5 h-3.5" /> : <Database className="w-3.5 h-3.5" />}
          {status.msg}
        </div>
      </div>

      <main className="max-w-7xl mx-auto p-8">
        
        {/* PANEL DE CONTROL / DASHBOARD SUPERIOR */}
        <section className="mb-12 grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-1 bg-black text-white p-8 border-l-8 border-yellow-400 shadow-xl flex flex-col justify-center">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-2">Universo Cargado</span>
            <div className="flex items-baseline gap-2">
              <span className="text-6xl font-black">{data.length}</span>
              <span className="text-xs font-bold text-yellow-400">Agencias</span>
            </div>
          </div>
          <div className="lg:col-span-1 bg-white p-8 border-l-8 border-black shadow-lg flex flex-col justify-center">
            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-2">Facturación Total 2024</span>
            <span className="text-2xl font-black text-green-600 tabular-nums">{formatCurrency(stats.total2024)}</span>
          </div>
          <div className="lg:col-span-2 bg-white p-8 border-l-8 border-gray-100 shadow-lg overflow-x-auto">
            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-4">Entidades por Categoría</span>
            <div className="flex gap-6">
              {Object.entries(stats.cats).slice(0, 4).map(([cat, count]) => (
                <div key={cat} className="flex flex-col border-r border-gray-100 pr-6 last:border-0">
                  <span className="text-[9px] font-black text-gray-400 uppercase truncate max-w-[80px]">{cat}</span>
                  <span className="text-xl font-black">{count}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CARRUSEL TOP 10 LÍDERES */}
        <section className="mb-16">
          <div className="flex items-center gap-3 mb-6 border-b-4 border-black pb-2">
            <Trophy className="w-6 h-6 text-yellow-500" />
            <h2 className="text-xl font-black uppercase tracking-tighter italic">Top 10 Ranking Liderazgo</h2>
          </div>
          <div className="flex gap-6 overflow-x-auto pb-6 snap-x scrollbar-hide">
            {topTen.map((c, i) => (
              <div 
                key={i} 
                onClick={() => setSelectedCompany(c)}
                className="min-w-[320px] bg-white border-2 border-gray-100 p-6 shadow-md snap-center hover:border-yellow-400 transition-all cursor-pointer group relative"
              >
                <div className="absolute top-0 right-0 bg-yellow-400 text-black font-black px-2.5 py-1.5 text-[10px]">RANK #{i + 1}</div>
                <span className="text-[9px] font-black bg-black text-white px-2 py-0.5 uppercase tracking-widest mb-4 inline-block">
                  {c['CATEGORÍA']}
                </span>
                <h3 className="font-black uppercase truncate text-lg mb-4 group-hover:text-yellow-600 transition-colors">
                  {c['ACRONIMO'] || c['DENOMINACIÓN SOCIAL']}
                </h3>
                <div className="flex justify-between items-baseline border-t border-gray-50 pt-4">
                  <span className="text-[10px] font-bold text-gray-400 uppercase">Volumen Negocio</span>
                  <span className="font-black text-xl tabular-nums">{formatCurrency(c['IMPORTEN NETO DE LA CIFRA DE NEGOCIO'])}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* BUSCADOR Y FILTROS ESTRATÉGICOS */}
        <section className="bg-white p-10 shadow-2xl mb-12 border-t-[12px] border-black rounded-sm">
          <div className="flex items-center gap-5 border-b-2 border-gray-100 pb-6 mb-8 group">
            <Search className="text-gray-300 group-focus-within:text-yellow-500 transition-colors w-10 h-10" />
            <input 
              className="w-full outline-none font-black text-3xl placeholder-gray-200 bg-transparent uppercase"
              placeholder="Buscar por Nombre, CIF o Acrónimo..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
            <div className="flex flex-col gap-3">
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em] flex items-center gap-2">
                <Filter className="w-3.5 h-3.5" /> Sector / Categoría
              </span>
              <select 
                className="w-full p-5 bg-gray-50 border-2 border-transparent focus:border-yellow-400 outline-none font-bold text-sm cursor-pointer transition-all appearance-none"
                value={selectedCategory} 
                onChange={(e) => {setSelectedCategory(e.target.value); setSelectedSubcategory('Todas');}}
              >
                {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-3">
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em] flex items-center gap-2">
                <Filter className="w-3.5 h-3.5" /> Especialidad
              </span>
              <select 
                className="w-full p-5 bg-gray-50 border-2 border-transparent focus:border-yellow-400 outline-none font-bold text-sm cursor-pointer transition-all disabled:opacity-30"
                value={selectedSubcategory} 
                onChange={(e) => setSelectedSubcategory(e.target.value)} 
                disabled={selectedCategory === 'Todas'}
              >
                {subcategories.map(sub => <option key={sub} value={sub}>{sub}</option>)}
              </select>
            </div>
          </div>
        </section>

        {/* LISTADO DE RESULTADOS */}
        <div className="flex justify-between items-end mb-8 border-b-2 border-black pb-3">
          <h2 className="text-sm font-black uppercase tracking-widest italic flex items-center gap-2">
            Directorio BUD Advisors <span className="text-yellow-600 bg-yellow-50 px-2 rounded font-bold">({filtered.length})</span>
          </h2>
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Registros Consolidados</span>
        </div>
        
        {loading ? (
          <div className="text-center py-40 animate-pulse flex flex-col items-center gap-6">
            <Database className="w-16 h-16 text-gray-200" />
            <span className="font-black text-gray-300 uppercase tracking-[0.5em] text-xl">Sincronizando Inteligencia...</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
            {filtered.map((c, i) => (
              <div 
                key={i} 
                onClick={() => setSelectedCompany(c)} 
                className="bg-white border border-gray-200 p-10 hover:shadow-2xl transition-all cursor-pointer border-t-[6px] hover:border-t-yellow-400 group relative"
              >
                <span className="text-[9px] font-black bg-black text-white px-2 py-0.5 uppercase tracking-widest mb-5 inline-block">
                  {c['CATEGORÍA'] || 'CORPORACIÓN'}
                </span>
                <h3 className="text-2xl font-black text-black group-hover:text-yellow-600 transition-colors uppercase leading-tight mb-2 truncate">
                  {c['ACRONIMO'] || c['DENOMINACIÓN SOCIAL']}
                </h3>
                <p className="text-gray-400 text-[11px] font-mono mb-10 flex items-center gap-2">
                  <Database className="w-3 h-3" /> {c['CIF EMPRESA']}
                </p>
                <div className="flex justify-between items-baseline border-t border-gray-50 pt-5">
                  <span className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Facturación</span>
                  <span className="font-black text-2xl tabular-nums">{formatCurrency(c['IMPORTEN NETO DE LA CIFRA DE NEGOCIO'])}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {filtered.length === 0 && !loading && (
          <div className="text-center py-40 bg-white border-4 border-dashed border-gray-100 rounded-lg">
            <Search className="w-16 h-16 text-gray-100 mx-auto mb-6" />
            <p className="font-black text-gray-300 uppercase tracking-widest text-2xl">Sin resultados en la búsqueda</p>
          </div>
        )}
      </main>

      {/* MODAL: EXPEDIENTE P&L DETALLADO */}
      {selectedCompany && (
        <div className="fixed inset-0 bg-black/98 backdrop-blur-xl z-[100] flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-6xl my-auto shadow-2xl border-t-[16px] border-yellow-400 animate-in fade-in zoom-in duration-500 rounded-sm">
            <div className="p-10 md:p-20">
              <div className="flex justify-between items-start mb-16">
                <div>
                  <div className="flex items-center gap-3 mb-6">
                    <span className="bg-black text-yellow-400 text-[11px] font-black px-4 py-1.5 uppercase tracking-[0.3em] shadow-lg">Expediente de Inteligencia</span>
                    <TrendingUp className="w-5 h-5 text-yellow-500" />
                  </div>
                  <h2 className="text-5xl md:text-8xl font-black tracking-tighter uppercase leading-none mb-6">
                    {selectedCompany['DENOMINACIÓN SOCIAL']}
                  </h2>
                  <div className="flex flex-wrap gap-8 text-gray-400 font-mono text-sm">
                    <div className="flex flex-col"><span className="text-[10px] font-black uppercase text-gray-300">Identificación CIF</span><span className="text-black font-bold text-lg">{selectedCompany['CIF EMPRESA']}</span></div>
                    <div className="flex flex-col"><span className="text-[10px] font-black uppercase text-gray-300">Sector Negocio</span><span className="text-black font-bold text-lg uppercase">{selectedCompany['CATEGORÍA']}</span></div>
                    <div className="flex flex-col"><span className="text-[10px] font-black uppercase text-gray-300">Cierre Ejercicio</span><span className="text-yellow-600 font-black text-lg italic">{selectedCompany['EJERCICIO']}</span></div>
                  </div>
                </div>
                <button 
                  onClick={() => setSelectedCompany(null)} 
                  className="p-5 border-4 border-gray-100 rounded-full hover:bg-gray-100 transition-all text-black hover:rotate-90 group"
                >
                  <X className="w-10 h-10 group-hover:scale-110" />
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-20">
                {/* CUENTA DE RESULTADOS ESTRUCTURADA */}
                <div className="space-y-10">
                  <h4 className="text-2xl font-black uppercase border-b-8 border-black pb-4 flex justify-between items-end">
                    <span>Estructura Operativa</span>
                    <span className="text-[11px] text-gray-400 tracking-[0.3em] font-bold">UNIDAD: EUR</span>
                  </h4>
                  <div className="space-y-5">
                    <div className="flex justify-between p-6 bg-gray-50 border-l-[10px] border-black hover:bg-gray-100 transition-all">
                      <span className="font-black text-lg uppercase italic">Ventas Netas</span>
                      <span className="text-3xl font-black tabular-nums">{formatCurrency(selectedCompany['IMPORTEN NETO DE LA CIFRA DE NEGOCIO'])}</span>
                    </div>
                    <div className="flex justify-between px-6 py-4 text-red-600 border-b border-gray-100 italic font-bold">
                      <span>(-) Gastos de Personal</span>
                      <span className="text-lg">{formatCurrency(selectedCompany['GASTOS DE PERSONAL'])}</span>
                    </div>
                    <div className="flex justify-between px-6 py-4 text-red-600 border-b border-gray-100 italic font-bold">
                      <span>(-) Gastos de Explotación</span>
                      <span className="text-lg">{formatCurrency(selectedCompany['GASTOS DE EXPLOTACIÓN Y OTROS GASTOS DE EXPLOTACIÓN'])}</span>
                    </div>
                    <div className="flex justify-between p-8 bg-yellow-400/10 border-l-[10px] border-yellow-400 mt-8">
                      <span className="font-black text-xl uppercase tracking-tighter italic">(=) EBITDA Operativo</span>
                      <span className="text-3xl font-black text-yellow-600 tabular-nums">{formatCurrency(selectedCompany['EBITDA'])}</span>
                    </div>
                    <div className="flex justify-between p-6 border-t-8 border-black bg-black text-white shadow-2xl relative overflow-hidden">
                      <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-r from-yellow-400/20 to-transparent pointer-events-none"></div>
                      <span className="font-black text-2xl uppercase italic relative z-10">Resultado Neto</span>
                      <span className="text-4xl font-black tabular-nums text-yellow-400 relative z-10">{formatCurrency(selectedCompany['RESULTADO DEL EJERCICIO'])}</span>
                    </div>
                  </div>
                </div>

                {/* VISIÓN ESTRATÉGICA Y RATIOS */}
                <div className="space-y-12">
                  <div className="bg-black text-white p-12 border-l-[12px] border-yellow-400 shadow-2xl relative overflow-hidden group">
                    <div className="absolute -right-16 -bottom-16 w-60 h-60 text-white/5 group-hover:scale-125 transition-transform duration-1000 rotate-12">
                       <BarChart3 className="w-full h-full" />
                    </div>
                    <h5 className="text-[11px] font-black uppercase tracking-[0.4em] text-yellow-400 mb-10">Productividad de Capital Humano</h5>
                    <div className="grid grid-cols-2 gap-16 relative z-10">
                      <div>
                        <span className="text-7xl font-black block leading-none mb-3 tracking-tighter">{selectedCompany['NÚMERO MEDIO DE EMPLEADOS'] || '-'}</span>
                        <span className="text-[11px] uppercase font-bold text-gray-400 tracking-widest block">Pax Plantilla</span>
                      </div>
                      <div>
                        <span className="text-3xl font-black block leading-none mb-3 tracking-tighter text-yellow-400">
                          {formatCurrency((selectedCompany['IMPORTEN NETO DE LA CIFRA DE NEGOCIO'] || 0) / (selectedCompany['NÚMERO MEDIO DE EMPLEADOS'] || 1))}
                        </span>
                        <span className="text-[11px] uppercase font-bold text-gray-400 tracking-widest block">Ventas / Pax</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="bg-gray-100 p-12 border-l-[12px] border-slate-300">
                    <h5 className="text-[11px] font-black uppercase tracking-[0.4em] text-gray-400 mb-8 flex items-center gap-3">
                       <Info className="w-4 h-4" /> Objeto Social Registrado
                    </h5>
                    <p className="text-xl leading-relaxed italic font-serif text-slate-700">
                      "{String(selectedCompany['OBJETO SOCIAL'] || 'Descripción de actividad no disponible en el registro mercantil del último ejercicio.')}"
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-24 flex justify-center">
                <button 
                  onClick={() => setSelectedCompany(null)} 
                  className="bg-black text-white px-32 py-8 font-black uppercase tracking-[0.5em] text-sm hover:bg-yellow-400 hover:text-black transition-all shadow-2xl active:scale-95 border-b-[12px] border-yellow-600 rounded-sm"
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