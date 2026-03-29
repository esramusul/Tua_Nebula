import React, { useState, useRef, useEffect } from "react";
import {
  UploadCloud,
  Map,
  Target,
  Navigation,
  RefreshCw,
  Cpu,
  BarChart2,
  Clock,
  ShieldAlert,
  Terminal,
  ChevronRight,
  Layers,
  Image as ImageIcon,
  Activity,
  Maximize
} from "lucide-react";

function useAnimatedCounter(endValue, duration = 2000, start = false) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!start) return;
    let startTime = null;
    const animate = (time) => {
      if (!startTime) startTime = time;
      const progress = Math.min((time - startTime) / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3);
      setCount(Math.floor(ease * endValue));
      if (progress < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }, [endValue, duration, start]);

  return count;
}

export default function App() {
  const [file, setFile] = useState(null);
  const [imageSrc, setImageSrc] = useState(null);
  const [isDragging, setIsDragging] = useState(false);

  const [startPoint, setStartPoint] = useState(null);
  const [goalPoint, setGoalPoint] = useState(null);
  const [pickingMode, setPickingMode] = useState(null);

  const [status, setStatus] = useState("Beklemede"); 
  const [errorMsg, setErrorMsg] = useState("");
  const [alerts, setAlerts] = useState([]);

  const [resultOverlay, setResultOverlay] = useState(null);
  const [resultMask, setResultMask] = useState(null);
  const [activeTab, setActiveTab] = useState("routes");

  const imgRef = useRef(null);
  const containerRef = useRef(null);
  const fileInputRef = useRef(null);

  const showMetrics = status === "Tamamlandı";
  const simulatedDistance = useAnimatedCounter(4250, 2500, showMetrics);
  const simulatedRisk = useAnimatedCounter(12, 2000, showMetrics);
  const simulatedETA = useAnimatedCounter(18, 2000, showMetrics);

  const handleDragOver = (e) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = () => setIsDragging(false);
  const handleDrop = (e) => {
    e.preventDefault(); setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) handleFileSelection(e.dataTransfer.files[0]);
  };
  const handleInputChange = (e) => {
    if (e.target.files && e.target.files[0]) handleFileSelection(e.target.files[0]);
  };

  const handleFileSelection = (selectedFile) => {
    setFile(selectedFile);
    setImageSrc(URL.createObjectURL(selectedFile));
    resetSystem();
    addAlert("info", "Uydu görüntüsü aktif. Koordinat girdisi bekleniyor.");
  };

  const resetSystem = () => {
    setStartPoint(null); setGoalPoint(null); setPickingMode(null);
    setStatus("Beklemede"); setResultOverlay(null); setResultMask(null);
    setAlerts([]); setErrorMsg("");
  };

  const addAlert = (type, message) => {
    const id = Date.now();
    setAlerts(prev => [...prev.slice(-3), { id, type, message }]);
  };

  const handleImageClick = (e) => {
    if (!pickingMode || !imgRef.current || !containerRef.current) return;
    const imgRect = imgRef.current.getBoundingClientRect();
    const containerRect = containerRef.current.getBoundingClientRect();
    // displayX/Y: click position relative to the container (so absolute dots land correctly)
    const displayX = e.clientX - containerRect.left;
    const displayY = e.clientY - containerRect.top;
    // realX/Y: actual pixel coords on the original image
    const scaleX = imgRef.current.naturalWidth / imgRect.width;
    const scaleY = imgRef.current.naturalHeight / imgRect.height;
    const realX = Math.round((e.clientX - imgRect.left) * scaleX);
    const realY = Math.round((e.clientY - imgRect.top) * scaleY);

    if (pickingMode === "start") {
      setStartPoint({ x: realX, y: realY, displayX, displayY });
      addAlert("success", `BAŞLANGIÇ kilitlendi: [${realX}, ${realY}]`);
      setPickingMode(goalPoint ? null : "goal");
    } else if (pickingMode === "goal") {
      setGoalPoint({ x: realX, y: realY, displayX, displayY });
      addAlert("success", `HEDEF kilitlendi: [${realX}, ${realY}]`);
      setPickingMode(null);
    }
  };

  const handleRunAnalysis = async () => {
    if (!file || !startPoint || !goalPoint) return;
    setStatus("Analiz Ediliyor"); 
    setErrorMsg("");
    addAlert("info", "YZ motoru arazi hesaplanmasına başlıyor...");

    const formData = new FormData();
    formData.append("image", file);
    formData.append("start_x", startPoint.x);
    formData.append("start_y", startPoint.y);
    formData.append("goal_x", goalPoint.x);
    formData.append("goal_y", goalPoint.y);

    try {
      const response = await fetch("http://localhost:8000/analyze", { method: "POST", body: formData });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Sistem veri akış hatası.");

      setResultOverlay(data.overlay); setResultMask(data.mask);
      setStatus("Tamamlandı");
      setTimeout(() => addAlert("warning", "⚠️ Ana güzergah üzerinde enkaz tespit edildi. Alternatif çiziliyor."), 1500);
    } catch (error) {
      setErrorMsg(error.message); setStatus("Hata");
      addAlert("error", "KRİTİK HATA: " + error.message);
    }
  };

  return (
    // ROOT APP CONTAINER: Forced full viewport
    <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', overflow: 'hidden' }} className="flex bg-[#05080F] font-mono text-slate-300 selection:bg-cyan-500/30 uppercase">
      
      {/* BACKGROUND AMBIENCE */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-cyan-900/10 rounded-full blur-[120px] pointer-events-none animate-blob"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-900/10 rounded-full blur-[120px] pointer-events-none animate-blob" style={{animationDelay: '1s'}}></div>

      {/* --- LEFT SIDEBAR (Original Compact Width) --- */}
      <aside className="w-[340px] shrink-0 bg-[#08111f]/95 flex flex-col z-20 shadow-[0_0_30px_rgba(0,0,0,0.5)] relative border-r border-slate-700">
        <div className="absolute inset-y-0 right-0 w-[1px] bg-cyan-500/30 shadow-[0_0_15px_rgba(6,182,212,0.5)]"></div>
        
        {/* Header Section */}
        <header className="p-5 border-b border-slate-700/80 flex items-center gap-4 bg-black/60 shadow-md">
          <div className="relative w-12 h-12 flex items-center justify-center rounded-lg bg-cyan-500/10 border border-cyan-500/50 shrink-0">
            <Cpu className="text-cyan-400 w-6 h-6 animate-pulse-slow" />
            <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-emerald-500 rounded-full animate-ping"></div>
          </div>
          <div className="overflow-hidden">
            <h1 className="text-2xl font-black tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-indigo-400 truncate">NEBULA</h1>
            <div className="text-[10px] font-semibold text-cyan-500/80 mt-1 tracking-widest truncate">Taktiksel Rota Sistemi</div>
          </div>
        </header>

        <div className="p-6 flex flex-col gap-6 overflow-y-auto flex-1 custom-scrollbar">
          
          {/* Uploader Block */}
          <div className="flex flex-col gap-3">
            <label className="text-xs font-bold text-slate-200 flex items-center gap-3"><UploadCloud className="w-5 h-5 text-cyan-400"/> Görüntü Kaynağı</label>
            <div 
              onClick={() => fileInputRef.current?.click()}
              onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
              className={`w-full min-h-[160px] border-2 border-dashed rounded-xl flex flex-col items-center justify-center p-5 text-center cursor-pointer transition-all duration-300 shadow-inner
                ${isDragging ? 'border-cyan-400 bg-cyan-500/20 scale-[1.02]' : 'border-slate-600 hover:border-cyan-500/50 bg-[#0b1320]/80 hover:bg-[#0b1320]'}
              `}
            >
              <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleInputChange} />
              <UploadCloud className={`w-10 h-10 mb-4 ${isDragging ? 'text-cyan-400' : 'text-slate-500'}`} />
              {file ? (
                <span className="text-sm text-emerald-400 font-bold px-3 py-2 bg-emerald-500/10 rounded-lg tracking-widest">YÜKLENDİ<br/><span className="text-[10px] font-normal text-slate-400 mt-2 block tracking-wider">Değiştir</span></span>
              ) : (
                <span className="text-xs font-medium text-slate-400 tracking-wider">UYDU GÖRÜNTÜSÜ OLUŞTUR</span>
              )}
            </div>
          </div>

          <div className="h-[2px] bg-gradient-to-r from-transparent via-slate-700/50 to-transparent my-2"></div>

          {/* Commander Block */}
          <div className="flex flex-col gap-4">
             <label className="text-xs font-bold text-slate-200 flex items-center gap-3 mb-1"><Terminal className="w-5 h-5 text-cyan-400"/> Görev Talimatları</label>
             
             {/* Start Button */}
             <button onClick={() => {if(imageSrc) setPickingMode("start"); addAlert('info', 'Başlangıç bekleniyor.')}} disabled={!imageSrc || status === "Analiz Ediliyor"}
               className={`w-full text-left p-5 rounded-xl border-2 transition-all duration-300 font-bold text-xs relative overflow-hidden group tracking-wider
                 ${!imageSrc ? 'bg-black/50 border-slate-700 text-slate-500' : startPoint && pickingMode !== 'start' ? 'bg-[#0b1320] border-cyan-500/30 text-cyan-300' : pickingMode === 'start' ? 'bg-cyan-500/10 border-cyan-400 text-cyan-100 shadow-[0_0_20px_rgba(6,182,212,0.4)]' : 'bg-slate-800/80 border-slate-600 text-slate-200 hover:border-slate-400'}
               `}
             >
               <div className="flex items-center gap-4 mb-2"><Map className={`w-5 h-5 ${startPoint ? 'text-cyan-400' : ''}`}/> 1. BAŞLANGIÇ (DEPLOY)</div>
               {startPoint ? <div className="text-[10px] text-cyan-400 pl-9">[{startPoint.x}, {startPoint.y}]</div> : <div className="text-[10px] opacity-50 pl-9">BEKLENİYOR...</div>}
               {pickingMode === 'start' && <div className="absolute bottom-0 left-0 h-1 w-full bg-cyan-400 animate-pulse"></div>}
             </button>

             {/* Goal Button */}
             <button onClick={() => {if(startPoint) setPickingMode("goal"); addAlert('info', 'Hedef (evac) bekleniyor.')}} disabled={!startPoint || status === "Analiz Ediliyor"}
               className={`w-full text-left p-5 rounded-xl border-2 transition-all duration-300 font-bold text-xs relative overflow-hidden group tracking-wider
                 ${!startPoint ? 'bg-black/50 border-slate-700 text-slate-500 cursor-not-allowed' : goalPoint && pickingMode !== 'goal' ? 'bg-[#0b1320] border-emerald-500/30 text-emerald-300' : pickingMode === 'goal' ? 'bg-emerald-500/10 border-emerald-400 text-emerald-100 shadow-[0_0_20px_rgba(16,185,129,0.4)]' : 'bg-slate-800/80 border-slate-600 text-slate-200 hover:border-slate-400'}
               `}
             >
               <div className="flex items-center gap-4 mb-2"><Target className={`w-5 h-5 ${goalPoint ? 'text-emerald-400' : ''}`}/> 2. HEDEF (EVACUATION)</div>
               {goalPoint ? <div className="text-[10px] text-emerald-400 pl-9">[{goalPoint.x}, {goalPoint.y}]</div> : <div className="text-[10px] opacity-50 pl-9">BEKLENİYOR...</div>}
               {pickingMode === 'goal' && <div className="absolute bottom-0 left-0 h-1 w-full bg-emerald-400 animate-pulse"></div>}
             </button>

             {/* Execute Button */}
             <button onClick={handleRunAnalysis} disabled={!startPoint || !goalPoint || status === "Analiz Ediliyor"}
               className={`w-full mt-4 flex items-center justify-center gap-3 py-5 rounded-xl font-black tracking-widest transition-all duration-300 shadow-xl text-sm border-2
                 ${!startPoint || !goalPoint || status === "Analiz Ediliyor" ? 'bg-slate-800 text-slate-500 border-slate-700 cursor-not-allowed' : 'bg-cyan-600 hover:bg-cyan-500 text-white shadow-[0_0_20px_rgba(6,182,212,0.4)] border-cyan-400 hover:scale-[1.02]'}
               `}
             >
               <Cpu className="w-5 h-5" /> {status === 'Tamamlandı' ? 'RE-CALC YZ ROTA' : 'YZ SİSTEMİNİ BAŞLAT'} <ChevronRight className="w-5 h-5 opacity-70" />
             </button>

             {/* Reset Action */}
             <button onClick={resetSystem} disabled={!imageSrc} className="w-full mt-2 flex justify-center items-center py-4 text-xs font-bold text-slate-500 hover:text-slate-300 transition bg-[#0b1320]/40 rounded-xl hover:bg-[#0b1320]">
                <RefreshCw className="w-4 h-4 mr-2" /> HAFIZAYI SİL
             </button>
          </div>
        </div>
      </aside>

      {/* --- CENTER (MAIN TACTICAL VIEWPORT) --- */}
      <main className="flex-1 flex flex-col relative bg-[#020408] z-0 overflow-hidden shadow-2xl">
        <div className="w-full h-full flex flex-col relative grid-overlay border-cyan-900/40 border-l border-r">
          
          {/* Viewport Top Bar */}
          <div className="h-14 shrink-0 bg-black/80 border-b border-cyan-500/30 flex items-center justify-between px-6 z-20 shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
             <div className="text-sm font-bold text-cyan-500 flex items-center gap-3 tracking-widest">
               <Maximize className="w-4 h-4" /> ANA OPTİK SENSÖR KANALI
             </div>
             {status === 'Analiz Ediliyor' ? <div className="text-xs font-black text-cyan-400 animate-pulse tracking-widest">❖ YZ BAĞLANTISI AKTİF</div> : <div className="text-xs text-slate-500 font-bold tracking-widest">SİSTEM HAZIR</div>}
          </div>

          {/* Canvas Wrapper */}
          <div className="flex-1 relative w-full h-full flex items-center justify-center overflow-hidden bg-[#05080f]/50 bg-stripe-pattern p-4">
            
            {/* 1. Placeholder State (No Image) */}
            {!imageSrc && (
              <div className="text-center opacity-40 select-none bg-[#08111f]/80 p-10 rounded-2xl border border-slate-700/50 shadow-2xl backdrop-blur-sm">
                <Map className="w-24 h-24 mx-auto mb-6 text-slate-600" />
                <h2 className="text-2xl tracking-widest font-black text-slate-300">SİNYAL YOK</h2>
                <p className="text-xs mt-3 text-slate-500 tracking-widest">SOL PANELDEN OPTİK MATERYAL YÜKLEYİN.</p>
              </div>
            )}

            {/* 2. Loading State Overlay */}
            {status === "Analiz Ediliyor" && (
              <div className="absolute inset-0 z-50 bg-[#020408]/90 backdrop-blur flex flex-col items-center justify-center border border-transparent">
                <div className="relative w-32 h-32 mb-8 shadow-[0_0_80px_rgba(6,182,212,0.2)] rounded-full flex items-center justify-center">
                  <div className="absolute inset-0 border-t-2 border-r-2 border-cyan-400 rounded-full animate-spin shadow-[0_0_20px_rgba(6,182,212,0.6)]"></div>
                  <div className="absolute inset-4 border-l-2 border-b-2 border-indigo-500 rounded-full animate-[spin_2s_linear_infinite_reverse]"></div>
                  <Cpu className="text-cyan-400 w-10 h-10 animate-pulse-slow" />
                </div>
                <h2 className="text-xl text-cyan-400 font-bold mb-2 shadow-cyan-400/50 drop-shadow-lg tracking-widest">YZ ÇIKARIM YAPIYOR...</h2>
                <p className="text-xs text-slate-400 font-medium tracking-widest">ENKAZ VE TEHLİKELER HESAPLANIYOR</p>
                <div className="w-[24rem] h-1 bg-slate-800 mt-8 rounded overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-cyan-600 to-cyan-400 animate-[slideUp_2s_ease-out_infinite]" style={{width: '60%'}}></div>
                </div>
              </div>
            )}

            {/* 3. Error Overlay */}
            {status === "Hata" && (
              <div className="absolute z-50 bg-red-950/95 border border-red-500 backdrop-blur flex flex-col items-center p-12 text-center text-red-100 rounded-xl shadow-[0_0_100px_rgba(239,68,68,0.3)] max-w-lg">
                 <ShieldAlert className="w-16 h-16 mb-6 text-red-500 animate-pulse" />
                 <h2 className="text-2xl mb-4 font-black tracking-widest">KRİTİK HATA</h2>
                 <p className="text-xs bg-black/80 p-4 border border-red-500/50 rounded w-full mb-8 shadow-inner font-mono">{errorMsg}</p>
                 <button onClick={resetSystem} className="w-full py-4 bg-red-700 hover:bg-red-600 text-white font-bold rounded-lg tracking-widest text-sm transition shadow-lg border border-red-400">SIFIRLA</button>
              </div>
            )}

            {/* 4. Interactive Img Map (Input Selection Phase) */}
            {imageSrc && status !== "Tamamlandı" && status !== "Hata" && (
              <div ref={containerRef} className="relative w-full h-full flex items-center justify-center">
                <img ref={imgRef} src={imageSrc} onClick={handleImageClick} className={`max-w-full max-h-full object-contain rounded border border-slate-700 shadow-[0_0_40px_rgba(0,0,0,0.8)] transition-all duration-300 ${pickingMode ? 'cursor-crosshair ring-2 ring-cyan-500/50' : ''}`} draggable="false" alt="Satellite Feed"/>
                
                {/* Visual Pointers */}
                {startPoint && (
                  <div className="absolute pointer-events-none transform -translate-x-1/2 -translate-y-1/2 z-10" style={{ left: startPoint.displayX, top: startPoint.displayY }}>
                    <div className="w-6 h-6 flex items-center justify-center">
                      <div className="absolute w-full h-full border-2 border-cyan-400 rounded-full animate-ping opacity-80"></div>
                      <div className="w-3 h-3 rounded-full bg-cyan-400 border-2 border-[#02050B] shadow-[0_0_15px_rgba(34,211,238,0.9)]"></div>
                    </div>
                  </div>
                )}
                {goalPoint && (
                  <div className="absolute pointer-events-none transform -translate-x-1/2 -translate-y-1/2 z-10" style={{ left: goalPoint.displayX, top: goalPoint.displayY }}>
                    <div className="w-6 h-6 flex items-center justify-center">
                      <div className="absolute w-full h-full border-2 border-emerald-400 rounded-full animate-ping opacity-80"></div>
                      <div className="w-3 h-3 rounded-full bg-emerald-400 border-2 border-[#02050B] shadow-[0_0_15px_rgba(16,185,129,0.9)]"></div>
                    </div>
                  </div>
                )}
                
                {/* Live Instruction Banner placed on top of map */}
                {pickingMode && (
                   <div className="absolute top-6 bg-[#08111f]/95 border border-slate-600 backdrop-blur px-6 py-3 rounded-full text-xs font-bold flex items-center gap-3 animate-pulse shadow-[0_10px_40px_rgba(0,0,0,0.6)] z-20">
                     <span className={`w-3 h-3 rounded-full ${pickingMode==='start' ? 'bg-cyan-400 shadow-[0_0_10px_#22d3ee]' : 'bg-emerald-400 shadow-[0_0_10px_#10b981]'} animate-ping`}></span>
                     <span className={`tracking-widest ${pickingMode==='start' ? 'text-cyan-400' : 'text-emerald-400'}`}>
                        {pickingMode==='start' ? 'BAŞLANGIÇ (DEPLOY) SEÇİLİYOR' : 'HEDEF (EVAC) SEÇİLİYOR'}
                     </span>
                   </div>
                )}
              </div>
            )}

            {/* 5. Results Renders */}
            {status === "Tamamlandı" && resultOverlay && resultMask && (
              <div className="relative w-full h-full flex items-center justify-center animate-[fadeIn_0.5s_ease-out]">
                 {activeTab === 'routes' && <img src={resultOverlay} className="max-w-full max-h-full object-contain rounded shadow-[0_0_80px_rgba(0,0,0,0.7)] border border-slate-700" alt="Routes" />}
                 {activeTab === 'segmentation' && <img src={resultMask} className="max-w-full max-h-full object-contain rounded shadow-[0_0_80px_rgba(0,0,0,0.7)] border border-slate-700" alt="Mask" />}
                 {activeTab === 'comparison' && (
                   <div className="w-full h-full flex flex-row items-center justify-center gap-4">
                     <img src={resultMask} className="w-1/2 h-full object-contain rounded border border-slate-700 opacity-90 mix-blend-screen shadow-2xl" alt="Mask" />
                     <img src={resultOverlay} className="w-1/2 h-full object-contain rounded border border-slate-700 shadow-2xl" alt="Routes" />
                   </div>
                 )}
              </div>
            )}
          </div>
          
          {/* Bottom Tabs Wrapper */}
          {status === "Tamamlandı" && (
            <div className="h-20 shrink-0 bg-black/90 border-t border-cyan-500/30 flex items-center justify-center gap-6 backdrop-blur z-20 shadow-[0_-4px_20px_rgba(0,0,0,0.4)]">
               {[ 
                 { id: 'routes', label: 'ROTA PLANI', icon: Navigation }, 
                 { id: 'segmentation', label: 'YZ HASAR', icon: Layers }, 
                 { id: 'comparison', label: 'ÇİFT GÖRÜNÜM', icon: ImageIcon } 
               ].map(tab => (
                 <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                   className={`flex items-center gap-2 px-6 py-3 rounded-lg text-xs font-bold tracking-widest transition-all duration-300 border
                     ${activeTab === tab.id ? 'bg-[#0b1320] text-cyan-400 border-cyan-500 shadow-[0_0_15px_rgba(6,182,212,0.4)]' : 'bg-black/60 text-slate-400 border-slate-700 hover:text-slate-200 hover:border-slate-500 hover:bg-[#0b1320]/60'}
                   `}
                 >
                   <tab.icon className="w-4 h-4" /> {tab.label}
                 </button>
               ))}
            </div>
          )}
        </div>
      </main>

      {/* --- RIGHT SIDEBAR (Original Compact Width) --- */}
      <aside className="w-[340px] shrink-0 bg-[#08111f]/95 flex flex-col p-5 z-20 gap-6 overflow-hidden shadow-[0_0_30px_rgba(0,0,0,0.5)] relative border-l border-slate-700">
        <div className="absolute inset-y-0 left-0 w-[1px] bg-cyan-500/30 shadow-[0_0_15px_rgba(6,182,212,0.5)]"></div>
        
        {/* Status Tracker */}
        <div className="p-5 bg-black/40 border border-slate-600 shadow-lg flex flex-col gap-4 shrink-0 rounded-xl relative overflow-hidden backdrop-blur-sm">
           <div className="absolute top-0 right-0 w-full h-1 bg-gradient-to-r from-cyan-500 to-emerald-500"></div>
           <div className="flex justify-between items-center text-[10px] font-bold border-b border-slate-700/80 pb-3 tracking-widest text-slate-300">
             <span className="flex items-center gap-2"><Activity className="w-4 h-4 text-emerald-400"/> SİSTEM BAĞLANTISI</span>
             <span className="text-emerald-400 font-black tracking-widest">GÜVENLİ</span>
           </div>
           <div className="flex justify-between items-center text-[10px] font-bold pt-1 tracking-widest">
             <span className="text-slate-400">MOTOR DURUMU</span>
             <span className={`font-black uppercase text-xs ${status === 'Beklemede' ? 'text-amber-500' : status === 'Analiz Ediliyor' ? 'text-cyan-400 animate-pulse' : status === 'Hata' ? 'text-red-500' : 'text-emerald-500'}`}>
               {status}
             </span>
           </div>
        </div>

        {/* Telemetry Metrics Panel */}
        <div className="p-5 flex flex-col bg-black/20 relative border border-slate-700/80 shadow-inner shrink-0 rounded-xl">
           <h2 className="text-xs font-bold text-indigo-400 mb-5 flex items-center gap-2 tracking-widest">
             <BarChart2 className="w-4 h-4"/> LOJİSTİK/PERFORMANS
           </h2>
           
           {status !== "Tamamlandı" ? (
             <div className="h-48 flex flex-col items-center justify-center text-slate-600 text-[10px] font-bold text-center border-2 border-dashed border-slate-700/80 rounded-xl">
                <Cpu className="w-8 h-8 mb-4 opacity-30 animate-pulse text-indigo-400" />
                TELEMETRİ BEKLENİYOR
             </div>
           ) : (
             <div className="flex flex-col gap-4 animate-[slideUp_0.5s_ease-out]">
                {/* Line 1: Dist */}
                <div className="bg-[#08111f]/80 p-4 rounded-xl border border-slate-700 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-cyan-500/10 flex items-center justify-center border border-cyan-500/30 shrink-0">
                    <Navigation className="w-5 h-5 text-cyan-400" />
                  </div>
                  <div>
                    <div className="text-[10px] text-cyan-500/80 mb-1 tracking-widest font-bold">MESAFA DÜZLEMİ</div>
                    <div className="text-xl font-black text-slate-100">
                      {simulatedDistance.toLocaleString()} <span className="text-xs text-slate-500">m</span>
                    </div>
                  </div>
                </div>

                {/* Line 2: ETA */}
                <div className="bg-[#08111f]/80 p-4 rounded-xl border border-slate-700 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-indigo-500/10 flex items-center justify-center border border-indigo-500/30 shrink-0">
                    <Clock className="w-5 h-5 text-indigo-400" />
                  </div>
                  <div>
                    <div className="text-[10px] text-indigo-400/80 mb-1 tracking-widest font-bold">TAHLİYE ETA</div>
                    <div className="text-xl font-black text-slate-100">
                      ~{simulatedETA} <span className="text-xs text-slate-500">Mins</span>
                    </div>
                  </div>
                </div>

                {/* Line 3: Risk */}
                <div className="bg-emerald-950/20 p-4 rounded-xl border-2 border-emerald-500/30 flex items-center gap-4 relative overflow-hidden">
                  <div className="absolute top-0 right-0 px-2 py-1 bg-emerald-500 border-b border-l border-emerald-600 text-black text-[8px] font-black tracking-widest rounded-bl">GÜVENLİ X1</div>
                  <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center border border-emerald-500/50 shrink-0">
                    <ShieldAlert className="w-5 h-5 text-emerald-400" />
                  </div>
                  <div>
                    <div className="text-[10px] text-emerald-500/80 mb-1 tracking-widest font-bold">KÜMÜLATİF RİSK</div>
                    <div className="text-xl font-black text-emerald-400">
                      {simulatedRisk}% <span className="text-xs text-emerald-600">Risk</span>
                    </div>
                  </div>
                </div>
             </div>
           )}
        </div>

        {/* Route Legend */}
        {status === "Tamamlandı" && activeTab === 'routes' && (
          <div className="p-5 border border-slate-700 animate-[fadeIn_0.5s_ease-out] bg-black/40 rounded-xl shrink-0 shadow-lg">
            <div className="text-xs font-bold text-slate-400 mb-4 border-b border-slate-700/50 pb-2 tracking-widest">LEJANT MATRİSİ</div>
            <div className="flex flex-col gap-3 text-xs font-medium tracking-wide">
              <div className="flex items-center gap-4"><div className="w-8 h-1.5 bg-emerald-500 rounded"></div> <span className="text-slate-200">En Güvenli Yol</span></div>
              <div className="flex items-center gap-4"><div className="w-8 h-0 border-t-2 border-dashed border-amber-500"></div> <span className="text-slate-400">En Kısa Kuşuçuşu</span></div>
              <div className="flex items-center gap-4"><div className="w-4 h-4 rounded bg-blue-500/40 border-2 border-blue-400"></div> <span className="text-slate-400">Haritalanan Yol</span></div>
              <div className="flex items-center gap-4"><div className="w-4 h-4 rounded bg-red-500/40 border-2 border-red-500"></div> <span className="text-slate-400">Kritik Enkaz</span></div>
            </div>
          </div>
        )}

        {/* Alerts Log Container */}
        <div className="flex-1 min-h-0 flex flex-col bg-black/30 rounded-xl border border-slate-700/80 p-5 overflow-hidden shadow-inner font-mono">
           <h3 className="text-xs font-bold text-slate-300 mb-4 border-b border-slate-700 pb-3 tracking-widest flex items-center gap-2">
             <Terminal className="w-4 h-4 text-cyan-400"/> TERMİNAL LOGLARI
           </h3>
           <div className="flex-1 overflow-y-auto flex flex-col justify-end gap-3 custom-scrollbar pr-2">
            {alerts.slice(-6).map((alert) => (
              <div key={alert.id} className={`shrink-0 flex items-start gap-3 p-3 rounded-lg pointer-events-none transition-all shadow-md
                ${alert.type === 'error' ? 'bg-red-950/40 border-l-[3px] border-red-500 text-red-100' : 
                  alert.type === 'warning' ? 'bg-amber-950/40 border-l-[3px] border-amber-500 text-amber-100' : 
                  alert.type === 'success' ? 'bg-emerald-950/20 border-l-[3px] border-emerald-500 text-emerald-100' : 
                  'bg-cyan-950/10 border-l-[3px] border-cyan-500 text-cyan-100'}
              `}>
                {alert.type === 'error' ? <ShieldAlert className="w-4 h-4 text-red-400 mt-0.5" /> : alert.type === 'warning' ? <ShieldAlert className="w-4 h-4 text-amber-400 mt-0.5" /> : <Terminal className={`w-4 h-4 mt-0.5 ${alert.type === 'success' ? 'text-emerald-400' : 'text-cyan-400'}`} />}
                <span className="text-[10px] leading-relaxed font-medium tracking-wider flex-1">{alert.message}</span>
              </div>
            ))}
            {alerts.length === 0 && <div className="text-[10px] font-medium text-slate-600 text-center opacity-70 py-6 border border-dashed border-slate-700/50 rounded-lg mx-2 tracking-widest">AWAITING SYSTEM LOGS</div>}
          </div>
        </div>
      </aside>
    </div>
  );
}
