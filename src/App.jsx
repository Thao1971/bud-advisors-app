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

const UploadIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>
);

const CloudIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.5 19c2.5 0 4.5-2 4.5-4.5 0-2.3-1.7-4.2-4-4.5-1.1-2.6-3.7-4.5-6.5-4.5-3.6 0-6.5 2.9-6.5 6.5 0 .3 0 .7.1 1C3.1 13.5 2 15.1 2 17c0 2.8 2.2 5 5 5h10.5"/></svg>
);

const CloseIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
);

// --- CONFIGURACIÓN E INICIALIZACIÓN ---
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : null;
const app = firebaseConfig ? initializeApp(firebaseConfig) : null;
const auth = app ? getAuth(app) : null;
const db = app ? getFirestore(app) : null;
const rawAppId = typeof __app_id !== 'undefined' ? __app_id : 'bud-advisors-app';
const appId = rawAppId.replace(/\//g, '_'); // Saneamiento para evitar errores de ruta

const formatCurrency = (v) => (!v || isNaN(v)) ? '-' : new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v);

export default function App() {
  const [data, setData] = useState([]);
  const [user, setUser] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCompany, setSelectedCompany] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  // REGLA 3: Autenticación ANTES de cualquier consulta
  useEffect(() => {
    if (!auth) return;
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (e) {
        console.error("Error de autenticación:", e);
      }
    };
    initAuth();
    return onAuthStateChanged(auth, setUser);
  }, []);

  // REGLA 3: Consultas protegidas por el estado del usuario
  useEffect(() => {
    if (!user || !db) return;

    // REGLA 1: Ruta exacta obligatoria para evitar errores de permisos y segmentos
    const companiesCollection = collection(db, 'artifacts', appId, 'public', 'data', 'companies');

    const unsubscribe = onSnapshot(companiesCollection, 
      (snap) => {
        const items = snap.docs.map(doc => doc.data());
        setData(items);
        setLoading(false);
      },
      (err) => {
        console.error("Error en Firestore:", err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user]);

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file || !db || !user) return;

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

        for (const company of companies) {
          const id = String(company['CIF EMPRESA']).replace(/[^a-zA-Z0-9]/g, '');
          const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'companies', id);
          await setDoc(docRef, company);
        }
      } catch (error) {
        console.error("Error procesando CSV:", error);
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
      String(c['CIF EMPRESA'] || '').toLowerCase().includes(search) ||
      String(c['ACRONIMO'] || '').toLowerCase().includes(search)
    );
  });

  if (!app) return <div className="p-10 text-center font-bold">Error: Configuración de Firebase no detectada.</div>;

  return (
    <div className="min-h-screen bg-gray-50 text-slate-900 font-sans">
      <nav className="bg-black text-white p-6 border-b-4 border-yellow-400 flex justify-between items-center sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <BuildingIcon />
          <div className="flex flex-col">
            <span className="font-black text-xl tracking-tighter uppercase">BUD <span className="text-yellow-400">ADVISORS</span></span>
            <span className="text-[10px] tracking-widest text-gray-400 uppercase font-bold">Inteligencia de Mercado</span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {user && (
            <div className="flex items-center gap-2 text-[10px] font-black px-3 py-1 rounded-full border border-green-400/30 bg-green-400/10 text-green-400">
              <CloudIcon />
              <span>SISTEMA ONLINE</span>
            </div>
          )}
          <label className="bg-yellow-400 hover:bg-yellow-300 text-black px-4 py-2 font-black text-xs uppercase tracking-widest cursor-pointer transition-all flex items-center gap-2">
            <UploadIcon />
            {uploading ? 'SINCRONIZANDO...' : 'ACTUALIZAR DB (CSV)'}
            <input type="file" onChange={handleFileUpload} className="hidden" accept=".csv" disabled={uploading} />
          </label>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto p-8">
        <div className="bg-white p-6 shadow-xl mb-12 border-t-4 border-black flex items-center gap-4">
          <div className="text-gray-400"><SearchIcon /></div>
          <input 
            className="w-full outline-none font-bold text-lg placeholder-gray-300 bg-transparent"
            placeholder="Buscar por nombre, CIF o acrónimo..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {loading ? (
          <div className="text-center py-20 text-gray-400 font-bold animate-pulse">Cargando base de datos...</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {filteredData.map((company, idx) => (
              <div 
                key={idx} 
                onClick={() => setSelectedCompany(company)}
                className="bg-white border border-gray-200 p-8 hover:shadow-2xl hover:-translate-y-1 transition-all cursor-pointer border-t-4 hover:border-t-yellow-400 group"
              >
                <div className="mb-6">
                  <span className="text-[10px] font-black text-yellow-600 bg-yellow-50 px-2 py-1 uppercase tracking-widest mb-2 inline-block">
                    {String(company['CATEGORÍA'] || 'CORPORACIÓN')}
                  </span>
                  <h3 className="text-xl font-black group-hover:text-yellow-600 transition-colors uppercase truncate">
                    {String(company['ACRONIMO'] || company['DENOMINACIÓN SOCIAL'] || 'EMPRESA')}
                  </h3>
                  <p className="text-gray-400 text-xs font-mono">{String(company['CIF EMPRESA'] || 'N/A')}</p>
                </div>

                <div className="space-y-3 border-t pt-4">
                  <div className="flex justify-between items-baseline">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">Ventas Netas</span>
                    <span className="font-black text-lg">{formatCurrency(company['IMPORTEN NETO DE LA CIFRA DE NEGOCIO'])}</span>
                  </div>
                  <div className="flex justify-between items-baseline">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">EBITDA</span>
                    <span className="font-bold text-gray-700">{formatCurrency(company['EBITDA'])}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && filteredData.length === 0 && (
          <div className="text-center py-20 bg-white border-2 border-dashed border-gray-200 rounded-lg">
            <p className="text-xl font-black text-gray-300 uppercase">No hay registros</p>
            <p className="text-gray-400 text-sm">Sube un archivo CSV para poblar la base de datos.</p>
          </div>
        )}
      </main>

      {selectedCompany && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-2xl border-t-8 border-yellow-400">
            <div className="p-10">
              <div className="flex justify-between items-start mb-10">
                <div>
                  <h2 className="text-4xl font-black uppercase tracking-tighter leading-none mb-2">
                    {String(selectedCompany['DENOMINACIÓN SOCIAL'])}
                  </h2>
                  <p className="text-gray-500 font-mono text-sm">CIF: {String(selectedCompany['CIF EMPRESA'])} | {String(selectedCompany['CATEGORÍA'])}</p>
                </div>
                <button onClick={() => setSelectedCompany(null)} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                  <CloseIcon />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="bg-gray-50 p-6 border-l-4 border-black">
                  <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Salud Financiera</h4>
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

                <div className="bg-gray-50 p-6 border-l-4 border-yellow-400">
                  <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Estructura</h4>
                  <div className="space-y-4">
                    <div className="flex justify-between border-b pb-2">
                      <span className="text-sm font-bold">Empleados:</span>
                      <span className="font-black">{selectedCompany['NÚMERO MEDIO DE EMPLEADOS'] || '-'}</span>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="mt-10 pt-10 border-t flex justify-center">
                <button onClick={() => setSelectedCompany(null)} className="bg-black text-white px-10 py-3 font-black uppercase tracking-widest text-sm hover:bg-yellow-400 hover:text-black transition-all">
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