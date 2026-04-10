import type { ReactNode } from 'react';
import { useMemo } from 'react';
import { formatTime } from '../lib/time';
import { useEditorStore } from '../store/editorStore';
import type { Asset, Clip, Overlay, TimelineTrack } from '../types/editor';

type TrackItemData =
  | { id: string; kind: 'clip'; startTime: number; duration: number; label: string; tone: 'video' | 'audio' | 'effects'; selected: boolean; onSelect: () => void; onMove: (nextStart: number) => void }
  | { id: string; kind: 'overlay'; startTime: number; duration: number; label: string; tone: 'title' | 'video'; selected: boolean; onSelect: () => void; onMove: (nextStart: number) => void };

function TimelineItem({ item }: { item: TrackItemData }) {
  const zoom = useEditorStore((state) => state.zoom);

  return (
    <button
      type="button"
      className={`timeline-item tone-${item.tone} ${item.selected ? 'selected' : ''}`}
      style={{
        left: `${item.startTime * zoom}px`,
        width: `${Math.max(item.duration * zoom, 24)}px`,
      }}
      onClick={item.onSelect}
      onPointerDown={(event) => {
        const startX = event.clientX;
        const startTime = item.startTime;
        event.currentTarget.setPointerCapture(event.pointerId);

        const move = (moveEvent: PointerEvent) => {
          const delta = (moveEvent.clientX - startX) / zoom;
          item.onMove(Math.max(0, startTime + delta));
        };

        const release = () => {
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', release);
        };

        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', release, { once: true });
      }}
    >
      <strong>{item.label}</strong>
      <small>{formatTime(item.duration)}</small>
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
  const splitSelectedClip = useEditorStore((state) => state.splitSelectedClip);
  const addTextOverlay = useEditorStore((state) => state.addTextOverlay);
  const setZoom = useEditorStore((state) => state.setZoom);
  const toggleTrackMute = useEditorStore((state) => state.toggleTrackMute);

  const width = useMemo(() => Math.max(project.duration * zoom + 120, 960), [project.duration, zoom]);

  return (
    <section className="panel timeline-panel">
      <div className="panel-header">
        <div>
          <span className="panel-kicker">Timeline</span>
          <h2>Five-track editor</h2>
        </div>
        <div className="timeline-summary">
          <span>{project.assets.length} assets</span>
          <span>{project.clips.length} clips</span>
          <span>{project.overlays.length} overlays</span>
          <span>{formatTime(project.duration)}</span>
        </div>
      </div>

      <div className="timeline-toolbar">
        <button type="button" className="button" onClick={splitSelectedClip}>
          Split
        </button>
        <button type="button" className="button" onClick={addTextOverlay}>
          Transition
        </button>
        <button type="button" className="button">
          Markers
        </button>
        <button type="button" className="button">
          Capture
        </button>
        <button type="button" className="button">
          Snap
        </button>
        <button type="button" className="button" onClick={() => setZoom(120)}>
          Fit
        </button>
        <label className="zoom-control timeline-zoom">
          Zoom
          <select value={zoom} onChange={(event) => setZoom(Number(event.target.value))}>
            <option value={60}>1s</option>
            <option value={120}>5s</option>
            <option value={240}>30s</option>
          </select>
        </label>
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
              {formatTime(tick)}
            </span>
          ))}
          <div className="playhead" style={{ left: `${playhead * zoom}px` }} />
        </div>

        {project.tracks.map((track) => (
          <Lane key={track.id} track={track} onMute={() => toggleTrackMute(track.id)}>
            {buildTrackItems({
              track,
              clips: project.clips,
              overlays: project.overlays,
              assets: project.assets,
              selectedClipId,
              selectedOverlayId,
              selectClip,
              selectOverlay,
              moveClip,
              moveOverlay,
            }).map((item) => (
              <TimelineItem key={item.id} item={item} />
            ))}
          </Lane>
        ))}

        <div className="timeline-help">Tracks: main video, overlay video/PIP, titles, audio, and effects. Drag clips horizontally to retime.</div>
      </div>
    </section>
  );
}

function Lane({
  track,
  children,
  onMute,
}: {
  track: TimelineTrack;
  children: ReactNode;
  onMute: () => void;
}) {
  return (
    <div className="timeline-lane">
      <div className="lane-title lane-title-rich">
        <div>
          <strong>{track.label}</strong>
          <small>{track.kind}</small>
        </div>
        {track.muteable ? (
          <button type="button" className={`mute-toggle ${track.muted ? 'is-muted' : ''}`} onClick={onMute}>
            M
          </button>
        ) : null}
      </div>
      <div className="lane-track">{children}</div>
    </div>
  );
}

function buildTrackItems({
  track,
  clips,
  overlays,
  assets,
  selectedClipId,
  selectedOverlayId,
  selectClip,
  selectOverlay,
  moveClip,
  moveOverlay,
}: {
  track: TimelineTrack;
  clips: Clip[];
  overlays: Overlay[];
  assets: Asset[];
  selectedClipId: string | null;
  selectedOverlayId: string | null;
  selectClip: (clipId: string | null) => void;
  selectOverlay: (overlayId: string | null) => void;
  moveClip: (clipId: string, startTime: number) => void;
  moveOverlay: (overlayId: string, startTime: number) => void;
}) {
  if (track.id === 'track-video-1' || track.id === 'track-audio-1') {
    return clips
      .filter((clip) => clip.trackId === track.id)
      .map((clip) => {
        const asset = assets.find((item) => item.id === clip.assetId);
        return {
          id: clip.id,
          kind: 'clip' as const,
          startTime: clip.startTime,
          duration: clip.duration,
          label: asset?.name ?? 'Missing asset',
          tone: track.id === 'track-audio-1' ? ('audio' as const) : ('video' as const),
          selected: selectedClipId === clip.id,
          onSelect: () => selectClip(clip.id),
          onMove: (nextStart: number) => moveClip(clip.id, nextStart),
        };
      });
  }

  if (track.id === 'track-video-2') {
    return overlays
      .filter((overlay) => overlay.type === 'image')
      .map((overlay) => {
        const asset = assets.find((item) => item.id === overlay.assetId);
        return {
          id: overlay.id,
          kind: 'overlay' as const,
          startTime: overlay.startTime,
          duration: overlay.duration,
          label: asset?.name ?? 'Overlay',
          tone: 'video' as const,
          selected: selectedOverlayId === overlay.id,
          onSelect: () => selectOverlay(overlay.id),
          onMove: (nextStart: number) => moveOverlay(overlay.id, nextStart),
        };
      });
  }

  if (track.id === 'track-titles') {
    return overlays
      .filter((overlay) => overlay.type === 'text')
      .map((overlay) => ({
        id: overlay.id,
        kind: 'overlay' as const,
        startTime: overlay.startTime,
        duration: overlay.duration,
        label: overlay.text,
        tone: 'title' as const,
        selected: selectedOverlayId === overlay.id,
        onSelect: () => selectOverlay(overlay.id),
        onMove: (nextStart: number) => moveOverlay(overlay.id, nextStart),
      }));
  }

  return [];
}
