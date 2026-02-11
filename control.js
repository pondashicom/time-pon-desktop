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
const elDownDisplayMode = document.getElementById('downDisplayMode');

const elWarn1Enabled = document.getElementById('warn1Enabled');
const elWarn2Enabled = document.getElementById('warn2Enabled');
const elWarn1Min = document.getElementById('warn1Min');
const elWarn2Min = document.getElementById('warn2Min');
const elWarn1Color = document.getElementById('warn1Color');
const elWarn2Color = document.getElementById('warn2Color');

const elDisplaySelect = document.getElementById('displaySelect');

const elPlacementArea = document.getElementById('placementArea');
const elPlacementMarker = document.getElementById('placementMarker');

const elFontFamily = document.getElementById('fontFamily');
const elFontSize = document.getElementById('fontSize'); 
const btnFontDec = document.getElementById('btnFontDec');
const btnFontInc = document.getElementById('btnFontInc');
const elColor = document.getElementById('color');
const elShowClock = document.getElementById('showClock');

const elKanpe = document.getElementById('kanpeText');

const btnStart = document.getElementById('btnStart');
const btnPause = document.getElementById('btnPause');
const btnReset = document.getElementById('btnReset');
const btnApplyTimer = document.getElementById('btnApplyTimer');
const btnToggleTimer = document.getElementById('btnToggleTimer');

const btnSendKanpe = document.getElementById('btnSendKanpe');
const btnClearKanpe = document.getElementById('btnClearKanpe');
const btnKanpeBlink = document.getElementById('btnKanpeBlink');

// -----------------------
//   状態（Renderer側保持）
// -----------------------
let currentTimer = null;
let currentOverlay = null;
let displays = [];


// -----------------------
//   共通関数
// -----------------------

// コントローラー側の表示色もOverlayと同じにする（タイマー表示＋カンペ入力欄）
let baseControlTimerColor = '#ffffff';

// 数値を整数として範囲内に丸める
function clampInt(n, min, max) {
    const x = Number.isFinite(n) ? n : parseInt(n, 10);
    if (!Number.isFinite(x)) return min;
    return Math.max(min, Math.min(max, Math.floor(x)));
}

// #RRGGBB 形式の色か判定
function isHex6(v) {
    return (typeof v === 'string') && /^#[0-9a-fA-F]{6}$/.test(v.trim());
}

// タイマー状態から「警告時に適用する色」を算出する（通常時は baseControlTimerColor）
function computeTimerWarnColor(timer) {
    const base = baseControlTimerColor || '#ffffff';
    if (!timer || timer.mode !== 'down') return base;

    const curRaw = (Number.isFinite(timer.currentSeconds) ? timer.currentSeconds : 0);

    // 0以下は常に「時間切れ」警告色（warn1/2 のON/OFFに関係なく）
    if (curRaw <= 0) return '#FF3B30';

    const warn1Enabled = (typeof timer.warn1Enabled === 'boolean')
        ? timer.warn1Enabled
        : (elWarn1Enabled ? !!elWarn1Enabled.checked : true);

    const warn2Enabled = (typeof timer.warn2Enabled === 'boolean')
        ? timer.warn2Enabled
        : (elWarn2Enabled ? !!elWarn2Enabled.checked : true);

    if (!warn1Enabled && !warn2Enabled) return base;

    const cur = clampInt(curRaw, 0, 24 * 3600 - 1);

    const w1Min = clampInt(timer.warn1Min, 0, 999);
    const w2Min = clampInt(timer.warn2Min, 0, 999);

    const col1 = isHex6(timer.warn1Color) ? timer.warn1Color.trim()
        : (elWarn1Color && isHex6(elWarn1Color.value) ? elWarn1Color.value.trim() : '#FFE900');

    const col2 = isHex6(timer.warn2Color) ? timer.warn2Color.trim()
        : (elWarn2Color && isHex6(elWarn2Color.value) ? elWarn2Color.value.trim() : '#F55700');

    const w1 = w1Min * 60;
    const w2 = w2Min * 60;

    if (warn2Enabled && cur <= w2) return col2;
    if (warn1Enabled && cur <= w1) return col1;

    return base;
}

// タイマー表示（時刻）の色だけを警告に応じて上書きする
function applyTimerWarnColor(timer) {
    if (!elTime) return;

    const c = computeTimerWarnColor(timer);
    elTime.style.color = c;

    const isOverrun = !!timer
        && timer.mode === 'down'
        && Number.isFinite(timer.currentSeconds)
        && timer.currentSeconds <= 0;

    elTime.classList.toggle('overrun', isOverrun);
}

