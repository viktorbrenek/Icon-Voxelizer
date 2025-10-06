const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;

function createWindow() {
  const preloadPath = path.join(__dirname, 'preload.js');
  console.log('[MAIN] preload path:', preloadPath, 'exists:', fs.existsSync(preloadPath));

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,              // 👈 DŮLEŽITÉ: mimo sandbox, ať má preload Node API (require, fs)
    },
  });

  mainWindow.loadFile('index.html');
  // mainWindow.webContents.openDevTools();
}


// Handler pro výběr složky - TVOJE PŮVODNÍ, FUNKČNÍ VERZE
ipcMain.handle('dialog:openDirectory', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
  });
  if (canceled || !filePaths || filePaths.length === 0) {
    return null;
  }
  const folderPath = filePaths[0];
  const files = fs.readdirSync(folderPath).filter(file => file.toLowerCase().endsWith('.svg'));
  return { folderPath, files };
});

// Handler pro uložení zpracovaných SVG souborů
ipcMain.handle('files:save', async (event, { outputFolder, filesToSave }) => {
  if (!fs.existsSync(outputFolder)) {
    fs.mkdirSync(outputFolder, { recursive: true });
  }
  let savedCount = 0;
  for (const file of filesToSave) {
    const outputPath = path.join(outputFolder, file.name);
    try {
      fs.writeFileSync(outputPath, file.content);
      savedCount++;
    } catch (error) {
      console.error(`Chyba při ukládání souboru: ${file.name}`, error);
    }
  }
  return savedCount;
});

// NOVĚ PŘIDANÝ Handler pro uložení presetu
ipcMain.handle('dialog:savePreset', async (event, settings) => {
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
        title: 'Uložit preset nastavení',
        defaultPath: 'voxel-preset.json',
        filters: [{ name: 'JSON Files', extensions: ['json'] }]
    });

    if (canceled || !filePath) return { success: false };

    try {
        fs.writeFileSync(filePath, JSON.stringify(settings, null, 2));
        return { success: true, path: filePath };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// NOVĚ PŘIDANÝ Handler pro načtení presetu
ipcMain.handle('dialog:openPreset', async (event) => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
        title: 'Načíst preset nastavení',
        filters: [{ name: 'JSON Files', extensions: ['json'] }],
        properties: ['openFile']
    });

    if (canceled || !filePaths || filePaths.length === 0) return null;

    try {
        const content = fs.readFileSync(filePaths[0], 'utf-8');
        return JSON.parse(content);
    } catch (error) {
        return { error: error.message };
    }
});

app.whenReady().then(createWindow);

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

