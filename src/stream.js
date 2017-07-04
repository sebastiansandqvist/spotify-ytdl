function stream(initialValue = null) {
  const s = {
    value: initialValue,
    listeners: [],
  };
  s.map = function(cb) {
    if (s.listeners.indexOf(cb) === -1)
      s.listeners.push(cb);
  };
  s.set = async function(x) {
    s.value = x;
    for (let i = 0; i < s.listeners.length; i++)
      await s.listeners[i](x);
  };
  return s;
}

module.exports = stream;
