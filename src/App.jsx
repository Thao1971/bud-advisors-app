import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, onSnapshot } from 'firebase/firestore';

// --- ICONOS (Componentes funcionales para evitar errores de React) ---
const BuildingIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="16" height="20" x="4" y="2" rx="2" ry="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01"/><path d="M16 6h.01"/><path d="M8 10h.01"/><path d="M16 10h.01"/><path d="M8 14h.01"/><path d="M16 14h.01"/></svg>
);
const SearchIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
);
const CloudIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.5 19c2.5 0 4.5-2 4.5-4.5 0-2.3-1.7-4.2-4-4.5-1.1-2.6-3.7-4.5-6.5-4.5-3.6 0-6.5 2.9-6.5 6.5 0 .3 0 .7.1 1C3.1 13.5 2 15.1 2 17c0 2.8 2.2 5 5 5h10.5"/></svg>
);
const UploadIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>
);
const XIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
);
const ChartIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></svg>
);

// --- INICIALIZACIÓN ---
const getFirebaseConfig = () => {
  if (typeof __firebase_config !== 'undefined' && __firebase_config) {
    try { return JSON.parse(__firebase_config); } catch (e) { return null; }
  }
  return null;
};

const firebaseConfig = getFirebaseConfig();
const app = firebaseConfig ? initializeApp(firebaseConfig) : null;
const auth = app ? getAuth(app) : null;
const db = app ? getFirestore(app) : null;

// Saneamiento de AppId (Regla 1: Ruta estricta de 5 segmentos para colecciones)
const rawAppId = typeof __app_id !== 'undefined' ? __app_id : "bud_advisors_prod";
const appId = rawAppId.replace(/[^a-zA-Z0-9]/g, '_');

const formatCurrency = (v) => (!v || isNaN(v)) ? '-' : new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v);