// state:sync のタイマー設定を UI に反映する（警告設定）
function applyWarningSettingsToUI(timer) {
    if (!timer) return;

    if (elWarn1Enabled && typeof timer.warn1Enabled === 'boolean') {
        elWarn1Enabled.checked = timer.warn1Enabled;
    }
    if (elWarn2Enabled && typeof timer.warn2Enabled === 'boolean') {
        elWarn2Enabled.checked = timer.warn2Enabled;
    }

    if (elWarn1Min && Number.isFinite(timer.warn1Min)) {
        elWarn1Min.value = String(timer.warn1Min);
    }
    if (elWarn2Min && Number.isFinite(timer.warn2Min)) {
        elWarn2Min.value = String(timer.warn2Min);
    }

    if (elWarn1Color && isHex6(timer.warn1Color)) {
        elWarn1Color.value = timer.warn1Color.trim();
    }
    if (elWarn2Color && isHex6(timer.warn2Color)) {
        elWarn2Color.value = timer.warn2Color.trim();
    }
}

// コントローラー側の表示色もOverlayと同じにする（タイマー表示＋カンペ入力欄）
function applyControlColor(color) {
    const c = (typeof color === 'string' && color.trim() !== '') ? color : '#ffffff';

    baseControlTimerColor = c;

    // タイマーは「警告色」で上書きする可能性があるため、まず base を当てる
    if (elTime) {
        elTime.style.color = c;
    }
    if (elKanpe) {
        elKanpe.style.color = c;
    }

    applyTimerWarnColor(currentTimer);
}

// タイマー状態に応じてボタンの有効/無効を更新する
function updateButtons() {
    if (!currentTimer) return;

    const running = !!currentTimer.running;
    const paused = !!currentTimer.paused;

    btnStart.disabled = running && !paused;
    btnPause.disabled = !running || paused;
    btnReset.disabled = false;
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


// 表示場所（仮想 16:9）でOverlay位置を調整する
let placementDrag = {
    active: false,
    offsetX: 0,
    offsetY: 0,
    raf: 0,
    pending: null
};

function getCurrentWorkArea() {
    const id = currentOverlay && currentOverlay.displayId != null ? currentOverlay.displayId : null;
    let d = null;

    if (id != null && Array.isArray(displays)) {
        d = displays.find(x => x && x.id === id) || null;
    }
    if (!d && Array.isArray(displays) && displays.length > 0) {
        d = displays[0];
    }

    if (d && d.workArea) return d.workArea;

    // fallback（例外時）
    return { x: 0, y: 0, width: 1920, height: 1080 };
}

function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
}

function scheduleOverlayPositionUpdate(x, y) {
    placementDrag.pending = { x, y };

    if (placementDrag.raf) return;

    placementDrag.raf = window.requestAnimationFrame(() => {
        placementDrag.raf = 0;
        const p = placementDrag.pending;
        placementDrag.pending = null;
        if (!p) return;

        window.timepon.updateOverlay({ x: p.x, y: p.y });
    });
}

function updatePlacementMarker() {
    if (!elPlacementArea || !elPlacementMarker) return;
    if (!currentOverlay) return;

    // 実表示サイズ（16:9 の内側）として扱う
    const areaRect = elPlacementArea.getBoundingClientRect();
    const innerW = Math.max(1, areaRect.width);
    const innerH = Math.max(1, Math.round(innerW * 9 / 16));

    const wa = getCurrentWorkArea();

    const overlayW = Math.max(1, parseInt(currentOverlay.width || 0, 10) || 1);
    const overlayH = Math.max(1, parseInt(currentOverlay.height || 0, 10) || 1);

    let x = currentOverlay.x;
    let y = currentOverlay.y;

    const mw = Math.max(12, Math.round(innerW * (overlayW / wa.width)));
    const mh = Math.max(10, Math.round(innerH * (overlayH / wa.height)));

    // 自動配置（null）の場合は「右上寄せ（見た目だけ）」で表示
    if (x == null || y == null) {
        const margin = 18;
        elPlacementMarker.style.width = `${clamp(mw, 12, innerW)}px`;
        elPlacementMarker.style.height = `${clamp(mh, 10, innerH)}px`;
        elPlacementMarker.style.left = `${Math.max(0, innerW - mw - margin)}px`;
        elPlacementMarker.style.top = `${margin}px`;
        return;
    }

    // 位置は workArea 基準の比率で 16:9 box に写す
    const relX = (x - wa.x) / wa.width;
    const relY = (y - wa.y) / wa.height;

    const left = Math.round(relX * innerW);
    const top = Math.round(relY * innerH);

    // 画面外はみ出し抑制（見た目）
    const cl = clamp(left, 0, Math.max(0, innerW - mw));
    const ct = clamp(top, 0, Math.max(0, innerH - mh));

    elPlacementMarker.style.width = `${clamp(mw, 12, innerW)}px`;
    elPlacementMarker.style.height = `${clamp(mh, 10, innerH)}px`;
    elPlacementMarker.style.left = `${cl}px`;
    elPlacementMarker.style.top = `${ct}px`;
}

