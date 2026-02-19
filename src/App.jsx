import React, { useState, useEffect, useMemo } from 'react';
import { 
  Search, Upload, Building2, TrendingUp, Users, 
  BarChart3, Filter, X, Database, AlertCircle, 
  Trophy, LayoutDashboard, CheckCircle2, 
  Target, Briefcase, DollarSign, PieChart, 
  ArrowUpRight, Globe, Calculator,
  Wallet, ShieldCheck, Activity, TrendingDown,
  Layers, Zap, Info, FileText
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, onSnapshot } from 'firebase/firestore';

// --- CONFIGURACIÓN DE FIREBASE ---
const firebaseConfig = JSON.parse(__firebase_config);
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// REGLA 1: Sanitización del appId para evitar errores de segmentos de ruta
const rawAppId = typeof __app_id !== 'undefined' ? __app_id : 'bud_stable_v25';
const appId = rawAppId.replace(/[^a-zA-Z0-9]/g, '_'); 

// --- MOTOR DE DATOS Y FORMATO ESPAÑOL ---
const cleanValue = (val) => {
  if (val === undefined || val === null || val === '') return 0;
  if (typeof val === 'number') return val;
  const cleaned = val.toString()
    .replace(/[€\s%]/g, '')
    .replace(/\./g, '') // Eliminar puntos de miles
    .replace(',', '.'); // Cambiar coma decimal por punto
  return parseFloat(cleaned) || 0;
};

// Función para encontrar la facturación (plural o singular en el CSV)
const getRevenue = (c) => {
  return cleanValue(c['IMPORTE NETO DE LA CIFRA DE NEGOCIOS'] || c['IMPORTE NETO DE LA CIFRA DE NEGOCIO'] || c['IMPORTEN NETO DE LA CIFRA DE NEGOCIO']);
};

// Formato Millones (M€) con punto para miles y coma para decimales
const formatM = (v) => {
  if (v === undefined || v === null || isNaN(v)) return '0 M€';
  const mValue = v / 1000000;
  return new Intl.NumberFormat('es-ES', { 
    minimumFractionDigits: 1,
    maximumFractionDigits: 1 
  }).format(mValue) + ' M€';
};

// Formato completo con punto para miles (Ej: 145.132.120 €)
const formatFull = (v) => {
  if (v === undefined || v === null || isNaN(v)) return '0 €';
  return new Intl.NumberFormat('es-ES', { 
    style: 'currency', 
    currency: 'EUR', 
    maximumFractionDigits: 0 
  }).format(v);
};