export default function App() {
  const [data, setData] = useState([]);
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState({ type: 'info', msg: 'Estableciendo conexión...' });
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Todas');
  const [selectedSubcategory, setSelectedSubcategory] = useState('Todas');
  const [selectedCompany, setSelectedCompany] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);

  // 1. Autenticación (Regla 3)
  useEffect(() => {
    if (!auth) {
      setStatus({ type: 'error', msg: 'Error: Configuración de Firebase no detectada.' });
      setLoading(false);
      return;
    }
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (e) { 
        setStatus({ type: 'error', msg: `Fallo de conexión: ${e.message}` }); 
        setLoading(false);
      }
    };
    initAuth();
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (u) setStatus({ type: 'success', msg: 'SISTEMA ONLINE - Cloud Database Conectada' });
    });
  }, []);

  // 2. Sincronización (Regla 1 y 3)
  useEffect(() => {
    if (!user || !db) return;
    
    // Ruta Colección (5 segmentos): artifacts / appId / public / data / companies
    const q = collection(db, 'artifacts', appId, 'public', 'data', 'companies');
    
    const unsubscribe = onSnapshot(q, (snap) => {
      const docs = snap.docs.map(d => d.data());
      // Ordenar por facturación descendente
      docs.sort((a, b) => (Number(b['IMPORTEN NETO DE LA CIFRA DE NEGOCIO']) || 0) - (Number(a['IMPORTEN NETO DE LA CIFRA DE NEGOCIO']) || 0));
      setData(docs);
      setLoading(false);
    }, (err) => {
      setLoading(false);
      if (err.code === 'permission-denied') {
        setStatus({ type: 'error', msg: 'PERMISOS DENEGADOS: Actualiza las Reglas en Firebase Console.' });
      } else {
        setStatus({ type: 'error', msg: `Error Firestore: ${err.message}` });
      }
    });

    return () => unsubscribe();
  }, [user]);

  // 3. Carga masiva CSV
  const handleUpload = (e) => {
    const file = e.target.files[0];
    if (!file || !db || !user) return;
    setUploading(true);
    setStatus({ type: 'info', msg: 'Actualizando base de datos central...' });
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const text = ev.target.result;
        const lines = text.split('\n').filter(l => l.trim());
        const headers = lines[0].split(',').map(h => h.trim());
        
        let count = 0;
        for (let i = 1; i < lines.length; i++) {
          const values = lines[i].split(',');
          const obj = {};
          headers.forEach((h, idx) => {
            let val = values[idx]?.trim();
            if (val && !isNaN(val.replace(',', '.'))) val = parseFloat(val.replace(',', '.'));
            obj[h] = val;
          });
          
          if (obj['CIF EMPRESA']) {
            const id = String(obj['CIF EMPRESA']).replace(/[^a-zA-Z0-9]/g, '');
            // Ruta Documento (6 segmentos): artifacts/appId/public/data/companies/id
            await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'companies', id), obj);
            count++;
          }
        }
        setStatus({ type: 'success', msg: `¡Éxito! ${count} registros sincronizados.` });
      } catch (err) { setStatus({ type: 'error', msg: `Error: ${err.message}` }); }
      finally { setUploading(false); }
    };
    reader.readAsText(file);
  };

  // --- LÓGICA DE NEGOCIO ---
  const statsByCategory = useMemo(() => {
    const counts = {};
    data.forEach(c => {
      if (c['CATEGORÍA']) counts[c['CATEGORÍA']] = (counts[c['CATEGORÍA']] || 0) + 1;
    });
    return counts;
  }, [data]);

  const totalRevenue2024 = useMemo(() => {
    return data
      .filter(c => String(c['EJERCICIO']) === '2024')
      .reduce((sum, c) => sum + (Number(c['IMPORTEN NETO DE LA CIFRA DE NEGOCIO']) || 0), 0);
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
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      {/* NAVBAR */}
      <nav className="bg-black text-white p-6 border-b-4 border-yellow-400 flex justify-between items-center sticky top-0 z-50 shadow-2xl">
        <div className="flex items-center gap-3">
          <BuildingIcon />
          <div className="flex flex-col">
            <span className="font-black text-xl tracking-tighter uppercase leading-none italic">BUD <span className="text-yellow-400 font-black">ADVISORS</span></span>
            <span className="text-[10px] tracking-widest text-gray-400 uppercase font-bold mt-1">Intelligence Unit</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <label className={`bg-yellow-400 hover:bg-yellow-300 text-black px-6 py-2.5 font-black text-xs uppercase tracking-widest cursor-pointer transition-all flex items-center gap-2 shadow-lg ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
            <UploadIcon />
            {uploading ? 'SINCRONIZANDO...' : 'ACTUALIZAR DATABASE'}
            <input type="file" onChange={handleUpload} className="hidden" accept=".csv" disabled={uploading} />
          </label>
        </div>
      </nav>

      {/* MONITOR DE ESTADO */}
      <div className={`p-2.5 text-[10px] font-black uppercase tracking-[0.2em] text-center text-white ${status.type === 'error' ? 'bg-red-600' : status.type === 'success' ? 'bg-green-600' : 'bg-blue-600'}`}>
        {status.msg}
      </div>

      <main className="max-w-7xl mx-auto p-8">
        {/* PANEL DE ESTADÍSTICAS */}
        <section className="mb-12">
            <div className="flex items-center gap-2 mb-6 border-b-2 border-black pb-2">
                <ChartIcon />
                <h2 className="text-sm font-black uppercase tracking-widest">Dashboard de Mercado</h2>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                <div className="bg-black text-white p-4 border-l-4 border-yellow-400 shadow-sm">
                    <span className="text-[9px] font-bold text-gray-400 uppercase block mb-1">Agencias Totales</span>
                    <span className="text-3xl font-black">{data.length}</span>
                </div>
                <div className="bg-yellow-400 text-black p-4 border-l-4 border-black shadow-md">
                    <span className="text-[9px] font-black uppercase block mb-1">Volumen 2024</span>
                    <span className="text-lg font-black">{formatCurrency(totalRevenue2024)}</span>
                </div>
                {Object.entries(statsByCategory).slice(0, 4).map(([cat, count]) => (
                    <div key={cat} className="bg-white p-4 border border-gray-200 border-l-4 border-black shadow-sm">
                        <span className="text-[9px] font-bold text-gray-400 uppercase block mb-1 truncate">{cat}</span>
                        <span className="text-2xl font-black">{count}</span>
                    </div>
                ))}
            </div>
        </section>

        {/* TOP 10 */}
        <section className="mb-12">
            <div className="flex items-center gap-2 mb-6 border-b-2 border-black pb-2">
                <span className="text-yellow-500 font-black">★</span>
                <h2 className="text-sm font-black uppercase tracking-widest">Top 10 por Facturación</h2>
            </div>
            <div className="flex gap-4 overflow-x-auto pb-6 scrollbar-hide">
                {topTen.map((c, i) => (
                    <div key={i} onClick={() => setSelectedCompany(c)} className="min-w-[280px] bg-white border-2 border-gray-100 p-6 hover:border-yellow-400 transition-all cursor-pointer shadow-sm relative group">
                        <div className="absolute top-0 right-0 bg-yellow-400 text-black font-black px-2 py-1 text-[10px]">#{i+1}</div>
                        <span className="text-[8px] font-black bg-black text-white px-1.5 py-0.5 uppercase tracking-widest mb-2 inline-block">{c['CATEGORÍA']}</span>
                        <h3 className="font-black uppercase truncate text-sm mb-1 group-hover:text-yellow-600">{c['ACRONIMO'] || c['DENOMINACIÓN SOCIAL']}</h3>
                        <p className="text-[10px] font-black text-gray-700">{formatCurrency(c['IMPORTEN NETO DE LA CIFRA DE NEGOCIO'])}</p>
                    </div>
                ))}
            </div>
        </section>

        {/* BUSQUEDA Y FILTROS */}
        <div className="bg-white p-8 shadow-xl mb-12 border-t-8 border-black flex flex-col gap-8">
          <div className="flex items-center gap-4 border-b-2 border-gray-100 pb-4 group">
            <SearchIcon />
            <input 
              className="w-full outline-none font-bold text-xl placeholder-gray-200 bg-transparent"
              placeholder="Nombre, CIF o Acrónimo..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="flex flex-col gap-2">
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Sector / Categoría</span>
              <select className="p-3 bg-gray-50 border-2 border-transparent focus:border-yellow-400 outline-none font-bold text-sm cursor-pointer" value={selectedCategory} onChange={(e) => {setSelectedCategory(e.target.value); setSelectedSubcategory('Todas');}}>
                {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Subcategoría</span>
              <select className="p-3 bg-gray-50 border-2 border-transparent focus:border-yellow-400 outline-none font-bold text-sm cursor-pointer" value={selectedSubcategory} onChange={(e) => setSelectedSubcategory(e.target.value)} disabled={selectedCategory === 'Todas'}>
                {subcategories.map(sub => <option key={sub} value={sub}>{sub}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* LISTADO PRINCIPAL */}
        {loading ? (
            <div className="text-center py-20 font-black text-gray-300 animate-pulse uppercase tracking-widest">Sincronizando con la nube...</div>
        ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {filtered.map((c, i) => (
                <div key={i} onClick={() => setSelectedCompany(c)} className="bg-white border-2 border-gray-100 p-8 hover:shadow-2xl hover:-translate-y-2 transition-all cursor-pointer border-t-4 hover:border-t-yellow-400 group relative">
                <span className="text-[9px] font-black bg-black text-white px-2 py-0.5 uppercase tracking-widest mb-3 inline-block">{String(c['CATEGORÍA'] || 'EMPRESA')}</span>
                <h3 className="text-xl font-black text-black group-hover:text-yellow-600 transition-colors uppercase truncate mb-1">{String(c['ACRONIMO'] || c['DENOMINACIÓN SOCIAL'])}</h3>
                <p className="text-gray-400 text-xs font-mono mb-6">{String(c['CIF EMPRESA'])}</p>
                <div className="flex justify-between items-baseline border-t pt-4">
                    <span className="text-[10px] font-bold text-gray-400 uppercase">Facturación</span>
                    <span className="font-black text-lg tabular-nums">{formatCurrency(c['IMPORTEN NETO DE LA CIFRA DE NEGOCIO'])}</span>
                </div>
                </div>
            ))}
            </div>
        )}
      </main>

      {/* MODAL DETALLE */}
      {selectedCompany && (
        <div className="fixed inset-0 bg-black/95 backdrop-blur-md z-[100] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-5xl max-h-[92vh] overflow-y-auto shadow-2xl border-t-[12px] border-yellow-400">
            <div className="p-10 md:p-16 text-slate-900">
              <div className="flex justify-between items-start mb-12">
                <div>
                  <div className="flex items-center gap-2 mb-2 text-yellow-600 font-black text-[10px] uppercase tracking-widest"><CloudIcon /> EXPEDIENTE ESTRATÉGICO</div>
                  <h2 className="text-4xl md:text-5xl font-black tracking-tighter uppercase leading-tight mb-2">{String(selectedCompany['DENOMINACIÓN SOCIAL'])}</h2>
                  <p className="text-gray-400 font-mono text-sm">CIF: {String(selectedCompany['CIF EMPRESA'])} | {String(selectedCompany['CATEGORÍA'])}</p>
                </div>
                <button onClick={() => setSelectedCompany(null)} className="p-3 border-2 border-gray-100 rounded-full hover:bg-gray-100 transition-colors shadow-sm"><XIcon /></button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-16">
                <div className="space-y-6">
                  <h4 className="text-lg font-black uppercase border-b-4 border-black pb-2">Cuenta de Resultados</h4>
                  <div className="space-y-3 font-medium text-sm">
                    <div className="flex justify-between p-3 bg-gray-50 font-bold border-l-4 border-black"><span>(+) Ventas Netas</span><span>{formatCurrency(selectedCompany['IMPORTEN NETO DE LA CIFRA DE NEGOCIO'])}</span></div>
                    <div className="flex justify-between p-3 text-red-600 italic"><span>(-) Gastos de Personal</span><span>{formatCurrency(selectedCompany['GASTOS DE PERSONAL'])}</span></div>
                    <div className="flex justify-between p-3 bg-yellow-400/10 font-black text-lg border-l-4 border-yellow-400"><span>(=) EBITDA</span><span className="text-yellow-600">{formatCurrency(selectedCompany['EBITDA'])}</span></div>
                    <div className="flex justify-between p-3 border-t-4 border-black font-black text-2xl mt-4 bg-gray-50"><span>Resultado Neto</span><span>{formatCurrency(selectedCompany['RESULTADO DEL EJERCICIO'])}</span></div>
                  </div>
                </div>
                <div className="space-y-8">
                  <div className="bg-black text-white p-8 border-l-8 border-yellow-400 shadow-xl">
                    <div className="flex items-center gap-2 mb-6 text-yellow-400"><h5 className="text-[10px] font-black uppercase tracking-widest">Visión Estratégica</h5></div>
                    <div className="grid grid-cols-2 gap-8">
                      <div><span className="text-3xl font-black block">{selectedCompany['NÚMERO MEDIO DE EMPLEADOS'] || '-'}</span><span className="text-[10px] uppercase font-bold text-gray-400 block mt-2">Personal</span></div>
                      <div><span className="text-xl font-black block">{formatCurrency((selectedCompany['IMPORTEN NETO DE LA CIFRA DE NEGOCIO'] || 0) / (selectedCompany['NÚMERO MEDIO DE EMPLEADOS'] || 1))}</span><span className="text-[10px] uppercase font-bold text-gray-400 block mt-2">Eficiencia/Pax</span></div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-16 flex justify-center">
                <button onClick={() => setSelectedCompany(null)} className="bg-black text-white px-20 py-5 font-black uppercase tracking-widest text-sm hover:bg-yellow-400 hover:text-black transition-all shadow-2xl active:scale-95">Cerrar Análisis de Inteligencia</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}