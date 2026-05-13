(() => {
  const root = document.querySelector("[data-merch]");
  if (!root) {
    return;
  }

  const cart = new Map();
  const formatter = new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" });
  const cartItems = root.querySelector("[data-cart-items]");
  const totalElements = [root.querySelector("[data-cart-total]")];
  const paymentMethod = root.querySelector("[data-payment-method]");
  const finishButton = root.querySelector("[data-finish-sale]");
  const clearButton = root.querySelector("[data-clear-cart]");
  const errorBox = root.querySelector("[data-pos-error]");
  const cashSection = root.querySelector("[data-cash-payment]");
  const cashReceived = root.querySelector("[data-cash-received]");
  const cashChange = root.querySelector("[data-cash-change]");
  const memberNumber = root.querySelector("[data-member-number]");
  const memberName = root.querySelector("[data-member-name]");
  const membersDatalist = root.querySelector("[data-members-datalist]");
  const endpoint = root.dataset.saleEndpoint || "/merchandising/sale";
  const membersEndpoint = root.dataset.membersEndpoint || "/api/members";
  const cashMethodId = String(root.dataset.cashMethodId || "1");
  const membersByName = new Map();
  const membersByNumber = new Map();

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
    return new Intl.NumberFormat("pt-PT", {
      style: "currency",
      currency: "EUR",
    }).format(amount);
  }

  function parseCurrency(value) {
    return parseFloat(value.replace(/[^\d,.-]/g, "").replace(",", ".")) || 0;
  }

  function updateChange() {
    const received = parseCurrency(cashReceived.value);
    const change = Math.max(0, received - total());
    cashChange.textContent = formatCurrency(change);
    finishButton.disabled = received < total() || received === 0;
  }

  function addToCashInput(value) {
    const current = cashReceived.value;
    if (value === "clear") {
      cashReceived.value = "";
    } else if (value === ",") {
      if (!current.includes(",")) {
        cashReceived.value = current + ",";
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

  function updateCashSection() {
    const isCash = paymentMethod.value === cashMethodId;
    cashSection.style.display = isCash ? "block" : "none";
    if (isCash && cashReceived) {
      cashReceived.focus();
      updateChange();
    } else {
      finishButton.disabled = false;
    }
  }

  paymentMethod.addEventListener("change", updateCashSection);
  updateCashSection();

  async function loadMembers() {
    if (!membersDatalist) {
      return;
    }

    try {
      const response = await fetch(membersEndpoint, { headers: { Accept: "application/json" } });
      const result = await response.json();
      if (!response.ok || !result.ok) {
        return;
      }

      clearElement(membersDatalist);
      membersByName.clear();
      membersByNumber.clear();

      result.members.forEach((member) => {
        const name = String(member.name || "").trim();
        const number = String(member.member_number || "").trim();
        if (!name || !number) {
          return;
        }

        const option = document.createElement("option");
        option.value = name;
        option.dataset.memberNumber = number;
        option.label = `${name} (${number})`;
        membersDatalist.appendChild(option);

        if (!membersByName.has(name)) {
          membersByName.set(name, number);
        }
        if (!membersByNumber.has(number)) {
          membersByNumber.set(number, name);
        }
      });
    } catch {
      // Ignore autocomplete failures
    }
  }

  if (memberName) {
    memberName.addEventListener("input", () => {
      const name = memberName.value.trim();
      const number = membersByName.get(name);
      if (number) {
        memberNumber.value = number;
      }
    });
  }

  if (memberNumber) {
    memberNumber.addEventListener("input", () => {
      const number = memberNumber.value.trim();
      const name = membersByNumber.get(number);
      if (name && (!memberName.value || memberName.value.trim() !== name)) {
        memberName.value = name;
      }
    });
  }

  if (cashReceived) {
    cashReceived.addEventListener("input", updateChange);
    cashReceived.addEventListener("keydown", (e) => {
      if (!/[0-9,.]|Backspace|Delete|Tab|Enter/.test(e.key)) {
        e.preventDefault();
      }
    });
  }

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
      empty.textContent = "Adicione produtos para iniciar a venda.";
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
      showError("Produto sem stock disponível.");
      return;
    }

    if (existing) {
      if (existing.quantity >= existing.stock) {
        showError("Não existe stock suficiente para aumentar a quantidade.");
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
      showError("Não existe stock suficiente para essa quantidade.");
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
      showError("Adicione produtos antes de finalizar.");
      return;
    }

    if (!memberNumber.value.trim() || !memberName.value.trim()) {
      showError("Nº sócio e nome do sócio são obrigatórios para vendas de merchandising.");
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
        member_number: memberNumber.value.trim(),
        member_name: memberName.value.trim(),
      };

      if (paymentMethod.value === cashMethodId) {
        const received = parseCurrency(cashReceived.value);
        if (received < total()) {
          throw new Error("Valor recebido insuficiente para o total da venda.");
        }
        payload.cash_received = received;
      }

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(result.message || "Não foi possível finalizar a venda.");
      }

      window.location.href = result.redirect;
    } catch (error) {
      showError(error.message);
      finishButton.disabled = false;
    }
  });

  renderCart();
  loadMembers();
})();
