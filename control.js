// -----------------------
//     control.js
//     ver 1.0.1
// -----------------------


// -----------------------
//   DOM参照
// -----------------------
const elTime = document.getElementById('timeText');

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
const btnReset = document.getElementById('btnReset');
const btnApplyTimer = document.getElementById('btnApplyTimer');
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

// タイマー状態に応じてボタンの有効/無効を更新する
function updateButtons() {
    if (!currentTimer) return;

    const running = !!currentTimer.running;
    const paused = !!currentTimer.paused;

    btnStart.disabled = running && !paused;
    btnPause.disabled = !running || paused;
    btnReset.disabled = running && !paused;
}

// タイマー状態に応じて「点滅表示」を更新する
function updateBlinking(timer) {
    if (!btnStart || !btnPause) return;

    btnStart.classList.remove('blink-running');
    btnPause.classList.remove('blink-paused');

    if (!timer || !timer.running) return;

    if (timer.paused) {
        btnPause.classList.add('blink-paused');
    } else {
        btnStart.classList.add('blink-running');
    }
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

// タイマー状態に応じた表示（時刻）を反映する
function applyTimerToUI(timer) {
    if (!timer) return;

    currentTimer = timer;
    elTime.textContent = timer.timeText || '00:00:00';

    updateButtons();
    updateBlinking(timer);
}

// オーバレイ設定をUIへ反映する
function applyOverlayToUI(overlay) {
    if (!overlay) return;

    currentOverlay = overlay;

    // 表示先ディスプレイ
    if (elDisplaySelect) {
        const id = (currentOverlay.displayId == null) ? '' : String(currentOverlay.displayId);
        if (id !== '') {
            elDisplaySelect.value = id;
        }
    }

    // フォント/サイズ/色
    if (elFontFamily) {
        const normalizeFontFamily = (v) => {
            const s = (v == null) ? '' : String(v);

            // 旧値（例: "Segoe UI"）を新しい select の value（font stack）へ寄せる
            if (s === 'Segoe UI') return 'Segoe UI, system-ui, -apple-system, sans-serif';
            if (s === 'Inter') return 'Inter, system-ui, -apple-system, sans-serif';
            if (s === 'Roboto') return 'Roboto, system-ui, -apple-system, sans-serif';
            if (s === 'Noto Sans JP') return '"Noto Sans JP", system-ui, -apple-system, sans-serif';
            if (s === 'Montserrat') return 'Montserrat, system-ui, -apple-system, sans-serif';
            if (s === 'Oswald') return 'Oswald, system-ui, -apple-system, sans-serif';

            return s;
        };

        const normalized = normalizeFontFamily(currentOverlay.fontFamily);

        // まず state の値を UI に反映
        if (normalized) {
            elFontFamily.value = normalized;
        }

        // value が選択肢に存在しない場合、先頭候補へフォールバック（＝空表示を防ぐ）
        if (!elFontFamily.value) {
            if (elFontFamily.options && elFontFamily.options.length > 0) {
                elFontFamily.value = elFontFamily.options[0].value;
            }
        }
    }

    if (elFontSize) {
        elFontSize.value = String(currentOverlay.fontSizePx || 120);
    }
    if (elColor) {
        elColor.value = currentOverlay.color || '#ffffff';
    }

    // 移動モード
    if (btnMoveMode) {
        const on = !!currentOverlay.moveMode;
        btnMoveMode.textContent = on ? '移動モード: ON' : '移動モード: OFF';
    }

    // カンペ入力欄
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

    // -----------------------
    // Overlay設定（即時反映）
    // -----------------------

    // 表示先ディスプレイ：変更したら即時反映（位置は自動に戻す）
    if (elDisplaySelect) {
        elDisplaySelect.addEventListener('change', () => {
            const id = parseInt(elDisplaySelect.value, 10);
            if (!Number.isFinite(id)) return;

            window.timepon.updateOverlay({
                displayId: id,
                x: null,
                y: null
            });
        });
    }

    // フォント：変更したら即時反映
    if (elFontFamily) {
        elFontFamily.addEventListener('change', () => {
            window.timepon.updateOverlay({
                fontFamily: elFontFamily.value || 'Segoe UI'
            });
        });
    }

    // 色：カラーピッカーが閉じたタイミング（change）で即時反映
    if (elColor) {
        elColor.addEventListener('change', () => {
            window.timepon.updateOverlay({
                color: elColor.value || '#ffffff'
            });
        });
    }

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
        const cur = clampFontSize(elFontSize ? elFontSize.value : 120);
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

        if (elFontSize) {
            elFontSize.value = String(next);
        }

        window.timepon.updateOverlay({
            fontSizePx: next
        });
    }

    if (btnFontDec) {
        btnFontDec.addEventListener('click', () => stepFontSize(-1));
    }
    if (btnFontInc) {
        btnFontInc.addEventListener('click', () => stepFontSize(1));
    }

    // 移動モード
    if (btnMoveMode) {
        btnMoveMode.addEventListener('click', () => {
            const next = !(currentOverlay && currentOverlay.moveMode);
            window.timepon.setOverlayMoveMode(next);
        });
    }

    // カンペ
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
