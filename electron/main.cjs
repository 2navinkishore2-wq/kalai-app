/* KALAI DIGITAL — Electron main process (Windows EXE)
 *
 * The built web app (dist/) is served over a tiny local HTTP server
 * (http://localhost:PORT). This gives the app a stable secure origin
 * (localhost) so Firebase Auth popup sign-in, Firestore offline
 * persistence (IndexedDB) and downloads behave exactly like the web build.
 *
 * The ORIGIN HOST must be `localhost` (not the 127.0.0.1 IP literal):
 * Firebase Web Auth validates the app origin against the project's
 * "Authorized domains" list before opening the Google popup, matching
 * hostnames exactly (IP entries require an exact hostname match).
 * `localhost` is a default authorized domain in every Firebase project,
 * whereas `127.0.0.1` is only allowed if explicitly added in the console
 * — without it the EXE fails Google Sign-In with auth/unauthorized-domain.
 */
const { app, BrowserWindow, shell, Menu, ipcMain } = require('electron');
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { launchAfterExit } = require('./updateLauncher.cjs');

const DIST_DIR = path.join(__dirname, '..', 'dist');

// FIXED local-server port (was random on every launch). The app origin is
// `http://localhost:PORT`, and Chromium partitions localStorage/IndexedDB by
// ORIGIN INCLUDING THE PORT. With a random port every EXE start produced a
// fresh origin, so the persisted Firebase Auth session (and the Firestore
// offline cache) never survived a restart — the user had to do Google
// Sign-In again every time. A stable port keeps the origin identical across
// launches: Firebase Auth restores the session automatically via
// onAuthStateChanged and the user lands straight back in their account.
//
// If the fixed port is already taken (e.g. a second instance), the app falls
// back to a random free port and keeps working — only persistence across
// restarts is unavailable in that rare case.
const APP_PORT = 38993;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.webmanifest': 'application/manifest+json'
};

function startServer(port) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      try {
        const url = new URL(req.url, 'http://127.0.0.1');
        let pathname = decodeURIComponent(url.pathname);
        if (pathname === '/' || pathname === '') pathname = '/index.html';
        const filePath = path.normalize(path.join(DIST_DIR, pathname));
        if (!filePath.startsWith(path.normalize(DIST_DIR))) {
          res.writeHead(403);
          res.end('Forbidden');
          return;
        }
        fs.readFile(filePath, (err, data) => {
          if (err) {
            res.writeHead(404);
            res.end('Not found');
            return;
          }
          res.writeHead(200, {
            'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
            'Cache-Control': 'no-cache'
          });
          res.end(data);
        });
      } catch (e) {
        res.writeHead(500);
        res.end('Server error');
      }
    });
    server.on('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

let win = null;
let mainServer = null;
// True from the moment the app commits to installing an update until it exits.
// New windows, new update requests and background work are refused from then on.
let isQuitting = false;
let stagedInstaller = null;

/* ---------------------------------------------------------------- updates
 * The renderer only supplies the published asset URL, a file name and the
 * SHA-256 from the release feed. The main process is the only part that
 * touches the network and the file system.
 *
 * ORDER MATTERS (this is the bug that blocked 1.5.0 → 1.6.0):
 * the NSIS installer used to be spawned as a CHILD of this process and this
 * process then called app.quit() 1.5 s later. electron-builder's installer
 * deliberately skips its "close the running app" logic when its own parent
 * process is the app executable (it assumes the app has already exited), so
 * it went straight to unpacking and hit locked files — "KALAI DIGITAL cannot
 * be closed". On top of that the local HTTP server was never closed, which
 * kept the Electron main process alive even after every window was gone.
 *
 * The fixed sequence: download to %TEMP% → verify SHA-256 (and PE header) →
 * hand the installer to a detached helper that waits for THIS process id to
 * disappear → close windows, stop the server, quit → the helper starts the
 * installer only after the app is really gone.
 */
function downloadFile(url, destination, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 6) return reject(new Error('The download redirected too many times.'));
    const request = https.get(url, { headers: { 'User-Agent': 'KALAI-DIGITAL-Updater' } }, (response) => {
      const status = response.statusCode || 0;
      if (status >= 300 && status < 400 && response.headers.location) {
        response.resume();
        const next = new URL(response.headers.location, url).toString();
        return resolve(downloadFile(next, destination, redirects + 1));
      }
      if (status !== 200) {
        response.resume();
        return reject(new Error(`The installer download failed (HTTP ${status}).`));
      }
      const partial = `${destination}.part`;
      const file = fs.createWriteStream(partial);
      response.pipe(file);
      file.on('finish', () => {
        file.close((closeError) => {
          if (closeError) return reject(closeError);
          try {
            fs.renameSync(partial, destination);
            resolve(destination);
          } catch (renameError) {
            reject(renameError);
          }
        });
      });
      file.on('error', (writeError) => {
        fs.promises.unlink(partial).catch(() => {});
        reject(writeError);
      });
    });
    request.on('error', reject);
    request.setTimeout(180000, () => request.destroy(new Error('The installer download timed out.')));
  });
}

