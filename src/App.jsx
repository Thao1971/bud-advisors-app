import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, onSnapshot } from 'firebase/firestore';

// --- COMPONENTES DE ICONO (SVG para máxima compatibilidad) ---
const Icons = {
  Building: () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="16" height="20" x="4" y="2" rx="2" ry="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01"/><path d="M16 6h.01"/><path d="M8 10h.01"/><path d="M16 10h.01"/><path d="M8 14h.01"/><path d="M16 14h.01"/></svg>,
  Search: () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>,
  Filter: () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>,
  Cloud: () => <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.5 19c2.5 0 4.5-2 4.5-4.5 0-2.3-1.7-4.2-4-4.5-1.1-2.6-3.7-4.5-6.5-4.5-3.6 0-6.5 2.9-6.5 6.5 0 .3 0 .7.1 1C3.1 13.5 2 15.1 2 17c0 2.8 2.2 5 5 5h10.5"/></svg>,
  Upload: () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>,
  X: () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>,
  Trending: () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>,
  Users: () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
};

// --- CONFIGURACIÓN DE FIREBASE ---
// Se elimina el uso de import.meta para evitar errores de compatibilidad en el entorno de compilación
const getFirebaseConfig = () => {
  if (typeof __firebase_config !== 'undefined' && __firebase_config) {
    try {
      return JSON.parse(__firebase_config);
    } catch (e) {
      console.error("Error al parsear la configuración de Firebase:", e);
    }
  }
  return null;
};

const firebaseConfig = getFirebaseConfig();
const app = firebaseConfig ? initializeApp(firebaseConfig) : null;
const auth = app ? getAuth(app) : null;
const db = app ? getFirestore(app) : null;
const rawAppId = typeof __app_id !== 'undefined' ? __app_id : "bud-advisors-prod";
const appId = rawAppId.replace(/\//g, '_');

// --- UTILIDADES DE FORMATO ---
const formatCurrency = (v) => (!v || isNaN(v)) ? '-' : new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v);
const formatPercent = (v) => (!v || isNaN(v)) ? '-' : new Intl.NumberFormat('es-ES', { style: 'percent', maximumFractionDigits: 2 }).format(v);

