import { useEffect, useMemo, useRef } from 'react';
import { formatTime } from '../lib/time';
import { useEditorStore } from '../store/editorStore';
import type { Asset, Clip, ImageOverlay, Overlay } from '../types/editor';

interface PreviewStageProps {
  currentTime: number;
}

function findActiveTrackClip(clips: Clip[], currentTime: number, trackId: string) {
  return clips.find(
    (clip) => clip.trackId === trackId && currentTime >= clip.startTime && currentTime <= clip.startTime + clip.duration,
  );
}

function findVisibleOverlays(overlays: Overlay[], currentTime: number) {
  return overlays.filter((overlay) => currentTime >= overlay.startTime && currentTime <= overlay.startTime + overlay.duration);
}

function getOverlayPositionStyles(overlay: Overlay) {
  const edgeOffset = '3%';
  const width = `${overlay.width}%`;
  const height = `${overlay.height}%`;

  switch (overlay.anchor) {
    case 'top-left':
      return { left: edgeOffset, top: edgeOffset, width, height };
    case 'top-right':
      return { right: edgeOffset, top: edgeOffset, width, height };
    case 'bottom-left':
      return { left: edgeOffset, bottom: edgeOffset, width, height };
    case 'bottom-right':
      return { right: edgeOffset, bottom: edgeOffset, width, height };
    default:
      return { left: `${overlay.x}%`, top: `${overlay.y}%`, width, height };
  }
}

