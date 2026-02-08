const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('timepon', {
    getDisplays: () => ipcRenderer.invoke('displays:get'),
    getState: () => ipcRenderer.invoke('state:get'),

    setTimer: (payload) => ipcRenderer.send('timer:set', payload),
    timerControl: (action) => ipcRenderer.send('timer:control', { action }),

    updateOverlay: (payload) => ipcRenderer.send('overlay:update', payload),
    setKanpe: (text) => ipcRenderer.send('kanpe:set', { text }),

    onStateSync: (cb) => ipcRenderer.on('state:sync', (_e, p) => cb(p)),
    onTimerTick: (cb) => ipcRenderer.on('timer:tick', (_e, p) => cb(p)),
    onKanpeUpdate: (cb) => ipcRenderer.on('kanpe:update', (_e, p) => cb(p))
});
