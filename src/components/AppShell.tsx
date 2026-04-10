import { useEffect, useRef, useState } from 'react';
import { ExportDialog } from './ExportDialog';
import { Inspector } from './Inspector';
import { MediaBin } from './MediaBin';
import { PreviewStage } from './PreviewStage';
import { Timeline } from './Timeline';
import { TransportBar } from './TransportBar';
import { useEditorStore } from '../store/editorStore';
import { startExport } from '../services/export/exportService';

export function AppShell({ workersSupported }: { workersSupported: boolean }) {
  const playback = useEditorStore((state) => state.playback);
  const tickPlayback = useEditorStore((state) => state.tickPlayback);
  const exportJob = useEditorStore((state) => state.exportJob);
  const project = useEditorStore((state) => state.project);
  const setExportJob = useEditorStore((state) => state.setExportJob);
  const [exportOpen, setExportOpen] = useState(false);
  const cancelExportRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    let frameId = 0;
    let previous = performance.now();

    const loop = (now: number) => {
      const deltaSeconds = (now - previous) / 1000;
      previous = now;
      tickPlayback(deltaSeconds);
      frameId = requestAnimationFrame(loop);
    };

    frameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frameId);
  }, [tickPlayback]);

  useEffect(() => () => cancelExportRef.current?.(), []);

  const handleExport = () => {
    if (!workersSupported) {
      setExportJob({
        status: 'failed',
        progress: 1,
        message: 'Exports require Web Worker support.',
      });
      setExportOpen(true);
      return;
    }

    cancelExportRef.current?.();
    setExportJob({
      status: 'queued',
      progress: 0,
      message: 'Preparing export…',
      outputUrl: undefined,
      error: undefined,
    });
    setExportOpen(true);
    cancelExportRef.current = startExport(project, (job) => setExportJob(job));
  };

  return (
    <div className="editor-shell">
      <TransportBar onOpenExport={handleExport} />
      <div className="workspace-grid">
        <MediaBin />
        <PreviewStage currentTime={playback.currentTime} />
        <Inspector />
        <Timeline />
      </div>
      <ExportDialog
        open={exportOpen}
        job={exportJob}
        onClose={() => setExportOpen(false)}
        onCancel={() => cancelExportRef.current?.()}
      />
    </div>
  );
}
