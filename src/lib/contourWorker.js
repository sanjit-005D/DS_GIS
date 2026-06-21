import { generateContours } from './contourGenerator';

self.onmessage = (e) => {
  const { samples, options } = e.data;
  try {
    const result = generateContours(samples, options);
    self.postMessage({ type: 'SUCCESS', result });
  } catch (err) {
    self.postMessage({ type: 'ERROR', error: err.message });
  }
};
