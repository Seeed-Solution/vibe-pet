"use strict";

const { contextBridge, ipcRenderer } = require("electron");

function subscribe(channel, listener) {
  const wrapped = (_event, payload) => listener(payload);
  ipcRenderer.on(channel, wrapped);
  return () => ipcRenderer.removeListener(channel, wrapped);
}

contextBridge.exposeInMainWorld("codePet", {
  getSnapshot: () => ipcRenderer.invoke("code-pet:get-snapshot"),
  getBridgeInfo: () => ipcRenderer.invoke("code-pet:get-bridge-info"),
  getGitHubStars: () => ipcRenderer.invoke("code-pet:get-github-stars"),
  getPetdexPets: (options = {}) => ipcRenderer.invoke("code-pet:get-petdex-pets", options),
  getFirmwareTargets: () => ipcRenderer.invoke("code-pet:get-firmware-targets"),
  listSerialPorts: () => ipcRenderer.invoke("code-pet:list-serial-ports"),
  flashFirmware: (options = {}) => ipcRenderer.invoke("code-pet:flash-firmware", options),
  cancelFirmwareFlash: () => ipcRenderer.invoke("code-pet:cancel-firmware-flash"),
  testState: (state) => ipcRenderer.invoke("code-pet:test-state", state),
  chooseBluetoothDevice: (deviceId) => ipcRenderer.invoke("code-pet:choose-bluetooth-device", deviceId),
  syncDesktopPets: (pets = []) => ipcRenderer.send("code-pet:sync-desktop-pets", pets),
  onState: (listener) => subscribe("code-pet:state", listener),
  onDesktopPet: (listener) => subscribe("code-pet:desktop-pet", listener),
  onBluetoothDevices: (listener) => subscribe("code-pet:bluetooth-devices", listener),
  onFirmwareFlash: (listener) => subscribe("code-pet:firmware-flash", listener),
  onBridgeInfo: (listener) => subscribe("code-pet:bridge-info", listener),
});
