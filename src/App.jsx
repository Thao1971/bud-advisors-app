import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, onSnapshot } from 'firebase/firestore';

// --- ICONOS SVG ---
const Icons = {
  Building: () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="16" height="20" x="4" y="2" rx="2" ry="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01"/><path d="M16 6h.01"/><path d="M8 10h.01"/><path d="M16 10h.01"/><path d="M8 14h.01"/><path d="M16 14h.01"/></svg>,
  Search: () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>,
  Cloud: () => <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.5 19c2.5 0 4.5-2 4.5-4.5 0-2.3-1.7-4.2-4-4.5-1.1-2.6-3.7-4.5-6.5-4.5-3.6 0-6.5 2.9-6.5 6.5 0 .3 0 .7.1 1C3.1 13.5 2 15.1 2 17c0 2.8 2.2 5 5 5h10.5"/></svg>,
  Upload: () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>,
  X: () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>,
  Alert: () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>
};

// --- CONFIGURACIÓN HÍBRIDA (CANVAS + NETLIFY) ---
const getFirebaseConfig = () => {
  // 1. Intento para entorno local/Canvas
  if (typeof __firebase_config !== 'undefined' && __firebase_config) {
    return JSON.parse(__firebase_config);
  }
  // 2. Intento para Netlify/Vite
  try {
    const viteEnv = import.meta.env.VITE_FIREBASE_CONFIG;
    if (viteEnv) return JSON.parse(viteEnv);
  } catch (e) {}
  return null;
};

const firebaseConfig = getFirebaseConfig();
const app = firebaseConfig ? initializeApp(firebaseConfig) : null;
const auth = app ? getAuth(app) : null;
const db = app ? getFirestore(app) : null;
const appId = typeof __app_id !== 'undefined' ? __app_id : "bud-advisors-prod";

const formatCurrency = (v) => (!v || isNaN(v)) ? '-' : new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v);

