const test = require("node:test");
const assert = require("node:assert/strict");

const { createPaymentMethodService } = require("../src/services/payment-methods");

test("payment method service reuses active methods within the ttl", async () => {
  let calls = 0;
  const pool = {
    async execute(sql) {
      calls += 1;
      assert.equal(sql, "SELECT * FROM payment_methods WHERE active = 1 ORDER BY id");
      return [[{ id: 1, name: "Dinheiro", code: "cash", active: 1 }]];
    },
  };
  const service = createPaymentMethodService({ pool, ttlMs: 1000, now: () => 100 });

  const first = await service.getActivePaymentMethods();
  const second = await service.getActivePaymentMethods();

  assert.deepEqual(first, second);
  assert.equal(calls, 1);
});

test("payment method service returns the cached cash method id", async () => {
  const pool = {
    async execute() {
      return [[
        { id: 1, name: "Dinheiro", code: "cash", active: 1 },
        { id: 2, name: "Cartão", code: "card", active: 1 },
      ]];
    },
  };
  const service = createPaymentMethodService({ pool, ttlMs: 1000, now: () => 100 });

  assert.equal(await service.getCashPaymentMethodId(), 1);
});

test("payment method service refreshes after the ttl expires", async () => {
  let calls = 0;
  let currentTime = 100;
  const pool = {
    async execute() {
      calls += 1;
      return [[{ id: calls, name: "Dinheiro", code: "cash", active: 1 }]];
    },
  };
  const service = createPaymentMethodService({
    pool,
    ttlMs: 1000,
    now: () => currentTime,
  });

  assert.equal(await service.getCashPaymentMethodId(), 1);
  currentTime = 1200;
  assert.equal(await service.getCashPaymentMethodId(), 2);
  assert.equal(calls, 2);
});
