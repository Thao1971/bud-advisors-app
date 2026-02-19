import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, onSnapshot } from 'firebase/firestore';

// --- COMPONENTES DE ICONO (SVG independientes para evitar errores de renderizado de objetos) ---
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

const CloseIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
);

const TrendingIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>
);

const FilterIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
);

// --- CONFIGURACIÓN E INICIALIZACIÓN ---
const getFirebaseConfig = () => {
  if (typeof __firebase_config !== 'undefined' && __firebase_config) {
    try {
      return JSON.parse(__firebase_config);
    } catch (e) {
      console.error("Error parseando __firebase_config");
    }
  }
  return null;
};

const firebaseConfig = getFirebaseConfig();
const app = firebaseConfig ? initializeApp(firebaseConfig) : null;
const auth = app ? getAuth(app) : null;
const db = app ? getFirestore(app) : null;

// REGLA 1: Saneamos el appId para que sea un solo segmento (sin barras diagonales)
const rawAppId = typeof __app_id !== 'undefined' ? __app_id : "bud-advisors-prod";
const appId = rawAppId.replace(/\//g, '_');

const formatCurrency = (v) => (!v || isNaN(v)) ? '-' : new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v);
const formatPercent = (v) => (!v || isNaN(v)) ? '-' : new Intl.NumberFormat('es-ES', { style: 'percent', maximumFractionDigits: 2 }).format(v);

