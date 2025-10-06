// preload.js (nahraď tímto)
(() => {
  try {
    const { contextBridge, ipcRenderer } = require('electron');
    const fs = require('fs');

    const api = {
      // Původní funkce
      selectFolder: () => ipcRenderer.invoke('dialog:openDirectory'),
      saveFiles: (data) => ipcRenderer.invoke('files:save', data),

      // Bezpečnější čtení (ať případný pád neodstřelí celý preload)
      readFile: (filePath) => {
        try {
          return fs.readFileSync(filePath, 'utf-8');
        } catch (e) {
          console.error('readFile error:', e);
          return null;
        }
      },

      // Nové funkce pro presety
      savePreset: (settings) => ipcRenderer.invoke('dialog:savePreset', settings),
      loadPreset: () => ipcRenderer.invoke('dialog:openPreset'),
    };

    contextBridge.exposeInMainWorld('electronAPI', api);
  } catch (e) {
    // Propíchneme chybu do rendereru, aby se ukázala v alertu/index.html
    globalThis.__preloadError = e && (e.stack || String(e));
    try { console.error('Chyba v preload.js:', e); } catch {}
  }
})();
