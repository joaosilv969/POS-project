const THEME_KEY = "app_theme";
const LEGACY_DARK_MODE_KEY = "app_dark_mode";

function normalizeTheme(theme) {
  return theme === "dark" ? "dark" : "light";
}

function getStoredTheme() {
  try {
    const theme = localStorage.getItem(THEME_KEY);
    if (theme === "dark" || theme === "light") {
      return theme;
    }

    const legacyDarkMode = localStorage.getItem(LEGACY_DARK_MODE_KEY);
    if (legacyDarkMode === "1" || legacyDarkMode === "0") {
      return legacyDarkMode === "1" ? "dark" : "light";
    }
  } catch {
    // ignore
  }

  return normalizeTheme(document.body.dataset.theme);
}

function persistTheme(theme) {
  try {
    localStorage.setItem(THEME_KEY, theme);
    localStorage.setItem(LEGACY_DARK_MODE_KEY, theme === "dark" ? "1" : "0");
  } catch {
    // ignore
  }

  document.cookie = `${THEME_KEY}=${theme}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

function updateThemeControls(theme) {
  document.querySelectorAll("[data-theme-option]").forEach((button) => {
    const isActive = normalizeTheme(button.dataset.themeOption) === theme;
    button.setAttribute("aria-pressed", isActive ? "true" : "false");
  });

  document.querySelectorAll("[data-dark-mode-toggle]").forEach((button) => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    const label =
      nextTheme === "dark"
        ? button.dataset.darkModeLabel || "Ativar modo escuro"
        : button.dataset.lightModeLabel || "Ativar modo claro";
    const labelTarget = button.querySelector("[data-theme-toggle-label]");

    button.setAttribute("aria-label", label);
    button.setAttribute("aria-pressed", theme === "dark" ? "true" : "false");
    button.setAttribute("title", label);

    if (labelTarget) {
      labelTarget.textContent = label;
    } else if (!button.hasAttribute("data-icon-only")) {
      button.textContent = label;
    }
  });
}

function setTheme(theme, shouldPersist = true) {
  const nextTheme = normalizeTheme(theme);
  document.documentElement.dataset.theme = nextTheme;
  document.body.dataset.theme = nextTheme;
  document.body.setAttribute("bgcolor", nextTheme === "dark" ? "#0b0b0d" : "#f3f3f4");

  const colorSchemeMeta = document.querySelector('meta[name="color-scheme"]');
  if (colorSchemeMeta) {
    colorSchemeMeta.setAttribute("content", nextTheme);
  }

  updateThemeControls(nextTheme);

  if (shouldPersist) {
    persistTheme(nextTheme);
  }
}

setTheme(getStoredTheme());

document.querySelectorAll("[data-theme-option]").forEach((button) => {
  button.addEventListener("click", () => {
    setTheme(button.dataset.themeOption);
  });
});

document.querySelectorAll("[data-dark-mode-toggle]").forEach((button) => {
  button.addEventListener("click", () => {
    setTheme(document.body.dataset.theme === "dark" ? "light" : "dark");
  });
});

document.querySelectorAll("[data-confirm]").forEach((form) => {
  form.addEventListener("submit", (event) => {
    const message = form.getAttribute("data-confirm");
    if (message && !window.confirm(message)) {
      event.preventDefault();
    }
  });
});

document.querySelectorAll("[data-image-input]").forEach((input) => {
  const preview = document.querySelector("[data-image-preview]");

  input.addEventListener("change", () => {
    const file = input.files && input.files[0];
    if (!file || !preview) {
      return;
    }

    const image = document.createElement("img");
    image.src = URL.createObjectURL(file);
    image.alt = file.name;
    image.onload = () => URL.revokeObjectURL(image.src);
    if (typeof preview.replaceChildren === "function") {
      preview.replaceChildren(image);
    } else {
      preview.textContent = "";
      preview.appendChild(image);
    }
  });
});

document.querySelectorAll("[data-print]").forEach((button) => {
  button.addEventListener("click", () => window.print());
});

document.querySelectorAll("[data-cash-closing]").forEach((root) => {
  const locale = root.dataset.locale || document.documentElement.lang || "pt-PT";
  const registeredTotal = Number(root.dataset.cashRegisteredTotal || 0);
  const storageKey = root.dataset.cashClosingKey || "cash-closing";
  const formatter = new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" });
  const openingInput = root.querySelector("[data-cash-opening]");
  const countedInput = root.querySelector("[data-cash-counted]");
  const denominationTotal = root.querySelector("[data-cash-denomination-total]");
  const expectedOutput = root.querySelector("[data-cash-expected]");
  const withdrawOutput = root.querySelector("[data-cash-withdraw]");
  const differenceOutput = root.querySelector("[data-cash-difference]");
  const differenceCard = root.querySelector("[data-cash-difference-card]");
  const clearButton = root.querySelector("[data-cash-closing-clear]");
  const denominationInputs = [...root.querySelectorAll("[data-cash-denomination]")];

  function parseCurrency(value) {
    const normalized = String(value || "").replace(/[^\d,.-]/g, "");
    const decimalValue = normalized.includes(",") ? normalized.replace(/\./g, "").replace(",", ".") : normalized;
    return Number(decimalValue) || 0;
  }

  function formatInputValue(value) {
    return Number(value || 0).toFixed(2).replace(".", ",");
  }

  function denominationsTotal() {
    return denominationInputs.reduce((sum, input) => {
      const unit = Number(input.dataset.cashDenomination || 0);
      const quantity = Math.max(0, Number.parseInt(input.value || "0", 10) || 0);
      return sum + unit * quantity;
    }, 0);
  }

  function readState() {
    return {
      opening: openingInput ? openingInput.value : "",
      counted: countedInput ? countedInput.value : "",
      denominations: denominationInputs.map((input) => input.value || ""),
    };
  }

  function saveState() {
    try {
      localStorage.setItem(storageKey, JSON.stringify(readState()));
    } catch {
      // ignore
    }
  }

  function updateClosing() {
    const opening = parseCurrency(openingInput ? openingInput.value : "");
    const counted = parseCurrency(countedInput ? countedInput.value : "");
    const countedByDenominations = denominationsTotal();
    const expected = opening + registeredTotal;
    const withdraw = counted - opening;
    const difference = counted - expected;

    if (denominationTotal) {
      denominationTotal.textContent = formatter.format(countedByDenominations);
    }
    if (expectedOutput) {
      expectedOutput.textContent = formatter.format(expected);
    }
    if (withdrawOutput) {
      withdrawOutput.textContent = formatter.format(withdraw);
    }
    if (differenceOutput) {
      differenceOutput.textContent = formatter.format(difference);
    }
    if (differenceCard) {
      differenceCard.classList.toggle("balanced", Math.abs(difference) < 0.01);
      differenceCard.classList.toggle("warning", Math.abs(difference) >= 0.01);
    }

    saveState();
  }

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || "null");
      if (!saved) {
        return;
      }
      if (openingInput) {
        openingInput.value = saved.opening || "";
      }
      if (countedInput) {
        countedInput.value = saved.counted || "";
      }
      denominationInputs.forEach((input, index) => {
        input.value = saved.denominations && saved.denominations[index] ? saved.denominations[index] : "";
      });
    } catch {
      // ignore
    }
  }

  denominationInputs.forEach((input) => {
    input.addEventListener("input", () => {
      if (countedInput) {
        countedInput.value = formatInputValue(denominationsTotal());
      }
      updateClosing();
    });
  });

  [openingInput, countedInput].forEach((input) => {
    if (input) {
      input.addEventListener("input", updateClosing);
    }
  });

  if (clearButton) {
    clearButton.addEventListener("click", () => {
      if (openingInput) {
        openingInput.value = "";
      }
      if (countedInput) {
        countedInput.value = "";
      }
      denominationInputs.forEach((input) => {
        input.value = "";
      });
      try {
        localStorage.removeItem(storageKey);
      } catch {
        // ignore
      }
      updateClosing();
    });
  }

  loadState();
  updateClosing();
});

document.querySelectorAll("[data-template-editor]").forEach((editor) => {
  editor.addEventListener("focusin", (event) => {
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
      editor.dataset.activeTarget = target.name;
    }
  });
});

document.querySelectorAll("[data-insert-variable]").forEach((button) => {
  button.addEventListener("click", () => {
    const editor = button.closest("[data-template-editor]");
    if (!editor) {
      return;
    }

    const targetName = editor.dataset.activeTarget || button.dataset.defaultTarget;
    const target = targetName ? editor.querySelector(`[name="${targetName}"]`) : null;
    const variable = button.dataset.insertVariable || "";

    if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) || !variable) {
      return;
    }

    const start = target.selectionStart ?? target.value.length;
    const end = target.selectionEnd ?? target.value.length;
    target.value = `${target.value.slice(0, start)}${variable}${target.value.slice(end)}`;
    const nextPosition = start + variable.length;
    target.focus();
    target.setSelectionRange(nextPosition, nextPosition);
    editor.dataset.activeTarget = target.name;
  });
});

const receipt = document.querySelector("[data-receipt-next-sale]");
if (receipt) {
  const nextSalePath = receipt.dataset.receiptNextSale;

  if (nextSalePath) {
    document.addEventListener("keydown", (event) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) {
        return;
      }

      if (event.key !== "Enter") {
        return;
      }

      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return;
      }

      event.preventDefault();
      window.location.href = nextSalePath;
    });
  }
}

// Mobile sidebar toggle
const burgerButton = document.querySelector(".burger-button");
const sidebar = document.querySelector(".sidebar");
const sidebarOverlay = document.querySelector(".sidebar-overlay");

if (burgerButton && sidebar && sidebarOverlay) {
  const toggleSidebar = () => {
    sidebar.classList.toggle("open");
    sidebarOverlay.classList.toggle("active");
    burgerButton.classList.toggle("active");
  };

  burgerButton.addEventListener("click", toggleSidebar);
  sidebarOverlay.addEventListener("click", toggleSidebar);

  // Close sidebar when clicking on a nav link (mobile)
  document.querySelectorAll(".nav-list a").forEach((link) => {
    link.addEventListener("click", () => {
      if (window.innerWidth <= 1080) {
        toggleSidebar();
      }
    });
  });
}
