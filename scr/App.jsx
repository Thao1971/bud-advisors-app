import React, { useState, useEffect, useMemo } from 'react';
import { Search, Upload, FileText, Users, DollarSign, TrendingUp, Activity, PieChart, Briefcase, Filter, X, ChevronRight, Calculator, ArrowDown, Minus, Building2, AlertCircle, Cloud, Loader2, Database } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, onSnapshot } from 'firebase/firestore';

// --- CONFIGURACIÓN DE FIREBASE PARA NETLIFY ---
// Intentamos leer la configuración desde las variables de entorno
let firebaseConfig;
try {
  // En local o Netlify, usamos la variable de entorno
  const envConfig = import.meta.env.VITE_FIREBASE_CONFIG;
  if (envConfig) {
    firebaseConfig = JSON.parse(envConfig);
  } else {
    console.warn("No se encontró configuración de Firebase. La app funcionará en modo demo local.");
    firebaseConfig = { apiKey: "demo", authDomain: "demo", projectId: "demo" }; // Dummy config
  }
} catch (e) {
  console.error("Error al leer la configuración:", e);
  firebaseConfig = {}; 
}

// Inicializamos solo si hay configuración válida
let app, auth, db;
try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
} catch(e) {
    console.log("Firebase no inicializado (Modo Demo)");
}

const appId = 'bud-advisors-prod'; // ID fijo para producción

// --- Utility Functions ---

const formatCurrency = (value) => {
  if (!value || isNaN(value)) return '-';
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(value);
};

const formatNumber = (value, decimals = 2) => {
  if (!value || isNaN(value)) return '-';
  return new Intl.NumberFormat('es-ES', { maximumFractionDigits: decimals }).format(value);
};

const formatPercent = (value) => {
  if (!value || isNaN(value)) return '-';
  return new Intl.NumberFormat('es-ES', { style: 'percent', maximumFractionDigits: 2 }).format(value);
};

