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
  const setPlaying = useEditorStore((state) => state.setPlaying);
  const nudgePlayhead = useEditorStore((state) => state.nudgePlayhead);
  const splitSelectedClip = useEditorStore((state) => state.splitSelectedClip);
  const duplicateSelection = useEditorStore((state) => state.duplicateSelection);
  const deleteSelection = useEditorStore((state) => state.deleteSelection);
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

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTypingTarget =
        target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;

      if (event.code === 'Space' && !isTypingTarget) {
        event.preventDefault();
        setPlaying(!playback.isPlaying);
        return;
      }

      if (isTypingTarget) {
        return;
      }

      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        deleteSelection();
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        nudgePlayhead(-1);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        nudgePlayhead(1);
      } else if (event.key.toLowerCase() === 's') {
        event.preventDefault();
        splitSelectedClip();
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd') {
        event.preventDefault();
        duplicateSelection();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [deleteSelection, duplicateSelection, nudgePlayhead, playback.isPlaying, setPlaying, splitSelectedClip]);

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
        <PreviewStage currentTime={playback.currentTime} />
        <MediaBin />
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
