import React, { useState, useEffect, useMemo } from 'react';
import { 
  Search, Upload, Building2, TrendingUp, Users, 
  BarChart3, Filter, X, Database, AlertCircle, 
  CheckCircle2, Info, LayoutDashboard, Trophy
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, onSnapshot } from 'firebase/firestore';

// --- INICIALIZACIÓN DE FIREBASE SEGURA ---
const getFirebaseConfig = () => {
  // 1. Intentar leer de variable global (Canvas)
  if (typeof __firebase_config !== 'undefined' && __firebase_config) {
    try { return typeof __firebase_config === 'string' ? JSON.parse(__firebase_config) : __firebase_config; } catch (e) { return null; }
  }
  // 2. Intentar leer de Netlify (Vite)
  try {
    const env = import.meta.env.VITE_FIREBASE_CONFIG;
    if (env) return typeof env === 'string' ? JSON.parse(env) : env;
  } catch (e) { }
  return null;
};

const firebaseConfig = getFirebaseConfig();
const app = firebaseConfig ? initializeApp(firebaseConfig) : null;
const auth = app ? getAuth(app) : null;
const db = app ? getFirestore(app) : null;
// REGLA 1: Saneamiento de la ruta para Google Firestore
const rawAppId = typeof __app_id !== 'undefined' ? __app_id : "bud_advisors_intelligence_unit";
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

  // 1. AUTENTICACIÓN (REGLA 3)
  useEffect(() => {
    if (!auth) {
      setStatus({ type: 'error', msg: 'ERROR: Configuración Firebase no detectada. Revisa el paso 1 en Netlify.' });
      setLoading(false);
      return;
    }
    signInAnonymously(auth).catch(err => setStatus({ type: 'error', msg: `Fallo de conexión: ${err.message}` }));
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (u) setStatus({ type: 'success', msg: 'SISTEMA ONLINE - Cloud Database Conectada' });
    });
  }, []);

  // 2. SINCRONIZACIÓN DE DATOS (REGLA 1 y 3)
  useEffect(() => {
    if (!db || !user) return;
    const q = collection(db, 'artifacts', appId, 'public', 'data', 'companies');
    const unsubscribe = onSnapshot(q, 
      (snap) => {
        const docs = snap.docs.map(d => d.data());
        // Ordenar por facturación por defecto
        docs.sort((a, b) => (Number(b['IMPORTEN NETO DE LA CIFRA DE NEGOCIO']) || 0) - (Number(a['IMPORTEN NETO DE LA CIFRA DE NEGOCIO']) || 0));
        setData(docs);
        setLoading(false);
      },
      (err) => {
        setLoading(false);
        setStatus({ type: 'error', msg: err.code === 'permission-denied' ? 'Acceso Denegado: Revisa las Reglas en tu consola de Firebase.' : err.message });
      }
    );
    return () => unsubscribe();
  }, [user]);

  // 3. CARGA DE DATOS
  const handleUpload = (e) => {
    const file = e.target.files[0];
    if (!file || !db || !user) return;
    setUploading(true);
    setStatus({ type: 'info', msg: 'Subiendo datos a la nube de Google...' });
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const lines = ev.target.result.split('\n').filter(l => l.trim());
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
            const id = String(obj['CIF EMPRESA']).replace(/[^a-zA-Z0-9]/g, '');
            await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'companies', id), obj);
            count++;
          }
        }
        setStatus({ type: 'success', msg: `¡Éxito! ${count} agencias actualizadas para todo el equipo.` });
      } catch (err) { setStatus({ type: 'error', msg: `Fallo en subida: ${err.message}` }); }
      finally { setUploading(false); }
    };
    reader.readAsText(file);
  };

  // --- LÓGICA DE MÉTRICAS ---
  const categories = useMemo(() => ['Todas', ...new Set(data.map(c => c['CATEGORÍA']).filter(Boolean))], [data]);
  const subcategories = useMemo(() => ['Todas', ...new Set(data.filter(c => selectedCategory === 'Todas' || c['CATEGORÍA'] === selectedCategory).map(c => c['SUBCATEGORÍA']).filter(Boolean))], [data, selectedCategory]);
  
  const stats = useMemo(() => {
    const cats = {};
    let rev2024 = 0;
    data.forEach(c => {
      if (c['CATEGORÍA']) cats[c['CATEGORÍA']] = (cats[c['CATEGORÍA']] || 0) + 1;
      if (String(c['EJERCICIO']) === '2024') rev2024 += (Number(c['IMPORTEN NETO DE LA CIFRA DE NEGOCIO']) || 0);
    });
    return { cats, rev2024 };
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

  return (
    <div className="min-h-screen bg-[#fcfcfc] text-slate-900 font-sans">
      {/* NAVBAR */}
      <nav className="bg-black text-white p-6 border-b-4 border-yellow-400 sticky top-0 z-50 shadow-xl">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-4">
            <div className="bg-yellow-400 p-2 rounded-sm"><Building2 className="text-black w-6 h-6" /></div>
            <div className="flex flex-col">
              <span className="font-black text-2xl tracking-tighter uppercase">BUD <span className="text-yellow-400 font-black">ADVISORS</span></span>
              <span className="text-[10px] tracking-[0.4em] text-gray-400 font-bold uppercase">Intelligence Unit</span>
            </div>
          </div>
          <label className={`bg-yellow-400 hover:bg-yellow-300 text-black px-6 py-3 font-black text-xs uppercase tracking-widest cursor-pointer transition-all flex items-center gap-2 shadow-lg ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
            <Upload className="w-4 h-4" />
            {uploading ? 'PROCESANDO...' : 'CARGAR CSV'}
            <input type="file" onChange={handleUpload} className="hidden" accept=".csv" disabled={uploading} />
          </label>
        </div>
      </nav>

      {/* MONITOR DE ESTADO */}
      <div className={`p-2 text-[10px] font-black uppercase tracking-[0.2em] text-center border-b transition-colors duration-500 ${
        status.type === 'error' ? 'bg-red-600 text-white' : 
        status.type === 'success' ? 'bg-green-600 text-white' : 'bg-blue-600 text-white'
      }`}>
        <div className="flex items-center justify-center gap-2">
          {status.type === 'error' ? <AlertCircle className="w-3 h-3" /> : <Database className="w-3 h-3" />}
          {status.msg}
        </div>
      </div>

      <main className="max-w-7xl mx-auto p-8">
        
        {/* DASHBOARD DE MÉTRICAS */}
        <section className="mb-12">
          <div className="flex items-center gap-2 mb-6 border-b-2 border-black pb-2">
            <LayoutDashboard className="w-5 h-5" />
            <h2 className="text-sm font-black uppercase tracking-widest">Dashboard de Mercado</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-black text-white p-6 border-l-8 border-yellow-400 shadow-xl">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-2">Total Entidades</span>
              <span className="text-5xl font-black">{data.length}</span>
            </div>
            <div className="bg-white p-6 border-l-8 border-black shadow-lg">
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-2">Facturación Agregada 2024</span>
              <span className="text-2xl font-black text-green-600">{formatCurrency(stats.rev2024)}</span>
            </div>
            {Object.entries(stats.cats).slice(0, 2).map(([cat, count]) => (
              <div key={cat} className="bg-white p-6 border-l-8 border-gray-200 shadow-lg group hover:border-yellow-400 transition-all">
                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-2 truncate">{cat}</span>
                <span className="text-3xl font-black">{count} <span className="text-xs text-gray-400">Agencias</span></span>
              </div>
            ))}
          </div>
        </section>

        {/* RANKING TOP 10 */}
        <section className="mb-16">
          <div className="flex items-center gap-3 mb-6 border-b-2 border-black pb-2">
            <Trophy className="w-5 h-5 text-yellow-500" />
            <h2 className="text-sm font-black uppercase tracking-widest italic">Líderes por Facturación (Top 10)</h2>
          </div>
          <div className="flex gap-6 overflow-x-auto pb-6 scrollbar-hide snap-x">
            {topTen.map((c, i) => (
              <div key={i} onClick={() => setSelectedCompany(c)} className="min-w-[320px] bg-white border-2 border-gray-100 p-6 shadow-md snap-center hover:border-yellow-400 transition-all cursor-pointer group relative">
                <div className="absolute top-0 right-0 bg-yellow-400 text-black font-black px-2 py-1 text-[10px]">#{i + 1}</div>
                <span className="text-[9px] font-black bg-black text-white px-2 py-0.5 uppercase tracking-widest mb-3 inline-block">{c['CATEGORÍA']}</span>
                <h3 className="font-black uppercase truncate text-lg mb-4 group-hover:text-yellow-600 transition-colors">{c['ACRONIMO'] || c['DENOMINACIÓN SOCIAL']}</h3>
                <div className="flex justify-between items-baseline border-t pt-4">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Facturación</span>
                  <span className="font-black text-xl">{formatCurrency(c['IMPORTEN NETO DE LA CIFRA DE NEGOCIO'])}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* BUSCADOR Y FILTROS */}
        <section className="bg-white p-10 shadow-2xl mb-12 border-t-[10px] border-black rounded-sm flex flex-col gap-8">
          <div className="flex items-center gap-4 border-b-2 border-gray-100 pb-4 group">
            <Search className="text-gray-300 group-focus-within:text-yellow-500 transition-colors w-8 h-8" />
            <input 
              className="w-full outline-none font-black text-2xl placeholder-gray-200 bg-transparent uppercase"
              placeholder="Buscar por Nombre, CIF o Acrónimo..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="flex flex-col gap-2">
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2"><Filter className="w-3 h-3" /> Categoría</span>
              <select className="w-full p-4 bg-gray-50 border-2 border-transparent focus:border-yellow-400 outline-none font-bold text-sm cursor-pointer" value={selectedCategory} onChange={(e) => {setSelectedCategory(e.target.value); setSelectedSubcategory('Todas');}}>
                {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2"><Filter className="w-3 h-3" /> Subcategoría</span>
              <select className="w-full p-4 bg-gray-50 border-2 border-transparent focus:border-yellow-400 outline-none font-bold text-sm cursor-pointer disabled:opacity-30" value={selectedSubcategory} onChange={(e) => setSelectedSubcategory(e.target.value)} disabled={selectedCategory === 'Todas'}>
                {subcategories.map(sub => <option key={sub} value={sub}>{sub}</option>)}
              </select>
            </div>
          </div>
        </section>

        {/* LISTADO GENERAL */}
        <div className="flex justify-between items-end mb-6 border-b-2 border-black pb-2">
          <h2 className="text-sm font-black uppercase tracking-widest italic">Directorio General ({filtered.length})</h2>
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Registros Consolidados</span>
        </div>
        
        {loading ? (
          <div className="text-center py-32 animate-pulse flex flex-col items-center gap-4">
            <Database className="w-12 h-12 text-gray-200" />
            <span className="font-black text-gray-300 uppercase tracking-[0.4em]">Sincronizando Nube de Inteligencia</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {filtered.map((c, i) => (
              <div key={i} onClick={() => setSelectedCompany(c)} className="bg-white border-2 border-gray-100 p-8 hover:shadow-2xl transition-all cursor-pointer border-t-4 hover:border-t-yellow-400 group">
                <span className="text-[9px] font-black bg-black text-white px-2 py-0.5 uppercase tracking-widest mb-4 inline-block">{c['CATEGORÍA'] || 'EMPRESA'}</span>
                <h3 className="text-xl font-black text-black group-hover:text-yellow-600 transition-colors uppercase truncate mb-1">{c['ACRONIMO'] || c['DENOMINACIÓN SOCIAL']}</h3>
                <p className="text-gray-400 text-[10px] font-mono mb-8">{c['CIF EMPRESA']}</p>
                <div className="flex justify-between items-baseline border-t pt-4">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Cifra Negocio</span>
                  <span className="font-black text-2xl tabular-nums">{formatCurrency(c['IMPORTEN NETO DE LA CIFRA DE NEGOCIO'])}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* MODAL EXPEDIENTE P&L */}
      {selectedCompany && (
        <div className="fixed inset-0 bg-black/95 backdrop-blur-md z-[100] flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-6xl my-auto shadow-2xl border-t-[12px] border-yellow-400 animate-in fade-in zoom-in duration-300">
            <div className="p-8 md:p-16">
              <div className="flex justify-between items-start mb-12">
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <span className="bg-black text-yellow-400 text-[10px] font-black px-3 py-1 uppercase tracking-[0.2em]">Expediente Estratégico</span>
                    <TrendingUp className="w-4 h-4 text-yellow-500" />
                  </div>
                  <h2 className="text-4xl md:text-7xl font-black tracking-tighter uppercase leading-none mb-4">{selectedCompany['DENOMINACIÓN SOCIAL']}</h2>
                  <p className="text-gray-400 font-mono text-sm flex gap-6">
                    <span>CIF: <span className="text-black font-bold">{selectedCompany['CIF EMPRESA']}</span></span>
                    <span>EJERCICIO: <span className="text-yellow-600 font-bold italic">{selectedCompany['EJERCICIO']}</span></span>
                  </p>
                </div>
                <button onClick={() => setSelectedCompany(null)} className="p-4 border-2 border-gray-100 rounded-full hover:bg-gray-100 transition-all text-black hover:rotate-90"><X className="w-8 h-8" /></button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-16">
                <div className="space-y-8">
                  <h4 className="text-xl font-black uppercase border-b-4 border-black pb-2">Cuenta de Resultados</h4>
                  <div className="space-y-4 text-sm">
                    <div className="flex justify-between p-4 bg-gray-50 border-l-4 border-black"><span className="font-bold uppercase italic">Ventas Netas</span><span className="text-xl font-black tabular-nums">{formatCurrency(selectedCompany['IMPORTEN NETO DE LA CIFRA DE NEGOCIO'])}</span></div>
                    <div className="flex justify-between p-4 text-red-600 border-b italic"><span>(-) Gastos de Personal</span><span className="font-bold">{formatCurrency(selectedCompany['GASTOS DE PERSONAL'])}</span></div>
                    <div className="flex justify-between p-4 text-red-600 border-b italic"><span>(-) Gastos de Explotación</span><span className="font-bold">{formatCurrency(selectedCompany['GASTOS DE EXPLOTACIÓN Y OTROS GASTOS DE EXPLOTACIÓN'])}</span></div>
                    <div className="flex justify-between p-5 bg-yellow-400/10 border-l-4 border-yellow-400"><span className="font-black text-lg uppercase">(=) EBITDA</span><span className="text-2xl font-black text-yellow-600 tabular-nums">{formatCurrency(selectedCompany['EBITDA'])}</span></div>
                    <div className="flex justify-between p-4 border-t-4 border-black bg-black text-white shadow-xl"><span className="font-black text-xl uppercase italic">Resultado Neto</span><span className="text-3xl font-black tabular-nums text-yellow-400">{formatCurrency(selectedCompany['RESULTADO DEL EJERCICIO'])}</span></div>
                  </div>
                </div>
                <div className="space-y-10">
                  <div className="bg-black text-white p-10 border-l-8 border-yellow-400 shadow-2xl relative overflow-hidden group">
                    <TrendingUp className="absolute -right-10 -bottom-10 w-40 h-40 text-white/5 group-hover:scale-110 transition-transform duration-700" />
                    <h5 className="text-[10px] font-black uppercase tracking-[0.3em] text-yellow-400 mb-8">Eficiencia de Capital Humano</h5>
                    <div className="grid grid-cols-2 gap-10">
                      <div className="relative z-10"><span className="text-5xl font-black block leading-none mb-2">{selectedCompany['NÚMERO MEDIO DE EMPLEADOS'] || '-'}</span><span className="text-[10px] uppercase font-bold text-gray-400 tracking-widest block">Pax Plantilla</span></div>
                      <div className="relative z-10"><span className="text-2xl font-black block leading-none mb-2 text-yellow-400">{formatCurrency((selectedCompany['IMPORTEN NETO DE LA CIFRA DE NEGOCIO'] || 0) / (selectedCompany['NÚMERO MEDIO DE EMPLEADOS'] || 1))}</span><span className="text-[10px] uppercase font-bold text-gray-400 tracking-widest block">Ventas / Pax</span></div>
                    </div>
                  </div>
                  <div className="bg-gray-100 p-10 border-l-8 border-slate-300">
                    <h5 className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-400 mb-6 flex items-center gap-2">Objeto Social / Actividad</h5>
                    <p className="text-md leading-relaxed italic font-serif text-slate-700 leading-relaxed">"{String(selectedCompany['OBJETO SOCIAL'] || 'Descripción no disponible en el registro mercantil.')}"</p>
                  </div>
                </div>
              </div>

              <div className="mt-20 flex justify-center">
                <button onClick={() => setSelectedCompany(null)} className="bg-black text-white px-24 py-6 font-black uppercase tracking-[0.4em] text-sm hover:bg-yellow-400 hover:text-black transition-all shadow-2xl active:scale-95 border-b-8 border-yellow-600">Cerrar Expediente</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}