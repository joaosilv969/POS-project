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
