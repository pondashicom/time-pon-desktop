const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');
const fs = require('fs');

let controlWindow = null;
let overlayWindow = null;

const STATE_PATH = () => path.join(app.getPath('userData'), 'state.json');

const state = {
    timer: {
        mode: 'down',                // 'down' | 'up'
        startSeconds: 5 * 60,        // 設定値（開始値）
        currentSecondsPrecise: 5 * 60, // 内部保持（小数OK）
        currentSeconds: 5 * 60,      // 表示用（整数）
        running: false,
        paused: false,
        lastTickMs: null
    },
    overlay: {
        displayId: null,             // electron display.id
        width: 800,
        height: 220,
        x: null,
        y: null,
        fontFamily: 'Segoe UI',
        fontSizePx: 120,
        color: '#FFFFFF',
        kanpeText: ''
    }
};

function clampInt(n, min, max) {
    const x = Number.isFinite(n) ? n : parseInt(n, 10);
    if (!Number.isFinite(x)) return min;
    return Math.max(min, Math.min(max, Math.floor(x)));
}

function pad2(n) {
    const x = Math.floor(Math.abs(n));
    return (x < 10 ? '0' : '') + String(x);
}

function secondsToHMS(sec) {
    const s = Math.max(0, Math.floor(sec));
    const hh = Math.floor(s / 3600);
    const mm = Math.floor((s % 3600) / 60);
    const ss = s % 60;
    return `${pad2(hh)}:${pad2(mm)}:${pad2(ss)}`;
}

function loadState() {
    try {
        const p = STATE_PATH();
        if (!fs.existsSync(p)) return;

        const json = JSON.parse(fs.readFileSync(p, 'utf8'));
        if (json && typeof json === 'object') {
            if (json.timer) Object.assign(state.timer, json.timer);
            if (json.overlay) Object.assign(state.overlay, json.overlay);
        }
    } catch (e) {
        // 読めなくても動くことを優先
    }
}

function saveState() {
    try {
        const p = STATE_PATH();
        fs.writeFileSync(p, JSON.stringify(state, null, 4), 'utf8');
    } catch (e) {
        // 書けなくても動くことを優先
    }
}

function sendToWindows(channel, payload) {
    if (controlWindow && !controlWindow.isDestroyed()) {
        controlWindow.webContents.send(channel, payload);
    }
    if (overlayWindow && !overlayWindow.isDestroyed()) {
        overlayWindow.webContents.send(channel, payload);
    }
}

function buildTimerPayload() {
    return {
        mode: state.timer.mode,
        startSeconds: state.timer.startSeconds,
        currentSeconds: state.timer.currentSeconds,
        running: state.timer.running,
        paused: state.timer.paused,
        timeText: secondsToHMS(state.timer.currentSeconds)
    };
}

function ensureOverlayBounds() {
    const displays = screen.getAllDisplays();

    let target = null;
    if (state.overlay.displayId != null) {
        target = displays.find(d => d.id === state.overlay.displayId) || null;
    }
    if (!target) {
        // 2画面想定：外部モニタがあれば最初の「primary以外」を優先、無ければprimary
        const primary = screen.getPrimaryDisplay();
        target = displays.find(d => d.id !== primary.id) || primary;
        state.overlay.displayId = target.id;
    }

    const wa = target.workArea; // x,y,width,height
    const w = clampInt(state.overlay.width, 200, 4000);
    const h = clampInt(state.overlay.height, 80, 2000);

    let x = (state.overlay.x != null) ? clampInt(state.overlay.x, wa.x, wa.x + wa.width - 1) : null;
    let y = (state.overlay.y != null) ? clampInt(state.overlay.y, wa.y, wa.y + wa.height - 1) : null;

    // 未指定なら、上部中央に配置
    if (x == null) x = Math.floor(wa.x + (wa.width - w) / 2);
    if (y == null) y = Math.floor(wa.y + 40);

    // 画面からはみ出しを抑制
    x = Math.max(wa.x, Math.min(x, wa.x + wa.width - w));
    y = Math.max(wa.y, Math.min(y, wa.y + wa.height - h));

    return { x, y, width: w, height: h };
}

function createOverlayWindow() {
    overlayWindow = new BrowserWindow({
        width: state.overlay.width,
        height: state.overlay.height,
        transparent: true,
        frame: false,
        resizable: false,
        movable: false,
        focusable: false,
        skipTaskbar: true,
        alwaysOnTop: true,
        hasShadow: false,
        backgroundColor: '#00000000',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false
        }
    });

    overlayWindow.setMenuBarVisibility(false);
    overlayWindow.setAlwaysOnTop(true, 'screen-saver');
    overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    overlayWindow.setIgnoreMouseEvents(true, { forward: true });

    overlayWindow.loadFile(path.join(__dirname, 'overlay.html'));

    overlayWindow.on('closed', () => {
        overlayWindow = null;
    });
}

function createControlWindow() {
    controlWindow = new BrowserWindow({
        width: 520,
        height: 760,
        resizable: true,
        show: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false
        }
    });

    controlWindow.setMenuBarVisibility(false);
    controlWindow.loadFile(path.join(__dirname, 'control.html'));

    controlWindow.on('closed', () => {
        controlWindow = null;
        // 操作ウインドウが閉じたらアプリも終了
        if (process.platform !== 'darwin') {
            app.quit();
        }
    });
}

function applyOverlaySettingsAndBroadcast() {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
        const b = ensureOverlayBounds();
        overlayWindow.setBounds(b, false);
    }

    const payload = {
        overlay: { ...state.overlay },
        timer: buildTimerPayload(),
        displays: screen.getAllDisplays().map(d => ({
            id: d.id,
            name: d.label || d.id,
            bounds: d.bounds,
            workArea: d.workArea,
            isPrimary: d.id === screen.getPrimaryDisplay().id
        }))
    };
    sendToWindows('state:sync', payload);
    saveState();
}