export default function App() {
  const [data, setData] = useState([]);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Todas');
  const [selectedSubcategory, setSelectedSubcategory] = useState('Todas');
  const [selectedCompany, setSelectedCompany] = useState(null);
  const [isCloud, setIsCloud] = useState(false);

  // Autenticación inicial
  useEffect(() => {
    if (!auth) { setLoading(false); return; }
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (e) { console.error("Error de autenticación:", e); }
    };
    initAuth();
    return onAuthStateChanged(auth, setUser);
  }, []);

  // Sincronización con Firestore
  useEffect(() => {
    if (!user || !db) return;
    const q = collection(db, 'artifacts', appId, 'public', 'data', 'companies');
    
    const unsubscribe = onSnapshot(q, (snap) => {
      if (!snap.empty) {
        const docs = snap.docs.map(d => d.data());
        // Ordenar por facturación de mayor a menor por defecto
        docs.sort((a, b) => (b['IMPORTEN NETO DE LA CIFRA DE NEGOCIO'] || 0) - (a['IMPORTEN NETO DE LA CIFRA DE NEGOCIO'] || 0));
        setData(docs);
        setIsCloud(true);
      }
      setLoading(false);
    }, (err) => {
      console.warn("Error de permisos o red en Firestore:", err);
      setLoading(false);
    });
    
    return () => unsubscribe();
  }, [user]);

  // Procesamiento de CSV
  const handleUpload = (e) => {
    const file = e.target.files[0];
    if (!file || !db || !user) return;
    setUploading(true);
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const text = ev.target.result;
        const lines = text.split('\n').filter(l => l.trim());
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
      } catch (err) { console.error("Error en la carga masiva:", err); }
      finally { setUploading(false); }
    };
    reader.readAsText(file);
  };

  // Lógica de filtrado
  const categories = useMemo(() => ['Todas', ...new Set(data.map(c => c['CATEGORÍA']).filter(Boolean))], [data]);
  const subcategories = useMemo(() => ['Todas', ...new Set(data.filter(c => selectedCategory === 'Todas' || c['CATEGORÍA'] === selectedCategory).map(c => c['SUBCATEGORÍA']).filter(Boolean))], [data, selectedCategory]);

  const filtered = useMemo(() => {
    return data.filter(c => {
      const s = searchTerm.toLowerCase();
      const matchesSearch = String(c['DENOMINACIÓN SOCIAL'] || '').toLowerCase().includes(s) || 
                          String(c['CIF EMPRESA'] || '').toLowerCase().includes(s) ||
                          String(c['ACRONIMO'] || '').toLowerCase().includes(s);
      const matchesCat = selectedCategory === 'Todas' || c['CATEGORÍA'] === selectedCategory;
      const matchesSub = selectedSubcategory === 'Todas' || c['SUBCATEGORÍA'] === selectedSubcategory;
      return matchesSearch && matchesCat && matchesSub;
    });
  }, [data, searchTerm, selectedCategory, selectedSubcategory]);

  return (
    <div className="min-h-screen bg-gray-50 text-slate-900 font-sans selection:bg-yellow-100">
      {/* NAVEGACIÓN */}
      <nav className="bg-black text-white p-6 border-b-4 border-yellow-400 flex justify-between items-center sticky top-0 z-50 shadow-2xl">
        <div className="flex items-center gap-4">
          <Icons.Building />
          <div className="flex flex-col">
            <span className="font-black text-2xl tracking-tighter leading-none uppercase">BUD <span className="text-yellow-400">ADVISORS</span></span>
            <span className="text-[10px] tracking-[0.3em] text-gray-400 uppercase font-bold">Business Intelligence Unit</span>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className={`flex items-center gap-2 text-[10px] font-black px-4 py-1.5 rounded-full border transition-all ${isCloud ? 'text-green-400 border-green-400/30 bg-green-400/5' : 'text-yellow-400 border-yellow-400/30 bg-yellow-400/5'}`}>
            <div className={`w-2 h-2 rounded-full ${isCloud ? 'bg-green-400 animate-pulse' : 'bg-yellow-400'}`} />
            <span>{isCloud ? 'CONEXIÓN CLOUD ACTIVA' : 'SINCRONIZANDO...'}</span>
          </div>
          <label className="bg-yellow-400 hover:bg-yellow-300 text-black px-6 py-2.5 font-black text-xs uppercase tracking-widest cursor-pointer transition-all flex items-center gap-2 shadow-lg hover:shadow-yellow-400/20 active:scale-95">
            <Icons.Upload />
            {uploading ? 'SUBIENDO...' : 'ACTUALIZAR DATABASE'}
            <input type="file" onChange={handleUpload} className="hidden" accept=".csv" disabled={uploading} />
          </label>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto p-8">
        {/* PANEL DE CONTROL: BUSQUEDA Y FILTROS */}
        <div className="bg-white p-8 shadow-xl mb-12 border-t-8 border-black rounded-sm flex flex-col gap-8">
          <div className="flex gap-4 items-center border-b-2 border-gray-100 pb-6 group">
            <div className="text-gray-400 group-focus-within:text-yellow-500 transition-colors">
              <Icons.Search />
            </div>
            <input 
              className="w-full outline-none font-bold text-xl placeholder-gray-200"
              placeholder="Buscar por Nombre, CIF o Acrónimo..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Filtrar por Categoría</label>
              <div className="relative">
                <select 
                  className="w-full p-4 bg-gray-50 border-2 border-transparent focus:border-yellow-400 outline-none font-bold appearance-none cursor-pointer transition-all"
                  value={selectedCategory}
                  onChange={(e) => { setSelectedCategory(e.target.value); setSelectedSubcategory('Todas'); }}
                >
                  {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                </select>
                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400"><Icons.Filter /></div>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Filtrar por Subcategoría</label>
              <div className="relative">
                <select 
                  className="w-full p-4 bg-gray-50 border-2 border-transparent focus:border-yellow-400 outline-none font-bold appearance-none cursor-pointer transition-all"
                  value={selectedSubcategory}
                  onChange={(e) => setSelectedSubcategory(e.target.value)}
                  disabled={selectedCategory === 'Todas'}
                >
                  {subcategories.map(sub => <option key={sub} value={sub}>{sub}</option>)}
                </select>
                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400"><Icons.Filter /></div>
              </div>
            </div>
          </div>
        </div>

        {/* INDICADOR DE RESULTADOS */}
        <div className="mb-8 flex justify-between items-end border-b-4 border-black pb-4">
          <h2 className="text-3xl font-black uppercase tracking-tighter italic">Ranking Operativo</h2>
          <span className="text-sm font-bold text-gray-400 uppercase tracking-widest">{filtered.length} Empresas Identificadas</span>
        </div>

        {/* LISTADO DE EMPRESAS */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-32 text-gray-300">
            <div className="animate-spin mb-4"><Icons.Building /></div>
            <p className="font-black uppercase tracking-widest text-sm">Sincronizando Inteligencia de Mercado...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-32 bg-white border-4 border-dashed border-gray-100">
            <Icons.Search />
            <p className="mt-4 font-black text-gray-400 uppercase tracking-widest">No se han encontrado registros con estos filtros</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {filtered.map((c, i) => (
              <div 
                key={i} 
                onClick={() => setSelectedCompany(c)}
                className="bg-white border-2 border-gray-100 p-8 hover:shadow-2xl hover:-translate-y-2 transition-all cursor-pointer border-t-8 hover:border-t-yellow-400 group relative"
              >
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <span className="text-[9px] font-black bg-black text-white px-2 py-0.5 uppercase tracking-widest mb-2 inline-block">
                      {String(c['CATEGORÍA'] || 'GENERAL')}
                    </span>
                    <h3 className="text-xl font-black group-hover:text-yellow-600 transition-colors leading-tight uppercase truncate max-w-[200px]">
                      {String(c['ACRONIMO'] || c['DENOMINACIÓN SOCIAL'])}
                    </h3>
                    <p className="text-gray-400 text-[10px] font-mono mt-1">{String(c['CIF EMPRESA'])}</p>
                  </div>
                  <div className="bg-gray-50 p-2 rounded text-gray-300 group-hover:text-yellow-400 transition-colors">
                    <Icons.Trending />
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex justify-between items-baseline border-b border-gray-50 pb-3">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">Facturación Neta</span>
                    <span className="font-black text-xl tabular-nums">{formatCurrency(c['IMPORTEN NETO DE LA CIFRA DE NEGOCIO'])}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <div className="flex items-center gap-1.5 text-gray-500 font-bold uppercase tracking-tighter">
                      <Icons.Users />
                      <span>{String(c['NÚMERO MEDIO DE EMPLEADOS'] || '0')} Pax</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-green-600 font-black">
                      <span>EBITDA:</span>
                      <span>{formatCurrency(c['EBITDA'])}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* MODAL: EXPEDIENTE ESTRATÉGICO COMPLETO */}
      {selectedCompany && (
        <div className="fixed inset-0 bg-black/95 backdrop-blur-xl z-[100] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-5xl max-h-[92vh] overflow-y-auto shadow-2xl border-t-[12px] border-yellow-400 animate-in fade-in zoom-in duration-300">
            <div className="p-10 md:p-16">
              {/* HEADER DEL MODAL */}
              <div className="flex justify-between items-start mb-12">
                <div>
                  <div className="flex items-center gap-3 mb-4">
                    <span className="bg-black text-yellow-400 text-[10px] font-black px-3 py-1 uppercase tracking-[0.2em]">EXPEDIENTE ESTRATÉGICO</span>
                    <span className="text-gray-400 text-[10px] font-bold uppercase tracking-widest">{String(selectedCompany['CATEGORÍA'])} / {String(selectedCompany['SUBCATEGORÍA'])}</span>
                  </div>
                  <h2 className="text-4xl md:text-6xl font-black tracking-tighter uppercase leading-none mb-4">
                    {String(selectedCompany['DENOMINACIÓN SOCIAL'])}
                  </h2>
                  <div className="flex gap-4 text-gray-500 font-mono text-sm">
                    <span className="bg-gray-100 px-2 py-1 rounded">CIF: {String(selectedCompany['CIF EMPRESA'])}</span>
                    {selectedCompany['URL'] && <a href={String(selectedCompany['URL'])} target="_blank" rel="noopener noreferrer" className="hover:text-yellow-600 underline">Sitio Web Oficial</a>}
                  </div>
                </div>
                <button 
                  onClick={() => setSelectedCompany(null)}
                  className="p-3 hover:bg-gray-100 rounded-full transition-colors text-black border-2 border-gray-100"
                >
                  <Icons.X />
                </button>
              </div>

              {/* GRID DE KPIs */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-12">
                <div className="bg-gray-50 p-6 border-b-4 border-black">
                  <span className="text-[10px] font-black text-gray-400 uppercase mb-2 block tracking-widest">Ventas</span>
                  <span className="text-2xl font-black">{formatCurrency(selectedCompany['IMPORTEN NETO DE LA CIFRA DE NEGOCIO'])}</span>
                </div>
                <div className="bg-gray-50 p-6 border-b-4 border-yellow-400">
                  <span className="text-[10px] font-black text-gray-400 uppercase mb-2 block tracking-widest">EBITDA</span>
                  <span className="text-2xl font-black text-yellow-600">{formatCurrency(selectedCompany['EBITDA'])}</span>
                </div>
                <div className="bg-gray-50 p-6 border-b-4 border-black">
                  <span className="text-[10px] font-black text-gray-400 uppercase mb-2 block tracking-widest">Márgen EBITDA</span>
                  <span className="text-2xl font-black">{formatPercent((selectedCompany['EBITDA'] || 0) / (selectedCompany['IMPORTEN NETO DE LA CIFRA DE NEGOCIO'] || 1))}</span>
                </div>
                <div className="bg-gray-50 p-6 border-b-4 border-black">
                  <span className="text-[10px] font-black text-gray-400 uppercase mb-2 block tracking-widest">Neto Neto</span>
                  <span className={`text-2xl font-black ${selectedCompany['RESULTADO DEL EJERCICIO'] < 0 ? 'text-red-500' : 'text-green-600'}`}>
                    {formatCurrency(selectedCompany['RESULTADO DEL EJERCICIO'])}
                  </span>
                </div>
              </div>

              {/* MINI CUENTA DE RESULTADOS (P&L) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                <div className="space-y-6">
                  <h4 className="text-lg font-black uppercase border-b-4 border-black pb-2 flex justify-between">
                    <span>Estructura P&L</span>
                    <span className="text-gray-400 text-xs tracking-widest">VALORES EN EUR</span>
                  </h4>
                  <div className="space-y-3">
                    <div className="flex justify-between font-bold text-sm bg-gray-50 p-3">
                      <span>(+) Ventas Netas</span>
                      <span>{formatCurrency(selectedCompany['IMPORTEN NETO DE LA CIFRA DE NEGOCIO'])}</span>
                    </div>
                    <div className="flex justify-between text-sm p-3 text-red-500 italic">
                      <span>(-) Aprovisionamientos</span>
                      <span>{formatCurrency(selectedCompany['APROVISIONAMIENTOS'])}</span>
                    </div>
                    <div className="flex justify-between text-sm p-3 text-red-500 italic">
                      <span>(-) Gastos de Personal</span>
                      <span>{formatCurrency(selectedCompany['GASTOS DE PERSONAL'])}</span>
                    </div>
                    <div className="flex justify-between text-sm p-3 text-red-500 italic border-b">
                      <span>(-) Gastos de Explotación</span>
                      <span>{formatCurrency(selectedCompany['GASTOS DE EXPLOTACIÓN Y OTROS GASTOS DE EXPLOTACIÓN'])}</span>
                    </div>
                    <div className="flex justify-between font-black text-lg p-3 bg-yellow-400/10">
                      <span>(=) EBITDA</span>
                      <span className="text-yellow-600">{formatCurrency(selectedCompany['EBITDA'])}</span>
                    </div>
                    <div className="flex justify-between text-sm p-3 border-t italic opacity-60">
                      <span>Amortizaciones e Intereses</span>
                      <span>{formatCurrency((selectedCompany['AMORTIZACIONES'] || 0) + (selectedCompany['INTERESES'] || 0))}</span>
                    </div>
                    <div className="flex justify-between font-black text-xl p-3 border-t-4 border-black mt-4 bg-gray-50">
                      <span>Resultado Neto Ejercicio</span>
                      <span>{formatCurrency(selectedCompany['RESULTADO DEL EJERCICIO'])}</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-8">
                   <div className="bg-black text-white p-8">
                      <h5 className="text-[10px] font-black uppercase tracking-[0.2em] mb-4 text-yellow-400">Objeto Social / Actividad</h5>
                      <p className="text-sm leading-relaxed font-serif italic opacity-80">
                        "{String(selectedCompany['OBJETO SOCIAL'] || 'Descripción de actividad no registrada oficialmente.')}"
                      </p>
                   </div>
                   
                   <div className="grid grid-cols-2 gap-4">
                      <div className="p-6 bg-gray-100 border-l-4 border-black">
                         <span className="text-[10px] font-black text-gray-400 uppercase mb-2 block tracking-widest">Personal</span>
                         <span className="text-xl font-black">{String(selectedCompany['NÚMERO MEDIO DE EMPLEADOS'] || '0')} Pax</span>
                      </div>
                      <div className="p-6 bg-gray-100 border-l-4 border-yellow-400">
                         <span className="text-[10px] font-black text-gray-400 uppercase mb-2 block tracking-widest">Ratio Ventas/Pax</span>
                         <span className="text-xl font-black">{formatCurrency((selectedCompany['IMPORTEN NETO DE LA CIFRA DE NEGOCIO'] || 0) / (selectedCompany['NÚMERO MEDIO DE EMPLEADOS'] || 1))}</span>
                      </div>
                   </div>
                </div>
              </div>

              <div className="mt-16 flex justify-center">
                <button 
                  onClick={() => setSelectedCompany(null)}
                  className="bg-black text-white px-16 py-5 font-black uppercase tracking-widest text-sm hover:bg-yellow-400 hover:text-black transition-all shadow-2xl active:scale-95"
                >
                  Cerrar Expediente
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}