export default function App() {
  const [data, setData] = useState([]);
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState({ type: 'info', msg: 'Sincronizando...' });
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Todas');
  const [selectedSubcategory, setSelectedSubcategory] = useState('Todas');
  const [selectedCompany, setSelectedCompany] = useState(null);
  const [uploading, setUploading] = useState(false);

  // 1. Autenticación (REGLA 3: Auth Before Queries)
  useEffect(() => {
    if (!auth) {
      setStatus({ type: 'error', msg: 'ERROR: Configuración Firebase no detectada.' });
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
        setStatus({ type: 'error', msg: `Error de conexión: ${e.message}` }); 
      }
    };
    initAuth();
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (u) setStatus({ type: 'success', msg: 'SISTEMA ONLINE - Cloud Database Conectada' });
    });
  }, []);

  // 2. Escucha de Datos (REGLA 1 & 3)
  useEffect(() => {
    if (!user || !db) return;
    
    // Ruta: /artifacts/{appId}/public/data/companies (5 segmentos = ODD)
    const q = collection(db, 'artifacts', appId, 'public', 'data', 'companies');
    
    const unsubscribe = onSnapshot(q, (snap) => {
      const docs = snap.docs.map(d => d.data());
      // Ordenar por facturación descendente por defecto
      docs.sort((a, b) => (Number(b['IMPORTEN NETO DE LA CIFRA DE NEGOCIO']) || 0) - (Number(a['IMPORTEN NETO DE LA CIFRA DE NEGOCIO']) || 0));
      setData(docs);
    }, (err) => {
      setStatus({ type: 'error', msg: err.code === 'permission-denied' ? 'Firestore: Permisos insuficientes.' : err.message });
    });
    
    return () => unsubscribe();
  }, [user]);

  // 3. Lógica de Carga masiva
  const handleUpload = (e) => {
    const file = e.target.files[0];
    if (!file || !db || !user) return;
    setUploading(true);
    setStatus({ type: 'info', msg: 'Actualizando base de datos central...' });
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const lines = ev.target.result.split('\n').filter(l => l.trim());
        const headers = lines[0].split(',').map(h => h.trim());
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
            await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'companies', id), obj);
          }
        }
        setStatus({ type: 'success', msg: '¡Base de datos sincronizada con éxito!' });
      } catch (err) { 
        setStatus({ type: 'error', msg: `Fallo en carga: ${err.message}` }); 
      } finally { 
        setUploading(false); 
      }
    };
    reader.readAsText(file);
  };

  // Filtros dinámicos
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
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-yellow-100">
      {/* NAVBAR */}
      <nav className="bg-black text-white p-6 border-b-4 border-yellow-400 flex justify-between items-center sticky top-0 z-50 shadow-2xl">
        <div className="flex items-center gap-3">
          <BuildingIcon />
          <div className="flex flex-col leading-none">
            <span className="font-black text-xl tracking-tighter uppercase">BUD <span className="text-yellow-400">ADVISORS</span></span>
            <span className="text-[10px] tracking-widest text-gray-400 uppercase font-bold mt-1">Market Intelligence</span>
          </div>
        </div>
        <label className={`bg-yellow-400 hover:bg-yellow-300 text-black px-6 py-2.5 font-black text-xs uppercase tracking-widest cursor-pointer transition-all flex items-center gap-2 shadow-lg ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
          <UploadIcon />
          {uploading ? 'PROCESANDO...' : 'ACTUALIZAR DATABASE'}
          <input type="file" onChange={handleUpload} className="hidden" accept=".csv" disabled={uploading} />
        </label>
      </nav>

      {/* MONITOR DE ESTADO */}
      <div className={`p-2.5 text-[10px] font-black uppercase tracking-[0.2em] text-center text-white ${status.type === 'error' ? 'bg-red-600' : status.type === 'success' ? 'bg-green-600' : 'bg-blue-600'}`}>
        {status.msg}
      </div>

      <main className="max-w-7xl mx-auto p-8">
        {/* BUSQUEDA Y FILTROS */}
        <div className="bg-white p-8 shadow-xl mb-12 border-t-8 border-black flex flex-col gap-6">
          <div className="flex items-center gap-4 border-b-2 border-gray-100 pb-4 group">
            <div className="text-gray-400 group-focus-within:text-yellow-500 transition-colors"><SearchIcon /></div>
            <input 
              className="w-full outline-none font-bold text-xl placeholder-gray-200"
              placeholder="Buscar por Nombre, CIF o Acrónimo..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="flex flex-col gap-2">
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Sector / Categoría</span>
              <div className="relative">
                <select className="w-full p-3 bg-gray-50 border-2 border-transparent focus:border-yellow-400 outline-none font-bold text-sm appearance-none cursor-pointer" value={selectedCategory} onChange={(e) => {setSelectedCategory(e.target.value); setSelectedSubcategory('Todas');}}>
                  {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400"><FilterIcon /></div>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Especialidad</span>
              <div className="relative">
                <select className="w-full p-3 bg-gray-50 border-2 border-transparent focus:border-yellow-400 outline-none font-bold text-sm appearance-none cursor-pointer" value={selectedSubcategory} onChange={(e) => setSelectedSubcategory(e.target.value)} disabled={selectedCategory === 'Todas'}>
                  {subcategories.map(sub => <option key={sub} value={sub}>{sub}</option>)}
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400"><FilterIcon /></div>
              </div>
            </div>
          </div>
        </div>

        {/* LISTADO */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {filtered.map((c, i) => (
            <div key={i} onClick={() => setSelectedCompany(c)} className="bg-white border-2 border-gray-100 p-8 hover:shadow-2xl hover:-translate-y-1 transition-all cursor-pointer border-t-4 hover:border-t-yellow-400 group">
              <span className="text-[9px] font-black bg-black text-white px-2 py-0.5 uppercase tracking-widest mb-3 inline-block">{String(c['CATEGORÍA'] || 'EMPRESA')}</span>
              <h3 className="text-xl font-black text-black group-hover:text-yellow-600 transition-colors uppercase truncate mb-1">{String(c['ACRONIMO'] || c['DENOMINACIÓN SOCIAL'])}</h3>
              <p className="text-gray-400 text-xs font-mono mb-6">{String(c['CIF EMPRESA'])}</p>
              <div className="flex justify-between items-baseline border-t pt-4">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">Ventas Netas</span>
                <span className="font-black text-lg tabular-nums">{formatCurrency(c['IMPORTEN NETO DE LA CIFRA DE NEGOCIO'])}</span>
              </div>
              <div className="flex justify-between items-center mt-3 text-xs">
                <span className="text-gray-400 font-bold uppercase tracking-widest">EBITDA</span>
                <span className="font-black text-green-600">{formatCurrency(c['EBITDA'])}</span>
              </div>
            </div>
          ))}
        </div>

        {filtered.length === 0 && !status.msg.includes('Sincronizando') && (
          <div className="text-center py-32 bg-white border-4 border-dashed border-gray-100 rounded-lg">
            <SearchIcon />
            <p className="mt-4 font-black text-gray-300 uppercase tracking-widest text-lg">Sin coincidencias en el registro</p>
          </div>
        )}
      </main>

      {/* MODAL DETALLE: CUENTA DE RESULTADOS (P&L) */}
      {selectedCompany && (
        <div className="fixed inset-0 bg-black/95 backdrop-blur-md z-[100] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-5xl max-h-[92vh] overflow-y-auto shadow-2xl border-t-[12px] border-yellow-400 animate-in fade-in zoom-in duration-300">
            <div className="p-10 md:p-16">
              <div className="flex justify-between items-start mb-12">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="bg-black text-yellow-400 text-[10px] font-black px-2 py-1 uppercase tracking-widest">EXPEDIENTE ESTRATÉGICO</span>
                    <CloudIcon />
                  </div>
                  <h2 className="text-4xl md:text-6xl font-black tracking-tighter uppercase leading-tight mb-4">{String(selectedCompany['DENOMINACIÓN SOCIAL'])}</h2>
                  <p className="text-gray-400 font-mono text-sm">CIF: {String(selectedCompany['CIF EMPRESA'])} | {String(selectedCompany['CATEGORÍA'])} / {String(selectedCompany['SUBCATEGORÍA'])}</p>
                </div>
                <button onClick={() => setSelectedCompany(null)} className="p-3 hover:bg-gray-100 rounded-full text-black border-2 border-gray-100 transition-colors"><CloseIcon /></button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-16">
                {/* ESTRUCTURA P&L */}
                <div className="space-y-6">
                  <h4 className="text-lg font-black uppercase border-b-4 border-black pb-2 flex justify-between items-end">
                    <span>Estructura de Resultados</span>
                    <span className="text-[10px] text-gray-400 tracking-widest">CIFRAS EN EUR</span>
                  </h4>
                  <div className="space-y-3 font-medium text-sm">
                    <div className="flex justify-between p-3 bg-gray-50 font-bold"><span>(+) Ventas Netas</span><span>{formatCurrency(selectedCompany['IMPORTEN NETO DE LA CIFRA DE NEGOCIO'])}</span></div>
                    <div className="flex justify-between p-3 text-red-600 italic"><span>(-) Aprovisionamientos</span><span>{formatCurrency(selectedCompany['APROVISIONAMIENTOS'])}</span></div>
                    <div className="flex justify-between p-3 text-red-600 italic"><span>(-) Gastos de Personal</span><span>{formatCurrency(selectedCompany['GASTOS DE PERSONAL'])}</span></div>
                    <div className="flex justify-between p-3 text-red-600 italic border-b-2"><span>(-) Otros Gastos de Explotación</span><span>{formatCurrency(selectedCompany['GASTOS DE EXPLOTACIÓN Y OTROS GASTOS DE EXPLOTACIÓN'])}</span></div>
                    <div className="flex justify-between p-3 bg-yellow-400/10 font-black text-lg"><span>(=) EBITDA</span><span className="text-yellow-600">{formatCurrency(selectedCompany['EBITDA'])}</span></div>
                    <div className="flex justify-between p-3 italic opacity-60"><span>Amortizaciones e Intereses</span><span>{formatCurrency((selectedCompany['AMORTIZACIONES'] || 0) + (selectedCompany['INTERESES'] || 0))}</span></div>
                    <div className="flex justify-between p-3 border-t-4 border-black font-black text-2xl mt-4 bg-gray-50"><span>Resultado Neto Ejercicio</span><span>{formatCurrency(selectedCompany['RESULTADO DEL EJERCICIO'])}</span></div>
                  </div>
                </div>

                {/* RATIOS Y VISIÓN */}
                <div className="space-y-8">
                  <div className="bg-black text-white p-8">
                    <div className="flex items-center gap-2 mb-6 text-yellow-400"><TrendingIcon /><h5 className="text-[10px] font-black uppercase tracking-widest">Capital Humano y Eficiencia</h5></div>
                    <div className="grid grid-cols-2 gap-8">
                      <div><span className="text-4xl font-black block leading-none">{selectedCompany['NÚMERO MEDIO DE EMPLEADOS'] || '-'}</span><span className="text-[10px] uppercase font-bold text-gray-400 mt-2 block tracking-widest">Consultores</span></div>
                      <div><span className="text-xl font-black block leading-none">{formatCurrency((selectedCompany['IMPORTEN NETO DE LA CIFRA DE NEGOCIO'] || 0) / (selectedCompany['NÚMERO MEDIO DE EMPLEADOS'] || 1))}</span><span className="text-[10px] uppercase font-bold text-gray-400 mt-2 block tracking-widest">Ventas / Pax</span></div>
                    </div>
                  </div>
                  <div className="bg-gray-100 p-8 border-l-8 border-yellow-400">
                    <h5 className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-4">Objeto Social Registrado</h5>
                    <p className="text-sm leading-relaxed italic font-serif text-gray-600">"{String(selectedCompany['OBJETO SOCIAL'] || 'Descripción de actividad no detallada en el registro mercantil.')}"</p>
                  </div>
                  <div className="p-6 border-2 border-black text-center group hover:bg-black hover:text-white transition-all">
                     <span className="text-[10px] font-black uppercase tracking-[0.3em]">Margen EBITDA: {formatPercent((selectedCompany['EBITDA'] || 0) / (selectedCompany['IMPORTEN NETO DE LA CIFRA DE NEGOCIO'] || 1))}</span>
                  </div>
                </div>
              </div>

              <div className="mt-16 flex justify-center">
                <button onClick={() => setSelectedCompany(null)} className="bg-black text-white px-20 py-5 font-black uppercase tracking-widest text-sm hover:bg-yellow-400 hover:text-black transition-all shadow-2xl active:scale-95">Cerrar Expediente</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}