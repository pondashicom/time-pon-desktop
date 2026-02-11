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

// 3桁ゼロ埋め文字列を作る（最小3桁。1000以上はそのまま）
function pad3(n) {
    const x = Math.floor(Math.abs(n));
    if (x >= 1000) return String(x);
    if (x >= 100) return String(x);
    if (x >= 10) return '0' + String(x);
    return '00' + String(x);
}

// 秒数を HH:MM:SS に変換する
function secondsToHMS(sec) {
    const neg = (sec < 0);
    const s = Math.abs(Math.floor(sec));
    const hh = Math.floor(s / 3600);
    const mm = Math.floor((s % 3600) / 60);
    const ss = s % 60;
    const body = `${pad2(hh)}:${pad2(mm)}:${pad2(ss)}`;
    return neg ? `-${body}` : body;
}

// 秒数を MMM:SS（分が59を超えてもOK）に変換する
function secondsToMSS(sec) {
    const neg = (sec < 0);
    const s = Math.abs(Math.floor(sec));
    const mm = Math.floor(s / 60);
    const ss = s % 60;

    // 残りMMM分SS秒（分がM/MMのときは0プレフィックスなし）
    const sign = neg ? '-' : '';
    return `残り${sign}${mm}分${pad2(ss)}秒`;
}

function secondsToMSSHtml(sec) {
    const neg = (sec < 0);
    const s = Math.abs(Math.floor(sec));
    const mm = Math.floor(s / 60);
    const ss = s % 60;

    const sign = neg ? '-' : '';
    const mmStr = `${sign}${mm}`;
    const ssStr = pad2(ss);

    // 「残り/分/秒」を小さく見せるためspanを付ける
    return `<span class="t-label">残り</span><span class="t-num">${mmStr}</span><span class="t-label">分</span><span class="t-num">${ssStr}</span><span class="t-label">秒</span>`;
}

// タイマー表示文字列を作る
function buildTimerText() {
    if (state.timer.mode === 'down' && state.timer.downDisplayMode === 'mss') {
        return secondsToMSS(state.timer.currentSeconds);
    }
    return secondsToHMS(state.timer.currentSeconds);
}

function buildTimerHtml() {
    if (state.timer.mode === 'down' && state.timer.downDisplayMode === 'mss') {
        return secondsToMSSHtml(state.timer.currentSeconds);
    }
    return null;
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
        downDisplayMode: 'hms',        // 'hms' | 'mss'（downのみ）
        warn1Enabled: true,            // 第一警告 有効
        warn2Enabled: true,            // 第二警告 有効
        warn1Min: 10,                  // 第一警告（分）
        warn2Min: 5,                   // 第二警告（分）
        warn1Color: '#FFE900',         // 第一警告色
        warn2Color: '#F55700',         // 第二警告色
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
        showTimer: true,
        showClock: false,
        fontFamily: 'Segoe UI, system-ui, -apple-system, sans-serif',
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

        const DEFAULT_FF = 'Segoe UI, system-ui, -apple-system, sans-serif';

        const normalizeFontFamily = (v) => {
            const s = (v == null) ? '' : String(v);

            if (s === '') return DEFAULT_FF;

            // 旧値（短い名前）→ 新値（font stack）
            if (s === 'Segoe UI') return DEFAULT_FF;
            if (s === 'Inter') return 'Inter, system-ui, -apple-system, sans-serif';
            if (s === 'Roboto') return 'Roboto, system-ui, -apple-system, sans-serif';
            if (s === 'Noto Sans JP') return '"Noto Sans JP", system-ui, -apple-system, sans-serif';
            if (s === 'Montserrat') return 'Montserrat, system-ui, -apple-system, sans-serif';
            if (s === 'Oswald') return 'Oswald, system-ui, -apple-system, sans-serif';

            return s;
        };

        state.overlay.fontFamily = normalizeFontFamily(state.overlay.fontFamily);
        state.overlay.moveMode = false;

        // 追加設定の正規化
        if (!('showTimer' in state.overlay)) {
            state.overlay.showTimer = true;
        } else {
            state.overlay.showTimer = !!state.overlay.showTimer;
        }
        state.overlay.showClock = !!state.overlay.showClock;
        state.timer.downDisplayMode = (state.timer.downDisplayMode === 'mss') ? 'mss' : 'hms';
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
function calcOverlayAutoSize(fontSizePx, kanpeText, fontFamily, showClock, timerMode, timerDownDisplayMode) {
    const fs = clampInt(fontSizePx, 10, 400);
    const text = (kanpeText != null) ? String(kanpeText) : '';
    const ff = (fontFamily != null) ? String(fontFamily) : '';

    // タイマー表示の横幅を見積もる（フォントで幅が変わるので安全側に補正）
    //   hms: 00:00:00
    //   mss: 残り000分00秒（こちらは長いので幅が必要）
    const isMSS = (String(timerMode || '') === 'down' && String(timerDownDisplayMode || '') === 'mss');

    let TIMER_EM_WIDTH = isMSS ? 6.75 : 4.10;

    // フォント差の補正倍率（hmsの基準 4.10 に対する比率を流用）
    let TIMER_EM_MUL = 1.0;

    if (/montserrat/i.test(ff)) TIMER_EM_MUL = 4.35 / 4.10;
    else if (/noto\s*sans\s*jp/i.test(ff)) TIMER_EM_MUL = 4.25 / 4.10;
    else if (/roboto/i.test(ff)) TIMER_EM_MUL = 4.15 / 4.10;
    else if (/inter/i.test(ff)) TIMER_EM_MUL = 4.15 / 4.10;
    else if (/oswald/i.test(ff)) TIMER_EM_MUL = 4.10 / 4.10;
    else if (/segoe\s*ui/i.test(ff)) TIMER_EM_MUL = 4.10 / 4.10;

    TIMER_EM_WIDTH = TIMER_EM_WIDTH * TIMER_EM_MUL;

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

    // 横幅は「タイマー幅の1.5倍」を上限にする（それ以上は折り返して縦に伸ばす）
    const baseWidth = timerWidthPx + PAD_X;
    const maxWidth = baseWidth * 1.5;

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

    // 幅は「タイマー幅」を下限、「タイマー幅×1.5」を上限としてクランプ
    let width = clampInt(
        Math.round(Math.max(baseWidth, Math.min(maxWidth, kanpeMaxLinePx + PAD_X))),
        200,
        4000
    );

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

    const baseHeight = fs + GAP + ((kanpeVisualLines > 0) ? (kanpeLineH * kanpeVisualLines) : 0) + PAD_Y;

    // 追加表示（現在時刻 / プログレスバー）ぶんの高さを確保
    let extraH = 0;

    if (!!showClock) {
        const clockSize = Math.max(10, Math.floor(fs * 0.27));
        const clockLineH = clockSize * 1.2;
        extraH += Math.round(clockLineH + GAP);
    }

    if (String(timerMode || '') === 'down') {
        // progress-wrap: height=6px ＋ 余白
        extraH += 6 + GAP;
    }

    const height = clampInt(
        Math.round(baseHeight + extraH),
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
    // UIを縦並びにしたので、初期サイズも縦型へ
    controlWindow = new BrowserWindow({
        width: 560,
        height: 980,
        minWidth: 460,
        minHeight: 780,
        resizable: true,
        show: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false
        }
    });

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
    // フォントサイズ＋カンペ文字量＋フォントからウインドウサイズを自動算出（W×H手動指定はしない方針）
    const auto = calcOverlayAutoSize(
        state.overlay.fontSizePx,
        state.overlay.kanpeText,
        state.overlay.fontFamily,
        state.overlay.showClock,
        state.timer.mode,
        state.timer.downDisplayMode
    );
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
        downDisplayMode: state.timer.downDisplayMode,
        warn1Enabled: state.timer.warn1Enabled,
        warn2Enabled: state.timer.warn2Enabled,
        warn1Min: state.timer.warn1Min,
        warn2Min: state.timer.warn2Min,
        warn1Color: state.timer.warn1Color,
        warn2Color: state.timer.warn2Color,
        startSeconds: state.timer.startSeconds,
        currentSeconds: state.timer.currentSeconds,
        running: state.timer.running,
        paused: state.timer.paused,
        timeText: buildTimerText(),
        timeHtml: buildTimerHtml()
    };
}

