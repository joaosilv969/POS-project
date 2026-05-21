(() => {
  const root = document.querySelector("[data-table-order]");
  if (!root) {
    return;
  }

  const locale = root.dataset.locale || document.documentElement.lang || "pt-PT";
  const messages = {
    updateTableError: root.dataset.updateTableError || "Não foi possível atualizar a mesa.",
    cashTotalError: root.dataset.cashTotalError || "Valor recebido insuficiente para o total da conta.",
  };
  const orderId = root.dataset.orderId;
  const errorBox = root.querySelector("[data-table-error]");
  const paymentMethod = root.querySelector("[data-payment-method]");
  const closeButton = root.querySelector("[data-close-table]");
  const cashSection = root.querySelector("[data-cash-payment]");
  const cashReceived = root.querySelector("[data-cash-received]");
  const cashChange = root.querySelector("[data-cash-change]");
  const totalAmount = parseFloat(root.dataset.total); // Total from server
  const cashMethodId = String(root.dataset.cashMethodId || "1");

  function showError(message) {
    if (!errorBox) {
      return;
    }

    errorBox.textContent = message;
    errorBox.hidden = !message;
  }

  function formatCurrency(amount) {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: "EUR"
    }).format(amount);
  }

  function parseCurrency(value) {
    // Remove currency symbols and convert commas to dots
    return parseFloat(value.replace(/[^\d,.-]/g, '').replace(',', '.')) || 0;
  }

  function updateChange() {
    const received = parseCurrency(cashReceived.value);
    const change = Math.max(0, received - totalAmount);
    cashChange.textContent = formatCurrency(change);

    // Update button state
    closeButton.disabled = received < totalAmount || received === 0;
  }

  function addToCashInput(value) {
    const current = cashReceived.value;
    if (value === 'clear') {
      cashReceived.value = '';
    } else if (value === ',') {
      if (!current.includes(',')) {
        cashReceived.value = current + ',';
      }
    } else {
      cashReceived.value = current + value;
    }
    updateChange();
  }

  async function postJson(url, payload) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json();

    if (!response.ok || !result.ok) {
      throw new Error(result.message || messages.updateTableError);
    }

    return result;
  }

  // Payment method change handler
  function updateCashSection() {
    const isCash = paymentMethod.value === cashMethodId;
    cashSection.style.display = isCash ? "block" : "none";
    if (isCash && cashReceived) {
      cashReceived.focus();
      // Calculate change if there's already a value
      updateChange();
    } else {
      closeButton.disabled = false;
    }
  }

  paymentMethod.addEventListener("change", updateCashSection);

  // Check initial state
  updateCashSection();

  // Cash received input handler
  if (cashReceived) {
    cashReceived.addEventListener("input", updateChange);
    cashReceived.addEventListener("keydown", (e) => {
      // Allow numbers, comma, backspace, delete, tab, enter
      if (!/[0-9,.]|Backspace|Delete|Tab|Enter/.test(e.key)) {
        e.preventDefault();
      }
    });
  }

  // Keypad buttons
  root.querySelectorAll("[data-key]").forEach((button) => {
    button.addEventListener("click", () => {
      addToCashInput(button.dataset.key);
    });
  });

  root.querySelectorAll("[data-table-product-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      button.disabled = true;
      showError("");

      try {
        await postJson(`/tables/orders/${orderId}/items`, {
          product_id: button.dataset.tableProductId,
          quantity: 1,
        });
        window.location.reload();
      } catch (error) {
        showError(error.message);
        button.disabled = false;
      }
    });
  });

  root.querySelectorAll("[data-table-item-id]").forEach((itemRow) => {
    const itemId = itemRow.dataset.tableItemId;
    const currentQuantity = Number(itemRow.querySelector("[data-current-qty]").textContent);

    itemRow.querySelectorAll("[data-table-qty]").forEach((button) => {
      button.addEventListener("click", async () => {
        showError("");

        try {
          await postJson(`/tables/orders/${orderId}/items/${itemId}`, {
            quantity: currentQuantity + Number(button.dataset.tableQty),
          });
          window.location.reload();
        } catch (error) {
          showError(error.message);
        }
      });
    });

    const removeButton = itemRow.querySelector("[data-table-remove]");
    if (removeButton) {
      removeButton.addEventListener("click", async () => {
        showError("");

        try {
          await postJson(`/tables/orders/${orderId}/items/${itemId}`, { quantity: 0 });
          window.location.reload();
        } catch (error) {
          showError(error.message);
        }
      });
    }
  });

  root.querySelectorAll("[data-category-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      const category = button.dataset.categoryFilter;
      root.querySelectorAll("[data-category-filter]").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");

      root.querySelectorAll("[data-table-product-id]").forEach((tile) => {
        const productCategory = String(tile.dataset.productCategory || "");
        const shouldShow = category === "all" || productCategory === String(category);
        tile.hidden = !shouldShow;
        tile.style.display = shouldShow ? "" : "none";
      });
    });
  });

  closeButton.addEventListener("click", async () => {
    closeButton.disabled = true;
    showError("");

    try {
      const payload = {
        payment_method_id: paymentMethod.value,
      };

      // Add cash received amount if payment method is cash
      if (paymentMethod.value === cashMethodId) {
        const received = parseCurrency(cashReceived.value);
        if (received < totalAmount) {
          throw new Error(messages.cashTotalError);
        }
        payload.cash_received = received;
      }

      const result = await postJson(`/tables/orders/${orderId}/close`, payload);
      window.location.href = result.redirect;
    } catch (error) {
      console.error("Erro ao fechar mesa:", error);
      showError(error.message);
      closeButton.disabled = false;
    }
  });
})();
