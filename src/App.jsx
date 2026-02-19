import React, { useState, useEffect, useMemo } from 'react';
import { 
  Search, 
  Upload, 
  Building2, 
  TrendingUp, 
  Users, 
  DollarSign, 
  BarChart3, 
  Filter, 
  X, 
  ChevronRight, 
  AlertCircle, 
  CheckCircle2,
  Database
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, onSnapshot } from 'firebase/firestore';

// --- CONFIGURACIÓN E INICIALIZACIÓN ---
const getFirebaseConfig = () => {
  if (typeof __firebase_config !== 'undefined' && __firebase_config) {
    try { return JSON.parse(__firebase_config); } catch (e) { return null; }
  }
  try {
    const env = import.meta.env.VITE_FIREBASE_CONFIG;
    return typeof env === 'string' ? JSON.parse(env) : env;
  } catch (e) { return null; }
};

const firebaseConfig = getFirebaseConfig();
const app = firebaseConfig ? initializeApp(firebaseConfig) : null;
const auth = app ? getAuth(app) : null;
const db = app ? getFirestore(app) : null;
// REGLA 1: Saneamiento de App ID para evitar errores de ruta en Firestore
const rawAppId = typeof __app_id !== 'undefined' ? __app_id : "bud-advisors-intelligence";
const appId = rawAppId.replace(/[^a-zA-Z0-9]/g, '_');

// --- UTILIDADES ---
const formatCurrency = (v) => (!v || isNaN(v)) ? '-' : new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v);

