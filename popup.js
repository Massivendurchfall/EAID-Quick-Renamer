(() => {
  const pageRegex = /^https:\/\/myaccount\.ea\.com\/am\/ui\/account-information/i;

  const DEFAULT_INTERVAL_SEC = 60;
  const MIN_INTERVAL_SEC = 2;
  const INTERVAL_STORAGE_KEY = "loopIntervalSec";

  const intervalSecInput = document.getElementById("intervalSec");
  const runOnceBtn = document.getElementById("runOnceBtn");
  const startLoopBtn = document.getElementById("startLoopBtn");
  const stopLoopBtn = document.getElementById("stopLoopBtn");
  const statusEl = document.getElementById("status");
  const resultEl = document.getElementById("result");

  function setStatus(text, isError = false) {
    statusEl.textContent = text;
    statusEl.className = `status ${isError ? "error" : ""}`.trim();
  }

  function setResult(text, cls = "") {
    resultEl.textContent = text;
    resultEl.className = `status ${cls}`.trim();
  }

  function normalizeIntervalSeconds(value) {
    const seconds = Number(value);
    if (!Number.isFinite(seconds)) {
      return DEFAULT_INTERVAL_SEC;
    }
    return Math.max(MIN_INTERVAL_SEC, Math.floor(seconds));
  }

  function setIntervalInput(seconds) {
    intervalSecInput.value = String(normalizeIntervalSeconds(seconds));
  }

  function storageGet(key) {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get([key], (result) => {
          if (chrome.runtime.lastError) {
            resolve({});
            return;
          }
          resolve(result || {});
        });
      } catch (error) {
        resolve({});
      }
    });
  }

  function storageSet(data) {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.set(data, () => {
          resolve();
        });
      } catch (error) {
        resolve();
      }
    });
  }

  async function loadSavedInterval() {
    const data = await storageGet(INTERVAL_STORAGE_KEY);
    const saved = data[INTERVAL_STORAGE_KEY];
    setIntervalInput(saved ?? DEFAULT_INTERVAL_SEC);
  }

  async function persistIntervalInput() {
    const normalized = normalizeIntervalSeconds(intervalSecInput.value);
    setIntervalInput(normalized);
    await storageSet({ [INTERVAL_STORAGE_KEY]: normalized });
    return normalized;
  }

  function getPayload() {
    const safeSeconds = normalizeIntervalSeconds(intervalSecInput.value || DEFAULT_INTERVAL_SEC);
    return {
      customName: "",
      intervalMs: safeSeconds * 1000
    };
  }

  async function getActiveTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab;
  }

  async function getTargetTab() {
    const active = await getActiveTab();
    if (isSupportedTab(active)) {
      return active;
    }

    const candidates = await chrome.tabs.query({
      url: "https://myaccount.ea.com/am/ui/account-information*"
    });

    if (candidates.length > 0) {
      return candidates[0];
    }

    return null;
  }

  function isSupportedTab(tab) {
    return !!(tab && tab.url && pageRegex.test(tab.url));
  }

  async function sendToContentScript(type) {
    const tab = await getTargetTab();

    if (!tab || !isSupportedTab(tab)) {
      setStatus("Please open the EA account-information page in any tab first.", true);
      return null;
    }

    try {
      return await chrome.tabs.sendMessage(tab.id, {
        type,
        ...getPayload()
      });
    } catch (error) {
      setStatus("Content script not reachable. Reload the EA page and try again.", true);
      return null;
    }
  }

  async function refreshStatus() {
    const response = await sendToContentScript("GET_STATUS");
    if (!response || !response.ok) {
      return;
    }

    const { running, runs, lastName, intervalMs } = response.status;
    const intervalSec = normalizeIntervalSeconds(Math.floor(intervalMs / 1000));
    setIntervalInput(intervalSec);
    await storageSet({ [INTERVAL_STORAGE_KEY]: intervalSec });

    setStatus(`Status: ${running ? "Loop running" : "Loop stopped"} | Runs: ${runs} | Interval: ${intervalSec}s`);
    if (lastName) {
      setResult(`Last name: ${lastName}`, "ok");
    }
  }

  intervalSecInput.addEventListener("change", () => {
    void persistIntervalInput();
  });

  intervalSecInput.addEventListener("blur", () => {
    void persistIntervalInput();
  });

  runOnceBtn.addEventListener("click", async () => {
    await persistIntervalInput();
    setStatus("Starting one run...");
    const response = await sendToContentScript("RUN_ONCE");
    if (!response) {
      return;
    }

    if (response.ok) {
      setResult(`Set: ${response.name}`, "ok");
    } else {
      setResult(`Error: ${response.error || "Unknown"}`, "error");
    }

    await refreshStatus();
  });

  startLoopBtn.addEventListener("click", async () => {
    await persistIntervalInput();
    setStatus("Starting loop...");
    const response = await sendToContentScript("START_LOOP");
    if (!response || !response.ok) {
      setResult("Could not start loop.", "error");
      return;
    }

    setResult("Loop started.", "ok");
    await refreshStatus();
  });

  stopLoopBtn.addEventListener("click", async () => {
    await persistIntervalInput();
    setStatus("Stopping loop...");
    const response = await sendToContentScript("STOP_LOOP");
    if (!response || !response.ok) {
      setResult("Could not stop loop.", "error");
      return;
    }

    setResult("Loop stopped.", "ok");
    await refreshStatus();
  });

  async function init() {
    await loadSavedInterval();
    await refreshStatus();
  }

  void init();
})();
