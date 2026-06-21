"use strict";

(() => {
  const STORAGE_KEY = "code-pet-language";
  const DEFAULT_LOCALE = "en";
  const LOCALE_LABELS = {
    en: "English",
    zh: "中文",
    ja: "日本語",
  };
  const HTML_LANG = {
    en: "en",
    zh: "zh-CN",
    ja: "ja",
  };
  const DICTIONARY = {
    en: {
      "app.githubAria": "Vibe Pet GitHub repository",
      "connection.disconnected": "Disconnected",
      "connection.connected": "Connected",
      "connection.reconnect": "Reconnect",
      "connection.connectDevice": "Connect device",
      "connection.noBluetoothDesktop": "Desktop runtime does not support Bluetooth",
      "connection.noBluetoothWeb": "This browser does not support Web Bluetooth",
      "connection.selecting": "Selecting device",
      "connection.scanning": "Scanning devices",
      "connection.connecting": "Connecting",
      "connection.deviceDisconnected": "Disconnected",
      "connection.cancelled": "Cancelled",
      "connection.notSelected": "No device selected",
      "connection.serviceMissing": "Selected device does not expose the Vibe Pet BLE service. Choose a VibePet device. Legacy CodePet firmware is also supported.",
      "connection.failed": "Connection failed: {message}",
      "connection.sendFailed": "Send failed: {message}",
      "firmware.flashButton": "Flash firmware",
      "firmware.title": "Flash firmware",
      "firmware.subtitle": "Choose a target and serial port, then flash main.bin from that target folder.",
      "firmware.target": "Target",
      "firmware.port": "Serial port",
      "firmware.refreshPorts": "Refresh",
      "firmware.start": "Flash",
      "firmware.cancel": "Cancel flashing",
      "firmware.ready": "Ready",
      "firmware.loading": "Loading firmware options",
      "firmware.noPorts": "No serial ports found",
      "firmware.selectPort": "Select a serial port",
      "firmware.flashing": "Flashing {target} on {port}",
      "firmware.done": "Firmware flashed successfully",
      "firmware.failed": "Flash failed: {message}",
      "firmware.cancelled": "Flash cancelled",
      "firmware.portRequired": "Choose a serial port first",
      "firmware.flasherMissing": "Firmware flasher is unavailable: {message}",
      "device.choose": "Choose device",
      "device.cancel": "Cancel",
      "device.empty": "Scanning. Make sure the device is powered on and advertising.",
      "device.recommended": "{name} · Recommended",
      "device.unnamed": "Unnamed BLE device",
      "device.disconnectTitle": "Disconnect device?",
      "device.disconnectMessage": "Vibe Pet will stop sending live status to {name}. You can reconnect anytime.",
      "device.keepConnected": "Keep connected",
      "device.disconnectAction": "Disconnect",
      "label.deviceOutput": "Device output",
      "label.agent": "Agent",
      "label.event": "Event",
      "label.liveOutput": "Live output",
      "label.activeSessions": "Active sessions",
      "label.bridgePort": "Bridge port",
      "label.theme": "Theme",
      "label.language": "Language",
      "label.testState": "Test state",
      "panel.open": "Status",
      "panel.title": "Status panel",
      "theme.day": "Day",
      "theme.night": "Night",
      "pet.gridAria": "desktop pet grid",
      "pet.previewAria": "desktop pet preview",
      "pet.switchTitle": "Switch character: {name}",
      "pet.switchAria": "Switch {agent} character",
      "pet.modalTitle": "Switch character",
      "pet.source": "Character source: {source}",
      "pet.filterPlaceholder": "Filter characters",
      "pet.kindAria": "Character type",
      "pet.allSources": "All sources",
      "pet.refresh": "Refresh",
      "pet.loading": "Loading",
      "pet.loadingCharacters": "Loading characters",
      "pet.unavailable": "Petdex unavailable: {message}",
      "pet.shown": "Showing {count} characters",
      "pet.shownCapped": "Showing {count} / {total} characters. Keep typing to narrow results.",
      "pet.noMatches": "No matching characters",
      "pet.builtin": "Built in",
      "session.untitled": "Untitled session",
      "session.waitingEditors": "Waiting for editors",
      "session.waitingHooks": "Waiting for hook events",
      "action.send": "Send",
      "action.close": "Close",
      "state.idle": "Idle",
      "state.thinking": "Thinking",
      "state.working": "Working",
      "state.typing": "Working",
      "state.juggling": "Handling multiple tasks",
      "state.building": "Building",
      "state.attention": "Needs attention",
      "state.notification": "Notification",
      "state.error": "Error",
      "state.sweeping": "Cleaning context",
      "state.sleeping": "Sleeping",
      "state.unknown": "Unknown",
      "web.title": "Hardware Desktop Pet BLE Bridge",
    },
    zh: {
      "app.githubAria": "Vibe Pet GitHub 仓库",
      "connection.disconnected": "未连接",
      "connection.connected": "已连接",
      "connection.reconnect": "重新连接",
      "connection.connectDevice": "连接设备",
      "connection.noBluetoothDesktop": "桌面运行时不支持 Bluetooth",
      "connection.noBluetoothWeb": "当前浏览器不支持 Web Bluetooth",
      "connection.selecting": "选择设备中",
      "connection.scanning": "扫描设备中",
      "connection.connecting": "连接中",
      "connection.deviceDisconnected": "已断开",
      "connection.cancelled": "已取消",
      "connection.notSelected": "未选择设备",
      "connection.serviceMissing": "选中的设备没有 Vibe Pet BLE 服务，请选择 VibePet 设备。旧版 CodePet 固件也会兼容识别。",
      "connection.failed": "连接失败: {message}",
      "connection.sendFailed": "发送失败: {message}",
      "firmware.flashButton": "烧录固件",
      "firmware.title": "烧录固件",
      "firmware.subtitle": "选择目标设备和串口，然后烧录对应目录里的 main.bin。",
      "firmware.target": "目标设备",
      "firmware.port": "串口",
      "firmware.refreshPorts": "刷新",
      "firmware.start": "烧录",
      "firmware.cancel": "取消烧录",
      "firmware.ready": "就绪",
      "firmware.loading": "正在加载固件选项",
      "firmware.noPorts": "没有发现串口",
      "firmware.selectPort": "选择串口",
      "firmware.flashing": "正在向 {port} 烧录 {target}",
      "firmware.done": "固件烧录成功",
      "firmware.failed": "烧录失败：{message}",
      "firmware.cancelled": "烧录已取消",
      "firmware.portRequired": "请先选择串口",
      "firmware.flasherMissing": "固件烧录工具不可用：{message}",
      "device.choose": "选择设备",
      "device.cancel": "取消",
      "device.empty": "扫描中，确认设备已上电并处于广播状态",
      "device.recommended": "{name} · 推荐",
      "device.unnamed": "未命名 BLE 设备",
      "device.disconnectTitle": "断开设备连接？",
      "device.disconnectMessage": "断开后，硬件桌宠会停止接收 {name} 的新状态；需要时可以重新连接。",
      "device.keepConnected": "保持连接",
      "device.disconnectAction": "断开连接",
      "label.deviceOutput": "设备输出",
      "label.agent": "Agent",
      "label.event": "事件",
      "label.liveOutput": "实时输出",
      "label.activeSessions": "活动会话",
      "label.bridgePort": "后台端口",
      "label.theme": "主题",
      "label.language": "语言",
      "label.testState": "测试状态",
      "panel.open": "状态",
      "panel.title": "状态面板",
      "theme.day": "日间",
      "theme.night": "夜晚",
      "pet.gridAria": "桌宠格子",
      "pet.previewAria": "桌宠预览",
      "pet.switchTitle": "切换形象：{name}",
      "pet.switchAria": "切换 {agent} 的形象",
      "pet.modalTitle": "切换角色",
      "pet.source": "角色来源：{source}",
      "pet.filterPlaceholder": "筛选角色",
      "pet.kindAria": "角色类型",
      "pet.allSources": "全部来源",
      "pet.refresh": "刷新",
      "pet.loading": "加载中",
      "pet.loadingCharacters": "正在加载角色",
      "pet.unavailable": "Petdex 暂不可用：{message}",
      "pet.shown": "显示 {count} 个角色",
      "pet.shownCapped": "显示 {count} / {total} 个角色，继续输入可缩小范围",
      "pet.noMatches": "无匹配角色",
      "pet.builtin": "内置",
      "session.untitled": "未命名会话",
      "session.waitingEditors": "等待编辑器",
      "session.waitingHooks": "等待 hook 事件",
      "action.send": "发送",
      "action.close": "关闭",
      "state.idle": "空闲",
      "state.thinking": "思考中",
      "state.working": "工作中",
      "state.typing": "工作中",
      "state.juggling": "多任务处理中",
      "state.building": "构建中",
      "state.attention": "需要关注",
      "state.notification": "有通知",
      "state.error": "出错了",
      "state.sweeping": "清理上下文",
      "state.sleeping": "休眠",
      "state.unknown": "未知状态",
      "web.title": "硬件桌宠蓝牙桥",
    },
    ja: {
      "app.githubAria": "Vibe Pet GitHub リポジトリ",
      "connection.disconnected": "未接続",
      "connection.connected": "接続済み",
      "connection.reconnect": "再接続",
      "connection.connectDevice": "デバイスに接続",
      "connection.noBluetoothDesktop": "デスクトップ実行環境は Bluetooth に対応していません",
      "connection.noBluetoothWeb": "このブラウザーは Web Bluetooth に対応していません",
      "connection.selecting": "デバイスを選択中",
      "connection.scanning": "デバイスをスキャン中",
      "connection.connecting": "接続中",
      "connection.deviceDisconnected": "切断済み",
      "connection.cancelled": "キャンセルしました",
      "connection.notSelected": "デバイスが選択されていません",
      "connection.serviceMissing": "選択したデバイスに Vibe Pet BLE サービスがありません。VibePet デバイスを選択してください。旧 CodePet ファームウェアも互換対応しています。",
      "connection.failed": "接続に失敗しました: {message}",
      "connection.sendFailed": "送信に失敗しました: {message}",
      "firmware.flashButton": "ファームを書込",
      "firmware.title": "ファームウェアを書き込み",
      "firmware.subtitle": "ターゲットとシリアルポートを選択し、そのフォルダの main.bin を書き込みます。",
      "firmware.target": "ターゲット",
      "firmware.port": "シリアルポート",
      "firmware.refreshPorts": "更新",
      "firmware.start": "書き込み",
      "firmware.cancel": "書き込みを中止",
      "firmware.ready": "準備完了",
      "firmware.loading": "ファームウェア設定を読み込み中",
      "firmware.noPorts": "シリアルポートが見つかりません",
      "firmware.selectPort": "シリアルポートを選択",
      "firmware.flashing": "{port} に {target} を書き込み中",
      "firmware.done": "ファームウェアを書き込みました",
      "firmware.failed": "書き込みに失敗しました: {message}",
      "firmware.cancelled": "書き込みをキャンセルしました",
      "firmware.portRequired": "先にシリアルポートを選択してください",
      "firmware.flasherMissing": "ファームウェア書き込みツールを利用できません: {message}",
      "device.choose": "デバイスを選択",
      "device.cancel": "キャンセル",
      "device.empty": "スキャン中です。デバイスの電源と広告状態を確認してください。",
      "device.recommended": "{name} · 推奨",
      "device.unnamed": "名前のない BLE デバイス",
      "device.disconnectTitle": "デバイスの接続を切断しますか？",
      "device.disconnectMessage": "切断すると、Vibe Pet は {name} へ新しい状態を送信しなくなります。必要なときに再接続できます。",
      "device.keepConnected": "接続したままにする",
      "device.disconnectAction": "切断",
      "label.deviceOutput": "デバイス出力",
      "label.agent": "Agent",
      "label.event": "イベント",
      "label.liveOutput": "リアルタイム出力",
      "label.activeSessions": "アクティブセッション",
      "label.bridgePort": "ブリッジポート",
      "label.theme": "テーマ",
      "label.language": "言語",
      "label.testState": "テスト状態",
      "panel.open": "状態",
      "panel.title": "状態パネル",
      "theme.day": "昼",
      "theme.night": "夜",
      "pet.gridAria": "デスクトップペットのグリッド",
      "pet.previewAria": "デスクトップペットのプレビュー",
      "pet.switchTitle": "キャラクターを切り替え: {name}",
      "pet.switchAria": "{agent} のキャラクターを切り替え",
      "pet.modalTitle": "キャラクターを切り替え",
      "pet.source": "キャラクター提供元：{source}",
      "pet.filterPlaceholder": "キャラクターを絞り込み",
      "pet.kindAria": "キャラクター種別",
      "pet.allSources": "すべての提供元",
      "pet.refresh": "更新",
      "pet.loading": "読み込み中",
      "pet.loadingCharacters": "キャラクターを読み込み中",
      "pet.unavailable": "Petdex は利用できません：{message}",
      "pet.shown": "{count} 件のキャラクターを表示",
      "pet.shownCapped": "{count} / {total} 件を表示中。入力を続けると絞り込めます。",
      "pet.noMatches": "一致するキャラクターはありません",
      "pet.builtin": "内蔵",
      "session.untitled": "無題のセッション",
      "session.waitingEditors": "エディターを待機中",
      "session.waitingHooks": "hook イベントを待機中",
      "action.send": "送信",
      "action.close": "閉じる",
      "state.idle": "待機中",
      "state.thinking": "思考中",
      "state.working": "作業中",
      "state.typing": "作業中",
      "state.juggling": "複数タスク処理中",
      "state.building": "ビルド中",
      "state.attention": "確認が必要",
      "state.notification": "通知あり",
      "state.error": "エラー",
      "state.sweeping": "コンテキスト整理中",
      "state.sleeping": "休止中",
      "state.unknown": "不明な状態",
      "web.title": "ハードウェアデスクトップペット BLE ブリッジ",
    },
  };

  function safeLocale(locale) {
    return Object.prototype.hasOwnProperty.call(DICTIONARY, locale) ? locale : DEFAULT_LOCALE;
  }

  function storedLocale() {
    try {
      return safeLocale(localStorage.getItem(STORAGE_KEY) || DEFAULT_LOCALE);
    } catch {
      return DEFAULT_LOCALE;
    }
  }

  function format(template, values = {}) {
    return String(template || "").replace(/\{(\w+)\}/g, (_match, key) =>
      values[key] === undefined ? "" : String(values[key])
    );
  }

  function t(key, values = {}) {
    const locale = storedLocale();
    const text = DICTIONARY[locale][key] || DICTIONARY[DEFAULT_LOCALE][key] || key;
    return format(text, values);
  }

  function setLocale(locale) {
    const nextLocale = safeLocale(locale);
    try {
      localStorage.setItem(STORAGE_KEY, nextLocale);
    } catch {}
    apply();
    window.dispatchEvent(new CustomEvent("code-pet:language-change", { detail: { locale: nextLocale } }));
    return nextLocale;
  }

  let languageMenuListenersReady = false;

  function localeLabel(locale) {
    return LOCALE_LABELS[safeLocale(locale)] || locale;
  }

  function languageButtonFor(menu) {
    const buttonId = menu.getAttribute("aria-labelledby");
    return buttonId ? document.getElementById(buttonId) : null;
  }

  function closeLanguageMenus(exceptMenu = null) {
    for (const menu of document.querySelectorAll("[data-language-menu]")) {
      if (menu === exceptMenu) continue;
      menu.hidden = true;
      const button = languageButtonFor(menu);
      if (button) button.setAttribute("aria-expanded", "false");
    }
  }

  function updateLanguageMenus(root = document) {
    const locale = storedLocale();
    for (const label of root.querySelectorAll("[data-language-menu-label]")) {
      label.textContent = localeLabel(locale);
    }
    for (const option of root.querySelectorAll("[data-locale-option]")) {
      const selected = safeLocale(option.dataset.localeOption) === locale;
      option.textContent = localeLabel(option.dataset.localeOption);
      option.setAttribute("aria-selected", String(selected));
      option.tabIndex = selected ? 0 : -1;
    }
  }

  function focusLanguageOption(menu, direction) {
    const options = Array.from(menu.querySelectorAll("[data-locale-option]"));
    if (!options.length) return;
    const activeIndex = options.indexOf(document.activeElement);
    const selectedIndex = options.findIndex((option) => option.getAttribute("aria-selected") === "true");
    const currentIndex = activeIndex >= 0 ? activeIndex : Math.max(selectedIndex, 0);
    const nextIndex = (currentIndex + direction + options.length) % options.length;
    options[nextIndex].focus();
  }

  function openLanguageMenu(button, menu) {
    closeLanguageMenus(menu);
    updateLanguageMenus();
    menu.hidden = false;
    button.setAttribute("aria-expanded", "true");
    const selected = menu.querySelector('[aria-selected="true"]') || menu.querySelector("[data-locale-option]");
    if (selected) selected.focus();
  }

  function setupLanguageMenus(root = document) {
    for (const button of root.querySelectorAll("[data-language-menu-button]")) {
      if (button.dataset.languageMenuReady === "true") continue;
      const menu = document.getElementById(button.getAttribute("aria-controls"));
      if (!menu) continue;
      button.dataset.languageMenuReady = "true";

      button.addEventListener("click", (event) => {
        event.stopPropagation();
        if (button.getAttribute("aria-expanded") === "true") {
          closeLanguageMenus();
        } else {
          openLanguageMenu(button, menu);
        }
      });

      button.addEventListener("keydown", (event) => {
        if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openLanguageMenu(button, menu);
        }
      });

      menu.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          closeLanguageMenus();
          button.focus();
        } else if (event.key === "ArrowDown") {
          event.preventDefault();
          focusLanguageOption(menu, 1);
        } else if (event.key === "ArrowUp") {
          event.preventDefault();
          focusLanguageOption(menu, -1);
        } else if (event.key === "Home") {
          event.preventDefault();
          const first = menu.querySelector("[data-locale-option]");
          if (first) first.focus();
        } else if (event.key === "End") {
          event.preventDefault();
          const options = menu.querySelectorAll("[data-locale-option]");
          if (options.length) options[options.length - 1].focus();
        }
      });

      for (const option of menu.querySelectorAll("[data-locale-option]")) {
        option.addEventListener("click", (event) => {
          event.stopPropagation();
          setLocale(option.dataset.localeOption);
          closeLanguageMenus();
          button.focus();
        });
      }
    }

    if (languageMenuListenersReady) return;
    languageMenuListenersReady = true;
    document.addEventListener("click", (event) => {
      if (event.target.closest("[data-language-menu-shell]")) return;
      closeLanguageMenus();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeLanguageMenus();
    });
  }

  function apply(root = document) {
    const locale = storedLocale();
    document.documentElement.lang = HTML_LANG[locale] || "en";

    for (const element of root.querySelectorAll("[data-i18n]")) {
      element.textContent = t(element.dataset.i18n);
    }
    for (const element of root.querySelectorAll("[data-i18n-placeholder]")) {
      element.setAttribute("placeholder", t(element.dataset.i18nPlaceholder));
    }
    for (const element of root.querySelectorAll("[data-i18n-aria-label]")) {
      element.setAttribute("aria-label", t(element.dataset.i18nAriaLabel));
    }
    for (const element of root.querySelectorAll("[data-i18n-title]")) {
      element.setAttribute("title", t(element.dataset.i18nTitle));
    }
    for (const select of root.querySelectorAll("[data-language-select]")) {
      select.value = locale;
    }
    setupLanguageMenus(root);
    updateLanguageMenus(root);
  }

  window.VibePetI18n = {
    defaultLocale: DEFAULT_LOCALE,
    labels: LOCALE_LABELS,
    supportedLocales: Object.keys(DICTIONARY),
    getLocale: storedLocale,
    setLocale,
    t,
    apply,
    updateLanguageMenus,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => apply());
  } else {
    apply();
  }
})();