function registerPlacementEvents() {
    if (!elPlacementArea || !elPlacementMarker) return;

    const startDrag = (ev) => {
        if (!currentOverlay) return;
        ev.preventDefault();

        const areaRect = elPlacementArea.getBoundingClientRect();
        const innerW = Math.max(1, areaRect.width);
        const innerH = Math.max(1, Math.round(innerW * 9 / 16));

        const markerRect = elPlacementMarker.getBoundingClientRect();

        placementDrag.active = true;
        placementDrag.offsetX = ev.clientX - markerRect.left;
        placementDrag.offsetY = ev.clientY - markerRect.top;

        const move = (e) => {
            if (!placementDrag.active) return;

            const wa = getCurrentWorkArea();

            const overlayW = Math.max(1, parseInt(currentOverlay.width || 0, 10) || 1);
            const overlayH = Math.max(1, parseInt(currentOverlay.height || 0, 10) || 1);

            const mw = Math.max(12, Math.round(innerW * (overlayW / wa.width)));
            const mh = Math.max(10, Math.round(innerH * (overlayH / wa.height)));

            const rawLeft = (e.clientX - areaRect.left) - placementDrag.offsetX;
            const rawTop = (e.clientY - areaRect.top) - placementDrag.offsetY;

            const left = clamp(rawLeft, 0, Math.max(0, innerW - mw));
            const top = clamp(rawTop, 0, Math.max(0, innerH - mh));

            elPlacementMarker.style.left = `${Math.round(left)}px`;
            elPlacementMarker.style.top = `${Math.round(top)}px`;

            // 実座標へ変換（Overlayは left/top=workArea基準の左上）
            const relX = left / innerW;
            const relY = top / innerH;

            let nx = Math.round(wa.x + relX * wa.width);
            let ny = Math.round(wa.y + relY * wa.height);

            // はみ出し抑制（実座標）
            nx = clamp(nx, wa.x, wa.x + wa.width - overlayW);
            ny = clamp(ny, wa.y, wa.y + wa.height - overlayH);

            scheduleOverlayPositionUpdate(nx, ny);
        };

        const end = () => {
            placementDrag.active = false;
            window.removeEventListener('mousemove', move);
            window.removeEventListener('mouseup', end);
        };

        window.addEventListener('mousemove', move);
        window.addEventListener('mouseup', end);
    };

    elPlacementMarker.addEventListener('mousedown', startDrag);
}

// タイマー状態に応じた表示（時刻）を反映する
function applyTimerToUI(timer) {
    if (!timer) return;

    currentTimer = timer;

    if (timer.timeHtml) {
        elTime.innerHTML = timer.timeHtml;
    } else {
        elTime.textContent = timer.timeText || '00:00:00';
    }

    applyTimerWarnColor(timer);

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
        applyControlColor(elColor.value);
    } else {
        applyControlColor(currentOverlay.color || '#ffffff');
    }

    if (elShowClock) {
        elShowClock.checked = !!currentOverlay.showClock;
    }

    // タイマー表示トグル（表示中:「非表示」/ 非表示中:「表示」）
    if (btnToggleTimer) {
        const visible = !currentOverlay || currentOverlay.showTimer !== false;
        btnToggleTimer.textContent = visible ? 'タイマー非表示' : 'タイマー表示';
    }

    // カンペ点滅トグル（OFF:「点滅ON」/ ON:「点滅OFF」）
    if (btnKanpeBlink) {
        const blinking = !!(currentOverlay && currentOverlay.kanpeBlink);
        btnKanpeBlink.textContent = blinking ? '点滅OFF' : '点滅ON';
    }

    // 表示場所（仮想表示）を更新
    updatePlacementMarker();

    // カンペ入力欄
    elKanpe.value = (typeof currentOverlay.kanpeText === 'string') ? currentOverlay.kanpeText : '';
}

