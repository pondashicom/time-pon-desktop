(function () {
    const elTimer = document.getElementById('timer');
    const elKanpe = document.getElementById('kanpe');

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

    window.timepon.onStateSync((payload) => {
        if (payload && payload.overlay) {
            applyAppearance(payload.overlay);
        }
        if (payload && payload.timer && payload.timer.timeText) {
            elTimer.textContent = payload.timer.timeText;
        }
        if (payload && payload.overlay && typeof payload.overlay.kanpeText === 'string') {
            elKanpe.textContent = payload.overlay.kanpeText;
        }
    });

    window.timepon.onTimerTick((t) => {
        if (t && t.timeText) {
            elTimer.textContent = t.timeText;
        }
    });

    window.timepon.onKanpeUpdate((p) => {
        elKanpe.textContent = (p && typeof p.text === 'string') ? p.text : '';
    });
})();
