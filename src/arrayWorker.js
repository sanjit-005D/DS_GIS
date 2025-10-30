// arrayWorker.js - runs in a Web Worker (module)
// Lightweight parsing of numeric arrays from strings/arrays sent from the main thread.

self.onmessage = function (e) {
  const { xRaw, yRaw } = e.data || {};

  const toNumArrayWorker = (val) => {
    if (val === null || val === undefined) return [];
    try {
      if (Array.isArray(val)) return val.map(v => Number(v)).filter(n => !Number.isNaN(n));
      if (typeof val === 'number') return [val];
      if (typeof val === 'string') {
        const t = val.trim();
        // try fast JSON.parse first
        if ((t.startsWith('[') && t.endsWith(']')) || (t.startsWith('{') && t.endsWith('}'))) {
          try {
            const parsed = JSON.parse(t);
            if (Array.isArray(parsed)) return parsed.map(v => Number(v)).filter(n => !Number.isNaN(n));
          } catch (e) {
            void e // fall through to regex extraction
          }
        }
        // regex fallback (handles numbers separated by commas/spaces)
        const matches = t.match(/-?\d+\.?\d*(?:e[+-]?\d+)?/ig);
        if (matches) return matches.map(Number).filter(n => !Number.isNaN(n));

        // last resort, split on commas/whitespace
        return t.replace(/^\[|\]$/g, '').split(/[,"]+|\s+/).filter(Boolean).map(Number).filter(n => !Number.isNaN(n));
      }
    } catch (err) { void err /* swallow errors in worker and return empty array so main thread can proceed */ }
    return [];
  };

  const xArr = toNumArrayWorker(xRaw);
  const yArr = toNumArrayWorker(yRaw);
  // Post back the parsed arrays
  self.postMessage({ xArr, yArr });
};
