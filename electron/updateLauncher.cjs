/**
 * The Windows update hand-off, kept in its own module so it can be inspected
 * and tested outside Electron.
 *
 * WHY THIS EXISTS
 * The 1.5.0/1.6.0 updater spawned the NSIS installer as a CHILD of the app and
 * only then called app.quit(). electron-builder's installer skips its whole
 * "the app is still running, close it" routine when its parent process is the
 * app executable (it assumes electron-updater semantics: spawn and exit now).
 * The old app instead stayed alive (its loopback HTTP server was never closed),
 * so the unpacker could not replace files and showed
 * "KALAI DIGITAL cannot be closed. Please close it manually and click Retry".
 *
 * THE FIX
 * A detached Node helper (run by Electron itself through ELECTRON_RUN_AS_NODE,
 * so it needs no cmd.exe, PowerShell or extra binary) waits for the app's PID to
 * disappear, then starts the verified installer. Installation therefore begins
 * with the app well and truly gone, and NSIS never has to kill anything on a
 * healthy install.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const PRODUCT_EXE = 'KALAI DIGITAL.exe';
const REG_PATH = 'HKCU\\Software\\52cd6c50-63b8-59cf-91d1-f658038915bb';
const HELPER_NAME = 'kalai-update-helper.js';
const HELPER_OK = 'KALAI_UPDATE_HELPER_OK';
const MAX_WAIT_MS = 120000;

/**
 * Written to %TEMP% when an update starts.
 * Arguments: <pid> <installerPath> <expectedVersion> <appExePath>.
 * `--probe` is used before the app closes to prove the helper can run at all.
 *
 * WHY IT CHECKS THE VERSION
 * electron-builder's one-click installer can report a non-zero exit code even
 * after it has replaced every file (it returns 2 on some post-install steps),
 * so the exit code alone cannot be trusted. After the install the helper reads
 * the installed .exe's ProductVersion: when it matches the version from the
 * verified release feed the update counts as successful and the app reopens;
 * only when it does not match does the visible installer open for a retry.
 */
const HELPER_SOURCE = `'use strict';
const fs = require('fs');
const path = require('path');
const { spawn, execFileSync } = require('child_process');

if (process.argv[2] === '--probe') {
  process.stdout.write('${HELPER_OK}');
  process.exit(0);
}

const pid = Number(process.argv[2]);
const installer = process.argv[3];
const expectedVersion = String(process.argv[4] || '').trim();
const appExe = String(process.argv[5] || '').trim();
if (!pid || !installer) process.exit(1);

const os = require('os');
const logPath = path.join(os.tmpdir(), 'kalai-update.log');
const note = (message) => {
  try {
    fs.appendFileSync(logPath, new Date().toISOString() + ' ' + message + String.fromCharCode(10));
  } catch (error) {
    /* diagnostics only */
  }
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const alive = () => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error && error.code === 'EPERM';
  }
};

function runInstaller(args, options) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (code) => {
      if (settled) return;
      settled = true;
      resolve(code);
    };
    let child;
    try {
      child = spawn(installer, args, options);
    } catch (error) {
      note('installer spawn threw: ' + error.message);
      finish(-1);
      return;
    }
    child.on('error', (error) => {
      note('installer error: ' + error.message);
      finish(-1);
    });
    child.on('exit', (code) => finish(typeof code === 'number' ? code : 0));
  });
}

function appRunning() {
  try {
    const out = execFileSync('tasklist', ['/FI', 'IMAGENAME eq ${PRODUCT_EXE}', '/NH'], {
      encoding: 'utf8',
      windowsHide: true
    });
    return out.toLowerCase().indexOf('${PRODUCT_EXE.toLowerCase()}') !== -1;
  } catch (error) {
    return false;
  }
}

function startApp() {
  const dirs = [];
  try {
    const out = execFileSync('reg', ['query', ${JSON.stringify(REG_PATH)}, '/v', 'InstallLocation'], {
      encoding: 'utf8',
      windowsHide: true
    });
    const match = /InstallLocation\\s+REG_SZ\\s+(.+)/i.exec(out);
    if (match && match[1]) dirs.push(match[1].trim());
  } catch (error) {
    /* fall back to the default per-user location */
  }
  if (process.env.LOCALAPPDATA) dirs.push(path.join(process.env.LOCALAPPDATA, 'Programs', 'KALAI DIGITAL'));
  for (const dir of dirs) {
    const exe = path.join(dir, '${PRODUCT_EXE}');
    if (!fs.existsSync(exe)) continue;
    const child = spawn(exe, [], { detached: true, stdio: 'ignore', windowsHide: true });
    child.on('error', () => {});
    child.unref();
    return;
  }
}

/** ProductVersion of the installed app, e.g. "1.7.0.0". '' when unknown. */
function installedVersion() {
  if (!appExe || !fs.existsSync(appExe)) return '';
  try {
    const out = execFileSync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', "(Get-Item $env:KALAI_APP_EXE).VersionInfo.ProductVersion"],
      { encoding: 'utf8', env: { ...process.env, KALAI_APP_EXE: appExe }, windowsHide: true, timeout: 20000 }
    );
    return out.trim();
  } catch (error) {
    note('could not read the installed version: ' + error.message);
    return '';
  }
}

/** True only when the files on disk really are the version we installed. */
function installVerified() {
  if (!expectedVersion) return false;
  const found = installedVersion();
  note('installed version is "' + found + '", expected "' + expectedVersion + '"');
  return found.indexOf(expectedVersion) === 0;
}

(async () => {
  note('helper started for pid ' + pid + ' -> ' + installer + ' (expect ' + expectedVersion + ')');
  // 1. Wait for the app to exit on its own. The old build never used to.
  const deadline = Date.now() + ${MAX_WAIT_MS};
  while (alive() && Date.now() < deadline) await sleep(250);
  note(alive() ? 'app still running after the wait limit' : 'app exited');
  await sleep(900);

  // 2. Silent in-place install: /S no wizard, --updated keeps %APPDATA% and
  //    shortcuts, --force-run reopens the app.
  note('starting silent install');
  const code = await runInstaller(['/S', '--updated', '--force-run'], {
    stdio: 'ignore',
    windowsHide: true
  });
  note('silent install exited with code ' + code);

  // 3. The exit code is not proof: check the version that is actually on disk.
  let ok = installVerified();

  // 4. Only a real failure opens the visible installer for a retry.
  if (!ok) {
    note('silent install did not replace the files; opening the visible installer');
    await runInstaller(['--updated', '--force-run'], { stdio: 'ignore', windowsHide: true, detached: false });
    ok = installVerified();
  }

  // 5. Guarantee "new version opens" even if the installer did not relaunch it.
  await sleep(2500);
  if (appRunning()) {
    note('app is running after the update');
  } else if (ok) {
    note('app did not restart; starting it');
    if (appExe && fs.existsSync(appExe)) {
      const child = spawn(appExe, [], { detached: true, stdio: 'ignore', windowsHide: true });
      child.on('error', () => {});
      child.unref();
    } else {
      startApp();
    }
  }
  note(ok ? 'update succeeded' : 'update did NOT complete');
  process.exit(ok ? 0 : 3);
})();
`;

