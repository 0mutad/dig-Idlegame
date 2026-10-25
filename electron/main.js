const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');

/* 画面右下に置くカード。中身の寸法は src/style.css の変数と揃えること。
 * ウィンドウ自体はカードより一回り大きく、余った部分はクリックが下のアプリに抜ける。 */
const MARGIN = 14;
const CARD_W = 480;
const STRIP_H = 190;
const PANEL_H = 320;
const WIN_W = CARD_W + MARGIN * 2;
const WIN_H = STRIP_H + PANEL_H + MARGIN * 2 + 8;

let win = null;

function place() {
  if (!win) return;
  const area = screen.getPrimaryDisplay().workArea;
  win.setBounds({
    x: area.x + area.width - WIN_W,
    y: area.y + area.height - WIN_H,
    width: WIN_W,
    height: WIN_H,
  });
}

function createWindow() {
  const area = screen.getPrimaryDisplay().workArea;

  win = new BrowserWindow({
    x: area.x + area.width - WIN_W,
    y: area.y + area.height - WIN_H,
    width: WIN_W,
    height: WIN_H,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    movable: true,   // HUD を掴んで動かせる（-webkit-app-region: drag）
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: false,
    title: 'Deskavation',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.setAlwaysOnTop(true, 'normal');
  win.setIgnoreMouseEvents(true, { forward: true });
  win.loadFile(path.join(__dirname, '..', 'index.html'));

  screen.on('display-metrics-changed', place);
  win.on('closed', () => { win = null; });
}

ipcMain.on('desk:ignore', (_e, ignore) => {
  if (win) win.setIgnoreMouseEvents(!!ignore, { forward: true });
});

ipcMain.on('desk:quit', () => app.quit());

app.whenReady().then(createWindow);

app.on('window-all-closed', () => app.quit());

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
