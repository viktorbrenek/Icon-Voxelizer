const { contextBridge, ipcRenderer } = require('electron');
const fs = require('fs');

console.log('[PRELOAD] start');

try {
  contextBridge.exposeInMainWorld('electronAPI', {
    selectFolder: () => ipcRenderer.invoke('dialog:openDirectory'),
    saveFiles: (data) => ipcRenderer.invoke('files:save', data),
    readFile: (filePath) => fs.readFileSync(filePath, 'utf-8'),
  });
  console.log('[PRELOAD] electronAPI exposed');
} catch (e) {
  console.error('[PRELOAD] failed to expose API:', e);
  // nouzový signál do rendereru, když se preload rozbije
  // (contextBridge už spadnul? pak aspoň dáme něco na window)
  try { window.__preloadError = String(e && e.message || e); } catch (_) {}
}