/** Writes the helper next to the installer in %TEMP%. */
function writeHelper(tempDir) {
  const file = path.join(tempDir || os.tmpdir(), HELPER_NAME);
  fs.writeFileSync(file, HELPER_SOURCE, 'utf8');
  return file;
}

/**
 * Runs the helper once with `--probe` before the app closes, so a broken
 * ELECTRON_RUN_AS_NODE setup falls back to the batch helper instead of leaving
 * the user with no installer at all.
 */
function helperWorks(helperPath, execPath) {
  const result = spawnSync(execPath, [helperPath, '--probe'], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    encoding: 'utf8',
    timeout: 15000,
    windowsHide: true
  });
  return !!(result && typeof result.stdout === 'string' && result.stdout.indexOf(HELPER_OK) !== -1);
}

/** Fallback used only if the Node helper cannot run. */
function buildCmdScript(pid, installerPath) {
  return [
    '@echo off',
    'setlocal',
    `set "KALAI_PID=${Number(pid)}"`,
    ':kalai_wait',
    'tasklist /FI "PID eq %KALAI_PID%" /NH 2>nul | find "%KALAI_PID%" >nul',
    'if not errorlevel 1 (',
    '  ping -n 2 127.0.0.1 >nul',
    '  goto kalai_wait',
    ')',
    'ping -n 2 127.0.0.1 >nul',
    `start "" /wait "${installerPath}" /S --updated --force-run`,
    'ping -n 2 127.0.0.1 >nul',
    `if not exist "%LOCALAPPDATA%\\Programs\\KALAI DIGITAL\\${PRODUCT_EXE}" start "" "${installerPath}" --updated`
  ].join('\r\n');
}

/**
 * Starts the detached helper. Returns false when no helper could be started, so
 * the caller keeps the app open and reports the problem instead of closing a
 * window with nothing left to install the update.
 */
function launchAfterExit(installerPath, options = {}) {
  const pid = options.pid || process.pid;
  const tempDir = options.tempDir || os.tmpdir();
  const execPath = options.execPath || process.execPath;
  const expectedVersion = String(options.expectedVersion || '');
  const appExe = String(options.appExe || '');

  try {
    const helperPath = writeHelper(tempDir);
    if (helperWorks(helperPath, execPath)) {
      const helper = spawn(execPath, [helperPath, String(pid), installerPath, expectedVersion, appExe], {
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
        detached: true,
        stdio: 'ignore',
        windowsHide: true
      });
      helper.on('error', () => {});
      helper.unref();
      return true;
    }
  } catch {
    /* fall through to the batch helper */
  }

  try {
    const batchPath = path.join(tempDir, 'kalai-update-launcher.cmd');
    fs.writeFileSync(batchPath, buildCmdScript(pid, installerPath), 'latin1');
    // Spawning a .cmd directly is refused on modern Node; run it through cmd.exe.
    const helper = spawn(process.env.ComSpec || 'cmd.exe', ['/c', batchPath], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true
    });
    helper.on('error', () => {});
    helper.unref();
    return true;
  } catch {
    return false;
  }
}

module.exports = { HELPER_SOURCE, HELPER_NAME, buildCmdScript, writeHelper, launchAfterExit };