// Robust CSV Parsing
const parseCSV = (text) => {
  const lines = text.split('\n').filter(line => line.trim() !== '');
  
  let headerIndex = -1;
  for (let i = 0; i < Math.min(lines.length, 20); i++) {
    if (lines[i].includes('CIF EMPRESA')) {
      headerIndex = i;
      break;
    }
  }

  if (headerIndex === -1) return [];

  const headerLine = lines[headerIndex];
  const semicolonCount = (headerLine.match(/;/g) || []).length;
  const commaCount = (headerLine.match(/,/g) || []).length;
  const delimiter = semicolonCount > commaCount ? ';' : ',';

  const headers = headerLine.split(delimiter).map(h => h.trim().replace(/^"|"$/g, ''));
  
  const data = [];

  for (let i = headerIndex + 1; i < lines.length; i++) {
    const currentLine = lines[i];
    let values = [];
    
    const regex = delimiter === ';' 
        ? /;(?=(?:(?:[^"]*"){2})*[^"]*$)/ 
        : /,(?=(?:(?:[^"]*"){2})*[^"]*$)/;

    values = currentLine.split(regex).map(val => val.trim().replace(/^"|"$/g, ''));

    if (values.length < 5) continue; 

    const entry = {};
    headers.forEach((header, index) => {
      if (header && index < values.length) {
        let val = values[index];
        const isNumericField = [
          'IMPORTEN NETO', 'GASTOS', 'RESULTADO', 'EBITDA', 'ACTIVO', 'PASIVO', 'PATRIMONIO', 'EMPLEADOS', 'APROVISIONAMIENTOS'
        ].some(k => header.toUpperCase().includes(k));

        if (isNumericField && val) {
            val = val.replace(/[€\s]/g, '');
            if (val.includes(',') && val.includes('.')) {
                if (val.lastIndexOf(',') > val.lastIndexOf('.')) {
                    val = val.replace(/\./g, '').replace(',', '.');
                } else {
                    val = val.replace(/,/g, '');
                }
            } else if (val.includes(',')) {
                val = val.replace(',', '.');
            }
            val = parseFloat(val);
        }
        entry[header] = val;
      }
    });

    if (entry['CIF EMPRESA']) {
      // Use CIF as ID, ensure it's clean
      entry.id = entry['CIF EMPRESA'].replace(/[^a-zA-Z0-9]/g, '');
      data.push(entry);
    }
  }
  return data;
};

// --- Components ---

const StatCard = ({ title, value, subtext, icon: Icon }) => (
  <div className="bg-white p-4 rounded-none border-l-4 border-yellow-400 shadow-sm flex items-start space-x-4 hover:shadow-md transition-shadow">
    <div className="p-3 bg-black text-yellow-400">
      <Icon className="w-6 h-6" />
    </div>
    <div>
      <p className="text-xs font-bold uppercase tracking-wider text-gray-500">{title}</p>
      <h3 className="text-xl font-bold text-black mt-1">{value}</h3>
      {subtext && <p className="text-xs text-gray-400 mt-1">{subtext}</p>}
    </div>
  </div>
);

const RatioProgressBar = ({ label, value, max = 100 }) => (
  <div className="mb-4">
    <div className="flex justify-between mb-1">
      <span className="text-sm font-bold text-gray-700">{label}</span>
      <span className="text-sm font-bold text-black">{value}</span>
    </div>
    <div className="w-full bg-gray-200 h-2">
      <div 
        className="h-2 bg-yellow-400" 
        style={{ width: `${Math.min(parseFloat(value) || 0, max)}%` }}
      ></div>
    </div>
  </div>
);

const PnLRow = ({ label, value, isTotal, isNegative, bold }) => (
  <div className={`flex justify-between items-center py-3 border-b border-gray-100 ${isTotal ? 'bg-yellow-50 px-4 -mx-4 border-l-4 border-yellow-400' : ''}`}>
    <div className="flex items-center gap-2">
      {isNegative && <Minus className="w-4 h-4 text-red-400" />}
      <span className={`${bold || isTotal ? 'font-bold text-black' : 'text-gray-600'}`}>{label}</span>
    </div>
    <span className={`${bold || isTotal ? 'font-bold text-black' : 'text-gray-800'} ${isNegative ? 'text-red-600' : ''}`}>
      {isNegative && value > 0 ? '-' : ''}{formatCurrency(value)}
    </span>
  </div>
);

const CompanyDetail = ({ company, onClose }) => {
  const revenue = company['IMPORTEN NETO DE LA CIFRA DE NEGOCIO'] || 0;
  const procurements = company['APROVISIONAMIENTOS'] || 0;
  const personnelCosts = company['GASTOS DE PERSONAL'] || 0;
  const operatingResult = company['RESULTADO DE EXPLOTACIÓN'] || 0;
  const grossMargin = revenue - procurements;
  
  const ebitda = company['EBITDA'] || 0;
  const netIncome = company['RESULTADO DEL EJERCICIO'] || 0;
  const equity = company['PATRIMONIO NETO'] || 0;
  const totalAssets = (company['ACTIVO CORRIENTE'] || 0) + (company['ACTIVO NO CORRIENTE'] || 0);
  const currentAssets = company['ACTIVO CORRIENTE'] || 0;
  const currentLiabilities = company['PASIVO CORRIENTE'] || 0;
  const employees = company['EMPLEADOS'] || 0;
  
  const ebitdaMargin = revenue ? (ebitda / revenue) : 0;
  const netMargin = revenue ? (netIncome / revenue) : 0;
  const roe = equity ? (netIncome / equity) : 0;
  const roa = totalAssets ? (netIncome / totalAssets) : 0;
  const liquidityRatio = currentLiabilities ? (currentAssets / currentLiabilities) : 0;
  const revPerEmployee = employees ? (revenue / employees) : 0;
  const costPerEmployee = employees ? (personnelCosts / employees) : 0;

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex justify-end transition-opacity duration-300 backdrop-blur-sm">
      <div className="w-full max-w-4xl bg-white h-full overflow-y-auto shadow-2xl animate-in slide-in-from-right duration-300">
        <div className="bg-black text-white p-8 sticky top-0 z-10 flex justify-between items-start border-b-4 border-yellow-400">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="bg-yellow-400 text-black text-xs px-2 py-1 font-bold uppercase tracking-wider">
                {company['CATEGORÍA'] || 'Agencia'}
              </span>
              {company['SUBCATEGORÍA'] && (
                <span className="border border-white/30 text-white text-xs px-2 py-1 font-medium">
                  {company['SUBCATEGORÍA']}
                </span>
              )}
            </div>
            <h2 className="text-4xl font-black tracking-tight mb-2">{company['ACRONIMO'] || company['DENOMINACIÓN SOCIAL']}</h2>
            <p className="text-gray-400 text-sm font-mono">{company['DENOMINACIÓN SOCIAL']} • CIF: {company['CIF EMPRESA']}</p>
            {company['URL'] && (
              <a href={`https://${company['URL']}`} target="_blank" rel="noreferrer" className="text-yellow-400 text-sm hover:text-yellow-300 hover:underline mt-4 inline-flex items-center gap-1 font-bold">
                VISITAR WEB <ChevronRight className="w-3 h-3" />
              </a>
            )}
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors text-white">
            <X className="w-8 h-8" />
          </button>
        </div>

        <div className="p-8 space-y-10 bg-gray-50 min-h-screen">
          <div>
            <h3 className="text-xl font-black text-black uppercase tracking-wider mb-6 border-l-4 border-black pl-4">
              Resumen Ejecutivo <span className="text-gray-400 font-normal normal-case">({company['EJERCICIO'] || 'N/A'})</span>
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard title="Cifra de Negocio" value={formatCurrency(revenue)} icon={DollarSign} />
              <StatCard title="EBITDA" value={formatCurrency(ebitda)} icon={TrendingUp} />
              <StatCard title="Resultado Neto" value={formatCurrency(netIncome)} icon={PieChart} />
              <StatCard title="Empleados" value={employees || '-'} icon={Users} />
            </div>
          </div>

          <div className="bg-white shadow-lg border border-gray-100">
             <div className="bg-black px-6 py-4 flex items-center gap-3">
                <Calculator className="w-5 h-5 text-yellow-400" />
                <h3 className="font-bold text-white uppercase tracking-wider text-sm">Cuenta de Resultados Analítica</h3>
             </div>
             <div className="p-8">
                <PnLRow label="Importe Neto de la Cifra de Negocio" value={revenue} bold />
                {procurements > 0 && (
                   <PnLRow label="Aprovisionamientos" value={procurements} isNegative />
                )}
                <PnLRow label="MARGEN BRUTO" value={grossMargin} isTotal />
                <div className="my-4 border-t border-dashed border-gray-200"></div>
                <PnLRow label="Gastos de Personal" value={personnelCosts} isNegative />
                <div className="flex justify-center py-2 opacity-20">
                   <ArrowDown className="w-4 h-4 text-black" />
                </div>
                <PnLRow label="RESULTADO DE EXPLOTACIÓN" value={operatingResult} isTotal bold />
             </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="bg-white p-8 shadow-md border-t-4 border-black">
              <h4 className="font-black text-black uppercase tracking-wider mb-6 flex items-center gap-2">
                <Activity className="w-5 h-5 text-yellow-500" />
                Rentabilidad
              </h4>
              <RatioProgressBar label="Margen EBITDA" value={formatPercent(ebitdaMargin)} max={100} />
              <RatioProgressBar label="Margen Neto" value={formatPercent(netMargin)} max={50} />
              <div className="grid grid-cols-2 gap-4 mt-8">
                <div className="bg-gray-100 p-4 border-l-2 border-black">
                  <p className="text-xs font-bold text-gray-500 uppercase">ROE (Financiera)</p>
                  <p className="text-2xl font-black text-black mt-1">{formatPercent(roe)}</p>
                </div>
                <div className="bg-gray-100 p-4 border-l-2 border-black">
                  <p className="text-xs font-bold text-gray-500 uppercase">ROA (Económica)</p>
                  <p className="text-2xl font-black text-black mt-1">{formatPercent(roa)}</p>
                </div>
              </div>
            </div>

            <div className="bg-white p-8 shadow-md border-t-4 border-black">
              <h4 className="font-black text-black uppercase tracking-wider mb-6 flex items-center gap-2">
                <Briefcase className="w-5 h-5 text-yellow-500" />
                Eficiencia
              </h4>
              <div className="space-y-6">
                <div className="flex justify-between items-center border-b border-gray-100 pb-3">
                  <span className="text-gray-600 font-medium">Facturación por Empleado</span>
                  <span className="font-bold text-black text-lg">{formatCurrency(revPerEmployee)}</span>
                </div>
                <div className="flex justify-between items-center border-b border-gray-100 pb-3">
                  <span className="text-gray-600 font-medium">Coste Medio Empleado</span>
                  <span className="font-bold text-black text-lg">{formatCurrency(costPerEmployee)}</span>
                </div>
                <div className="flex justify-between items-center border-b border-gray-100 pb-3">
                  <span className="text-gray-600 font-medium">Ratio de Liquidez</span>
                  <span className={`font-bold text-lg ${liquidityRatio < 1 ? 'text-red-600' : 'text-green-600'}`}>
                    {formatNumber(liquidityRatio)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600 font-medium">Patrimonio Neto</span>
                  <span className="font-bold text-black text-lg">{formatCurrency(equity)}</span>
                </div>
              </div>
            </div>
          </div>

          {company['OBJETO SOCIAL'] && (
            <div className="bg-white p-6 border-l-4 border-gray-300 shadow-sm">
              <h4 className="font-bold text-black uppercase text-sm mb-3">Objeto Social</h4>
              <p className="text-gray-600 text-sm leading-relaxed font-serif italic">{company['OBJETO SOCIAL']}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default function AdAgencyApp() {
  const [data, setData] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Todas');
  const [selectedCompany, setSelectedCompany] = useState(null);
  
  // App States
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState(null);
  const [uploadSuccess, setUploadSuccess] = useState(false);

  // 1. Initialize Auth
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (!auth) {
            setLoading(false);
            return;
        }
        await signInAnonymously(auth);
      } catch (error) {
        console.error("Auth error:", error);
      }
    };
    initAuth();
    if (auth) {
        const unsubscribe = onAuthStateChanged(auth, setUser);
        return () => unsubscribe();
    }
  }, []);

  // 2. Data Fetching (Real-time from Firestore)
  useEffect(() => {
    if (!user || !db) return;

    const q = collection(db, 'artifacts', appId, 'public', 'data', 'companies');
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const companies = [];
      snapshot.forEach((doc) => {
        companies.push(doc.data());
      });
      setData(companies);
      setLoading(false);
    }, (error) => {
      console.error("Firestore Error:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  // 3. Upload Logic (Admin)
  const handleFileUpload = (event) => {
    setUploadError(null);
    setUploadSuccess(false);
    const file = event.target.files[0];
    if (file) {
      setUploading(true);
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
            if (!db) throw new Error("Base de datos no conectada");

            const text = e.target.result;
            const parsed = parseCSV(text);
            
            if (parsed.length === 0) {
                setUploadError("No se pudieron leer datos. Verifica el formato CSV.");
                setUploading(false);
                return;
            }

            // Upload to Firestore in batches
            const totalDocs = parsed.length;
            let processed = 0;
            
            for (const company of parsed) {
                if (!company.id) continue;
                await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'companies', company.id), company);
                processed++;
                setUploadProgress(Math.round((processed / totalDocs) * 100));
            }
            
            setUploadSuccess(true);
            setTimeout(() => setUploadSuccess(false), 5000);
            
        } catch (err) {
            console.error(err);
            setUploadError("Error al subir a la nube. Verifica tu conexión.");
        } finally {
            setUploading(false);
            setUploadProgress(0);
        }
      };
      reader.readAsText(file);
    }
  };

  const categories = useMemo(() => {
    const cats = new Set(data.map(d => d['CATEGORÍA']).filter(Boolean));
    return ['Todas', ...Array.from(cats)];
  }, [data]);

  const filteredData = useMemo(() => {
    return data.filter(item => {
      const matchesSearch = 
        (item['DENOMINACIÓN SOCIAL'] || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item['ACRONIMO'] || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item['CIF EMPRESA'] || '').toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesCategory = selectedCategory === 'Todas' || item['CATEGORÍA'] === selectedCategory;
      
      return matchesSearch && matchesCategory;
    });
  }, [data, searchTerm, selectedCategory]);

  return (
    <div className="min-h-screen bg-gray-100 font-sans text-gray-900 selection:bg-yellow-200">
      
      {/* Navbar Style BUD */}
      <nav className="bg-black text-white shadow-2xl sticky top-0 z-20 border-b-4 border-yellow-400">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-20 items-center">
            <div className="flex items-center gap-3">
              <div className="bg-yellow-400 p-2 text-black">
                <Building2 className="w-6 h-6" />
              </div>
              <div className="flex flex-col">
                <span className="font-black text-2xl tracking-tighter leading-none">BUD <span className="text-yellow-400">ADVISORS</span></span>
                <span className="text-[10px] tracking-[0.2em] text-gray-400 uppercase">Strategic Intelligence</span>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
               {/* Cloud Status Indicator */}
               <div className="hidden md:flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-400 mr-4">
                  {loading ? (
                    <span className="flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Conectando...</span>
                  ) : db ? (
                    <span className="flex items-center gap-1 text-green-500"><Cloud className="w-3 h-3" /> Online</span>
                  ) : (
                    <span className="flex items-center gap-1 text-yellow-500"><Cloud className="w-3 h-3" /> Demo Local</span>
                  )}
               </div>

               <label className={`flex items-center gap-2 ${uploading ? 'bg-gray-500 cursor-not-allowed' : 'bg-yellow-400 hover:bg-yellow-300'} text-black px-5 py-2.5 font-bold uppercase text-xs tracking-wider cursor-pointer transition-all transform hover:scale-105 shadow-lg`}>
                  {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  <span>{uploading ? `Subiendo ${uploadProgress}%` : 'Actualizar DB'}</span>
                  <input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" disabled={uploading} />
               </label>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        
        {uploadError && (
            <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-6 flex items-center gap-3 animate-pulse">
                <AlertCircle className="w-6 h-6 text-red-500" />
                <p className="text-red-700 font-bold">{uploadError}</p>
            </div>
        )}

        {uploadSuccess && (
            <div className="bg-green-50 border-l-4 border-green-500 p-4 mb-6 flex items-center gap-3 animate-bounce">
                <div className="bg-green-500 rounded-full p-1"><Upload className="w-4 h-4 text-white" /></div>
                <p className="text-green-700 font-bold">¡Datos actualizados en la nube correctamente!</p>
            </div>
        )}

        {/* Search & Filter Header */}
        <div className="bg-white shadow-lg p-8 mb-10 border-t-4 border-gray-900">
          <div className="flex flex-col md:flex-row gap-6 justify-between items-center">
            <div className="relative w-full md:w-96 group">
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5 group-focus-within:text-yellow-500 transition-colors" />
              <input 
                type="text" 
                placeholder="Buscar agencia, CIF..." 
                className="w-full pl-12 pr-4 py-4 bg-gray-50 border-2 border-gray-100 focus:border-black focus:ring-0 transition-all font-medium text-black placeholder-gray-400"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            
            <div className="flex items-center gap-2 overflow-x-auto w-full md:w-auto pb-2 md:pb-0 scrollbar-hide">
              <Filter className="w-5 h-5 text-black mr-2" />
              {categories.map(cat => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`whitespace-nowrap px-5 py-2 text-xs font-bold uppercase tracking-wider transition-all border-2 ${
                    selectedCategory === cat 
                    ? 'bg-black text-white border-black' 
                    : 'bg-white text-gray-500 border-gray-200 hover:border-black hover:text-black'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Results Grid */}
        <div className="mb-8 flex justify-between items-end border-b border-black pb-4">
          <h2 className="text-3xl font-black text-black uppercase tracking-tight">Market Overview <span className="text-yellow-500">.</span></h2>
          <span className="text-sm font-bold text-gray-500">{filteredData.length} Compañías</span>
        </div>

        {filteredData.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredData.map((company, index) => (
              <div 
                key={index} 
                onClick={() => setSelectedCompany(company)}
                className="group bg-white border border-gray-200 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 cursor-pointer flex flex-col relative overflow-hidden"
              >
                {/* Yellow accent on hover */}
                <div className="absolute top-0 left-0 w-full h-1 bg-black group-hover:bg-yellow-400 transition-colors duration-300"></div>

                <div className="p-8 flex-1">
                  <div className="flex justify-between items-start mb-6">
                    <div className="w-14 h-14 bg-black text-white flex items-center justify-center font-black text-2xl shadow-lg group-hover:bg-yellow-400 group-hover:text-black transition-colors">
                      {(company['ACRONIMO'] || company['DENOMINACIÓN SOCIAL'] || '?').charAt(0)}
                    </div>
                    <span className="bg-gray-100 text-gray-600 text-[10px] font-bold uppercase px-2 py-1 tracking-wider">
                      {company['CATEGORÍA'] || 'General'}
                    </span>
                  </div>
                  
                  <h3 className="text-xl font-black text-black mb-1 line-clamp-1 group-hover:text-yellow-600 transition-colors">
                    {company['ACRONIMO'] || company['DENOMINACIÓN SOCIAL']}
                  </h3>
                  <p className="text-xs text-gray-400 mb-6 font-mono truncate">{company['DENOMINACIÓN SOCIAL']}</p>
                  
                  <div className="space-y-3 pt-4 border-t border-gray-100">
                    <div className="flex justify-between items-center">
                      <p className="text-xs font-bold text-gray-400 uppercase">Ventas</p>
                      <p className="font-bold text-black">{formatCurrency(company['IMPORTEN NETO DE LA CIFRA DE NEGOCIO'])}</p>
                    </div>
                    <div className="flex justify-between items-center">
                      <p className="text-xs font-bold text-gray-400 uppercase">EBITDA</p>
                      <p className="font-bold text-black">{formatCurrency(company['EBITDA'])}</p>
                    </div>
                  </div>
                </div>
                <div className="bg-black p-4 flex justify-between items-center group-hover:bg-yellow-400 transition-colors">
                  <span className="text-xs font-bold text-white uppercase tracking-wider group-hover:text-black">Ver Análisis</span>
                  <ChevronRight className="w-4 h-4 text-white group-hover:text-black" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-20 bg-white border-2 border-dashed border-gray-300">
            <div className="bg-gray-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
               <FileText className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-xl font-bold text-black">No se encontraron datos</h3>
            <p className="text-gray-500 mt-2">
                {db ? "La base de datos está vacía. Usa el botón 'Actualizar DB' para subir tu CSV." : "Modo Demo. Sube un CSV para ver datos."}
            </p>
          </div>
        )}

      </main>

      {/* Details Modal */}
      {selectedCompany && (
        <CompanyDetail 
          company={selectedCompany} 
          onClose={() => setSelectedCompany(null)} 
        />
      )}
    </div>
  );
}