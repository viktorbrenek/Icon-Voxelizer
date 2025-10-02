// main.js

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;

function createWindow() {
  const preloadPath = path.join(__dirname, 'preload.js');
  console.log('[MAIN] preload path:', preloadPath, 'exists:', fs.existsSync(preloadPath));

  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // přidej explicitně, ať to není v sandboxu
    },
  });

  mainWindow.loadFile('index.html');
  // mainWindow.webContents.openDevTools();
}


// ⬇⬇⬇ VYMĚŇ TENTO BLOK ZA SVŮJ HANDLER ⬇⬇⬇
ipcMain.handle('dialog:openDirectory', async (event) => {
  try {
    // 1) Zkusíme získat okno více způsoby (někdy fromWebContents vrací null)
    const winFromEvent = BrowserWindow.fromWebContents(event?.sender || null) || null;
    const focusedWin = BrowserWindow.getFocusedWindow() || null;
    const parent = winFromEvent || focusedWin || mainWindow || undefined;

    console.log('[openDirectory] invoked. parent:',
      parent ? 'OK' : 'undefined/null');

    // 2) Otevřeme dialog (s pár bezpečnými properties)
    const { canceled, filePaths } = await dialog.showOpenDialog(parent, {
      title: 'Vyber složku se SVG',
      properties: ['openDirectory', 'dontAddToRecent'],
    });

    console.log('[openDirectory] result:', { canceled, filePaths });

    if (canceled || !filePaths || filePaths.length === 0) {
      return null;
    }

    const folderPath = filePaths[0];
    let files = [];
    try {
      // jen *.svg
      files = fs.readdirSync(folderPath).filter(f => f.toLowerCase().endsWith('.svg'));
    } catch (e) {
      console.error('[openDirectory] readdirSync error:', e);
      // když čtení selže, vrať aspoň cestu ke složce – renderer si může poradit
      return { folderPath, files: [] };
    }

    return { folderPath, files };
  } catch (err) {
    console.error('[openDirectory] fatal error:', err);
    // vraťme explicitní chybu do rendereru, ať to „nezmizí“
    return { error: String(err && err.message || err) };
  }
});
// ⬆⬆⬆ KONEC PATCH BLOKU ⬆⬆⬆

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
      console.error(`Failed to save file: ${file.name}`, error);
    }
  }
  return savedCount;
});

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