// state:sync など「まとまった状態」からUIを更新する
function refreshUIFromState(payload) {
    if (!payload) return;

    if (payload.timer) {
        applyWarningSettingsToUI(payload.timer);
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

    // 表示場所（仮想表示）を更新
    updatePlacementMarker();
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

    if (elMode) {
        elMode.addEventListener('change', () => {
            const mode = elMode.value === 'up' ? 'up' : 'down';
            if (mode === 'up') {
                if (elWarn1Enabled) elWarn1Enabled.checked = false;
                if (elWarn2Enabled) elWarn2Enabled.checked = false;
            }
        });
    }

    btnApplyTimer.addEventListener('click', () => {
        const mode = elMode.value === 'up' ? 'up' : 'down';
        const startMin = Math.max(0, parseInt(elStartMin.value || '0', 10));
        const startSeconds = startMin * 60;

        const downDisplayMode = (elDownDisplayMode && elDownDisplayMode.value === 'mss') ? 'mss' : 'hms';

        // 有効フラグ（UPのときは強制OFF）
        let warn1Enabled = (elWarn1Enabled && elWarn1Enabled.checked) ? true : false;
        let warn2Enabled = (elWarn2Enabled && elWarn2Enabled.checked) ? true : false;

        if (mode === 'up') {
            warn1Enabled = false;
            warn2Enabled = false;
            if (elWarn1Enabled) elWarn1Enabled.checked = false;
            if (elWarn2Enabled) elWarn2Enabled.checked = false;
        }

        const warn1Min = Math.max(0, parseInt((elWarn1Min && elWarn1Min.value) ? elWarn1Min.value : '0', 10));
        const warn2Min = Math.max(0, parseInt((elWarn2Min && elWarn2Min.value) ? elWarn2Min.value : '0', 10));

        const warn1Color = (elWarn1Color && elWarn1Color.value) ? elWarn1Color.value : '#FFE900';
        const warn2Color = (elWarn2Color && elWarn2Color.value) ? elWarn2Color.value : '#F55700';

        window.timepon.setTimer({
            mode,
            startSeconds,
            downDisplayMode,
            warn1Enabled,
            warn2Enabled,
            warn1Min,
            warn2Min,
            warn1Color,
            warn2Color
        });
    });

    if (btnToggleTimer) {
        btnToggleTimer.addEventListener('click', () => {
            const visible = !currentOverlay || currentOverlay.showTimer !== false;
            const next = !visible;

            window.timepon.updateOverlay({
                showTimer: next
            });

            // 体感をよくするため、UI上の表示だけ先に更新
            if (!currentOverlay) currentOverlay = {};
            currentOverlay.showTimer = next;
            btnToggleTimer.textContent = next ? '非表示' : '表示';
        });
    }

    registerPlacementEvents();

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
            applyControlColor(elColor.value);

            window.timepon.updateOverlay({
                color: elColor.value || '#ffffff'
            });
        });
    }

    // 現在時刻表示（タイマー下に現在時刻を表示）
    if (elShowClock) {
        elShowClock.addEventListener('change', () => {
            window.timepon.updateOverlay({
                showClock: !!elShowClock.checked
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

    // カンペ
    btnSendKanpe.addEventListener('click', () => {
        if (window.timepon.setKanpeBlink) {
            window.timepon.setKanpeBlink(false);
        }
        window.timepon.setKanpe(elKanpe.value || '');
    });

    btnClearKanpe.addEventListener('click', () => {
        if (window.timepon.setKanpeBlink) {
            window.timepon.setKanpeBlink(false);
        }
        elKanpe.value = '';
        window.timepon.setKanpe('');
    });

    // カンペ点滅（OFF: 点滅ON / ON: 点滅OFF）
    if (btnKanpeBlink) {
        btnKanpeBlink.addEventListener('click', () => {
            const next = !(currentOverlay && currentOverlay.kanpeBlink);
            window.timepon.setKanpeBlink(next);
        });
    }
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
    if (s && s.timer && elDownDisplayMode) {
        elDownDisplayMode.value = s.timer.downDisplayMode === 'mss' ? 'mss' : 'hms';
    }
    if (s && s.overlay && s.overlay.displayId != null) {
        elDisplaySelect.value = String(s.overlay.displayId);
    }
    if (s && s.overlay && elShowClock) {
        elShowClock.checked = !!s.overlay.showClock;
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
