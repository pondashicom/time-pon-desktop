// -----------------------
//     overlay.js
//     ver 1.0.2
// -----------------------

// -----------------------
//   DOM参照
// -----------------------
const elTimer = document.getElementById('timer');
const elClock = document.getElementById('clock');
const elProgressWrap = document.getElementById('progressWrap');
const elProgressBar = document.getElementById('progressBar');
const elKanpe = document.getElementById('kanpe');

// -----------------------
//   共通関数
// -----------------------
function pad2(n) {
    const x = Math.floor(Math.abs(n));
    return (x < 10 ? '0' : '') + String(x);
}

function nowToHMS() {
    const d = new Date();
    return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

// -----------------------
//   表示設定
// -----------------------

// オーバレイの見た目（フォント/サイズ/色）を反映する
function applyAppearance(overlay) {
    const fontFamily = overlay.fontFamily || 'Segoe UI, system-ui, -apple-system, sans-serif';
    const fontSizePx = overlay.fontSizePx || 120;
    const color = overlay.color || '#ffffff';

    elTimer.style.fontFamily = fontFamily;
    elTimer.style.fontSize = `${fontSizePx}px`;
    elTimer.style.color = color;

    elKanpe.style.fontFamily = fontFamily;
    elKanpe.style.fontSize = `${Math.max(12, Math.floor(fontSizePx * 0.42))}px`;
    elKanpe.style.color = color;

    if (elClock) {
        elClock.style.fontFamily = fontFamily;
        elClock.style.fontSize = `${Math.max(10, Math.floor(fontSizePx * 0.27))}px`;
        elClock.style.color = color;
    }

    if (elProgressBar) {
        elProgressBar.style.backgroundColor = color;
        elProgressBar.style.opacity = '0.80';
    }
}

// -----------------------
//   追加表示（現在時刻 / プログレス）
// -----------------------
let clockEnabled = false;
let timerVisible = true;

function applyTimerVisibility(enabled) {
    timerVisible = !!enabled;

    if (elTimer) {
        elTimer.style.display = timerVisible ? 'block' : 'none';
    }

    // タイマー非表示時は、付随表示もまとめて消す
    if (!timerVisible) {
        if (elClock) elClock.style.display = 'none';
        if (elProgressWrap) {
            elProgressWrap.style.display = 'none';
            if (elProgressBar) elProgressBar.style.transform = 'scaleX(1)';
        }
        return;
    }

    // 再表示時：現在時刻表示の可否は clockEnabled に従う
    applyClockVisibility(clockEnabled);
}

function applyClockVisibility(enabled) {
    clockEnabled = !!enabled;
    if (!elClock) return;

    if (!timerVisible) {
        elClock.style.display = 'none';
        return;
    }

    elClock.style.display = clockEnabled ? 'block' : 'none';
    if (clockEnabled) {
        elClock.innerHTML = `<span class="c-label">現在時刻</span> <span class="c-time">${nowToHMS()}</span>`;
    }
}

function updateProgressFromTimer(t) {
    if (!elProgressWrap || !elProgressBar) return;

    if (!timerVisible) {
        elProgressWrap.style.display = 'none';
        elProgressBar.style.transform = 'scaleX(1)';
        return;
    }

    const mode = t && t.mode ? String(t.mode) : 'down';
    const start = t && Number.isFinite(t.startSeconds) ? t.startSeconds : 0;
    const cur = t && Number.isFinite(t.currentSeconds) ? t.currentSeconds : 0;

    // カウントダウンのみ表示（開始値0は非表示）
    if (mode !== 'down' || start <= 0) {
        elProgressWrap.style.display = 'none';
        elProgressBar.style.transform = 'scaleX(1)';
        return;
    }

    const ratio = Math.max(0, Math.min(1, cur / start));
    elProgressWrap.style.display = 'block';

    // 幅は固定(100%)、transform で「右→左に減る」表現
    elProgressBar.style.width = '100%';
    elProgressBar.style.transform = `scaleX(${ratio.toFixed(6)})`;
}

// -----------------------
//   IPC受信（Renderer API）
// -----------------------

// state:sync を受け取り、見た目/タイマー/カンペ表示を同期する
function handleStateSync(payload) {
    if (payload && payload.overlay) {
        applyAppearance(payload.overlay);
        document.body.classList.toggle('move-mode', !!payload.overlay.moveMode);

        applyTimerVisibility(payload.overlay.showTimer !== false);
        applyClockVisibility(!!payload.overlay.showClock);
    }
    if (payload && payload.timer) {
        if (timerVisible) {
            if (payload.timer.timeHtml) {
                elTimer.innerHTML = payload.timer.timeHtml;
            } else if (payload.timer.timeText) {
                elTimer.textContent = payload.timer.timeText;
            }
        }
        updateProgressFromTimer(payload.timer);
    }
    if (payload && payload.overlay && typeof payload.overlay.kanpeText === 'string') {
        elKanpe.textContent = payload.overlay.kanpeText;
    }
}

// timer:tick を受け取り、タイマー表示を更新する
function handleTimerTick(t) {
    if (t) {
        if (timerVisible) {
            if (t.timeHtml) {
                elTimer.innerHTML = t.timeHtml;
            } else if (t.timeText) {
                elTimer.textContent = t.timeText;
            }
        }
    }
    updateProgressFromTimer(t);

    if (clockEnabled && timerVisible && elClock) {
        elClock.innerHTML = `<span class="c-label">現在時刻</span> <span class="c-time">${nowToHMS()}</span>`;
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

    // 現在時刻は 1秒ごとに更新（表示がONのときだけ意味がある）
    setInterval(() => {
        if (!clockEnabled || !timerVisible || !elClock) return;
        elClock.innerHTML = `<span class="c-label">現在時刻</span> <span class="c-time">${nowToHMS()}</span>`;
    }, 1000);

    // 起動直後に state:sync を取り逃した場合でも、保存状態を必ず反映する
    window.timepon.getState()
        .then((s) => {
            if (s) handleStateSync(s);
        })
        .catch(() => {
            // 取得できなくても動作は継続（後続の state:sync を待つ）
        });
}

init();
