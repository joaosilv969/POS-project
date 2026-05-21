const DARK_MODE_KEY = "app_dark_mode";

function setDarkMode(enabled) {
  document.body.dataset.theme = enabled ? "dark" : "light";
  document.querySelectorAll("[data-dark-mode-toggle]").forEach((button) => {
    button.textContent = enabled ? "Desativar dark mode" : "Ativar dark mode";
  });

  try {
    localStorage.setItem(DARK_MODE_KEY, enabled ? "1" : "0");
  } catch {
    // ignore
  }

  document.cookie = `app_theme=${enabled ? "dark" : "light"}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

function isDarkModeEnabled() {
  try {
    return localStorage.getItem(DARK_MODE_KEY) === "1";
  } catch {
    return false;
  }
}

setDarkMode(isDarkModeEnabled());

document.querySelectorAll("[data-dark-mode-toggle]").forEach((button) => {
  button.addEventListener("click", () => {
    setDarkMode(document.body.dataset.theme !== "dark");
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
