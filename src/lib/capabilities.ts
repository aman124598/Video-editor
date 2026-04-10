export async function detectCapabilities() {
  const workers = typeof Worker !== 'undefined';
  if (!('gpu' in navigator)) {
    return { webgpu: false, workers };
  }

  try {
    const gpu = navigator.gpu as GPU;
    const adapter = await gpu.requestAdapter();
    return { webgpu: Boolean(adapter), workers };
  } catch {
    return { webgpu: false, workers };
  }
}
