// app.jsx - Hlavní komponenta Reactu

const { useState, useEffect, useCallback, useRef, useMemo } = React;

function App() {
  const [settings, setSettings] = useState({
    gridResolution: 16,
    threshold: 0.3,
    blockColor: "#111827",
  });
  const [inputFolder, setInputFolder] = useState(null);
  const [outputFolder, setOutputFolder] = useState(null);
  const [svgFiles, setSvgFiles] = useState([]);
  const [processedFiles, setProcessedFiles] = useState([]);
  const [log, setLog] = useState("Aplikace připravena.");
  const [isProcessing, setIsProcessing] = useState(false);
  
  const canvasRef = useRef(null);

  // Načtení nastavení při startu
  useEffect(() => {
    const savedSettings = localStorage.getItem('voxelizer-settings');
    if (savedSettings) {
      setSettings(JSON.parse(savedSettings));
    }
  }, []);
  
  // Uložení nastavení při změně
  useEffect(() => {
    localStorage.setItem('voxelizer-settings', JSON.stringify(settings));
  }, [settings]);

  // Univerzální funkce pro výběr složky
  const handleSelectFolder = async (type) => {
  try {
    setLog(`Vybírám ${type === 'input' ? 'vstupní' : 'výstupní'} složku...`);
    console.log('[UI] selectFolder click:', type);

    const result = await window.electronAPI.selectFolder();
    console.log('[UI] selectFolder result:', result);

    if (!result) {
      setLog('Výběr zrušen.');
      return;
    }
    if (result.error) {
      console.error('[UI] selectFolder error:', result.error);
      alert('Chyba výběru složky: ' + result.error);
      setLog('Chyba při výběru složky.');
      return;
    }

    if (type === 'input') {
      setInputFolder(result.folderPath);
      setSvgFiles(result.files);
      setLog(`Nalezeno ${result.files.length} SVG ve složce ${result.folderPath}`);
      if (!outputFolder) setOutputFolder(result.folderPath + '_voxelized');
    } else {
      setOutputFolder(result.folderPath);
      setLog(`Výstupní složka nastavena na ${result.folderPath}`);
    }
  } catch (e) {
    console.error('[UI] handleSelectFolder fatal:', e);
    alert('Výběr složky selhal: ' + (e?.message ?? e));
    setLog('Výběr složky selhal.');
  }
};


  const voxelizeSvg = useCallback((svgContent) => {
    return new Promise((resolve, reject) => {
        const canvas = canvasRef.current;
        if (!canvas) return reject(new Error("Canvas not ready"));
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        
        const svgBlob = new Blob([svgContent], { type: "image/svg+xml" });
        const url = URL.createObjectURL(svgBlob);
        const img = new Image();

        img.onload = () => {
            canvas.width = settings.gridResolution;
            canvas.height = settings.gridResolution;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            URL.revokeObjectURL(url);
            
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const { data } = imageData;
            
            let rects = "";
            const blockSize = 24 / settings.gridResolution;
            const pixelThreshold = Math.floor(255 * settings.threshold);

            for (let y = 0; y < settings.gridResolution; y++) {
                for (let x = 0; x < settings.gridResolution; x++) {
                    const i = (y * settings.gridResolution + x) * 4;
                    const alpha = data[i + 3];
                    const brightness = (data[i] + data[i+1] + data[i+2]) / 3;
                    if (alpha > pixelThreshold && brightness < 250) {
                        const rectX = (x * blockSize).toFixed(3);
                        const rectY = (y * blockSize).toFixed(3);
                        rects += `<rect x="${rectX}" y="${rectY}" width="${blockSize}" height="${blockSize}" />`;
                    }
                }
            }
            const finalSvg = `<svg viewBox="0 0 24 24" fill="${settings.blockColor}" xmlns="http://www.w3.org/2000/svg">${rects}</svg>`;
            resolve(finalSvg);
        };
        img.onerror = (err) => { reject(new Error("Failed to load SVG image.")); URL.revokeObjectURL(url); };
        img.src = url;
    });
  }, [settings]);

  const handleStartProcessing = async () => {
    if (!inputFolder || !outputFolder || svgFiles.length === 0) {
      setLog("Chyba: Musíte vybrat vstupní i výstupní složku.");
      return;
    }
    
    setIsProcessing(true);
    setProcessedFiles([]);
    let processed = [];

    for (let i = 0; i < svgFiles.length; i++) {
        const fileName = svgFiles[i];
        const filePath = `${inputFolder}/${fileName}`; // Jednoduché spojení cesty
        setLog(`Zpracovávám (${i + 1}/${svgFiles.length}): ${fileName}`);
        try {
            const content = window.electronAPI.readFile(filePath);
            const voxelizedContent = await voxelizeSvg(content);
            processed.push({ name: fileName, content: voxelizedContent });
        } catch(error) {
            console.error(`Chyba při zpracování ${fileName}:`, error);
            setLog(`Chyba u souboru ${fileName}. Přeskakuji.`);
        }
    }

    setLog(`Zpracováno ${processed.length} souborů. Ukládám...`);
    const savedCount = await window.electronAPI.saveFiles({
        outputFolder: outputFolder,
        filesToSave: processed
    });
    setLog(`Hotovo! ${savedCount} souborů bylo úspěšně uloženo do složky ${outputFolder}`);
    setProcessedFiles(processed);
    setIsProcessing(false);
  };

  return (
    <div className="min-h-screen bg-gray-100 text-gray-900 p-6 font-sans">
      <canvas ref={canvasRef} style={{ display: 'none' }}></canvas>
      <div className="max-w-7xl mx-auto">
        <header className="mb-6">
          <h1 className="text-3xl font-bold">SVG Batch Voxelátor</h1>
          <p className="text-gray-600">Hromadně překreslete SVG ikony do blokového stylu.</p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* --- Settings Panel --- */}
          <div className="md:col-span-1 bg-white p-4 rounded-xl shadow-sm border space-y-4">
            <h2 className="text-lg font-semibold border-b pb-2">1. Nastavení</h2>
             <ControlSlider label="Rozlišení mřížky" value={settings.gridResolution} min={4} max={64} step={1} onChange={val => setSettings(s => ({...s, gridResolution: val}))} displayValue={`${settings.gridResolution}x${settings.gridResolution}`} />
             <ControlSlider label="Práh detekce" value={settings.threshold} min={0.05} max={0.95} step={0.05} onChange={val => setSettings(s => ({...s, threshold: val}))} displayValue={`${Math.round(settings.threshold*100)}%`} />
             <div>
                <label className="text-sm flex items-center justify-between text-gray-700">
                  <span>Barva bloků</span>
                  <input type="color" value={settings.blockColor} onChange={e => setSettings(s => ({...s, blockColor: e.target.value}))} className="w-8 h-8 border-none rounded" />
                </label>
             </div>
          </div>
          
          {/* --- Main Panel --- */}
          <div className="md:col-span-2 bg-white p-4 rounded-xl shadow-sm border space-y-4">
            <div>
                <h2 className="text-lg font-semibold border-b pb-2">2. Soubory</h2>
                <div className="grid grid-cols-2 gap-4 mt-4">
                    <button onClick={() => handleSelectFolder('input')} className="w-full text-left p-3 rounded-lg bg-gray-50 border hover:bg-gray-100">
                        <div className="font-semibold">Vstupní složka</div>
                        <div className="text-xs text-gray-500 truncate">{inputFolder || "Nevybráno"}</div>
                    </button>
                    <button onClick={() => handleSelectFolder('output')} className="w-full text-left p-3 rounded-lg bg-gray-50 border hover:bg-gray-100">
                        <div className="font-semibold">Výstupní složka</div>
                        <div className="text-xs text-gray-500 truncate">{outputFolder || "Nevybráno"}</div>
                    </button>
                </div>
            </div>
             <div>
                <h2 className="text-lg font-semibold border-b pb-2">3. Zpracování</h2>
                 <div className="mt-4">
                    <button onClick={handleStartProcessing} disabled={isProcessing || !inputFolder} className="w-full px-4 py-3 rounded-lg shadow-sm font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors">
                        {isProcessing ? "Zpracovávám..." : `Spustit zpracování (${svgFiles.length} souborů)`}
                    </button>
                    <div className="mt-2 text-xs text-gray-600 bg-gray-100 p-2 rounded-md font-mono h-16 overflow-y-auto">
                        {log}
                    </div>
                </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const ControlSlider = ({ label, value, min, max, step, onChange, displayValue }) => {
    return (<div><label className="text-sm flex items-center justify-between text-gray-700"><span>{label}</span><span className="text-gray-500 font-mono">{displayValue || value}</span></label><input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer mt-1" /></div>);
};

ReactDOM.createRoot(document.getElementById('root')).render(<App />);