export default function App() {
  const [data, setData] = useState([]);
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState({ type: 'info', msg: 'Iniciando sistema...' });
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCompany, setSelectedCompany] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [isCloud, setIsCloud] = useState(false);

  // 1. Autenticación Robusta
  useEffect(() => {
    if (!auth) {
      setStatus({ type: 'error', msg: 'ERROR: Configuración Firebase no detectada en Netlify.' });
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
      if (u) setStatus({ type: 'success', msg: 'Conectado a la nube de BUD Advisors.' });
    });
  }, []);

  // 2. Sincronización en tiempo real
  useEffect(() => {
    if (!user || !db) return;

    const q = collection(db, 'artifacts', appId, 'public', 'data', 'companies');
    const unsubscribe = onSnapshot(q, 
      (snap) => {
        const docs = snap.docs.map(d => d.data());
        docs.sort((a, b) => (b['IMPORTEN NETO DE LA CIFRA DE NEGOCIO'] || 0) - (a['IMPORTEN NETO DE LA CIFRA DE NEGOCIO'] || 0));
        setData(docs);
        setIsCloud(true);
      },
      (err) => {
        if (err.code === 'permission-denied') {
          setStatus({ type: 'error', msg: 'Firestore: Permisos insuficientes. Revisa las reglas en Firebase.' });
        } else {
          setStatus({ type: 'error', msg: `Firestore Error: ${err.message}` });
        }
      }
    );

    return () => unsubscribe();
  }, [user]);

  // 3. Lógica de Actualización (Escritura en Firebase)
  const handleUpload = (e) => {
    const file = e.target.files[0];
    if (!file || !db || !user) {
      setStatus({ type: 'error', msg: 'No se puede subir: Sin conexión o archivo.' });
      return;
    }

    setUploading(true);
    setStatus({ type: 'info', msg: 'Procesando archivo CSV...' });

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
            await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'companies', id), obj);
            count++;
          }
        }
        setStatus({ type: 'success', msg: `¡Éxito! Se han actualizado ${count} agencias en la nube.` });
      } catch (err) {
        setStatus({ type: 'error', msg: `Fallo al subir: ${err.message}` });
      } finally {
        setUploading(false);
      }
    };
    reader.readAsText(file);
  };

  const filtered = data.filter(c => {
    const s = searchTerm.toLowerCase();
    return String(c['DENOMINACIÓN SOCIAL'] || '').toLowerCase().includes(s) || 
           String(c['CIF EMPRESA'] || '').toLowerCase().includes(s);
  });

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      {/* NAVBAR */}
      <nav className="bg-black text-white p-6 border-b-4 border-yellow-400 flex justify-between items-center sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <Icons.Building />
          <div className="flex flex-col">
            <span className="font-black text-xl tracking-tighter uppercase leading-none">BUD <span className="text-yellow-400 font-black">ADVISORS</span></span>
            <span className="text-[10px] tracking-widest text-gray-400 uppercase font-bold text-center">Market Intelligence</span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <label className={`bg-yellow-400 hover:bg-yellow-300 text-black px-6 py-2.5 font-black text-xs uppercase tracking-widest cursor-pointer transition-all flex items-center gap-2 shadow-lg ${uploading ? 'opacity-50 cursor-not-allowed' : ''}`}>
            <Icons.Upload />
            {uploading ? 'SINCRONIZANDO...' : 'ACTUALIZAR DATABASE'}
            <input type="file" onChange={handleUpload} className="hidden" accept=".csv" disabled={uploading} />
          </label>
        </div>
      </nav>

      {/* MONITOR DE ESTADO (CRUCIAL PARA DEBUG) */}
      <div className={`p-3 text-[10px] font-bold uppercase tracking-widest border-b flex items-center justify-center gap-2 ${
        status.type === 'error' ? 'bg-red-500 text-white' : 
        status.type === 'success' ? 'bg-green-500 text-white' : 'bg-blue-600 text-white'
      }`}>
        {status.type === 'error' && <Icons.Alert />}
        {status.msg}
      </div>

      <main className="max-w-7xl mx-auto p-8">
        {/* BUSCADOR */}
        <div className="bg-white p-6 shadow-xl mb-12 border-t-4 border-black flex items-center gap-4 group">
          <div className="text-gray-400 group-focus-within:text-yellow-500 transition-colors">
            <Icons.Search />
          </div>
          <input 
            className="w-full outline-none font-bold text-lg placeholder-gray-300 bg-transparent"
            placeholder="Buscar por nombre o CIF..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {/* LISTADO */}
        {data.length === 0 ? (
          <div className="text-center py-32 bg-white border-4 border-dashed border-gray-100 rounded">
            <p className="text-gray-400 font-black uppercase tracking-widest">Base de datos vacía o desconectada</p>
            <p className="text-xs text-gray-400 mt-2">Usa el botón "Actualizar Database" con tu CSV.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {filtered.map((c, i) => (
              <div 
                key={i} 
                onClick={() => setSelectedCompany(c)}
                className="bg-white border-2 border-gray-100 p-8 hover:shadow-2xl hover:-translate-y-1 transition-all cursor-pointer border-t-4 hover:border-t-yellow-400 group"
              >
                <div className="mb-6">
                  <span className="text-[9px] font-black bg-black text-white px-2 py-0.5 uppercase tracking-widest mb-2 inline-block">
                    {String(c['CATEGORÍA'] || 'GENERAL')}
                  </span>
                  <h3 className="text-xl font-black text-black group-hover:text-yellow-600 transition-colors uppercase truncate">
                    {String(c['ACRONIMO'] || c['DENOMINACIÓN SOCIAL'])}
                  </h3>
                  <p className="text-gray-400 text-xs font-mono">{String(c['CIF EMPRESA'])}</p>
                </div>

                <div className="space-y-3 border-t pt-4">
                  <div className="flex justify-between items-baseline">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">Facturación Neta</span>
                    <span className="font-black text-lg">{formatCurrency(c['IMPORTEN NETO DE LA CIFRA DE NEGOCIO'])}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* MODAL DETALLE */}
      {selectedCompany && (
        <div className="fixed inset-0 bg-black/95 backdrop-blur-md z-[100] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-2xl border-t-8 border-yellow-400 animate-in fade-in zoom-in duration-200">
            <div className="p-10">
              <div className="flex justify-between items-start mb-10">
                <div>
                  <h2 className="text-4xl font-black tracking-tighter uppercase leading-none mb-2">
                    {String(selectedCompany['DENOMINACIÓN SOCIAL'])}
                  </h2>
                  <p className="text-gray-400 font-mono text-sm mt-2">CIF: {String(selectedCompany['CIF EMPRESA'])}</p>
                </div>
                <button onClick={() => setSelectedCompany(null)} className="p-2 hover:bg-gray-100 rounded-full transition-colors text-black">
                  <Icons.X />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="bg-gray-50 p-8 border-l-4 border-black">
                  <h4 className="text-[10px] font-black text-gray-400 uppercase mb-4 tracking-widest">Finanzas</h4>
                  <div className="space-y-4">
                    <div className="flex justify-between border-b pb-2">
                      <span className="text-sm font-bold">Cifra de Negocio:</span>
                      <span className="font-black">{formatCurrency(selectedCompany['IMPORTEN NETO DE LA CIFRA DE NEGOCIO'])}</span>
                    </div>
                    <div className="flex justify-between border-b pb-2">
                      <span className="text-sm font-bold">EBITDA:</span>
                      <span className="font-black text-yellow-600">{formatCurrency(selectedCompany['EBITDA'])}</span>
                    </div>
                  </div>
                </div>
                <div className="bg-gray-50 p-8 border-l-4 border-yellow-400">
                   <h4 className="text-[10px] font-black text-gray-400 uppercase mb-4 tracking-widest">Operaciones</h4>
                   <div className="space-y-4">
                    <div className="flex justify-between border-b pb-2">
                      <span className="text-sm font-bold">Empleados:</span>
                      <span className="font-black">{selectedCompany['NÚMERO MEDIO DE EMPLEADOS'] || '-'} personas</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-12 flex justify-center">
                <button onClick={() => setSelectedCompany(null)} className="bg-black text-white px-12 py-4 font-black uppercase tracking-widest text-sm hover:bg-yellow-400 transition-all shadow-xl">
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