function sha256Of(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

ipcMain.handle('kalai:open-external', async (_event, url) => {
  if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) return false;
  await shell.openExternal(url);
  return true;
});

/** Downloads the installer and proves it is the published, complete file. */
async function stageInstaller(payload) {
  const url = payload && typeof payload.url === 'string' ? payload.url : '';
  if (!/^https:\/\//i.test(url)) throw new Error('The update URL must use HTTPS.');

  const rawName = String((payload && payload.fileName) || '').trim() || 'KALAI-DIGITAL-Setup.exe';
  const fileName = path.basename(rawName).replace(/[^\w.\- ]+/g, '_');
  if (!/\.exe$/i.test(fileName)) throw new Error('The update is not a Windows installer.');

  // A checksum is mandatory: the app must never run an unverified executable.
  const expected = String((payload && payload.sha256) || '').trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(expected)) {
    throw new Error(
      'This update has no published checksum, so it was not installed. Please download the installer from the release page.'
    );
  }

  const destination = path.join(app.getPath('temp'), fileName);
  let actual = null;
  if (fs.existsSync(destination)) {
    try {
      actual = sha256Of(destination);
    } catch {
      actual = null;
    }
  }
  if (actual !== expected) {
    await downloadFile(url, destination);
    actual = sha256Of(destination);
  }
  if (actual !== expected) {
    await fs.promises.unlink(destination).catch(() => {});
    throw new Error(
      'The downloaded installer did not match its published SHA-256 checksum, so it was not installed. Please try again.'
    );
  }

  const stat = await fs.promises.stat(destination);
  if (stat.size < 1024 * 1024) {
    await fs.promises.unlink(destination).catch(() => {});
    throw new Error('The downloaded installer is incomplete. Please try again.');
  }
  const head = Buffer.alloc(2);
  const handle = await fs.promises.open(destination, 'r');
  try {
    await handle.read(head, 0, 2, 0);
  } finally {
    await handle.close();
  }
  if (head.toString('latin1') !== 'MZ') {
    await fs.promises.unlink(destination).catch(() => {});
    throw new Error('The downloaded file is not a Windows installer. Please try again.');
  }

  stagedInstaller = {
    path: destination,
    sha256: actual,
    size: stat.size,
    version: String((payload && payload.version) || '')
  };
  return stagedInstaller;
}

/**
 * Detached hand-off: installs only after this process has exited. The helper
 * also receives the installed .exe path and the expected version so it can
 * prove the update really landed (the installer's own exit code is unreliable).
 */
function launchInstallerAfterExit(installerPath, expectedVersion) {
  return launchAfterExit(installerPath, {
    pid: process.pid,
    tempDir: app.getPath('temp'),
    expectedVersion,
    appExe: process.execPath
  });
}

