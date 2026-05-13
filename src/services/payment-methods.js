function createPaymentMethodService({ pool, ttlMs = 30_000, now = () => Date.now() }) {
  let cachedMethods = null;
  let cachedAt = 0;

  function isFresh() {
    return cachedMethods && now() - cachedAt < ttlMs;
  }

  async function getActivePaymentMethods() {
    if (isFresh()) {
      return cachedMethods;
    }

    const [methods] = await pool.execute("SELECT * FROM payment_methods WHERE active = 1 ORDER BY id");
    cachedMethods = methods;
    cachedAt = now();
    return cachedMethods;
  }

  async function getCashPaymentMethodId(fallback = null) {
    const methods = await getActivePaymentMethods();
    const cashMethod = methods.find((method) => method.code === "cash");
    return cashMethod ? cashMethod.id : fallback;
  }

  function clearCache() {
    cachedMethods = null;
    cachedAt = 0;
  }

  return {
    clearCache,
    getActivePaymentMethods,
    getCashPaymentMethodId,
  };
}

module.exports = {
  createPaymentMethodService,
};
