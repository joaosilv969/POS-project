(() => {
  const root = document.querySelector("[data-pos]");
  if (!root) {
    return;
  }

  const locale = root.dataset.locale || document.documentElement.lang || "pt-PT";
  const messages = {
    emptyCart: root.dataset.emptyCartMessage || "Adicione produtos para iniciar a venda.",
    outOfStock: root.dataset.outOfStockMessage || "Produto sem stock disponível.",
    increaseStockError: root.dataset.increaseStockError || "Não existe stock suficiente para aumentar a quantidade.",
    quantityStockError: root.dataset.quantityStockError || "Não existe stock suficiente para essa quantidade.",
    missingItems: root.dataset.missingItemsMessage || "Adicione produtos antes de finalizar.",
    cashTotalError: root.dataset.cashTotalError || "Valor recebido insuficiente para o total da venda.",
    finishSaleError: root.dataset.finishSaleError || "Não foi possível finalizar a venda.",
  };
  const cart = new Map();
  const formatter = new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" });
  const cartItems = root.querySelector("[data-cart-items]") || document.querySelector("[data-cart-items]");
  const totalElements = [root.querySelector("[data-cart-total]")];
  const paymentMethod = root.querySelector("[data-payment-method]");
  const finishButton = root.querySelector("[data-finish-sale]");
  const clearButton = root.querySelector("[data-clear-cart]");
  const errorBox = root.querySelector("[data-pos-error]");
  const cashSection = root.querySelector("[data-cash-payment]");
  const cashReceived = root.querySelector("[data-cash-received]");
  const cashChange = root.querySelector("[data-cash-change]");
  const cashMethodId = String(root.dataset.cashMethodId || "1");

  if (!cartItems || !paymentMethod || !finishButton || !clearButton) {
    console.error("POS: missing required DOM elements", {
      cartItems: Boolean(cartItems),
      paymentMethod: Boolean(paymentMethod),
      finishButton: Boolean(finishButton),
      clearButton: Boolean(clearButton),
    });
    return;
  }

  function clearElement(element) {
    if (!element) {
      return;
    }

    if (typeof element.replaceChildren === "function") {
      element.replaceChildren();
      return;
    }

    while (element.firstChild) {
      element.removeChild(element.firstChild);
    }
  }

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
    const change = Math.max(0, received - total());
    cashChange.textContent = formatCurrency(change);

    // Update button state
    finishButton.disabled = received < total() || received === 0;
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

  function total() {
    return [...cart.values()].reduce((sum, item) => sum + item.price * item.quantity, 0);
  }

  function updateTotals() {
    totalElements.forEach((element) => {
      if (element) {
        element.textContent = formatter.format(total());
      }
    });
    // Update change if cash payment is selected
    if (cashReceived && paymentMethod.value === cashMethodId) {
      updateChange();
    }
  }

  function controlButton(label, onClick) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "qty-button";
    button.textContent = label;
    button.addEventListener("click", onClick);
    return button;
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
      // Non-cash payments should not block finishing the sale.
      finishButton.disabled = false;
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

  function renderCart() {
    clearElement(cartItems);

    if (cart.size === 0) {
      const empty = document.createElement("div");
      empty.className = "empty-cart";
      empty.textContent = messages.emptyCart;
      cartItems.appendChild(empty);
      updateTotals();
      return;
    }

    cart.forEach((item) => {
      const row = document.createElement("div");
      row.className = "cart-item";

      const info = document.createElement("div");
      const name = document.createElement("strong");
      name.textContent = item.name;
      const price = document.createElement("small");
      price.textContent = `${formatter.format(item.price)} · stock ${item.stock}`;
      info.append(name, price);

      const controls = document.createElement("div");
      controls.className = "qty-controls";
      controls.append(
        controlButton("-", () => changeQuantity(item.id, -1)),
        document.createTextNode(String(item.quantity)),
        controlButton("+", () => changeQuantity(item.id, 1)),
        controlButton("x", () => removeItem(item.id)),
      );

      const line = document.createElement("strong");
      line.textContent = formatter.format(item.price * item.quantity);

      row.append(info, controls, line);
      cartItems.appendChild(row);
    });

    updateTotals();
  }

  function addProduct(tile) {
    const id = Number(tile.dataset.productId);
    const existing = cart.get(id);
    const stock = Number(tile.dataset.productStock);

    if (stock <= 0) {
      showError(messages.outOfStock);
      return;
    }

    if (existing) {
      if (existing.quantity >= existing.stock) {
        showError(messages.increaseStockError);
        return;
      }

      existing.quantity += 1;
    } else {
      cart.set(id, {
        id,
        name: tile.dataset.productName,
        price: Number(tile.dataset.productPrice),
        stock,
        quantity: 1,
      });
    }

    showError("");
    renderCart();
  }

  function changeQuantity(id, delta) {
    const item = cart.get(id);
    if (!item) {
      return;
    }

    const nextQuantity = item.quantity + delta;
    if (nextQuantity <= 0) {
      cart.delete(id);
    } else if (nextQuantity <= item.stock) {
      item.quantity = nextQuantity;
    } else {
      showError(messages.quantityStockError);
    }

    renderCart();
  }

  function removeItem(id) {
    cart.delete(id);
    renderCart();
  }

  root.querySelectorAll("[data-product-id]").forEach((tile) => {
    tile.addEventListener("click", () => addProduct(tile));
  });

  root.querySelectorAll("[data-category-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      const category = button.dataset.categoryFilter;
      root.querySelectorAll("[data-category-filter]").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");

      root.querySelectorAll("[data-product-id]").forEach((tile) => {
        const productCategory = String(tile.dataset.productCategory || "");
        const shouldShow = category === "all" || productCategory === String(category);
        tile.hidden = !shouldShow;
        tile.style.display = shouldShow ? "" : "none";
      });
    });
  });

  clearButton.addEventListener("click", () => {
    cart.clear();
    showError("");
    renderCart();
  });

  finishButton.addEventListener("click", async () => {
    if (cart.size === 0) {
      showError(messages.missingItems);
      return;
    }

    finishButton.disabled = true;
    showError("");

    try {
      const payload = {
        payment_method_id: paymentMethod.value,
        items: [...cart.values()].map((item) => ({
          product_id: item.id,
          quantity: item.quantity,
        })),
      };

      // Add cash received amount if payment method is cash
      if (paymentMethod.value === cashMethodId) {
        const received = parseCurrency(cashReceived.value);
        if (received < total()) {
          throw new Error(messages.cashTotalError);
        }
        payload.cash_received = received;
      }

      const response = await fetch("/pos/sale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(result.message || messages.finishSaleError);
      }

      window.location.href = result.redirect;
    } catch (error) {
      showError(error.message);
      finishButton.disabled = false;
    }
  });

  renderCart();
})();
