export function UnsupportedScreen({ workers }: { workers: boolean }) {
  return (
    <main className="unsupported-screen">
      <div className="unsupported-card">
        <span className="eyebrow">Chromium + WebGPU Required</span>
        <h1>Blackframe Studio needs a desktop browser with WebGPU enabled.</h1>
        <p>
          This MVP targets Chrome and Edge on desktop first so preview compositing can run through the GPU.
          Worker support is {workers ? 'available' : 'not available'} on this browser.
        </p>
        <ul>
          <li>Use the latest Chrome or Edge on Windows, macOS, or Linux.</li>
          <li>Update graphics drivers if WebGPU should be available but is missing.</li>
          <li>Re-open the app after enabling any browser GPU flags.</li>
        </ul>
      </div>
    </main>
  );
}
