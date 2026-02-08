// -----------------------
//     main.js
//     ver 1.0.1
// -----------------------


// -----------------------
//    初期設定
// -----------------------
const { app, BrowserWindow, ipcMain, screen, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

let controlWindow = null;
let overlayWindow = null;
let overlayMoveSyncTimer = null;

// -----------------------
//   共通関数
// -----------------------

// 数値を整数として範囲内に丸める
function clampInt(n, min, max) {
    const x = Number.isFinite(n) ? n : parseInt(n, 10);
    if (!Number.isFinite(x)) return min;
    return Math.max(min, Math.min(max, Math.floor(x)));
}

// 2桁ゼロ埋め文字列を作る
function pad2(n) {
    const x = Math.floor(Math.abs(n));
    return (x < 10 ? '0' : '') + String(x);
}

// 秒数を HH:MM:SS に変換する
function secondsToHMS(sec) {
    const s = Math.max(0, Math.floor(sec));
    const hh = Math.floor(s / 3600);
    const mm = Math.floor((s % 3600) / 60);
    const ss = s % 60;
    return `${pad2(hh)}:${pad2(mm)}:${pad2(ss)}`;
}

// -----------------------
//   状態管理
// -----------------------

// 状態管理用パス生成
const STATE_PATH = () => path.join(app.getPath('userData'), 'state.json');

// 状態を保持するための初期データ
const state = {
    timer: {
        mode: 'down',                  // 'down' | 'up'
        startSeconds: 5 * 60,          // 設定値（開始値）
        currentSecondsPrecise: 5 * 60, // 内部保持（小数OK）
        currentSeconds: 5 * 60,        // 表示用（整数）
        running: false,
        paused: false,
        lastTickMs: null
    },
    overlay: {
        displayId: null,               // electron display.id
        width: 800,
        height: 220,
        x: null,
        y: null,
        moveMode: false,
        fontFamily: 'Segoe UI',
        fontSizePx: 120,
        color: '#FFFFFF',
        kanpeText: ''
    }
};

// state.jsonから状態を読み込む
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

// state.jsonへ状態を保存
function saveState() {
    try {
        const p = STATE_PATH();
        fs.writeFileSync(p, JSON.stringify(state, null, 4), 'utf8');
    } catch (e) {
        // 書けなくても動くことを優先
    }
}

// -----------------------
//   ウインドウ・表示
// -----------------------

// control/overlay両ウインドウへIPC送信する
function sendToWindows(channel, payload) {
    if (controlWindow && !controlWindow.isDestroyed()) {
        controlWindow.webContents.send(channel, payload);
    }
    if (overlayWindow && !overlayWindow.isDestroyed()) {
        overlayWindow.webContents.send(channel, payload);
    }
}

// フォントサイズ(px)とカンペ文字量からOverlayウインドウの推奨サイズを算出する
//   Overlay 自動サイズ/配置
const OVERLAY_MARGIN_X = 24;
const OVERLAY_MARGIN_Y = 24;

// フォントサイズ(px)とカンペ文字量からOverlayウインドウの推奨サイズを算出する
function calcOverlayAutoSize(fontSizePx, kanpeText) {
    const fs = clampInt(fontSizePx, 10, 400);
    const text = (kanpeText != null) ? String(kanpeText) : '';

    // 時計（00:00:00）を基準に横幅を見積もる（Segoe UI想定の概算）
    const TIMER_EM_WIDTH = 3.9;

    // 余白（概算）
    const PAD_X = 48;
    const GAP = 8;
    const PAD_Y = 24;

    const kanpeSize = Math.max(12, Math.floor(fs * 0.42));
    const kanpeLineH = kanpeSize * 1.2;

    // 1文字あたりの幅(em)をざっくり見積もる（CJK=1.0 / ASCII=0.55 / space=0.30）
    const estimateEm = (s) => {
        let em = 0;
        for (const ch of String(s)) {
            if (ch === ' ' || ch === '\t') {
                em += 0.30;
            } else {
                const code = ch.codePointAt(0);
                if (code != null && code <= 0x007f) {
                    // ASCII
                    em += 0.55;
                } else {
                    // CJKなど幅広
                    em += 1.00;
                }
            }
        }
        return em;
    };

    // タイマーの必要幅(px)
    const timerWidthPx = fs * TIMER_EM_WIDTH;

    // カンペの必要幅(px)（最長行ベース）
    let kanpeMaxLinePx = 0;
    let kanpeVisualLines = 0;

    if (text !== '') {
        const rawLines = text.split(/\r?\n/);

        // まず最長行幅を推定
        for (const line of rawLines) {
            const linePx = estimateEm(line) * kanpeSize;
            kanpeMaxLinePx = Math.max(kanpeMaxLinePx, linePx);
        }

        // 幅を決めたあとに折り返し行数を推定する
        // ※ width は後段で確定するので、ここでは一旦ダミー（後段で再計算）
    }

    // 幅は「タイマー vs カンペ最長行」の大きい方を採用（上限は安全のためclamp）
    let width = clampInt(Math.round(Math.max(timerWidthPx, kanpeMaxLinePx) + PAD_X), 200, 4000);

    // 折り返し行数（幅確定後）
    if (text !== '') {
        const innerW = Math.max(1, width - PAD_X);
        const rawLines = text.split(/\r?\n/);

        for (const line of rawLines) {
            const linePx = estimateEm(line) * kanpeSize;
            const wraps = Math.max(1, Math.ceil(linePx / innerW));
            kanpeVisualLines += wraps;
        }
    }

    const height = clampInt(
        Math.round(fs + GAP + ((kanpeVisualLines > 0) ? (kanpeLineH * kanpeVisualLines) : 0) + PAD_Y),
        80,
        2000
    );

    return { width, height };
}

// オーバレイ表示位置/サイズを画面内に収める
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

    // 未指定なら、右上（マージン付き）に配置
    if (x == null) x = Math.floor(wa.x + wa.width - w - OVERLAY_MARGIN_X);
    if (y == null) y = Math.floor(wa.y + OVERLAY_MARGIN_Y);

    // 画面からはみ出しを抑制
    x = Math.max(wa.x, Math.min(x, wa.x + wa.width - w));
    y = Math.max(wa.y, Math.min(y, wa.y + wa.height - h));

    return { x, y, width: w, height: h };
}

