function retry(count) {
  return async function doRetry(fn, onRetry, tries = 0) {
    try {
      await fn();
    }
    catch (err) {
      if (tries !== count) await onRetry(tries);
      else throw err;
      await doRetry(fn, onRetry, tries + 1);
    }
  };
}

module.exports = retry;
