// -----------------------
//     preload.js
//     ver 1.0.1
// -----------------------

// -----------------------
//   初期設定
// -----------------------
const { contextBridge, ipcRenderer } = require('electron');

// -----------------------
//   Rendererへ公開するAPI
// -----------------------
contextBridge.exposeInMainWorld('timepon', {

    //   取得系（invoke）
    getDisplays: () => ipcRenderer.invoke('displays:get'),
    getState: () => ipcRenderer.invoke('state:get'),

    //   タイマー操作（send）
    setTimer: (payload) => ipcRenderer.send('timer:set', payload),
    timerControl: (action) => ipcRenderer.send('timer:control', { action }),

    //   オーバレイ/カンペ操作（send）
    updateOverlay: (payload) => ipcRenderer.send('overlay:update', payload),
    setKanpe: (text) => ipcRenderer.send('kanpe:set', { text }),

    //   イベント購読（on）
    onStateSync: (cb) => ipcRenderer.on('state:sync', (_e, p) => cb(p)),
    onTimerTick: (cb) => ipcRenderer.on('timer:tick', (_e, p) => cb(p)),
    onKanpeUpdate: (cb) => ipcRenderer.on('kanpe:update', (_e, p) => cb(p))
});