// オーバレイの「ドラッグ移動モード」を反映する
function applyOverlayMoveMode() {
    if (!overlayWindow || overlayWindow.isDestroyed()) return;

    const enabled = !!state.overlay.moveMode;

    overlayWindow.setIgnoreMouseEvents(!enabled, { forward: true });
    overlayWindow.setMovable(enabled);

    if (typeof overlayWindow.setFocusable === 'function') {
        overlayWindow.setFocusable(enabled);
    }
}

// アプリメニュー（操作ウインドウ用）
function setupAppMenu() {
    const template = [
        ...(process.platform === 'darwin' ? [{
            label: app.name,
            submenu: [
                { role: 'about' },
                { type: 'separator' },
                { role: 'services' },
                { type: 'separator' },
                { role: 'hide' },
                { role: 'hideOthers' },
                { role: 'unhide' },
                { type: 'separator' },
                { role: 'quit' }
            ]
        }] : []),

        {
            label: 'File',
            submenu: [
                ...(process.platform === 'darwin'
                    ? [{ role: 'close' }]
                    : [{ role: 'quit' }]
                )
            ]
        },
        {
            label: 'View',
            submenu: [
                { role: 'reload' },
                { role: 'forceReload' },
                { type: 'separator' },
                { role: 'toggleDevTools' }
            ]
        },
        {
            label: 'Window',
            submenu: [
                { role: 'minimize' },
                ...(process.platform === 'darwin' ? [{ role: 'zoom' }] : []),
                { role: 'close' }
            ]
        }
    ];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
}

