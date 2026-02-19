import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, onSnapshot } from 'firebase/firestore';

// --- COMPONENTES DE ICONO (SVG para máxima compatibilidad) ---
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

// --- DATOS DE PRUEBA (Para cuando no hay conexión) ---
const MOCK_DATA = [
  { "CIF EMPRESA": "B12345678", "DENOMINACIÓN SOCIAL": "AGENCIA DE PRUEBA SL", "ACRONIMO": "DEMO AD", "CATEGORÍA": "MARKETING", "IMPORTEN NETO DE LA CIFRA DE NEGOCIO": 1500000, "EBITDA": 350000, "RESULTADO DEL EJERCICIO": 120000, "NÚMERO MEDIO DE EMPLEADOS": 15, "OBJETO SOCIAL": "Esta es una empresa de ejemplo para visualizar el diseño." }
];

// --- INICIALIZACIÓN SEGURA ---
const getFirebaseConfig = () => {
  if (typeof __firebase_config !== 'undefined' && __firebase_config) {
    try { return JSON.parse(__firebase_config); } catch (e) { return null; }
  }
  // Intentar leer de variables de Netlify (Vite) de forma segura
  try {
    const env = import.meta.env.VITE_FIREBASE_CONFIG;
    if (env) return JSON.parse(env);
  } catch (e) { /* Fallback */ }
  return null;
};

const firebaseConfig = getFirebaseConfig();
const app = firebaseConfig ? initializeApp(firebaseConfig) : null;
const auth = app ? getAuth(app) : null;
const db = app ? getFirestore(app) : null;
const rawAppId = typeof __app_id !== 'undefined' ? __app_id : "bud-advisors-app";
const appId = rawAppId.replace(/\//g, '_');

const formatCurrency = (v) => (!v || isNaN(v)) ? '-' : new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v);

