// app.jsx - Opravená verze s presety a rotací

const { useState, useEffect, useCallback, useRef } = React;

// Pomocné funkce pro barvy
const interpolateColor=(c1,c2,f)=>{let r=c1.slice();for(let i=0;i<3;i++)r[i]=Math.round(r[i]+f*(c2[i]-r[i]));return`rgb(${r[0]},${r[1]},${r[2]})`};
const hexToRgb=(h)=>{const r=/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(h);return r?[parseInt(r[1],16),parseInt(r[2],16),parseInt(r[3],16)]:null};

function App() {
  const [settings, setSettings] = useState({
    gridResolution: 16,
    threshold: 0.3,
    blockType: "rect",
    blockColor: "#111827", // Přidáno chybějící nastavení
    useGradient: false,
    gradientStart: "#4f46e5",
    gradientEnd: "#ec4899",
    invertOutput: false,
    sizeVariation: 0,
    blockRotation: 0,
  });
  const [inputFolder, setInputFolder] = useState(null);
  const [outputFolder, setOutputFolder] = useState(null);
  const [svgFiles, setSvgFiles] = useState([]);
  const [log, setLog] = useState("Aplikace připravena.");
  const [isProcessing, setIsProcessing] = useState(false);
  
  const canvasRef = useRef(null);

  useEffect(() => {
    const savedSettings = localStorage.getItem('voxelizer-settings-v3');
    if (savedSettings) {
      setSettings(s => ({ ...s, ...JSON.parse(savedSettings) }));
    }
  }, []);
  
  useEffect(() => {
    localStorage.setItem('voxelizer-settings-v3', JSON.stringify(settings));
  }, [settings]);

  const handleSelectFolder = async (type) => {
    setLog(`Vybírám ${type === 'input' ? 'vstupní' : 'výstupní'} složku...`);
    const result = await window.electronAPI.selectFolder();
    if (result && result.folderPath) {
      if (type === 'input') {
        setInputFolder(result.folderPath);
        setSvgFiles(result.files);
        setLog(`Nalezeno ${result.files.length} SVG souborů.`);
        if (!outputFolder) setOutputFolder(result.folderPath + '_voxelized');
      } else {
        setOutputFolder(result.folderPath);
        setLog(`Výstupní složka nastavena.`);
      }
    } else {
        setLog("Výběr složky zrušen nebo selhal.");
    }
  };
  
  const handleSavePreset = async () => {
    setLog("Ukládám preset...");
    const result = await window.electronAPI.savePreset(settings);
    if (result.success) {
      setLog(`Preset úspěšně uložen do ${result.path}`);
    } else {
      setLog("Uložení presetu zrušeno nebo selhalo.");
    }
  };

  const handleLoadPreset = async () => {
    setLog("Načítám preset...");
    const loadedSettings = await window.electronAPI.loadPreset();
    if (loadedSettings && !loadedSettings.error) {
      setSettings(s => ({ ...s, ...loadedSettings }));
      setLog("Preset úspěšně načten.");
    } else {
      setLog("Načtení presetu zrušeno nebo selhalo.");
    }
  };

  const voxelizeSvg = useCallback((svgContent) => {
    return new Promise((resolve, reject) => {
        const canvas = canvasRef.current;
        if (!canvas) return reject(new Error("Canvas not ready"));
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        const img = new Image();
        img.src = "data:image/svg+xml;base64," + btoa(svgContent);

        img.onload = () => {
            canvas.width = settings.gridResolution;
            canvas.height = settings.gridResolution;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const { data } = imageData;
            
            let elements = "";
            const blockSize = 24 / settings.gridResolution;
            const pixelThreshold = 255 * settings.threshold;
            const color1 = hexToRgb(settings.gradientStart);
            const color2 = hexToRgb(settings.gradientEnd);

            for (let y = 0; y < settings.gridResolution; y++) {
                for (let x = 0; x < settings.gridResolution; x++) {
                    const i = (y * settings.gridResolution + x) * 4;
                    const isFilled = data[i + 3] > pixelThreshold;
                    const shouldDraw = settings.invertOutput ? !isFilled : isFilled;

                    if (shouldDraw) {
                        const cx = (x + 0.5) * blockSize;
                        const cy = (y + 0.5) * blockSize;
                        const sizeFactor = 1 - (Math.random() * settings.sizeVariation);
                        const finalSize = blockSize * sizeFactor;
                        
                        let color = settings.useGradient && color1 && color2
                            ? interpolateColor(color1, color2, (x + y) / (settings.gridResolution * 2 - 2))
                            : settings.blockColor;
                        
                        const fill = `fill="${color}"`;
                        const transform = settings.blockRotation !== 0 ? `transform="rotate(${settings.blockRotation} ${cx} ${cy})"` : "";
                        
                        switch (settings.blockType) {
                            case 'circle': elements += `<circle cx="${cx}" cy="${cy}" r="${finalSize/2}" ${fill} />\n`; break;
                            case 'line': elements += `<line x1="${cx - finalSize/2}" y1="${cy - finalSize/2}" x2="${cx + finalSize/2}" y2="${cy + finalSize/2}" stroke="${color}" stroke-width="${blockSize*0.2}" ${transform} />\n`; break;
                            default: elements += `<rect x="${cx-finalSize/2}" y="${cy-finalSize/2}" width="${finalSize}" height="${finalSize}" ${fill} ${transform} />\n`;
                        }
                    }
                }
            }
            resolve(`<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">${elements}</svg>`);
        };
        img.onerror = (err) => reject(new Error("Failed to load SVG."));
    });
  }, [settings]);

  const handleStartProcessing = async () => {
    if (!inputFolder || !outputFolder || svgFiles.length === 0) {
      setLog("Chyba: Musíte vybrat vstupní i výstupní složku.");
      return;
    }
    setIsProcessing(true);
    let processed = [];
    for (let i = 0; i < svgFiles.length; i++) {
        const fileName = svgFiles[i];
        setLog(`Zpracovávám (${i + 1}/${svgFiles.length}): ${fileName}`);
        try {
            const content = await window.electronAPI.readFile(`${inputFolder}/${fileName}`);
            const voxelizedContent = await voxelizeSvg(content);
            processed.push({ name: fileName, content: voxelizedContent });
        } catch(error) {
            console.error(`Chyba při zpracování ${fileName}:`, error);
            setLog(`Chyba u souboru ${fileName}. Přeskakuji.`);
        }
    }
    setLog(`Zpracováno ${processed.length} souborů. Ukládám...`);
    const savedCount = await window.electronAPI.saveFiles({ outputFolder, filesToSave: processed });
    setLog(`Hotovo! ${savedCount} souborů bylo úspěšně uloženo do složky ${outputFolder}`);
    setIsProcessing(false);
  };

  return (
    <div className="min-h-screen bg-gray-100 text-gray-900 p-6 font-sans">
      <canvas ref={canvasRef} style={{ display: 'none' }}></canvas>
      <div className="max-w-7xl mx-auto">
        <header className="mb-6">
          <h1 className="text-3xl font-bold">SVG Batch Voxelátor v3</h1>
          <p className="text-gray-600">Hromadně překreslete SVG ikony do blokového stylu s pokročilými možnostmi.</p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-1 bg-white p-4 rounded-xl shadow-sm border space-y-4">
            <h2 className="text-lg font-semibold border-b pb-2">1. Nastavení</h2>
             <ControlSlider label="Rozlišení mřížky" value={settings.gridResolution} min={4} max={64} step={1} onChange={val => setSettings(s => ({...s, gridResolution: val}))} displayValue={`${settings.gridResolution}x${settings.gridResolution}`} />
             <ControlSlider label="Práh detekce" value={settings.threshold} min={0.05} max={0.95} step={0.05} onChange={val => setSettings(s => ({...s, threshold: val}))} displayValue={`${Math.round(settings.threshold*100)}%`} />
            <div>
                <label className="text-sm text-gray-700">Tvar bloku</label>
                <div className="flex rounded-md shadow-sm mt-1">
                    <button onClick={() => setSettings(s=>({...s, blockType: 'rect'}))} className={`px-3 py-1 text-xs w-full rounded-l-md border ${settings.blockType === 'rect' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white hover:bg-gray-50'}`}>Čtverec</button>
                    <button onClick={() => setSettings(s=>({...s, blockType: 'circle'}))} className={`px-3 py-1 text-xs w-full border-t border-b ${settings.blockType === 'circle' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white hover:bg-gray-50'}`}>Kruh</button>
                    <button onClick={() => setSettings(s=>({...s, blockType: 'line'}))} className={`px-3 py-1 text-xs w-full rounded-r-md border ${settings.blockType === 'line' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white hover:bg-gray-50'}`}>Čára</button>
                </div>
            </div>
             <ControlSlider label="Variace velikosti" value={settings.sizeVariation} min={0} max={0.9} step={0.05} onChange={val => setSettings(s => ({...s, sizeVariation: val}))} displayValue={`${Math.round(settings.sizeVariation*100)}%`} />
            
            <div className="border-t pt-4">
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">Pokročilé</h3>
              <ControlSlider label="Rotace bloků" value={settings.blockRotation} min={0} max={90} step={1} onChange={val => setSettings(s => ({...s, blockRotation: val}))} displayValue={`${settings.blockRotation}°`} />
            </div>

            <div className="border-t pt-4 space-y-3">
                 <label className="flex items-center justify-between cursor-pointer"><span className="text-sm text-gray-700">Použít přechod</span><input type="checkbox" checked={settings.useGradient} onChange={e => setSettings(s=>({...s, useGradient: e.target.checked}))} className="h-4 w-4 rounded" /></label>
                 <div className={`grid grid-cols-2 gap-2 ${!settings.useGradient ? 'opacity-50' : ''}`}>
                    <input type="color" disabled={!settings.useGradient} value={settings.gradientStart} onChange={e => setSettings(s => ({...s, gradientStart: e.target.value}))} className="w-full h-8 border-none rounded" />
                    <input type="color" disabled={!settings.useGradient} value={settings.gradientEnd} onChange={e => setSettings(s => ({...s, gradientEnd: e.target.value}))} className="w-full h-8 border-none rounded" />
                 </div>
            </div>
             <div className="border-t pt-4">
                 <label className="flex items-center justify-between cursor-pointer"><span className="text-sm text-gray-700">Invertovat výstup</span><input type="checkbox" checked={settings.invertOutput} onChange={e => setSettings(s=>({...s, invertOutput: e.target.checked}))} className="h-4 w-4 rounded" /></label>
            </div>
            
            <div className="border-t pt-4">
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">Presety</h3>
                <div className="grid grid-cols-2 gap-2">
                    <button onClick={handleLoadPreset} className="px-3 py-2 text-xs bg-gray-200 rounded-md hover:bg-gray-300">Načíst preset</button>
                    <button onClick={handleSavePreset} className="px-3 py-2 text-xs bg-gray-200 rounded-md hover:bg-gray-300">Uložit preset</button>
                </div>
            </div>
          </div>
          
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

