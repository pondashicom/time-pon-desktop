// -----------------------
//     control.js
//     ver 1.0.1
// -----------------------


// -----------------------
//   DOM参照
// -----------------------
const elTime = document.getElementById('timeText');
const elState = document.getElementById('stateText');

const elMode = document.getElementById('mode');
const elStartMin = document.getElementById('startMin');

const elDisplaySelect = document.getElementById('displaySelect');
const btnMoveMode = document.getElementById('btnMoveMode');

const elFontFamily = document.getElementById('fontFamily');
const elFontSize = document.getElementById('fontSize'); 
const btnFontDec = document.getElementById('btnFontDec');
const btnFontInc = document.getElementById('btnFontInc');
const elColor = document.getElementById('color');

const elKanpe = document.getElementById('kanpeText');

const btnStart = document.getElementById('btnStart');
const btnPause = document.getElementById('btnPause');
const btnStop = document.getElementById('btnStop');
const btnReset = document.getElementById('btnReset');
const btnApplyTimer = document.getElementById('btnApplyTimer');
const btnApplyOverlay = document.getElementById('btnApplyOverlay');
const btnSendKanpe = document.getElementById('btnSendKanpe');
const btnClearKanpe = document.getElementById('btnClearKanpe');


// -----------------------
//   状態（Renderer側保持）
// -----------------------
let currentTimer = null;
let currentOverlay = null;
let displays = [];


// -----------------------
//   共通関数
// -----------------------

// 状態テキストを表示する
function setStateText(t) {
    elState.textContent = t;
}

// タイマー状態に応じてボタンの有効/無効を更新する
function updateButtons() {
    if (!currentTimer) return;

    const running = !!currentTimer.running;
    const paused = !!currentTimer.paused;

    btnStart.disabled = running && !paused;
    btnPause.disabled = !running || paused;
    btnStop.disabled = !running;
    btnReset.disabled = running && !paused;
}

// 数値入力を「整数 or null」に変換する（空欄はnull）
function getIntOrNull(v) {
    if (v == null) return null;
    const s = String(v).trim();
    if (s === '') return null;
    const n = parseInt(s, 10);
    return Number.isFinite(n) ? n : null;
}

// フォントサイズ(px)からOverlayウインドウの推奨サイズを算出する
function calcOverlayWindowSizePx(fontSizePx) {
    const fs = Math.max(10, Math.min(400, parseInt(fontSizePx, 10) || 120));

    const TIMER_EM_WIDTH = 3.9;
    const PAD_X = 48;

    const KANPE_LINES = 2;
    const GAP = 8;
    const PAD_Y = 24;

    const kanpeSize = Math.max(12, Math.floor(fs * 0.42));
    const width = Math.max(200, Math.min(4000, Math.round(fs * TIMER_EM_WIDTH + PAD_X)));
    const height = Math.max(80, Math.min(2000, Math.round(fs + GAP + (kanpeSize * 1.2 * KANPE_LINES) + PAD_Y)));

    return { width, height };
}

// タイマー状態に応じた表示（時刻/状態）を反映する
function applyTimerToUI(timer) {
    if (!timer) return;

    currentTimer = timer;
    elTime.textContent = timer.timeText || '00:00:00';

    if (!timer.running) {
        setStateText('停止');
    } else if (timer.paused) {
        setStateText('一時停止');
    } else {
        setStateText('実行中');
    }

    updateButtons();
}

// オーバレイ設定をUIへ反映する
function applyOverlayToUI(overlay) {
    if (!overlay) return;

    currentOverlay = overlay;

    elFontFamily.value = currentOverlay.fontFamily || '';
    elFontSize.value = currentOverlay.fontSizePx || 120; // hiddenに保持
    elColor.value = currentOverlay.color || '#ffffff';

    if (btnMoveMode) {
        const on = !!currentOverlay.moveMode;
        btnMoveMode.textContent = on ? '移動モード: ON' : '移動モード: OFF';
    }

    elKanpe.value = (typeof currentOverlay.kanpeText === 'string') ? currentOverlay.kanpeText : '';
}

// state:sync など「まとまった状態」からUIを更新する
function refreshUIFromState(payload) {
    if (!payload) return;

    if (payload.timer) {
        applyTimerToUI(payload.timer);
    }
    if (payload.overlay) {
        applyOverlayToUI(payload.overlay);
    }
}

// ディスプレイ一覧をプルダウンへ反映する
function populateDisplays(list) {
    displays = Array.isArray(list) ? list : [];
    elDisplaySelect.innerHTML = '';

    for (const d of displays) {
        const opt = document.createElement('option');
        opt.value = String(d.id);
        const primaryMark = d.isPrimary ? ' (primary)' : '';
        opt.textContent = `${d.id}${primaryMark}  [${d.workArea.width}x${d.workArea.height}]`;
        elDisplaySelect.appendChild(opt);
    }

    if (currentOverlay && currentOverlay.displayId != null) {
        elDisplaySelect.value = String(currentOverlay.displayId);
    }
}