export default function App() {
  const [data, setData] = useState(MOCK_DATA);
  const [user, setUser] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCompany, setSelectedCompany] = useState(null);
  const [loading, setLoading] = useState(!!app);
  const [uploading, setUploading] = useState(false);
  const [isCloud, setIsCloud] = useState(false);

  // 1. Gestión de Autenticación
  useEffect(() => {
    if (!auth) {
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
      } catch (e) { console.error("Error Auth:", e); }
    };
    initAuth();
    return onAuthStateChanged(auth, setUser);
  }, []);

  // 2. Escucha de Datos (Firebase)
  useEffect(() => {
    if (!user || !db) return;

    const q = collection(db, 'artifacts', appId, 'public', 'data', 'companies');
    const unsubscribe = onSnapshot(q, 
      (snap) => {
        if (!snap.empty) {
          setData(snap.docs.map(doc => doc.data()));
          setIsCloud(true);
        }
        setLoading(false);
      },
      (err) => {
        console.warn("Firestore inaccesible. Usando datos locales.");
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, [user]);

  // 3. Lógica de Subida de Archivos
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target.result;
        const lines = text.split('\n').filter(l => l.trim());
        if (lines.length < 2) return;

        const headers = lines[0].split(',').map(h => h.trim());
        const companies = lines.slice(1).map(line => {
          const values = line.split(',');
          const obj = {};
          headers.forEach((h, i) => {
            let val = values[i]?.trim();
            if (val && !isNaN(val)) val = parseFloat(val);
            obj[h] = val;
          });
          return obj;
        }).filter(c => c['CIF EMPRESA']);

        if (db && user) {
          // Si hay nube, guardamos en la nube
          for (const company of companies) {
            const id = String(company['CIF EMPRESA']).replace(/[^a-zA-Z0-9]/g, '');
            await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'companies', id), company);
          }
        } else {
          // Si no hay nube, actualizamos la vista local
          setData(companies);
        }
      } catch (error) {
        console.error("Error procesando archivo:", error);
      } finally {
        setUploading(false);
      }
    };
    reader.readAsText(file);
  };

  const filteredData = data.filter(c => {
    const search = searchTerm.toLowerCase();
    return (
      String(c['DENOMINACIÓN SOCIAL'] || '').toLowerCase().includes(search) ||
      String(c['CIF EMPRESA'] || '').toLowerCase().includes(search)
    );
  });

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      <nav className="bg-black text-white p-6 border-b-4 border-yellow-400 flex justify-between items-center sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <BuildingIcon />
          <div className="flex flex-col">
            <span className="font-black text-xl tracking-tighter uppercase">BUD <span className="text-yellow-400">ADVISORS</span></span>
            <span className="text-[10px] tracking-widest text-gray-400 uppercase font-bold text-center">Market Intelligence</span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className={`flex items-center gap-2 text-[10px] font-black px-3 py-1 rounded-full border ${isCloud ? 'text-green-400 border-green-400/30 bg-green-400/10' : 'text-yellow-400 border-yellow-400/30 bg-yellow-400/10'}`}>
            <CloudIcon />
            <span>{isCloud ? 'SISTEMA ONLINE' : 'MODO DEMO / LOCAL'}</span>
          </div>
          <label className="bg-yellow-400 hover:bg-yellow-300 text-black px-4 py-2 font-black text-xs uppercase tracking-widest cursor-pointer transition-all flex items-center gap-2">
            <UploadIcon />
            {uploading ? 'PROCESANDO...' : 'CARGAR CSV'}
            <input type="file" onChange={handleFileUpload} className="hidden" accept=".csv" />
          </label>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto p-8">
        <div className="bg-white p-6 shadow-xl mb-12 border-t-4 border-black flex items-center gap-4">
          <SearchIcon />
          <input 
            className="w-full outline-none font-bold text-lg placeholder-gray-300 bg-transparent"
            placeholder="Buscar por nombre o CIF..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {loading ? (
          <div className="text-center py-20 font-bold text-gray-400 animate-pulse uppercase tracking-widest">Sincronizando nube...</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {filteredData.map((company, idx) => (
              <div 
                key={idx} 
                onClick={() => setSelectedCompany(company)}
                className="bg-white border border-gray-200 p-8 hover:shadow-2xl hover:-translate-y-1 transition-all cursor-pointer border-t-4 hover:border-t-yellow-400 group"
              >
                <div className="mb-6">
                  <h3 className="text-xl font-black text-black group-hover:text-yellow-600 transition-colors uppercase truncate">
                    {String(company['ACRONIMO'] || company['DENOMINACIÓN SOCIAL'] || 'Empresa')}
                  </h3>
                  <p className="text-gray-400 text-xs font-mono">{String(company['CIF EMPRESA'] || 'N/A')}</p>
                </div>

                <div className="space-y-3 border-t pt-4">
                  <div className="flex justify-between items-baseline">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">Ventas Netas</span>
                    <span className="font-black text-lg">{formatCurrency(company['IMPORTEN NETO DE LA CIFRA DE NEGOCIO'])}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* MODAL DE DETALLE */}
      {selectedCompany && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-2xl border-t-8 border-yellow-400">
            <div className="p-10">
              <div className="flex justify-between items-start mb-10">
                <div>
                  <h2 className="text-4xl font-black uppercase tracking-tighter leading-none mb-2">
                    {String(selectedCompany['DENOMINACIÓN SOCIAL'])}
                  </h2>
                  <p className="text-gray-500 font-mono text-sm">CIF: {String(selectedCompany['CIF EMPRESA'])}</p>
                </div>
                <button onClick={() => setSelectedCompany(null)} className="p-2 hover:bg-gray-100 rounded-full transition-colors text-black">
                  <CloseIcon />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="bg-gray-50 p-8 border-l-4 border-black">
                  <h4 className="text-[10px] font-black text-gray-400 uppercase mb-4">Finanzas</h4>
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
                   <h4 className="text-[10px] font-black text-gray-400 uppercase mb-4">Operaciones</h4>
                   <div className="space-y-4">
                    <div className="flex justify-between border-b pb-2">
                      <span className="text-sm font-bold">Empleados:</span>
                      <span className="font-black">{selectedCompany['NÚMERO MEDIO DE EMPLEADOS'] || '-'}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-12 flex justify-center">
                <button onClick={() => setSelectedCompany(null)} className="bg-black text-white px-12 py-4 font-black uppercase tracking-widest text-sm hover:bg-yellow-400 transition-all">
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