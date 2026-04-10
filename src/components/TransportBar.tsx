import { useMemo } from 'react';
import { formatTime } from '../lib/time';
import { useEditorStore } from '../store/editorStore';

export function TransportBar({ onOpenExport }: { onOpenExport: () => void }) {
  const playback = useEditorStore((state) => state.playback);
  const project = useEditorStore((state) => state.project);
  const statusMessage = useEditorStore((state) => state.statusMessage);
  const selectedAssetId = useEditorStore((state) => state.selectedAssetId);
  const setPlayhead = useEditorStore((state) => state.setPlayhead);
  const setPlaying = useEditorStore((state) => state.setPlaying);
  const splitSelectedClip = useEditorStore((state) => state.splitSelectedClip);
  const deleteSelection = useEditorStore((state) => state.deleteSelection);
  const addTextOverlay = useEditorStore((state) => state.addTextOverlay);
  const addImageOverlay = useEditorStore((state) => state.addImageOverlay);
  const setZoom = useEditorStore((state) => state.setZoom);
  const zoom = useEditorStore((state) => state.zoom);

  const clipCount = useMemo(() => project.clips.length, [project.clips.length]);

  return (
    <header className="transport-bar">
      <div className="brand-lockup">
        <span className="brand-badge">B+</span>
        <div>
          <h1>Blackframe Studio</h1>
          <p>Single-track WebGPU editor</p>
        </div>
      </div>

      <div className="transport-controls">
        <button type="button" className="button" onClick={() => setPlayhead(0)}>
          Start
        </button>
        <button type="button" className="button accent" onClick={() => setPlaying(!playback.isPlaying)}>
          {playback.isPlaying ? 'Pause' : 'Play'}
        </button>
        <button type="button" className="button" onClick={splitSelectedClip}>
          Split
        </button>
        <button type="button" className="button" onClick={deleteSelection}>
          Delete
        </button>
        <button type="button" className="button" onClick={addTextOverlay}>
          Text Overlay
        </button>
        <button
          type="button"
          className="button"
          onClick={() => {
            if (selectedAssetId) {
              addImageOverlay(selectedAssetId);
            }
          }}
        >
          Image Overlay
        </button>
      </div>

      <div className="transport-meta">
        <div className="time-readout">
          {formatTime(playback.currentTime)} / {formatTime(project.duration)}
        </div>
        <label className="zoom-control">
          Zoom
          <input
            type="range"
            min="60"
            max="240"
            step="10"
            value={zoom}
            onChange={(event) => setZoom(Number(event.target.value))}
          />
        </label>
        <button type="button" className="button accent" onClick={onOpenExport} disabled={clipCount === 0}>
          Export
        </button>
      </div>

      <div className="status-strip">{statusMessage}</div>
    </header>
  );
}
