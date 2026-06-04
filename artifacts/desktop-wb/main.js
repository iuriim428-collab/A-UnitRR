'use strict';

const { app, BrowserWindow, shell, Menu } = require('electron');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');

const SERVER_PORT = 7891;
let mainWindow = null;

const serverAssetsDir = app.isPackaged
  ? path.join(process.resourcesPath, 'server-assets')
  : path.join(__dirname, 'server-assets');

const publicDir = path.join(serverAssetsDir, 'public');
const serverEntry = path.join(serverAssetsDir, 'index.mjs');

// Папка с данными пользователя (сохраняется между запусками)
const userDataDir = app.getPath('userData');
const dbDir = path.join(userDataDir, 'adunit-db');
const secretFile = path.join(userDataDir, 'session-secret.txt');

// Генерируем постоянный секрет для сессий (или читаем существующий)
function getOrCreateSecret() {
  try {
    if (fs.existsSync(secretFile)) {
      return fs.readFileSync(secretFile, 'utf8').trim();
    }
    const secret = crypto.randomBytes(32).toString('hex');
    fs.mkdirSync(userDataDir, { recursive: true });
    fs.writeFileSync(secretFile, secret, 'utf8');
    return secret;
  } catch {
    return crypto.randomBytes(32).toString('hex');
  }
}

process.env.PORT = String(SERVER_PORT);
process.env.SERVE_FRONTEND_DIR = publicDir;
process.env.NODE_ENV = 'production';
process.env.DATABASE_URL = `pglite://${dbDir}`;
process.env.SESSION_SECRET = getOrCreateSecret();
process.env.SKIP_AUTH = 'true';

async function startServer() {
  await import(`file://${serverEntry}`);
}

async function waitForServer(maxAttempts = 60) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch(`http://localhost:${SERVER_PORT}/api/healthz`);
      if (res.ok) return;
    } catch {
    }
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error('Сервер не запустился за отведённое время');
}

function buildMenu() {
  const template = [
    {
      label: 'Приложение',
      submenu: [
        { label: 'О программе', role: 'about' },
        { type: 'separator' },
        {
          label: 'Выход',
          accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Alt+F4',
          click: () => app.quit(),
        },
      ],
    },
    {
      label: 'Вид',
      submenu: [
        { label: 'Обновить', role: 'reload', accelerator: 'F5' },
        { label: 'Принудительное обновление', role: 'forceReload', accelerator: 'Ctrl+Shift+R' },
        { type: 'separator' },
        { label: 'Уменьшить', role: 'zoomOut', accelerator: 'Ctrl+-' },
        { label: 'Нормальный размер', role: 'resetZoom', accelerator: 'Ctrl+0' },
        { label: 'Увеличить', role: 'zoomIn', accelerator: 'Ctrl+=' },
        { type: 'separator' },
        { label: 'На весь экран', role: 'togglefullscreen', accelerator: 'F11' },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    title: 'AD Unit R',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
    autoHideMenuBar: false,
  });

  buildMenu();

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  await mainWindow.loadURL(`http://localhost:${SERVER_PORT}`);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  try {
    await startServer();
    await waitForServer();
    await createWindow();
  } catch (err) {
    console.error('Ошибка запуска:', err);
    const { dialog } = require('electron');
    dialog.showErrorBox('Ошибка запуска', String(err));
    app.quit();
  }
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', async () => {
  if (mainWindow === null) {
    await createWindow();
  }
});