export default function App() {
  // --- ESTADO ---
  const [data, setData] = useState([]);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState({ type: 'info', msg: 'Iniciando sistema...' });
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Todas');
  const [selectedSubcategory, setSelectedSubcategory] = useState('Todas');
  const [selectedCompany, setSelectedCompany] = useState(null);

  // --- 1. AUTENTICACIÓN (REGLA 3) ---
  useEffect(() => {
    if (!auth) {
      setStatus({ type: 'error', msg: 'Configuración Firebase no detectada. Revisa Netlify.' });
      setLoading(false);
      return;
    }
    signInAnonymously(auth).catch(err => setStatus({ type: 'error', msg: `Error Auth: ${err.message}` }));
    return onAuthStateChanged(auth, setUser);
  }, []);

  // --- 2. SINCRONIZACIÓN DE DATOS (REGLA 1 Y 3) ---
  useEffect(() => {
    if (!db || !user) return;

    // Ruta de 5 segmentos para la colección
    const companiesRef = collection(db, 'artifacts', appId, 'public', 'data', 'companies');
    
    const unsubscribe = onSnapshot(companiesRef, 
      (snap) => {
        const docs = snap.docs.map(d => d.data());
        // Ordenar por facturación descendente por defecto
        docs.sort((a, b) => (Number(b['IMPORTEN NETO DE LA CIFRA DE NEGOCIO']) || 0) - (Number(a['IMPORTEN NETO DE LA CIFRA DE NEGOCIO']) || 0));
        setData(docs);
        setLoading(false);
        setStatus({ type: 'success', msg: 'Sistema Online - Datos Sincronizados' });
      },
      (err) => {
        setLoading(false);
        setStatus({ type: 'error', msg: err.code === 'permission-denied' ? 'Acceso Denegado: Revisa las Reglas en Firebase Console.' : err.message });
      }
    );
    return () => unsubscribe();
  }, [user]);

  // --- 3. LÓGICA DE CARGA ---
  const handleUpload = (e) => {
    const file = e.target.files[0];
    if (!file || !db || !user) return;
    
    setUploading(true);
    setStatus({ type: 'info', msg: 'Procesando archivo y subiendo a la nube...' });
    
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
        setStatus({ type: 'success', msg: `¡Éxito! ${count} agencias guardadas en la nube.` });
      } catch (err) {
        setStatus({ type: 'error', msg: `Fallo en la carga: ${err.message}` });
      } finally {
        setUploading(false);
      }
    };
    reader.readAsText(file);
  };

  // --- LÓGICA DE NEGOCIO / MÉTRICAS ---
  const categories = useMemo(() => ['Todas', ...new Set(data.map(c => c['CATEGORÍA']).filter(Boolean))], [data]);
  const subcategories = useMemo(() => ['Todas', ...new Set(data.filter(c => selectedCategory === 'Todas' || c['CATEGORÍA'] === selectedCategory).map(c => c['SUBCATEGORÍA']).filter(Boolean))], [data, selectedCategory]);

  const stats = useMemo(() => {
    const catCounts = {};
    let totalRev2024 = 0;
    data.forEach(c => {
      if (c['CATEGORÍA']) catCounts[c['CATEGORÍA']] = (catCounts[c['CATEGORÍA']] || 0) + 1;
      if (String(c['EJERCICIO']) === '2024') {
        totalRev2024 += (Number(c['IMPORTEN NETO DE LA CIFRA DE NEGOCIO']) || 0);
      }
    });
    return { catCounts, totalRev2024 };
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
    <div className="min-h-screen bg-[#f8f9fa] text-[#1a1a1a] font-sans selection:bg-yellow-200">
      {/* HEADER PRINCIPAL */}
      <nav className="bg-black text-white p-6 border-b-4 border-yellow-400 sticky top-0 z-50 shadow-2xl">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-4">
            <div className="p-2 bg-yellow-400 rounded-sm">
              <Building2 className="text-black w-6 h-6" />
            </div>
            <div className="flex flex-col">
              <span className="font-black text-2xl tracking-tighter uppercase leading-none">BUD <span className="text-yellow-400">ADVISORS</span></span>
              <span className="text-[10px] tracking-[0.3em] text-gray-400 font-bold uppercase mt-1">Intelligence Unit</span>
            </div>
          </div>
          <label className={`bg-yellow-400 hover:bg-yellow-300 text-black px-6 py-3 font-black text-xs uppercase tracking-widest cursor-pointer transition-all flex items-center gap-2 shadow-lg hover:scale-105 active:scale-95 ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
            <Upload className="w-4 h-4" />
            {uploading ? 'PROCESANDO...' : 'CARGAR CSV'}
            <input type="file" onChange={handleUpload} className="hidden" accept=".csv" disabled={uploading} />
          </label>
        </div>
      </nav>

      {/* BARRA DE ESTADO */}
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
        
        {/* PANEL DE INDICADORES (MÉTRICAS SOLICITADAS) */}
        <section className="mb-12">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-black text-white p-6 border-l-8 border-yellow-400 shadow-xl">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-2">Entidades Cargadas</span>
              <div className="flex items-baseline gap-2">
                <span className="text-5xl font-black leading-none">{data.length}</span>
                <span className="text-xs font-bold text-yellow-400 uppercase">Agencias</span>
              </div>
            </div>
            <div className="bg-white p-6 border-l-8 border-black shadow-lg">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-2">Facturación Total 2024</span>
              <span className="text-2xl font-black block text-green-600">{formatCurrency(stats.totalRev2024)}</span>
            </div>
            {Object.entries(stats.catCounts).slice(0, 2).map(([cat, count]) => (
              <div key={cat} className="bg-white p-6 border-l-8 border-gray-200 shadow-lg">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-2 truncate">{cat}</span>
                <span className="text-3xl font-black block leading-none">{count} agencias</span>
              </div>
            ))}
          </div>
        </section>

        {/* RANKING TOP 10 */}
        <section className="mb-16">
          <div className="flex items-center gap-3 mb-6 border-b-4 border-black pb-2">
            <TrendingUp className="w-6 h-6 text-yellow-500" />
            <h2 className="text-xl font-black uppercase tracking-tighter italic">Liderazgo de Mercado (Top 10)</h2>
          </div>
          <div className="flex gap-6 overflow-x-auto pb-6 snap-x">
            {topTen.map((c, i) => (
              <div 
                key={i} 
                onClick={() => setSelectedCompany(c)}
                className="min-w-[300px] bg-white border-2 border-gray-100 p-6 shadow-md snap-center hover:border-yellow-400 transition-all cursor-pointer group relative"
              >
                <div className="absolute -top-3 -left-3 w-8 h-8 bg-black text-yellow-400 flex items-center justify-center font-black text-xs rounded-full border-2 border-yellow-400">
                  {i + 1}
                </div>
                <span className="text-[9px] font-black bg-gray-100 text-gray-600 px-2 py-0.5 uppercase tracking-widest mb-3 inline-block rounded-sm">
                  {c['CATEGORÍA']}
                </span>
                <h3 className="font-black uppercase truncate text-lg mb-2 group-hover:text-yellow-600 transition-colors">
                  {c['ACRONIMO'] || c['DENOMINACIÓN SOCIAL']}
                </h3>
                <div className="flex justify-between items-end border-t pt-4">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Ventas</span>
                  <span className="font-black text-xl">{formatCurrency(c['IMPORTEN NETO DE LA CIFRA DE NEGOCIO'])}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* BUSCADOR Y FILTROS INTEGRADOS */}
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
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em] flex items-center gap-2">
                <Filter className="w-3 h-3" /> Categoría de Negocio
              </span>
              <select 
                className="w-full p-4 bg-gray-50 border-2 border-transparent focus:border-yellow-400 outline-none font-bold text-sm cursor-pointer transition-all"
                value={selectedCategory} 
                onChange={(e) => {setSelectedCategory(e.target.value); setSelectedSubcategory('Todas');}}
              >
                {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em] flex items-center gap-2">
                <Filter className="w-3 h-3" /> Especialidad
              </span>
              <select 
                className="w-full p-4 bg-gray-50 border-2 border-transparent focus:border-yellow-400 outline-none font-bold text-sm cursor-pointer transition-all disabled:opacity-30"
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
        <div className="flex justify-between items-end mb-6 border-b-2 border-black pb-2">
          <h2 className="text-sm font-black uppercase tracking-widest italic">Base de Inteligencia BUD ({filtered.length})</h2>
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Ejercicios Consolidados</span>
        </div>
        
        {loading ? (
          <div className="text-center py-32 animate-pulse flex flex-col items-center gap-4">
            <Database className="w-12 h-12 text-gray-200" />
            <span className="font-black text-gray-300 uppercase tracking-[0.4em]">Sincronizando con la nube de Google</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {filtered.map((c, i) => (
              <div 
                key={i} 
                onClick={() => setSelectedCompany(c)} 
                className="bg-white border-2 border-gray-100 p-8 hover:shadow-2xl transition-all cursor-pointer border-t-4 hover:border-t-yellow-400 group relative"
              >
                <span className="text-[9px] font-black bg-black text-white px-2 py-0.5 uppercase tracking-widest mb-4 inline-block">
                  {c['CATEGORÍA'] || 'SIN CATEGORÍA'}
                </span>
                <h3 className="text-xl font-black text-black group-hover:text-yellow-600 transition-colors uppercase truncate mb-1">
                  {c['ACRONIMO'] || c['DENOMINACIÓN SOCIAL']}
                </h3>
                <p className="text-gray-400 text-[10px] font-mono mb-8 flex items-center gap-2">
                  <Database className="w-3 h-3" /> {c['CIF EMPRESA']}
                </p>
                <div className="flex justify-between items-baseline border-t pt-4">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Cifra Negocio</span>
                  <span className="font-black text-2xl tabular-nums">{formatCurrency(c['IMPORTEN NETO DE LA CIFRA DE NEGOCIO'])}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {filtered.length === 0 && !loading && (
          <div className="text-center py-32 bg-white border-4 border-dashed border-gray-100 rounded-lg">
            <Search className="w-12 h-12 text-gray-100 mx-auto mb-4" />
            <p className="font-black text-gray-300 uppercase tracking-widest text-lg">No se han encontrado coincidencias</p>
          </div>
        )}
      </main>

      {/* MODAL DETALLE EXPEDIENTE (SOLICITADO) */}
      {selectedCompany && (
        <div className="fixed inset-0 bg-black/95 backdrop-blur-md z-[100] flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-6xl my-auto shadow-2xl border-t-[12px] border-yellow-400 animate-in fade-in zoom-in duration-300">
            <div className="p-8 md:p-16">
              <div className="flex justify-between items-start mb-12">
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <span className="bg-black text-yellow-400 text-[10px] font-black px-3 py-1 uppercase tracking-[0.2em]">Expediente de Inteligencia</span>
                    <TrendingUp className="w-4 h-4 text-yellow-500" />
                  </div>
                  <h2 className="text-4xl md:text-7xl font-black tracking-tighter uppercase leading-none mb-4">
                    {selectedCompany['DENOMINACIÓN SOCIAL']}
                  </h2>
                  <p className="text-gray-400 font-mono text-sm flex gap-6">
                    <span>CIF: <span className="text-black font-bold">{selectedCompany['CIF EMPRESA']}</span></span>
                    <span>SECTOR: <span className="text-black font-bold uppercase">{selectedCompany['CATEGORÍA']}</span></span>
                    <span>EJERCICIO: <span className="text-yellow-600 font-bold italic">{selectedCompany['EJERCICIO']}</span></span>
                  </p>
                </div>
                <button 
                  onClick={() => setSelectedCompany(null)} 
                  className="p-4 border-2 border-gray-100 rounded-full hover:bg-gray-100 transition-all text-black hover:rotate-90"
                >
                  <X className="w-8 h-8" />
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-16">
                {/* ESTRUCTURA P&L DETALLADA */}
                <div className="space-y-8">
                  <h4 className="text-xl font-black uppercase border-b-4 border-black pb-2 flex justify-between items-end">
                    <span>Cuenta de Resultados</span>
                    <span className="text-[10px] text-gray-400 tracking-widest font-bold">UNIDAD: EUR</span>
                  </h4>
                  <div className="space-y-4 text-sm font-medium">
                    <div className="flex justify-between p-4 bg-gray-50 border-l-4 border-black group hover:bg-gray-100 transition-all">
                      <span className="font-bold flex items-center gap-2 uppercase tracking-tighter italic">Ventas Netas</span>
                      <span className="text-xl font-black tabular-nums">{formatCurrency(selectedCompany['IMPORTEN NETO DE LA CIFRA DE NEGOCIO'])}</span>
                    </div>
                    <div className="flex justify-between p-4 text-red-600 border-b border-gray-50 italic">
                      <span>(-) Gastos de Personal</span>
                      <span className="font-bold">{formatCurrency(selectedCompany['GASTOS DE PERSONAL'])}</span>
                    </div>
                    <div className="flex justify-between p-4 text-red-600 border-b border-gray-50 italic">
                      <span>(-) Otros Gastos de Explotación</span>
                      <span className="font-bold">{formatCurrency(selectedCompany['GASTOS DE EXPLOTACIÓN Y OTROS GASTOS DE EXPLOTACIÓN'])}</span>
                    </div>
                    <div className="flex justify-between p-5 bg-yellow-400/10 border-l-4 border-yellow-400">
                      <span className="font-black text-lg uppercase tracking-tighter">(=) EBITDA Operativo</span>
                      <span className="text-2xl font-black text-yellow-600 tabular-nums">{formatCurrency(selectedCompany['EBITDA'])}</span>
                    </div>
                    <div className="flex justify-between p-4 border-t-4 border-black bg-black text-white shadow-xl">
                      <span className="font-black text-xl uppercase tracking-tighter italic">Resultado Neto Ejercicio</span>
                      <span className="text-3xl font-black tabular-nums text-yellow-400">{formatCurrency(selectedCompany['RESULTADO DEL EJERCICIO'])}</span>
                    </div>
                  </div>
                </div>

                {/* RATIOS Y VISIÓN DE NEGOCIO */}
                <div className="space-y-10">
                  <div className="bg-black text-white p-10 border-l-8 border-yellow-400 shadow-2xl relative overflow-hidden group">
                    <TrendingUp className="absolute -right-10 -bottom-10 w-40 h-40 text-white/5 group-hover:scale-110 transition-transform duration-700" />
                    <h5 className="text-[10px] font-black uppercase tracking-[0.3em] text-yellow-400 mb-8">Ratios de Capital Humano</h5>
                    <div className="grid grid-cols-2 gap-10">
                      <div className="relative z-10">
                        <span className="text-5xl font-black block leading-none mb-2 tracking-tighter">{selectedCompany['NÚMERO MEDIO DE EMPLEADOS'] || '-'}</span>
                        <span className="text-[10px] uppercase font-bold text-gray-400 tracking-widest block">Consultores / Pax</span>
                      </div>
                      <div className="relative z-10">
                        <span className="text-2xl font-black block leading-none mb-2 tracking-tighter text-yellow-400">
                          {formatCurrency((selectedCompany['IMPORTEN NETO DE LA CIFRA DE NEGOCIO'] || 0) / (selectedCompany['NÚMERO MEDIO DE EMPLEADOS'] || 1))}
                        </span>
                        <span className="text-[10px] uppercase font-bold text-gray-400 tracking-widest block">Productividad / Pax</span>
                      </div>
                    </div>
                  </div>
                  <div className="bg-gray-100 p-10 border-l-8 border-slate-300">
                    <h5 className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-400 mb-6 flex items-center gap-2">
                       Objeto Social Registrado
                    </h5>
                    <p className="text-md leading-relaxed italic font-serif text-slate-700">
                      "{String(selectedCompany['OBJETO SOCIAL'] || 'Descripción de actividad no disponible en el registro mercantil del último ejercicio.')}"
                    </p>
                  </div>
                  <div className="flex gap-4">
                    <button className="flex-1 bg-black text-white p-4 font-black uppercase text-xs tracking-widest hover:bg-yellow-400 hover:text-black transition-all">Exportar PDF</button>
                    <button className="flex-1 border-4 border-black p-4 font-black uppercase text-xs tracking-widest hover:bg-black hover:text-white transition-all">Añadir a Comparativa</button>
                  </div>
                </div>
              </div>

              <div className="mt-20 flex justify-center">
                <button 
                  onClick={() => setSelectedCompany(null)} 
                  className="bg-black text-white px-24 py-6 font-black uppercase tracking-[0.4em] text-sm hover:bg-yellow-400 hover:text-black transition-all shadow-2xl active:scale-95 border-b-8 border-yellow-600"
                >
                  Cerrar Análisis de Inteligencia
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}