export function PreviewStage({ currentTime }: PreviewStageProps) {
  const project = useEditorStore((state) => state.project);
  const playback = useEditorStore((state) => state.playback);
  const setPlayhead = useEditorStore((state) => state.setPlayhead);
  const setPlaying = useEditorStore((state) => state.setPlaying);
  const nudgePlayhead = useEditorStore((state) => state.nudgePlayhead);
  const overlays = useMemo(() => findVisibleOverlays(project.overlays, currentTime), [project.overlays, currentTime]);
  const activeVideoClip = useMemo(
    () => findActiveTrackClip(project.clips, currentTime, 'track-video-1'),
    [project.clips, currentTime],
  );
  const activeAudioClip = useMemo(
    () => findActiveTrackClip(project.clips, currentTime, 'track-audio-1'),
    [project.clips, currentTime],
  );
  const activeVideoAsset = useMemo(
    () => project.assets.find((asset) => asset.id === activeVideoClip?.assetId),
    [project.assets, activeVideoClip?.assetId],
  );
  const activeAudioAsset = useMemo(
    () => project.assets.find((asset) => asset.id === activeAudioClip?.assetId),
    [project.assets, activeAudioClip?.assetId],
  );
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !activeVideoClip || activeVideoAsset?.type !== 'video') {
      return;
    }

    const clipTime = Math.max(0, activeVideoClip.sourceStart + (currentTime - activeVideoClip.startTime));
    if (Math.abs(video.currentTime - clipTime) > 0.08) {
      video.currentTime = clipTime;
    }
  }, [activeVideoAsset?.type, activeVideoClip, currentTime]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !activeAudioClip || activeAudioAsset?.type !== 'audio') {
      return;
    }

    const clipTime = Math.max(0, activeAudioClip.sourceStart + (currentTime - activeAudioClip.startTime));
    if (Math.abs(audio.currentTime - clipTime) > 0.08) {
      audio.currentTime = clipTime;
    }
    audio.volume = activeAudioClip.muted ? 0 : activeAudioClip.volume ?? 1;
    audio.playbackRate = activeAudioClip.playbackRate ?? 1;
  }, [activeAudioAsset?.type, activeAudioClip, currentTime]);

  useEffect(() => {
    const video = videoRef.current;
    if (video && activeVideoClip && activeVideoAsset?.type === 'video') {
      if (playback.isPlaying) {
        void video.play().catch(() => undefined);
      } else {
        video.pause();
      }
    }

    const audio = audioRef.current;
    if (audio && activeAudioClip && activeAudioAsset?.type === 'audio') {
      if (playback.isPlaying) {
        void audio.play().catch(() => undefined);
      } else {
        audio.pause();
      }
    }
  }, [
    activeAudioAsset?.type,
    activeAudioClip,
    activeVideoAsset?.type,
    activeVideoClip,
    playback.isPlaying,
  ]);

  return (
    <section className="panel preview-stage">
      <div className="panel-header preview-header">
        <div>
          <span className="panel-kicker">Preview</span>
          <h2>Program monitor</h2>
        </div>
        <div className="pill">{activeVideoAsset?.name ?? activeAudioAsset?.name ?? 'No clip at playhead'}</div>
      </div>

      <div className="stage-frame">
        {activeVideoAsset?.type === 'video' ? (
          <video
            key={activeVideoClip?.id}
            ref={videoRef}
            className="preview-media"
            src={activeVideoAsset.objectUrl}
            playsInline
            preload="auto"
          />
        ) : activeVideoAsset?.type === 'image' ? (
          <img className="preview-media" src={activeVideoAsset.objectUrl} alt="" />
        ) : (
          <div className="preview-empty-surface" />
        )}

        {activeAudioAsset?.type === 'audio' ? (
          <audio key={activeAudioClip?.id} ref={audioRef} src={activeAudioAsset.objectUrl} preload="auto" />
        ) : null}

        <div className="overlay-layer">
          {overlays.map((overlay) =>
            overlay.type === 'text' ? (
              <div
                key={overlay.id}
                className="text-overlay"
                style={{
                  ...getOverlayPositionStyles(overlay),
                  opacity: overlay.opacity,
                  color: overlay.color,
                  fontSize: `${overlay.fontSize}px`,
                }}
              >
                {overlay.text}
              </div>
            ) : (
              <ImageOverlayView key={overlay.id} overlay={overlay} assets={project.assets} />
            ),
          )}
          {!activeVideoAsset && !activeAudioAsset ? (
            <div className="stage-placeholder">Import media and add it to the timeline to preview.</div>
          ) : null}
        </div>
      </div>

      <div className="preview-controls">
        <button
          type="button"
          className="preview-jump-button"
          onClick={() => setPlayhead(0)}
          aria-label="Jump to start"
        >
          |◀
        </button>
        <button type="button" className="preview-jump-button" onClick={() => nudgePlayhead(-1 / playback.fps)}>
          ◀
        </button>
        <button
          type="button"
          className="minimal-play-button"
          onClick={() => setPlaying(!playback.isPlaying)}
          aria-label={playback.isPlaying ? 'Pause preview' : 'Play preview'}
        >
          {playback.isPlaying ? 'Pause' : 'Play'}
        </button>
        <button type="button" className="preview-jump-button" onClick={() => nudgePlayhead(1 / playback.fps)}>
          ▶
        </button>
        <button type="button" className="preview-jump-button" onClick={() => setPlayhead(project.duration)}>
          ▶|
        </button>
        <input
          className="preview-scrubber"
          type="range"
          min={0}
          max={project.duration || 0}
          step={0.01}
          value={currentTime}
          onChange={(event) => setPlayhead(Number(event.target.value))}
        />
        <div className="preview-time-readout">
          {formatTime(currentTime)} / {formatTime(project.duration)}
        </div>
      </div>
    </section>
  );
}

function ImageOverlayView({ overlay, assets }: { overlay: ImageOverlay; assets: Asset[] }) {
  const asset = assets.find((item) => item.id === overlay.assetId);
  if (!asset?.objectUrl) {
    return null;
  }

  return (
    <img
      className="image-overlay"
      src={asset.objectUrl}
      alt=""
      style={{
        ...getOverlayPositionStyles(overlay),
        opacity: overlay.opacity,
      }}
    />
  );
}
