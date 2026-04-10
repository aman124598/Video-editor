import { useEffect, useState } from 'react';
import { AppShell } from './components/AppShell';
import { UnsupportedScreen } from './components/UnsupportedScreen';
import { detectCapabilities } from './lib/capabilities';
import { useEditorStore } from './store/editorStore';

export default function App() {
  const hydrate = useEditorStore((state) => state.hydrateProject);
  const [capabilities, setCapabilities] = useState({
    webgpu: false,
    workers: typeof Worker !== 'undefined',
    ready: false,
  });

  useEffect(() => {
    hydrate();
    detectCapabilities().then((result) => {
      setCapabilities({
        ...result,
        ready: true,
      });
    });
  }, [hydrate]);

  if (!capabilities.ready) {
    return <div className="boot-screen">Booting editor workspace…</div>;
  }

  if (!capabilities.webgpu) {
    return <UnsupportedScreen workers={capabilities.workers} />;
  }

  return <AppShell workersSupported={capabilities.workers} />;
}
