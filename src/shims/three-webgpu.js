// Shim for three/webgpu when not available in the installed Three build.
// Export minimal placeholders so imports succeed during bundling.
export const StorageInstancedBufferAttribute = undefined
export const WebGPURenderer = undefined