// -----------------------
//   UIイベント
// -----------------------

// UIイベント（クリック等）を登録する
function registerUiEvents() {
    btnStart.addEventListener('click', () => {
        window.timepon.timerControl('start');
    });

    btnPause.addEventListener('click', () => {
        window.timepon.timerControl('pause');
    });

    btnStop.addEventListener('click', () => {
        window.timepon.timerControl('stop');
    });

    btnReset.addEventListener('click', () => {
        window.timepon.timerControl('reset');
    });

    btnApplyTimer.addEventListener('click', () => {
        const mode = elMode.value === 'up' ? 'up' : 'down';
        const startMin = Math.max(0, parseInt(elStartMin.value || '0', 10));
        const startSeconds = startMin * 60;

        window.timepon.setTimer({
            mode,
            startSeconds
        });
    });

    // サイズ（±）は即時反映
    const FONT_SIZE_STEPS = [
        20, 30, 40, 50, 60, 70, 80, 90,
        100, 110, 120, 130, 140, 150, 160,
        180, 200, 220, 240, 260, 280, 300,
        320, 360, 400
    ];

    function clampFontSize(n) {
        const x = parseInt(n, 10);
        if (!Number.isFinite(x)) return 120;
        return Math.max(10, Math.min(400, x));
    }

    function stepFontSize(dir) {
        const cur = clampFontSize(elFontSize.value || 120);
        let idx = FONT_SIZE_STEPS.findIndex(v => v >= cur);
        if (idx < 0) idx = FONT_SIZE_STEPS.length - 1;

        // cur が段の中間の場合は「近い段」に寄せる
        if (FONT_SIZE_STEPS[idx] !== cur && idx > 0) {
            const prev = FONT_SIZE_STEPS[idx - 1];
            const next = FONT_SIZE_STEPS[idx];
            idx = (cur - prev <= next - cur) ? (idx - 1) : idx;
        }

        let nextIdx = idx + (dir > 0 ? 1 : -1);
        nextIdx = Math.max(0, Math.min(FONT_SIZE_STEPS.length - 1, nextIdx));

        const next = FONT_SIZE_STEPS[nextIdx];
        elFontSize.value = String(next);

        window.timepon.updateOverlay({ fontSizePx: next });
    }

    if (btnFontDec) {
        btnFontDec.addEventListener('click', () => stepFontSize(-1));
    }
    if (btnFontInc) {
        btnFontInc.addEventListener('click', () => stepFontSize(1));
    }

    // 「Overlayへ反映」はサイズ以外（表示先/フォント/色）の反映用
    btnApplyOverlay.addEventListener('click', () => {
        const payload = {
            displayId: parseInt(elDisplaySelect.value, 10),
            fontFamily: elFontFamily.value || 'Segoe UI',
            color: elColor.value || '#ffffff'
        };
        window.timepon.updateOverlay(payload);
    });

    if (btnMoveMode) {
        btnMoveMode.addEventListener('click', () => {
            const next = !(currentOverlay && currentOverlay.moveMode);
            window.timepon.setOverlayMoveMode(next);
        });
    }

    btnSendKanpe.addEventListener('click', () => {
        window.timepon.setKanpe(elKanpe.value || '');
    });

    btnClearKanpe.addEventListener('click', () => {
        elKanpe.value = '';
        window.timepon.setKanpe('');
    });
}

// -----------------------
//   IPC受信（Renderer API）
// -----------------------

// IPC（timepon API）受信を登録する
function registerIpcHandlers() {
    window.timepon.onStateSync((payload) => {
        if (payload && payload.displays) {
            populateDisplays(payload.displays);
        }
        refreshUIFromState(payload);
    });

    window.timepon.onTimerTick((t) => {
        if (!t) return;
        applyTimerToUI(t);
    });

    window.timepon.onKanpeUpdate((p) => {
        if (!p) return;
        elKanpe.value = (typeof p.text === 'string') ? p.text : '';
    });
}


// -----------------------
//   初期化
// -----------------------

// 初期状態を取得し、UI初期値を整える
async function init() {
    const ds = await window.timepon.getDisplays();
    populateDisplays(ds);

    const s = await window.timepon.getState();
    refreshUIFromState(s);

    // UI初期値（状態が無い場合の保険）
    if (s && s.timer) {
        elMode.value = s.timer.mode === 'up' ? 'up' : 'down';
        elStartMin.value = Math.floor((s.timer.startSeconds || 0) / 60);
    }
    if (s && s.overlay && s.overlay.displayId != null) {
        elDisplaySelect.value = String(s.overlay.displayId);
    }

    updateButtons();
}

// 起動時にイベント登録と初期化を行う
function bootstrap() {
    registerUiEvents();
    registerIpcHandlers();
    init();
}

document.addEventListener('DOMContentLoaded', bootstrap);