// タイマーを開始値リセット
function timerResetToStart() {
    const wasRunning = !!state.timer.running;
    const wasPaused = !!state.timer.paused;

    state.timer.currentSecondsPrecise = state.timer.startSeconds;
    state.timer.currentSeconds = state.timer.startSeconds;

    // リセット後の状態は「リセットボタンを押した瞬間の状態」を維持する
    // - 実行中: リセット後すぐ再開（running=true, paused=false）
    // - 一時停止: リセット後も一時停止（running=true, paused=true）
    // - 停止: リセット後も停止（running=false, paused=false）
    if (!wasRunning) {
        state.timer.running = false;
        state.timer.paused = false;
        state.timer.lastTickMs = null;
        return;
    }

    state.timer.running = true;
    state.timer.paused = wasPaused;
    state.timer.lastTickMs = wasPaused ? null : Date.now();
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

        // 0を過ぎても止めずにマイナスで進める（警告表示は renderer 側）
        // カウントダウンは「残り」なので ceil（1秒経つまで表示が変わらない）
        state.timer.currentSeconds = Math.ceil(state.timer.currentSecondsPrecise);
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
        const downDisplayMode = (payload.downDisplayMode === 'mss') ? 'mss' : 'hms';

        const isHex6 = (v) => (typeof v === 'string') && /^#[0-9a-fA-F]{6}$/.test(v.trim());

        const warn1Min = clampInt(payload.warn1Min, 0, 999);
        const warn2Min = clampInt(payload.warn2Min, 0, 999);
        const warn1Color = isHex6(payload.warn1Color) ? payload.warn1Color.trim() : state.timer.warn1Color;
        const warn2Color = isHex6(payload.warn2Color) ? payload.warn2Color.trim() : state.timer.warn2Color;

        let warn1Enabled = (typeof payload.warn1Enabled === 'boolean') ? payload.warn1Enabled : state.timer.warn1Enabled;
        let warn2Enabled = (typeof payload.warn2Enabled === 'boolean') ? payload.warn2Enabled : state.timer.warn2Enabled;

        // UPのときは警告を常に無効
        if (mode === 'up') {
            warn1Enabled = false;
            warn2Enabled = false;
        }

        state.timer.mode = mode;
        state.timer.startSeconds = startSeconds;
        state.timer.downDisplayMode = downDisplayMode;

        state.timer.warn1Enabled = warn1Enabled;
        state.timer.warn2Enabled = warn2Enabled;
        state.timer.warn1Min = warn1Min;
        state.timer.warn2Min = warn2Min;
        state.timer.warn1Color = warn1Color;
        state.timer.warn2Color = warn2Color;

        // 実行中でなければ表示も合わせてリセット
        if (!state.timer.running) {
            state.timer.currentSecondsPrecise = startSeconds;
            state.timer.currentSeconds = startSeconds;
        }

        // モード切替（up/down）で必要な高さが変わるため、Overlay側も反映
        applyOverlaySettingsAndBroadcast();

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

        if ('showTimer' in payload) state.overlay.showTimer = !!payload.showTimer;
        if ('showClock' in payload) state.overlay.showClock = !!payload.showClock;

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