function timerResetToStart() {
    state.timer.currentSecondsPrecise = state.timer.startSeconds;
    state.timer.currentSeconds = state.timer.startSeconds;
    state.timer.running = false;
    state.timer.paused = false;
    state.timer.lastTickMs = null;
}

function timerStart() {
    if (state.timer.running && !state.timer.paused) return;
    state.timer.running = true;
    state.timer.paused = false;
    state.timer.lastTickMs = Date.now();
}

function timerPause() {
    if (!state.timer.running) return;
    state.timer.paused = true;
    state.timer.lastTickMs = null;
}

function timerStop() {
    state.timer.running = false;
    state.timer.paused = false;
    state.timer.lastTickMs = null;
}

function timerTick() {
    if (!state.timer.running) return;
    if (state.timer.paused) return;

    const now = Date.now();
    if (state.timer.lastTickMs == null) {
        state.timer.lastTickMs = now;
        return;
    }

    const dt = (now - state.timer.lastTickMs) / 1000.0;
    if (dt <= 0) return;

    state.timer.lastTickMs = now;

    if (state.timer.mode === 'up') {
        state.timer.currentSecondsPrecise += dt;
        // 表示は「経過」なので floor
        state.timer.currentSeconds = Math.max(0, Math.floor(state.timer.currentSecondsPrecise));
    } else {
        state.timer.currentSecondsPrecise -= dt;

        if (state.timer.currentSecondsPrecise <= 0) {
            state.timer.currentSecondsPrecise = 0;
            state.timer.currentSeconds = 0;
            timerStop();
        } else {
            // カウントダウンは「残り」なので ceil（1秒経つまで表示が変わらない）
            state.timer.currentSeconds = Math.max(0, Math.ceil(state.timer.currentSecondsPrecise));
        }
    }

    sendToWindows('timer:tick', buildTimerPayload());
}

function registerIpc() {
    ipcMain.handle('displays:get', () => {
        return screen.getAllDisplays().map(d => ({
            id: d.id,
            name: d.label || d.id,
            bounds: d.bounds,
            workArea: d.workArea,
            isPrimary: d.id === screen.getPrimaryDisplay().id
        }));
    });

    ipcMain.handle('state:get', () => {
        return {
            overlay: { ...state.overlay },
            timer: buildTimerPayload()
        };
    });

    ipcMain.on('timer:set', (evt, payload) => {
        if (!payload || typeof payload !== 'object') return;

        const mode = (payload.mode === 'up') ? 'up' : 'down';
        const startSeconds = clampInt(payload.startSeconds, 0, 24 * 3600 - 1);

        state.timer.mode = mode;
        state.timer.startSeconds = startSeconds;

        // 実行中でなければ表示も合わせてリセット
        if (!state.timer.running) {
            state.timer.currentSecondsPrecise = startSeconds;
            state.timer.currentSeconds = startSeconds;
        }

        sendToWindows('timer:tick', buildTimerPayload());
        saveState();
    });

    ipcMain.on('timer:control', (evt, payload) => {
        const action = payload && payload.action ? String(payload.action) : '';
        switch (action) {
            case 'start':
                // down で 0 の場合は startSeconds に戻してから開始
                if (state.timer.mode === 'down' && state.timer.currentSeconds === 0 && state.timer.startSeconds > 0) {
                    state.timer.currentSeconds = state.timer.startSeconds;
                }
                timerStart();
                break;
            case 'pause':
                timerPause();
                break;
            case 'stop':
                timerStop();
                break;
            case 'reset':
                timerResetToStart();
                break;
            default:
                break;
        }

        sendToWindows('timer:tick', buildTimerPayload());
        saveState();
    });

    ipcMain.on('overlay:update', (evt, payload) => {
        if (!payload || typeof payload !== 'object') return;

        if (payload.displayId != null) state.overlay.displayId = payload.displayId;

        if (payload.width != null) state.overlay.width = clampInt(payload.width, 200, 4000);
        if (payload.height != null) state.overlay.height = clampInt(payload.height, 80, 2000);

        // x,y は null で「自動配置」に戻す
        if ('x' in payload) state.overlay.x = (payload.x == null || payload.x === '') ? null : clampInt(payload.x, -100000, 100000);
        if ('y' in payload) state.overlay.y = (payload.y == null || payload.y === '') ? null : clampInt(payload.y, -100000, 100000);

        if (payload.fontFamily != null) state.overlay.fontFamily = String(payload.fontFamily).slice(0, 128);
        if (payload.fontSizePx != null) state.overlay.fontSizePx = clampInt(payload.fontSizePx, 10, 400);
        if (payload.color != null) state.overlay.color = String(payload.color).slice(0, 64);

        // kanpeText は別経路でも更新可能
        if (payload.kanpeText != null) state.overlay.kanpeText = String(payload.kanpeText);

        applyOverlaySettingsAndBroadcast();
    });

    ipcMain.on('kanpe:set', (evt, payload) => {
        state.overlay.kanpeText = payload && payload.text != null ? String(payload.text) : '';
        sendToWindows('kanpe:update', { text: state.overlay.kanpeText });
        saveState();
    });
}

app.whenReady().then(() => {
    loadState();

    createOverlayWindow();
    createControlWindow();
    registerIpc();

    // 初期同期
    applyOverlaySettingsAndBroadcast();
    sendToWindows('timer:tick', buildTimerPayload());
    sendToWindows('kanpe:update', { text: state.overlay.kanpeText });

    // タイマー更新
    setInterval(timerTick, 200);
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
