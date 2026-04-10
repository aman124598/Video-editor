import type { ReactNode } from 'react';
import { useMemo, useRef } from 'react';
import { useEditorStore } from '../store/editorStore';
import { formatTime } from '../lib/time';
import type { Asset, Overlay } from '../types/editor';

function TimelineItem({
  startTime,
  duration,
  selected,
  label,
  onSelect,
  onMove,
}: {
  startTime: number;
  duration: number;
  selected: boolean;
  label: string;
  onSelect: () => void;
  onMove: (nextStart: number) => void;
}) {
  const zoom = useEditorStore((state) => state.zoom);
  const dragStartRef = useRef<{ pointerX: number; itemStart: number } | null>(null);

  return (
    <button
      type="button"
      className={`timeline-item ${selected ? 'selected' : ''}`}
      style={{
        left: `${startTime * zoom}px`,
        width: `${Math.max(duration * zoom, 24)}px`,
      }}
      onClick={onSelect}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        dragStartRef.current = { pointerX: event.clientX, itemStart: startTime };
      }}
      onPointerMove={(event) => {
        if (!dragStartRef.current) {
          return;
        }
        const delta = (event.clientX - dragStartRef.current.pointerX) / zoom;
        onMove(Math.max(0, dragStartRef.current.itemStart + delta));
      }}
      onPointerUp={() => {
        dragStartRef.current = null;
      }}
    >
      <strong>{label}</strong>
      <small>{formatTime(duration)}</small>
    </button>
  );
}

function ticks(duration: number) {
  return Array.from({ length: Math.ceil(duration) + 1 }, (_, index) => index);
}

export function Timeline() {
  const project = useEditorStore((state) => state.project);
  const zoom = useEditorStore((state) => state.zoom);
  const playhead = useEditorStore((state) => state.playback.currentTime);
  const selectedClipId = useEditorStore((state) => state.selectedClipId);
  const selectedOverlayId = useEditorStore((state) => state.selectedOverlayId);
  const selectClip = useEditorStore((state) => state.selectClip);
  const selectOverlay = useEditorStore((state) => state.selectOverlay);
  const moveClip = useEditorStore((state) => state.moveClip);
  const moveOverlay = useEditorStore((state) => state.moveOverlay);
  const setPlayhead = useEditorStore((state) => state.setPlayhead);

  const width = useMemo(() => Math.max(project.duration * zoom + 120, 960), [project.duration, zoom]);

  return (
    <section className="panel timeline-panel">
      <div className="panel-header">
        <div>
          <span className="panel-kicker">Timeline</span>
          <h2>Primary + overlay lanes</h2>
        </div>
      </div>

      <div
        className="timeline-scroll"
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const nextTime = (event.clientX - rect.left + event.currentTarget.scrollLeft - 24) / zoom;
          setPlayhead(nextTime);
        }}
      >
        <div className="timeline-ruler" style={{ width }}>
          {ticks(project.duration).map((tick) => (
            <span key={tick} className="tick" style={{ left: `${tick * zoom}px` }}>
              {tick}s
            </span>
          ))}
          <div className="playhead" style={{ left: `${playhead * zoom}px` }} />
        </div>

        <Lane title="Video Track">
          {project.clips.map((clip) => {
            const asset = project.assets.find((item) => item.id === clip.assetId);
            return (
              <TimelineItem
                key={clip.id}
                startTime={clip.startTime}
                duration={clip.duration}
                selected={selectedClipId === clip.id}
                label={asset?.name ?? 'Missing asset'}
                onSelect={() => selectClip(clip.id)}
                onMove={(nextStart) => moveClip(clip.id, nextStart)}
              />
            );
          })}
        </Lane>

        <Lane title="Overlay Lane">
          {project.overlays.map((overlay) => (
            <TimelineItem
              key={overlay.id}
              startTime={overlay.startTime}
              duration={overlay.duration}
              selected={selectedOverlayId === overlay.id}
              label={getOverlayLabel(overlay, project.assets)}
              onSelect={() => selectOverlay(overlay.id)}
              onMove={(nextStart) => moveOverlay(overlay.id, nextStart)}
            />
          ))}
        </Lane>
      </div>
    </section>
  );
}

function Lane({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="timeline-lane">
      <div className="lane-title">{title}</div>
      <div className="lane-track">{children}</div>
    </div>
  );
}

function getOverlayLabel(overlay: Overlay, assets: Asset[]) {
  if (overlay.type === 'text') {
    return overlay.text;
  }
  const asset = assets.find((item) => item.id === overlay.assetId);
  return asset?.name ?? 'Image Overlay';
}