function stopLocalServer() {
  if (!mainServer) return;
  try {
    mainServer.close();
  } catch {
    /* already closed */
  }
  try {
    if (typeof mainServer.closeAllConnections === 'function') mainServer.closeAllConnections();
  } catch {
    /* no active connections */
  }
  mainServer = null;
}

/**
 * Closes the app for good: no windows, no local server, no timers holding the
 * event loop. A hard exit is only a last resort if something refuses to release
 * the process, so the installer's helper is never left waiting.
 */
function beginUpdateShutdown() {
  if (isQuitting && !mainServer) return;
  isQuitting = true;

  setTimeout(() => {
    for (const window of BrowserWindow.getAllWindows()) {
      try {
        window.removeAllListeners('close');
        window.destroy();
      } catch {
        /* already destroyed */
      }
    }
    win = null;
    stopLocalServer();
    app.quit();
    setTimeout(() => app.exit(0), 4000);
  }, 600);
}

ipcMain.handle('kalai:update-install', async (_event, payload) => {
  if (isQuitting) throw new Error('KALAI DIGITAL is already closing for the update.');

  // 1. Download and verify first: nothing is closed until the package is proven.
  const staged = await stageInstaller(payload);

  // 2. Hand over to the detached helper while the app is still alive; it waits
  //    for this exact process id, so installation starts only after we exit.
  if (!launchInstallerAfterExit(staged.path, staged.version)) {
    throw new Error(
      'The installer could not be started. Nothing was changed — please download the installer from the release page.'
    );
  }

  // 3. Close windows, flush the local server and exit.
  beginUpdateShutdown();
  return { ok: true, path: staged.path, sha256: staged.sha256, size: staged.size };
});

async function createWindow() {
  // Try the fixed port first so the session origin stays stable between runs.
  let server;
  try {
    server = await startServer(APP_PORT);
  } catch (e) {
    if (e && e.code !== 'EADDRINUSE') throw e;
    // Port busy (another instance is running): use any free port. This
    // instance keeps working; persistence belongs to the first instance.
    server = await startServer(0);
  }
  mainServer = server;
  const port = server.address().port;
  // Bind stays on loopback (127.0.0.1) for security; the app ORIGIN uses
  // `localhost` so Firebase Auth's authorized-domain check passes.
  const url = `http://localhost:${port}/`;

      if (isQuitting) return;

  win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    title: 'KALAI DIGITAL',
    autoHideMenuBar: true,
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    backgroundColor: '#FFF9F0',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  win.setMenuBarVisibility(false);
  Menu.setApplicationMenu(null);

  // Allow Firebase/Google auth popups (they postMessage the result back);
  // everything else opens in the system browser.
  win.webContents.setWindowOpenHandler(({ url: target }) => {
    const isAuth =
      target.includes('firebaseapp.com') ||
      target.includes('accounts.google.com') ||
      target.includes('googleapis.com') ||
      target.includes('google.com');
    if (isAuth) {
      return { action: 'allow' };
    }
    shell.openExternal(target);
    return { action: 'deny' };
  });

  win.webContents.on('will-navigate', (event, target) => {
    // Keep the app pinned to our local origin.
    if (!target.startsWith(url)) {
      event.preventDefault();
      shell.openExternal(target);
    }
  });

  win.loadURL(url);
}

// One instance only: a second launch focuses the open window instead of adding
// another process that would also have to be closed before an update.
const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!win || win.isDestroyed()) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  });

  app.whenReady().then(() => {
    createWindow();
    app.on('activate', () => {
      if (isQuitting) return;
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  // Release the loopback HTTP server on every quit path. An open listener kept
  // the process (and its locked files) alive after the windows had gone.
  app.on('before-quit', stopLocalServer);
  app.on('will-quit', stopLocalServer);
}