export default function App() {
  const [data, setData] = useState([]);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState({ type: 'info', msg: 'Sincronizando HUB...' });
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Todas');
  const [selectedCompany, setSelectedCompany] = useState(null);

  // REGLA 3: Autenticación obligatoria antes de cualquier consulta
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        setStatus({ type: 'error', msg: 'Error de conexión inicial' });
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  // REGLA 1 & 2: Sincronización de datos tras autenticación
  useEffect(() => {
    if (!user) return;
    const colRef = collection(db, 'artifacts', appId, 'public', 'data', 'companies');
    const unsubscribe = onSnapshot(colRef, (snap) => {
      const docs = snap.docs.map(d => d.data());
      // Ordenación en memoria (Regla 2)
      docs.sort((a, b) => getRevenue(b) - getRevenue(a));
      setData(docs);
      setLoading(false);
      if (docs.length > 0) setStatus({ type: 'success', msg: 'TERMINAL ONLINE' });
    }, (err) => {
      setStatus({ type: 'error', msg: 'Error de permisos de datos' });
    });
    return () => unsubscribe();
  }, [user]);

  const handleUpload = (e) => {
    const file = e.target.files[0];
    if (!file || !user) return;
    setUploading(true);
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const text = ev.target.result;
        const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        const delimiter = lines[0].includes(';') ? ';' : ',';
        const headers = lines[0].split(delimiter).map(h => h.trim().replace(/^"|"$/g, ''));
        for (let i = 1; i < lines.length; i++) {
          const values = lines[i].split(delimiter);
          if (values.length < headers.length) continue;
          const obj = {};
          headers.forEach((h, idx) => {
            let val = values[idx]?.trim().replace(/^"|"$/g, '');
            const isNumeric = ['IMPORTE', 'GASTOS', 'EBITDA', 'RESULTADO', 'ACTIVO', 'PASIVO', 'PATRIMONIO'].some(k => h.toUpperCase().includes(k));
            obj[h] = (isNumeric && val) ? cleanValue(val) : val;
          });
          if (obj['CIF EMPRESA']) {
            const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'companies', obj['CIF EMPRESA'].replace(/[^a-zA-Z0-9]/g, ''));
            await setDoc(docRef, obj);
          }
        }
        setStatus({ type: 'success', msg: 'Datos actualizados' });
      } catch (err) { setStatus({ type: 'error', msg: err.message }); }
      finally { setUploading(false); }
    };
    reader.readAsText(file);
  };

  const aggregates = useMemo(() => {
    const totalRev = data.reduce((acc, curr) => acc + getRevenue(curr), 0);
    const totalEbitda = data.reduce((acc, curr) => acc + (cleanValue(curr['EBITDA'])), 0);
    const totalTalent = data.reduce((acc, curr) => acc + (cleanValue(curr['GASTOS DE PERSONAL'])), 0);
    const cats = {};
    data.forEach(c => {
      const cat = c['CATEGORÍA'] || 'General';
      if (!cats[cat]) cats[cat] = { count: 0, revenue: 0 };
      cats[cat].count++;
      cats[cat].revenue += getRevenue(c);
    });
    return { totalRev, totalEbitda, totalTalent, cats };
  }, [data]);

  const similarCompanies = useMemo(() => {
    if (!selectedCompany) return [];
    const currentRev = getRevenue(selectedCompany);
    const currentCat = selectedCompany['CATEGORÍA'];
    return data
      .filter(c => c['CIF EMPRESA'] !== selectedCompany['CIF EMPRESA'])
      .map(c => {
        const score = (Math.abs(currentRev - getRevenue(c)) / (currentRev || 1)) + (c['CATEGORÍA'] === currentCat ? 0 : 1);
        return { ...c, score };
      })
      .sort((a, b) => a.score - b.score).slice(0, 4);
  }, [selectedCompany, data]);

  const filtered = data.filter(c => {
    const s = searchTerm.toLowerCase();
    const mSearch = String(c['DENOMINACIÓN SOCIAL'] || '').toLowerCase().includes(s) || String(c['CIF EMPRESA'] || '').toLowerCase().includes(s) || String(c['ACRONIMO'] || '').toLowerCase().includes(s);
    const mCat = selectedCategory === 'Todas' || c['CATEGORÍA'] === selectedCategory;
    return mSearch && mCat;
  });

  return (
    <div className="min-h-screen bg-[#FDFDFD] text-slate-900 font-sans antialiased selection:bg-yellow-100 overflow-x-hidden">
      
      {/* NAVBAR */}
      <nav className="bg-black text-white px-8 py-5 border-b-2 border-yellow-400 sticky top-0 z-[60] flex justify-between items-center shadow-xl">
        <div className="flex items-center gap-4">
          <div className="bg-yellow-400 p-2 rounded-sm shadow-lg"><Building2 className="text-black w-6 h-6" /></div>
          <div className="flex flex-col leading-none">
            <span className="font-black text-2xl tracking-tighter uppercase italic">BUD <span className="text-yellow-400">ADVISORS</span></span>
            <span className="text-[10px] tracking-[0.4em] text-slate-500 font-bold uppercase mt-1 italic">Intelligence Terminal</span>
          </div>
        </div>
        <label className="bg-yellow-400 hover:bg-yellow-300 text-black px-6 py-3 font-black text-xs uppercase tracking-widest cursor-pointer transition-all flex items-center gap-2 rounded-sm shadow-md active:scale-95">
          <Upload className="w-4 h-4" /> {uploading ? '...' : 'ACTUALIZAR DATABASE'}
          <input type="file" onChange={handleUpload} className="hidden" accept=".csv" />
        </label>
      </nav>

      <div className={`py-1 text-[7px] font-black uppercase tracking-[0.4em] text-center border-b ${status.type === 'error' ? 'bg-red-600 text-white' : 'bg-slate-50 text-slate-400'}`}>
        {status.msg}
      </div>

      <main className="max-w-7xl mx-auto p-10 space-y-16">
        
        {/* DASHBOARD: ESCALA REFINADA AL 15% */}
        <section className="animate-in fade-in duration-700">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-12">
            <div className="bg-black text-white p-10 border-l-[12px] border-yellow-400 shadow-2xl relative overflow-hidden group">
              <DollarSign className="absolute -right-4 -bottom-4 w-32 h-32 text-white/5" />
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-3 italic">Volumen Sectorial HUB</span>
              <span className="text-4xl lg:text-5xl font-black tabular-nums tracking-tighter truncate leading-none">
                {formatM(aggregates.totalRev)}
              </span>
            </div>
            
            <div className="bg-white p-10 border-l-[12px] border-black shadow-xl group flex flex-col justify-between">
              <div>
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-3 italic">EBITDA Pool</span>
                <span className="text-4xl font-black text-green-600 tabular-nums tracking-tighter truncate leading-none">
                  {formatM(aggregates.totalEbitda)}
                </span>
              </div>
              <span className="text-[10px] font-black text-slate-400 uppercase mt-4 block italic tracking-widest">
                M. MEDIO: {(aggregates.totalRev > 0 ? (aggregates.totalEbitda / aggregates.totalRev) * 100 : 0).toFixed(1)}%
              </span>
            </div>

            <div className="bg-white p-10 border-l-[12px] border-slate-200 shadow-xl flex flex-col justify-between">
              <div>
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-3 italic">Capital Humano</span>
                <span className="text-4xl font-black text-slate-900 tabular-nums tracking-tighter truncate leading-none">
                  {formatM(Math.abs(aggregates.totalTalent))}
                </span>
              </div>
              <div className="w-full bg-slate-100 h-1 mt-6 rounded-full overflow-hidden border border-slate-100">
                <div className="bg-blue-600 h-full transition-all duration-1000" style={{width: `${Math.min(100, (Math.abs(aggregates.totalTalent)/(aggregates.totalRev || 1))*100)}%`}}></div>
              </div>
            </div>

            <div className="bg-white p-10 border-l-[12px] border-slate-200 shadow-xl flex flex-col justify-center text-center">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-3 italic">Unidades Hub</span>
              <span className="text-6xl font-black text-slate-900 tabular-nums tracking-tighter leading-none">{data.length}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
            {/* DISTRIBUCIÓN */}
            <div className="lg:col-span-8 bg-white p-12 border border-slate-100 shadow-2xl rounded-sm">
              <h3 className="text-[12px] font-black uppercase tracking-[0.3em] text-slate-400 mb-10 flex items-center gap-4 italic leading-none border-b border-slate-50 pb-4"><PieChart className="w-5 h-5" /> Cuota de Negocio por Ecosistema</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-8">
                {Object.entries(aggregates.cats).sort((a,b) => b[1].revenue - a[1].revenue).slice(0, 6).map(([name, stat]) => (
                  <div key={name} className="group">
                    <div className="flex justify-between text-[11px] font-black uppercase mb-3 tracking-widest leading-none">
                      <span className="text-slate-800 italic truncate max-w-[150px]">{name}</span>
                      <span className="tabular-nums text-slate-500">{(aggregates.totalRev > 0 ? (stat.revenue / aggregates.totalRev) * 100 : 0).toFixed(1)}%</span>
                    </div>
                    <div className="w-full bg-slate-50 h-2.5 rounded-full overflow-hidden border border-slate-100 shadow-inner">
                      <div className="bg-black h-full group-hover:bg-yellow-400 transition-all duration-500 shadow-sm" style={{width: `${aggregates.totalRev > 0 ? (stat.revenue / aggregates.totalRev) * 100 : 0}%`}}></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {/* TOP 5 */}
            <div className="lg:col-span-4 bg-slate-900 text-white p-12 shadow-2xl rounded-sm overflow-hidden">
              <h3 className="text-[12px] font-black uppercase tracking-[0.3em] text-yellow-400 mb-10 flex items-center gap-4 italic border-b border-white/5 pb-4 leading-none"><Trophy className="w-5 h-5" /> Top Leadership Ranking</h3>
              <div className="space-y-6">
                {data.slice(0, 5).map((c, i) => (
                  <div key={i} onClick={() => setSelectedCompany(c)} className="flex items-center justify-between p-4 border-b border-white/5 hover:text-yellow-400 cursor-pointer transition-all group">
                    <div className="flex items-center gap-6 leading-none">
                      <span className="text-yellow-400 font-black italic tabular-nums text-2xl leading-none">0{i+1}</span>
                      <span className="font-bold uppercase text-xs tracking-widest group-hover:text-yellow-400 transition-colors truncate max-w-[150px]">{c['ACRONIMO'] || c['DENOMINACIÓN SOCIAL']}</span>
                    </div>
                    <span className="font-black tabular-nums text-lg tracking-tighter italic leading-none">{formatM(getRevenue(c))}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* --- FILTROS --- */}
        <section className="bg-white p-10 shadow-2xl mb-12 border-t-[12px] border-black rounded-sm flex flex-col md:flex-row gap-8 items-center">
          <div className="flex-1 flex items-center gap-6 border-b-4 border-slate-100 pb-4 w-full group">
            <Search className="text-slate-300 w-10 h-10 group-focus-within:text-yellow-500 transition-all" />
            <input className="w-full outline-none font-black text-3xl placeholder-slate-200 bg-transparent uppercase tracking-tighter" placeholder="Identificar Agencia, CIF o Acrónimo..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          </div>
          <select className="p-5 bg-slate-50 border-2 border-transparent focus:border-yellow-400 outline-none font-black uppercase tracking-widest text-[10px] cursor-pointer shadow-inner w-full md:w-auto" value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)}>
            {['Todas', ...new Set(data.map(c => c['CATEGORÍA']).filter(Boolean))].map(cat => <option key={cat} value={cat}>{cat}</option>)}
          </select>
        </section>

        {/* --- GRID DE AGENCIAS --- */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
          {filtered.map((c, i) => (
            <div key={i} onClick={() => setSelectedCompany(c)} className="bg-white border border-slate-100 p-12 hover:shadow-2xl transition-all cursor-pointer border-t-[8px] hover:border-t-yellow-400 group relative shadow-lg overflow-hidden flex flex-col justify-between min-h-[300px]">
              <div>
                <div className="flex justify-between items-start mb-10">
                   <span className="text-[10px] font-black bg-black text-white px-3 py-1 uppercase tracking-widest italic leading-none shadow-md">{c['CATEGORÍA'] || 'ENTITY'}</span>
                   <span className="text-yellow-600 font-bold text-[10px] italic bg-yellow-50 px-3 py-1 rounded-sm border border-yellow-100 leading-none">{c['EJERCICIO']}</span>
                </div>
                <h3 className="text-3xl font-black text-black group-hover:text-yellow-600 transition-colors uppercase leading-[1] mb-6 tracking-tighter truncate">
                  {c['ACRONIMO'] || c['DENOMINACIÓN SOCIAL']}
                </h3>
                <p className="text-slate-400 text-[11px] font-mono uppercase tracking-tighter italic border-b border-slate-50 pb-6 leading-none">REF ID: {c['CIF EMPRESA']}</p>
              </div>
              <div className="flex justify-between items-baseline pt-8 border-t border-slate-50 mt-4 leading-none">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest italic leading-none">Net Revenue</span>
                <span className="font-black text-4xl tabular-nums tracking-tighter text-slate-900 group-hover:scale-105 transition-transform duration-500 leading-none">
                  {formatM(getRevenue(c))}
                </span>
              </div>
            </div>
          ))}
        </div>
      </main>

      {/* --- MODAL ESTRATÉGICO STABLE --- */}
      {selectedCompany && (
        <div className="fixed inset-0 bg-black/98 backdrop-blur-3xl z-[100] flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-7xl my-auto shadow-2xl border-t-[20px] border-yellow-400 animate-in zoom-in duration-500 rounded-sm">
            <div className="p-8 md:p-24 text-slate-900">
              
              <div className="flex justify-between items-start mb-20 gap-12">
                <div className="flex-1 overflow-hidden">
                  <div className="flex items-center gap-5 mb-10 leading-none">
                    <span className="bg-black text-yellow-400 text-[11px] font-black px-6 py-2 uppercase tracking-[0.5em] shadow-xl italic leading-none">STRATEGIC DOSSIER M&A</span>
                    <Activity className="w-8 h-8 text-yellow-500 animate-pulse" />
                  </div>
                  <h2 className="text-6xl md:text-8xl font-black tracking-tighter uppercase italic leading-[0.85] mb-12 truncate text-black drop-shadow-sm">
                    {selectedCompany['ACRONIMO'] || selectedCompany['DENOMINACIÓN SOCIAL']}
                  </h2>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-12 text-slate-500 font-mono text-[10px] border-l-[15px] border-black pl-16 uppercase py-4 leading-none">
                    <div className="flex flex-col gap-2"><span className="text-black font-black tracking-widest">Full Legal Name</span><span className="font-bold text-sm text-slate-800 break-words leading-tight">{selectedCompany['DENOMINACIÓN SOCIAL']}</span></div>
                    <div className="flex flex-col gap-2"><span className="text-black font-black italic leading-none">Tax ID Code</span><span className="text-black font-black text-3xl tabular-nums leading-none tracking-widest">{selectedCompany['CIF EMPRESA']}</span></div>
                    <div className="flex flex-col gap-2"><span className="text-black font-black text-yellow-600 leading-none">Segment Class</span><span className="text-yellow-600 font-black text-3xl italic tracking-tighter leading-none">{selectedCompany['CATEGORÍA']}</span></div>
                    <div className="flex flex-col gap-2"><span className="text-black font-black leading-none">Audit Year</span><span className="text-black font-black text-3xl italic tabular-nums leading-none">{selectedCompany['EJERCICIO']}</span></div>
                  </div>
                </div>
                <button onClick={() => setSelectedCompany(null)} className="p-10 border-4 border-slate-100 rounded-full hover:bg-slate-100 transition-all text-black hover:rotate-90 shadow-2xl bg-white sticky top-0"><X className="w-16 h-16" /></button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-24">
                <div className="lg:col-span-8 space-y-24">
                  
                  {/* KPI BOXES */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
                    {[
                      { label: 'Facturación', val: formatM(getRevenue(selectedCompany)), color: 'black' },
                      { label: 'EBITDA', val: formatM(cleanValue(selectedCompany['EBITDA'])), color: 'yellow-400' },
                      { label: 'Margen %', val: (getRevenue(selectedCompany) > 0 ? ((cleanValue(selectedCompany['EBITDA']) / getRevenue(selectedCompany)) * 100).toFixed(1) : 0) + '%', color: 'black' },
                      { label: 'Bº Neto', val: formatM(cleanValue(selectedCompany['RESULTADO DEL EJERCICIO'])), color: 'yellow-400', invert: true }
                    ].map((k, i) => (
                      <div key={i} className={`${k.invert ? 'bg-black text-white' : 'bg-slate-50'} p-12 border-b-[12px] border-${k.color} shadow-2xl rounded-sm group overflow-hidden`}>
                        <span className="text-[11px] font-black uppercase text-slate-400 block mb-6 italic tracking-widest leading-none">{k.label}</span>
                        <span className={`text-4xl font-black tabular-nums tracking-tighter block truncate leading-none ${!k.invert && k.color === 'yellow-400' ? 'text-yellow-600' : ''}`}>{k.val}</span>
                      </div>
                    ))}
                  </div>

                  {/* CASCADA P&L */}
                  <div className="space-y-12">
                    <h4 className="text-4xl font-black uppercase border-b-[15px] border-black pb-6 italic leading-none">P&L Consolidated Cascade</h4>
                    <div className="space-y-6">
                      <div className="flex justify-between p-10 bg-slate-900 text-white rounded-sm border-l-[20px] border-yellow-400 shadow-2xl items-center group overflow-hidden">
                        <span className="uppercase text-[11px] font-black italic tracking-[0.4em] flex items-center gap-6 leading-none"><ArrowUpRight className="w-8 h-8 text-yellow-400" /> (+) Business Revenue</span>
                        <span className="text-5xl font-black tabular-nums italic tracking-tighter drop-shadow-xl leading-none">{formatFull(getRevenue(selectedCompany))}</span>
                      </div>
                      <div className="flex justify-between px-12 py-8 text-red-600 border-b-4 border-slate-100 italic leading-none">
                        <span className="uppercase text-sm font-black tracking-[0.2em] italic leading-none">(-) Personnel Expenditure</span>
                        <span className="text-3xl font-black tabular-nums tracking-tighter leading-none">{formatFull(cleanValue(selectedCompany['GASTOS DE PERSONAL']))}</span>
                      </div>
                      <div className="flex justify-between p-16 bg-yellow-400/10 border-x-[30px] border-yellow-400 shadow-inner items-center my-14 leading-none group">
                        <span className="text-5xl font-black uppercase italic tracking-tighter text-slate-800 leading-none">(=) EBITDA</span>
                        <span className="text-8xl font-black text-yellow-600 tabular-nums italic drop-shadow-2xl leading-none">{formatFull(cleanValue(selectedCompany['EBITDA']))}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* COLUMNA DERECHA */}
                <div className="lg:col-span-4 space-y-24 leading-none">
                  <div className="bg-black text-white p-16 border-l-[25px] border-yellow-400 shadow-2xl relative overflow-hidden group rounded-sm">
                    <Calculator className="absolute -right-16 -bottom-16 w-96 h-96 text-white/5 group-hover:scale-125 transition-all duration-1000 rotate-12" />
                    <h5 className="text-[12px] font-black uppercase tracking-[0.6em] text-yellow-400 mb-20 flex items-center gap-6 italic underline underline-offset-8 decoration-4 leading-none">
                       <BarChart3 className="w-8 h-8" /> Performance Index
                    </h5>
                    <div className="space-y-20 relative z-10 font-black leading-none">
                      <div className="border-l-4 border-white/20 pl-12">
                        <span className="text-8xl font-black block leading-none mb-6 tracking-tighter italic tabular-nums group-hover:text-yellow-400 transition-colors leading-none">
                          {getRevenue(selectedCompany) > 0 ? ((Math.abs(cleanValue(selectedCompany['GASTOS DE PERSONAL'])) / getRevenue(selectedCompany)) * 100).toFixed(1) : 0}%
                        </span>
                        <span className="text-[12px] uppercase font-black text-slate-400 tracking-[0.6em] block italic leading-none">Labor Cost Ratio</span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-[#F8F9FA] p-16 border-l-[25px] border-slate-200 shadow-2xl rounded-sm group hover:border-black transition-all leading-normal">
                    <h5 className="text-[12px] font-black uppercase tracking-[0.6em] text-slate-400 mb-16 flex items-center gap-6 italic leading-none"><Briefcase className="w-8 h-8 text-slate-400" /> Registry Purpose</h5>
                    <p className="text-3xl leading-relaxed italic font-serif text-slate-800 font-medium leading-normal">
                      "{String(selectedCompany['OBJETO SOCIAL'] || 'Descripción no disponible.')}"
                    </p>
                  </div>
                </div>
              </div>

              {/* SIMILARES */}
              <div className="mt-40 pt-24 border-t-[10px] border-slate-50 leading-none">
                <div className="flex items-center gap-6 mb-16 leading-none">
                  <Layers className="w-12 h-12 text-yellow-500" />
                  <h4 className="text-5xl font-black uppercase tracking-tighter italic text-black leading-none">Peer Analysis: Comparable Units</h4>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12">
                  {similarCompanies.map((c, i) => (
                    <div key={i} onClick={() => { setSelectedCompany(c); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="bg-white border-2 border-slate-100 hover:border-yellow-400 hover:shadow-2xl transition-all cursor-pointer group flex flex-col justify-between min-h-[350px] shadow-xl relative overflow-hidden leading-none">
                      <div className="absolute -right-4 -bottom-4 w-24 h-24 text-slate-50 opacity-10 group-hover:text-yellow-400 group-hover:opacity-10 transition-all"><Zap className="w-full h-full" /></div>
                      <div className="p-10 leading-none">
                        <span className="text-[10px] font-black bg-black text-white px-4 py-1 uppercase tracking-widest mb-12 inline-block leading-none">{c['CATEGORÍA']}</span>
                        <h5 className="font-black uppercase text-3xl leading-[1.1] group-hover:text-yellow-600 transition-all tracking-tighter mb-4 italic leading-none truncate">{c['ACRONIMO'] || c['DENOMINACIÓN SOCIAL']}</h5>
                        <p className="text-slate-400 text-[10px] font-mono italic tracking-[0.2em] uppercase border-b border-slate-50 pb-6 leading-none">{c['CIF EMPRESA']}</p>
                      </div>
                      <div className="p-10 border-t-4 border-slate-50 mt-10 leading-none">
                         <span className="text-[11px] font-black text-slate-400 uppercase block mb-4 italic leading-none">Current Revenue</span>
                         <span className="font-black text-4xl tabular-nums tracking-tighter text-slate-900 group-hover:text-black leading-none italic">{formatM(getRevenue(c))}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-40 flex justify-center pb-32">
                <button onClick={() => setSelectedCompany(null)} className="bg-black text-white px-80 py-16 font-black uppercase tracking-[1em] text-sm hover:bg-yellow-400 hover:text-black transition-all shadow-2xl active:scale-95 border-b-[30px] border-yellow-600 rounded-sm italic leading-none">CLOSE DOSSIER</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}