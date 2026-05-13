(() => {
  const STORAGE_KEY = "vk_enabled";

  function isKeyboardEnabled() {
    try {
      return localStorage.getItem(STORAGE_KEY) !== "0";
    } catch {
      return true;
    }
  }

  function setKeyboardEnabled(enabled) {
    try {
      localStorage.setItem(STORAGE_KEY, enabled ? "1" : "0");
    } catch {
      // ignore
    }
  }

  const SELECTOR = [
    "input:not([type])",
    "input[type='text']",
    "input[type='email']",
    "input[type='password']",
    "input[type='search']",
    "input[type='tel']",
    "input[type='url']",
    "textarea",
    "[contenteditable='true']",
  ].join(",");

  function isEditableTextTarget(element) {
    if (!(element instanceof HTMLElement)) {
      return false;
    }

    if (!isKeyboardEnabled()) {
      return false;
    }

    if (!element.matches(SELECTOR)) {
      return false;
    }

    if (element.closest("[data-virtual-keyboard='off']")) {
      return false;
    }

    if (element instanceof HTMLInputElement) {
      const type = (element.getAttribute("type") || "text").toLowerCase();
      if (type === "hidden" || type === "file" || type === "date" || type === "time") {
        return false;
      }

      if (element.readOnly || element.disabled) {
        return false;
      }

      // Cash inputs use a dedicated keypad.
      if (element.dataset.cashReceived !== undefined) {
        return false;
      }

      const inputMode = (element.getAttribute("inputmode") || "").toLowerCase();
      if (inputMode === "decimal" || inputMode === "numeric") {
        return false;
      }
    }

    if (element instanceof HTMLTextAreaElement) {
      if (element.readOnly || element.disabled) {
        return false;
      }
    }

    return true;
  }

  function createKey(label, { value, action, wide } = {}) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `vk-key${wide ? " wide" : ""}`;
    button.textContent = label;
    if (value !== undefined) {
      button.dataset.vkValue = value;
    }
    if (action) {
      button.dataset.vkAction = action;
    }
    return button;
  }

  function rowsForMode({ symbols, upper, numeric }) {
    if (numeric) {
      return [
        ["1", "2", "3"],
        ["4", "5", "6"],
        ["7", "8", "9"],
        ["0"],
      ];
    }

    if (symbols) {
      return [
        ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
        ["@", "#", "€", "&", "-", "_", "(", ")", "/", ":"],
        [".", ",", "?", "!", "\"", "'", "+", "*", "=", "%"],
      ];
    }

    const r1 = ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"];
    const r2 = ["a", "s", "d", "f", "g", "h", "j", "k", "l", "ç"];
    const r3 = ["z", "x", "c", "v", "b", "n", "m"];

    const applyCase = (k) => (upper ? k.toUpperCase() : k);
    return [r1.map(applyCase), r2.map(applyCase), r3.map(applyCase)];
  }

  function setSelectionValue(input, nextValue, nextCursorIndex) {
    input.value = nextValue;
    if (typeof nextCursorIndex === "number") {
      try {
        input.setSelectionRange(nextCursorIndex, nextCursorIndex);
      } catch {
        // Some browsers may throw if the input isn't focusable at the moment.
      }
    }
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function insertText(target, text) {
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
      const start = typeof target.selectionStart === "number" ? target.selectionStart : target.value.length;
      const end = typeof target.selectionEnd === "number" ? target.selectionEnd : target.value.length;
      const next = target.value.slice(0, start) + text + target.value.slice(end);
      setSelectionValue(target, next, start + text.length);
      return;
    }

    if (target.isContentEditable) {
      document.execCommand("insertText", false, text);
    }
  }

  function backspace(target) {
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
      const start = typeof target.selectionStart === "number" ? target.selectionStart : target.value.length;
      const end = typeof target.selectionEnd === "number" ? target.selectionEnd : target.value.length;
      if (start !== end) {
        const next = target.value.slice(0, start) + target.value.slice(end);
        setSelectionValue(target, next, start);
        return;
      }
      if (start <= 0) {
        return;
      }
      const next = target.value.slice(0, start - 1) + target.value.slice(end);
      setSelectionValue(target, next, start - 1);
      return;
    }

    if (target.isContentEditable) {
      document.execCommand("delete", false);
    }
  }

  function enter(target) {
    if (target instanceof HTMLTextAreaElement) {
      insertText(target, "\n");
      return;
    }

    const form = (target && target.form) || (target && target.closest ? target.closest("form") : null);
    if (form) {
      // Mobile-like behavior: go to next field; submit only on last field.
      const fields = Array.from(form.querySelectorAll("input, textarea")).filter((element) => {
        if (!(element instanceof HTMLElement)) {
          return false;
        }
        if (element instanceof HTMLTextAreaElement) {
          return !element.disabled && !element.readOnly;
        }
        if (element instanceof HTMLInputElement) {
          const type = (element.getAttribute("type") || "text").toLowerCase();
          if (
            type === "hidden" ||
            type === "file" ||
            type === "checkbox" ||
            type === "radio" ||
            type === "date" ||
            type === "time" ||
            type === "number"
          ) {
            return false;
          }
          return !element.disabled && !element.readOnly;
        }
        return false;
      });

      const index = fields.indexOf(target);
      if (index >= 0 && index < fields.length - 1) {
        safeFocus(fields[index + 1]);
        return;
      }

      const submitButton = form.querySelector("button[type='submit'], input[type='submit']");
      if (typeof form.requestSubmit === "function") {
        form.requestSubmit(submitButton || undefined);
        return;
      }
      if (submitButton && typeof submitButton.click === "function") {
        submitButton.click();
        return;
      }
      if (typeof form.submit === "function") {
        form.submit();
        return;
      }
    }

    const event = new KeyboardEvent("keydown", {
      key: "Enter",
      code: "Enter",
      keyCode: 13,
      which: 13,
      bubbles: true,
      cancelable: true,
    });
    target.dispatchEvent(event);
  }

  function createKeyboardUI() {
    const overlay = document.createElement("div");
    overlay.className = "vk-overlay";
    overlay.hidden = true;

    const modal = document.createElement("div");
    modal.className = "vk-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-label", "Teclado no ecrã");

    const handle = document.createElement("div");
    handle.className = "vk-handle";

    const header = document.createElement("div");
    header.className = "vk-header";

    const title = document.createElement("strong");
    title.textContent = "Teclado";

    const close = createKey("Fechar", { action: "close", wide: true });
    close.classList.add("vk-close");

    header.append(title, close);

    const keys = document.createElement("div");
    keys.className = "vk-keys";

    modal.append(handle, header, keys);
    overlay.append(modal);
    document.body.append(overlay);

    return { overlay, keys };
  }

  const { overlay, keys } = createKeyboardUI();

  let activeTarget = null;
  let symbols = false;
  let upper = false;
  let numeric = false;

  function renderKeys() {
    keys.textContent = "";

    const rows = rowsForMode({ symbols, upper, numeric });
    rows.forEach((row) => {
      const rowEl = document.createElement("div");
      rowEl.className = "vk-row";
      row.forEach((label) => rowEl.append(createKey(label, { value: label })));
      keys.append(rowEl);
    });

    const rowActions = document.createElement("div");
    rowActions.className = "vk-row";

    if (numeric) {
      rowActions.append(
        createKey("⌫", { action: "backspace", wide: true }),
        createKey("Enter", { action: "enter", wide: true }),
      );
    } else {
      rowActions.append(
        createKey(symbols ? "ABC" : "123", { action: "toggleSymbols", wide: true }),
        createKey(upper ? "abc" : "ABC", { action: "toggleCase", wide: true }),
        createKey("Espaço", { value: " ", wide: true }),
        createKey("⌫", { action: "backspace", wide: true }),
        createKey("Enter", { action: "enter", wide: true }),
      );
    }

    keys.append(rowActions);

    // Map button presses explicitly (like the cash keypad) for maximum compatibility.
    overlay.querySelectorAll("button.vk-key").forEach((button) => {
      const handler = (event) => {
        try {
          if (!activeTarget) {
            return;
          }

          // Some Firefox touchscreen setups don't dispatch mousedown/click reliably,
          // but they do dispatch mouseup/touchend. Support those while avoiding repeats.
          const now = Date.now();
          const lastHandledAt = Number(button.dataset.vkHandledAt || "0");
          if (now - lastHandledAt < 250) {
            return;
          }
          button.dataset.vkHandledAt = String(now);

          // Keep focus/selection in the target.
          if (event && typeof event.preventDefault === "function") {
            event.preventDefault();
          }
          if (event && typeof event.stopPropagation === "function") {
            event.stopPropagation();
          }

          const action = button.dataset.vkAction;
          const value = button.dataset.vkValue;

          if (action === "close") {
            closeKeyboard();
            return;
          }

          if (action === "toggleSymbols") {
            symbols = !symbols;
            renderKeys();
            return;
          }

          if (action === "toggleCase") {
            upper = !upper;
            renderKeys();
            return;
          }

          if (action === "backspace") {
            backspace(activeTarget);
            return;
          }

          if (action === "enter") {
            enter(activeTarget);
            return;
          }

          if (typeof value === "string") {
            insertText(activeTarget, value);
          }

          safeFocus(activeTarget);
        } catch {
          // Ignore input/selection edge-case errors in specific browsers.
        }
      };

      button.addEventListener("pointerdown", handler);
      // Avoid options-object here for older browsers/Firefox ESR.
      button.addEventListener("touchstart", handler);
      button.addEventListener("touchend", handler);
      button.addEventListener("mousedown", handler);
      button.addEventListener("mouseup", handler);
      button.addEventListener("click", handler);
    });
  }

  function updateBodyPadding() {
    if (!overlay.hidden) {
      document.body.style.paddingBottom = `${overlay.offsetHeight}px`;
    } else {
      document.body.style.paddingBottom = "";
    }
  }

  function openKeyboardFor(target) {
    activeTarget = target;
    numeric = target instanceof HTMLInputElement && target.type === "number";
    overlay.hidden = false;
    overlay.classList.add("active");
    try {
      renderKeys();
    } catch (error) {
      keys.textContent = "Erro ao carregar teclado.";
      console.error("Virtual keyboard render failed", error);
    }

    updateBodyPadding();

    if (activeTarget && typeof activeTarget.scrollIntoView === "function") {
      activeTarget.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
    }

    // Keep focus on the edited element so selection/validation keeps working.
    safeFocus(activeTarget);
  }

  function closeKeyboard() {
    overlay.hidden = true;
    overlay.classList.remove("active");
    activeTarget = null;
    symbols = false;
    upper = false;
    numeric = false;
    updateBodyPadding();
  }

  function safeFocus(target) {
    if (target && typeof target.focus === "function") {
      try {
        target.focus({ preventScroll: true });
      } catch {
        target.focus();
      }
    }
  }

  document.addEventListener(
    "focusin",
    (event) => {
      const target = event.target;
      if (!isEditableTextTarget(target)) {
        return;
      }
      openKeyboardFor(target);
    },
    true,
  );

  // Optional toggle (e.g. on login page)
  const toggles = Array.from(document.querySelectorAll("[data-vk-toggle]"));
  if (toggles.length > 0) {
    const sync = () => {
      const enabled = isKeyboardEnabled();
      toggles.forEach((toggle) => {
        toggle.checked = enabled;
      });
    };

    sync();
    toggles.forEach((toggle) => {
      toggle.addEventListener("change", () => {
        setKeyboardEnabled(Boolean(toggle.checked));
        sync();
        if (!toggle.checked) {
          closeKeyboard();
        }
      });
    });
  }

  document.addEventListener(
    "focusout",
    (event) => {
      if (!overlay.classList.contains("active")) {
        return;
      }

      // If focus moves inside the virtual keyboard, keep editing the same input.
      const next = event.relatedTarget;
      if (next instanceof Node && overlay.contains(next)) {
        safeFocus(activeTarget);
      }
    },
    true,
  );

  // Backdrop press closes.
  const closeOnBackdrop = (event) => {
    if (event.target === overlay) {
      closeKeyboard();
    }
  };

  overlay.addEventListener("pointerdown", closeOnBackdrop);
  overlay.addEventListener("pointerup", closeOnBackdrop);
  overlay.addEventListener("touchstart", closeOnBackdrop);
  overlay.addEventListener("touchend", closeOnBackdrop);
  overlay.addEventListener("mousedown", closeOnBackdrop);
  overlay.addEventListener("mouseup", closeOnBackdrop);
  overlay.addEventListener("click", closeOnBackdrop);

  document.addEventListener("keydown", (event) => {
    if (!overlay.classList.contains("active")) {
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      closeKeyboard();
    }
  });
})();