// 透明オーバレイ用ウインドウ生成
function createOverlayWindow() {
    overlayWindow = new BrowserWindow({
        width: state.overlay.width,
        height: state.overlay.height,
        transparent: true,
        frame: false,
        resizable: false,
        movable: !!state.overlay.moveMode,
        focusable: !!state.overlay.moveMode,
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
    applyOverlayMoveMode();

    overlayWindow.on('move', () => {
        if (!state.overlay.moveMode) return;
        if (overlayMoveSyncTimer) clearTimeout(overlayMoveSyncTimer);
        overlayMoveSyncTimer = setTimeout(() => {
            if (!overlayWindow || overlayWindow.isDestroyed()) return;
            const b = overlayWindow.getBounds();
            state.overlay.x = b.x;
            state.overlay.y = b.y;
            sendToWindows('state:sync', { overlay: { ...state.overlay } });
            saveState();
        }, 80);
    });

    overlayWindow.loadFile(path.join(__dirname, 'overlay.html'));

    overlayWindow.on('closed', () => {
        overlayWindow = null;
    });
}

// 操作用コントロールウインドウ生成
function createControlWindow() {
    controlWindow = new BrowserWindow({
        width: 1280,
        height: 720,
        minWidth: 1120,
        minHeight: 630,
        resizable: true,
        show: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false
        }
    });

    // 常に 16:9 を維持
    controlWindow.setAspectRatio(16 / 9);

    // 操作ウインドウはメニューを表示
    controlWindow.setMenuBarVisibility(true);
    controlWindow.loadFile(path.join(__dirname, 'control.html'));

    // 開発中だけ DevTools を自動で開きたい場合：TIMEPON_DEBUG=1
    if (process.env.TIMEPON_DEBUG === '1') {
        controlWindow.webContents.once('did-finish-load', () => {
            if (!controlWindow || controlWindow.isDestroyed()) return;
            controlWindow.webContents.openDevTools({ mode: 'detach' });
        });
    }

    controlWindow.on('closed', () => {
        controlWindow = null;
        // 操作ウインドウが閉じたらアプリも終了
        if (process.platform !== 'darwin') {
            app.quit();
        }
    });
}

// オーバレイ設定を反映し、全ウインドウへ同期して保存
function applyOverlaySettingsAndBroadcast() {
    // フォントサイズ＋カンペ文字量からウインドウサイズを自動算出（W×H手動指定はしない方針）
    const auto = calcOverlayAutoSize(state.overlay.fontSizePx, state.overlay.kanpeText);
    state.overlay.width = auto.width;
    state.overlay.height = auto.height;

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

// -----------------------
//   タイマー制御
// -----------------------

// タイマー状態を送信用payloadにまとめる
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

// タイマーを開始値リセット
function timerResetToStart() {
    state.timer.currentSecondsPrecise = state.timer.startSeconds;
    state.timer.currentSeconds = state.timer.startSeconds;
    state.timer.running = false;
    state.timer.paused = false;
    state.timer.lastTickMs = null;
}

// タイマーを開始（再開）
function timerStart() {
    if (state.timer.running && !state.timer.paused) return;
    state.timer.running = true;
    state.timer.paused = false;
    state.timer.lastTickMs = Date.now();
}

// タイマーを一時停止
function timerPause() {
    if (!state.timer.running) return;
    state.timer.paused = true;
    state.timer.lastTickMs = null;
}

// タイマーを停止
function timerStop() {
    state.timer.running = false;
    state.timer.paused = false;
    state.timer.lastTickMs = null;
}

// タイマーを進めて表示を更新
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

// -----------------------
//   IPC
// -----------------------

// IPCハンドラ/イベント受信を登録
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

    ipcMain.on('overlay:move-mode', (evt, payload) => {
        state.overlay.moveMode = !!(payload && payload.enabled);

        applyOverlayMoveMode();
        sendToWindows('state:sync', { overlay: { ...state.overlay } });
        saveState();
    });

    ipcMain.on('kanpe:set', (evt, payload) => {
        state.overlay.kanpeText = payload && payload.text != null ? String(payload.text) : '';

        // カンペ文字量込みでOverlayサイズを再計算・反映
        applyOverlaySettingsAndBroadcast();

        // 既存の購読先互換のため、kanpe:update も送る
        sendToWindows('kanpe:update', { text: state.overlay.kanpeText });
    });
}

// -----------------------
//   アプリ開始・終了処理
// -----------------------

// 初期化完了後の起動処理
app.whenReady().then(() => {
    loadState();

    setupAppMenu();

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

// 全ウインドウが閉じたとき（mac以外は終了）
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
