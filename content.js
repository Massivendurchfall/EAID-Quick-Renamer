(() => {
  if (window.__EAID_RENAMER_LOADED__) {
    return;
  }
  window.__EAID_RENAMER_LOADED__ = true;

  const SELECTORS = {
    editButton: "#edit-eaid-button, [data-testid='edit-eaid-button']",
    input: "[data-testid='eaid-section-input']",
    saveButton: "#save-eaid-button, [data-testid='save-eaid-button']",
    cancelButton: "#cancel-eaid-edit-button, [data-testid='cancel-eaid-edit-button']",
    inUseError: "[data-testid='eaid-section-input-error']"
  };

  const WORD_SOURCE_URL = "https://raw.githubusercontent.com/dwyl/english-words/refs/heads/master/words.txt";
  const MIN_NAME_LENGTH = 4;
  const MAX_NAME_LENGTH = 14;
  const WORD_MIN_LENGTH = 3;
  const WORD_MAX_LENGTH = 7;
  const MAX_RENAME_ATTEMPTS = 5;
  const MIN_LOOP_INTERVAL_MS = 2000;
  const EAID_PATTERN = new RegExp(`^[A-Za-z0-9]{${MIN_NAME_LENGTH},${MAX_NAME_LENGTH}}$`);

  const FALLBACK_WORD_POOL = [
    "alpha", "amber", "anchor", "apple", "april", "arrow", "atlas", "aurora", "autumn", "avenue",
    "badge", "baker", "beacon", "bison", "blaze", "bloom", "border", "breeze", "bronze", "buddy",
    "cable", "candy", "canyon", "captain", "carbon", "cedar", "center", "cherry", "cipher", "circle",
    "cloud", "cobalt", "comet", "copper", "coral", "cosmic", "craft", "crater", "crystal", "dawn",
    "delta", "desert", "dragon", "drift", "eagle", "earth", "ember", "engine", "falcon", "field",
    "final", "flame", "forest", "forge", "frost", "galaxy", "garden", "gentle", "glider", "golden",
    "hammer", "harbor", "hazel", "hero", "honey", "horizon", "island", "jet", "jungle", "knight",
    "lagoon", "lancer", "legend", "lunar", "maple", "marble", "matrix", "meadow", "meteor", "mint",
    "mirage", "modern", "mocha", "mount", "nebula", "nexus", "noble", "nova", "onyx", "orbit",
    "panther", "pearl", "phoenix", "pilot", "pixel", "planet", "prime", "pulse", "quartz", "quest",
    "rapid", "raven", "reactor", "ridge", "rocket", "royal", "ruby", "saber", "sage", "sapphire",
    "scarlet", "shadow", "shield", "signal", "silent", "silver", "skyline", "solar", "sonic", "sparrow",
    "spirit", "spring", "star", "steady", "storm", "summit", "sunset", "swift", "talon", "thunder",
    "tiger", "timber", "topaz", "trail", "turbo", "ultra", "urban", "vector", "velvet", "vivid",
    "voyage", "warden", "wave", "willow", "winter", "wolf", "zenith"
  ];

  let wordPool = [];
  let wordPoolLoadPromise = null;
  let loopTimer = null;
  let loopIntervalMs = 60000;
  let loopCustomName = "";
  let runLock = false;
  let runs = 0;
  let lastName = "";

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  function isElementVisible(element) {
    if (!element) {
      return false;
    }

    const style = window.getComputedStyle(element);
    if (!style || style.display === "none" || style.visibility === "hidden") {
      return false;
    }

    return element.offsetParent !== null || style.position === "fixed";
  }

  function findElement(selector) {
    const matches = Array.from(document.querySelectorAll(selector));
    if (matches.length === 0) {
      return null;
    }

    const visible = matches.find((element) => isElementVisible(element));
    return visible || matches[0];
  }

  function capitalize(word) {
    if (!word) {
      return "";
    }
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  }

  function isDisabled(button) {
    if (!button) {
      return true;
    }
    return button.disabled || button.getAttribute("aria-disabled") === "true";
  }

  function isValidEaidName(name) {
    return EAID_PATTERN.test(name);
  }

  function sanitizeName(name) {
    let cleaned = String(name || "").trim();
    cleaned = cleaned.replace(/\s+/g, "");
    cleaned = cleaned.replace(/[^a-zA-Z0-9]/g, "");

    if (cleaned.length > MAX_NAME_LENGTH) {
      cleaned = cleaned.slice(0, MAX_NAME_LENGTH);
    }

    if (!isValidEaidName(cleaned)) {
      return "";
    }

    return cleaned;
  }

  function normalizeWord(word) {
    return String(word || "").trim().toLowerCase();
  }

  function isUsableWord(word) {
    return /^[a-z]+$/.test(word) && word.length >= WORD_MIN_LENGTH && word.length <= WORD_MAX_LENGTH;
  }

  function filterWordList(words) {
    const unique = new Set();

    for (const raw of words) {
      const word = normalizeWord(raw);
      if (!isUsableWord(word)) {
        continue;
      }
      unique.add(word);
    }

    return Array.from(unique);
  }

  async function loadRemoteWords() {
    const response = await fetch(WORD_SOURCE_URL, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Failed to load words list (${response.status}).`);
    }

    const text = await response.text();
    return filterWordList(text.split(/\r?\n/));
  }

  async function ensureWordPool() {
    if (wordPool.length > 0) {
      return wordPool;
    }

    if (wordPoolLoadPromise) {
      return wordPoolLoadPromise;
    }

    wordPoolLoadPromise = (async () => {
      try {
        const remoteWords = await loadRemoteWords();
        if (remoteWords.length >= 200) {
          wordPool = remoteWords;
          return wordPool;
        }
      } catch (error) {
        // Fallback below.
      }

      wordPool = filterWordList(FALLBACK_WORD_POOL);
      return wordPool;
    })();

    const loaded = await wordPoolLoadPromise;
    wordPoolLoadPromise = null;
    return loaded;
  }

  function buildCandidateFromPool(pool) {
    for (let i = 0; i < 80; i += 1) {
      const left = capitalize(pick(pool));
      const right = capitalize(pick(pool));
      const base = `${left}${right}`;

      if (base.length < MIN_NAME_LENGTH || base.length > MAX_NAME_LENGTH) {
        continue;
      }

      let candidate = base;
      if (Math.random() < 0.55 && candidate.length <= MAX_NAME_LENGTH - 2) {
        const digits = String(Math.floor(Math.random() * 90) + 10);
        candidate = `${candidate}${digits}`;
      }

      if (isValidEaidName(candidate)) {
        return candidate;
      }
    }

    return "";
  }

  async function buildRandomName() {
    const pool = await ensureWordPool();

    for (let i = 0; i < 80; i += 1) {
      const candidate = buildCandidateFromPool(pool);
      if (candidate && isValidEaidName(candidate)) {
        return candidate;
      }
    }

    const fallback = `User${Math.floor(Math.random() * 9000) + 1000}`;
    return fallback.slice(0, MAX_NAME_LENGTH);
  }

  async function generateName(customName) {
    const custom = sanitizeName(customName);
    if (custom) {
      return custom;
    }

    let candidate = await buildRandomName();
    for (let i = 0; i < 12 && candidate === lastName; i += 1) {
      candidate = await buildRandomName();
    }

    return candidate;
  }

  function setInputValue(input, value) {
    const descriptor = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value");
    if (descriptor && descriptor.set) {
      descriptor.set.call(input, value);
    } else {
      input.value = value;
    }

    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function clickElement(element) {
    if (typeof element.click === "function") {
      element.click();
      return;
    }

    element.dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        view: window
      })
    );
  }

  function waitForElement(selector, timeoutMs = 12000) {
    const foundNow = findElement(selector);
    if (foundNow) {
      return Promise.resolve(foundNow);
    }

    return new Promise((resolve, reject) => {
      const stopAt = Date.now() + timeoutMs;

      const observer = new MutationObserver(() => {
        const found = findElement(selector);
        if (found) {
          clearInterval(poller);
          observer.disconnect();
          resolve(found);
        }
      });

      const poller = setInterval(() => {
        const found = findElement(selector);
        if (found) {
          clearInterval(poller);
          observer.disconnect();
          resolve(found);
          return;
        }

        if (Date.now() > stopAt) {
          clearInterval(poller);
          observer.disconnect();
          reject(new Error(`Element not found: ${selector}`));
        }
      }, 120);

      observer.observe(document.documentElement, {
        childList: true,
        subtree: true
      });
    });
  }

  function getVisibleEaidErrorMessage() {
    const errorNodes = Array.from(document.querySelectorAll(SELECTORS.inUseError));
    for (const node of errorNodes) {
      const text = (node.textContent || "").trim().toLowerCase();
      if (isElementVisible(node) && text.length > 0) {
        return text;
      }
    }

    return "";
  }

  function isRetryableEaidError(message) {
    const normalized = String(message || "").toLowerCase();
    return normalized.includes("already in use") || normalized.includes("enter a valid ea id");
  }

  async function cancelEditMode() {
    const cancelButton = findElement(SELECTORS.cancelButton) || (await waitForElement(SELECTORS.cancelButton, 2500).catch(() => null));
    if (!cancelButton) {
      return false;
    }

    clickElement(cancelButton);
    await sleep(220);
    return true;
  }

  async function waitForEnabled(button, timeoutMs = 7000) {
    if (!isDisabled(button)) {
      return;
    }

    const stopAt = Date.now() + timeoutMs;
    while (Date.now() <= stopAt) {
      if (!isDisabled(button)) {
        return;
      }
      await sleep(120);
    }

    throw new Error("Save button stayed disabled.");
  }

  async function runRename(customName = "") {
    if (runLock) {
      return { ok: false, error: "A run is already in progress." };
    }

    runLock = true;

    try {
      for (let attempt = 1; attempt <= MAX_RENAME_ATTEMPTS; attempt += 1) {
        const editButton = await waitForElement(SELECTORS.editButton, 12000);
        clickElement(editButton);
        await sleep(260);

        const input = await waitForElement(SELECTORS.input, 12000);
        const nameInputForAttempt = attempt === 1 ? customName : "";
        const newName = await generateName(nameInputForAttempt);

        input.focus();
        setInputValue(input, newName);
        await sleep(260);

        const saveButton = await waitForElement(SELECTORS.saveButton, 12000);
        await waitForEnabled(saveButton, 8000);
        clickElement(saveButton);
        await sleep(450);

        const eaErrorMessage = getVisibleEaidErrorMessage();
        if (eaErrorMessage) {
          const retryable = isRetryableEaidError(eaErrorMessage);
          await cancelEditMode();

          if (retryable && attempt < MAX_RENAME_ATTEMPTS) {
            await sleep(220);
            continue;
          }

          return {
            ok: false,
            error: eaErrorMessage,
            name: newName,
            retryable
          };
        }

        lastName = newName;
        runs += 1;

        return {
          ok: true,
          name: newName,
          runs
        };
      }

      return {
        ok: false,
        error: "Could not set a valid EA ID after multiple attempts.",
        retryable: true
      };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      };
    } finally {
      runLock = false;
    }
  }

  function getStatus() {
    return {
      running: loopTimer !== null,
      intervalMs: loopIntervalMs,
      runs,
      lastName
    };
  }

  function stopLoop() {
    if (loopTimer !== null) {
      clearInterval(loopTimer);
      loopTimer = null;
    }
    return getStatus();
  }

  function startLoop(intervalMs, customName) {
    stopLoop();

    const parsed = Number(intervalMs);
    loopIntervalMs = Number.isFinite(parsed) ? Math.max(MIN_LOOP_INTERVAL_MS, Math.floor(parsed)) : 60000;
    loopCustomName = typeof customName === "string" ? customName : "";

    loopTimer = setInterval(() => {
      void runRename(loopCustomName);
    }, loopIntervalMs);

    void runRename(loopCustomName);
    return getStatus();
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || typeof message.type !== "string") {
      return;
    }

    if (message.type === "RUN_ONCE") {
      runRename(message.customName).then(sendResponse);
      return true;
    }

    if (message.type === "START_LOOP") {
      const status = startLoop(message.intervalMs, message.customName);
      sendResponse({ ok: true, status });
      return;
    }

    if (message.type === "STOP_LOOP") {
      const status = stopLoop();
      sendResponse({ ok: true, status });
      return;
    }

    if (message.type === "GET_STATUS") {
      sendResponse({ ok: true, status: getStatus() });
    }
  });

  void ensureWordPool();
})();
