// -----------------------
//     overlay.js
//     ver 1.0.1
// -----------------------

// -----------------------
//   DOM参照
// -----------------------
const elTimer = document.getElementById('timer');
const elKanpe = document.getElementById('kanpe');

// -----------------------
//   表示設定
// -----------------------

// オーバレイの見た目（フォント/サイズ/色）を反映する
function applyAppearance(overlay) {
    const fontFamily = overlay.fontFamily || 'Segoe UI';
    const fontSizePx = overlay.fontSizePx || 120;
    const color = overlay.color || '#FFFFFF';

    elTimer.style.fontFamily = fontFamily;
    elTimer.style.fontSize = `${fontSizePx}px`;
    elTimer.style.color = color;

    elKanpe.style.fontFamily = fontFamily;
    elKanpe.style.fontSize = `${Math.max(12, Math.floor(fontSizePx * 0.42))}px`;
    elKanpe.style.color = color;
}

// -----------------------
//   IPC受信（Renderer API）
// -----------------------

// state:sync を受け取り、見た目/タイマー/カンペ表示を同期する
function handleStateSync(payload) {
    if (payload && payload.overlay) {
        applyAppearance(payload.overlay);
    }
    if (payload && payload.timer && payload.timer.timeText) {
        elTimer.textContent = payload.timer.timeText;
    }
    if (payload && payload.overlay && typeof payload.overlay.kanpeText === 'string') {
        elKanpe.textContent = payload.overlay.kanpeText;
    }
}

// timer:tick を受け取り、タイマー表示を更新する
function handleTimerTick(t) {
    if (t && t.timeText) {
        elTimer.textContent = t.timeText;
    }
}

// kanpe:update を受け取り、カンペ表示を更新する
function handleKanpeUpdate(p) {
    elKanpe.textContent = (p && typeof p.text === 'string') ? p.text : '';
}

// -----------------------
//   初期化
// -----------------------

// イベント購読を登録する
function init() {
    window.timepon.onStateSync(handleStateSync);
    window.timepon.onTimerTick(handleTimerTick);
    window.timepon.onKanpeUpdate(handleKanpeUpdate);
}

init();
