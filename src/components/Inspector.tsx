import type { ChangeEvent } from 'react';
import { useEditorStore } from '../store/editorStore';
import { formatTime } from '../lib/time';

export function Inspector() {
  const project = useEditorStore((state) => state.project);
  const selectedAssetId = useEditorStore((state) => state.selectedAssetId);
  const selectedClipId = useEditorStore((state) => state.selectedClipId);
  const selectedOverlayId = useEditorStore((state) => state.selectedOverlayId);
  const trimClip = useEditorStore((state) => state.trimClip);
  const updateTextOverlay = useEditorStore((state) => state.updateTextOverlay);
  const updateImageOverlay = useEditorStore((state) => state.updateImageOverlay);

  const selectedAsset = project.assets.find((asset) => asset.id === selectedAssetId);
  const selectedClip = project.clips.find((clip) => clip.id === selectedClipId);
  const selectedOverlay = project.overlays.find((overlay) => overlay.id === selectedOverlayId);

  return (
    <aside className="panel inspector">
      <div className="panel-header">
        <div>
          <span className="panel-kicker">Inspector</span>
          <h2>Properties</h2>
        </div>
      </div>

      {selectedClip ? (
        <div className="inspector-section">
          <h3>Selected Clip</h3>
          <p>Duration {formatTime(selectedClip.duration)}</p>
          <p>Source In {formatTime(selectedClip.sourceStart)}</p>
          <div className="inspector-grid">
            <button type="button" className="button" onClick={() => trimClip(selectedClip.id, 'start', -0.5)}>
              Trim Start -0.5s
            </button>
            <button type="button" className="button" onClick={() => trimClip(selectedClip.id, 'start', 0.5)}>
              Trim Start +0.5s
            </button>
            <button type="button" className="button" onClick={() => trimClip(selectedClip.id, 'end', -0.5)}>
              Trim End -0.5s
            </button>
            <button type="button" className="button" onClick={() => trimClip(selectedClip.id, 'end', 0.5)}>
              Trim End +0.5s
            </button>
          </div>
        </div>
      ) : null}

      {selectedOverlay ? (
        <div className="inspector-section">
          <h3>{selectedOverlay.type === 'text' ? 'Text Overlay' : 'Image Overlay'}</h3>
          <RangeField
            label="Start"
            min={0}
            max={project.duration}
            step={0.1}
            value={selectedOverlay.startTime}
            onChange={(value) => {
              if (selectedOverlay.type === 'text') {
                updateTextOverlay(selectedOverlay.id, { startTime: value });
              } else {
                updateImageOverlay(selectedOverlay.id, { startTime: value });
              }
            }}
          />
          <RangeField
            label="Duration"
            min={0.5}
            max={12}
            step={0.1}
            value={selectedOverlay.duration}
            onChange={(value) => {
              if (selectedOverlay.type === 'text') {
                updateTextOverlay(selectedOverlay.id, { duration: value });
              } else {
                updateImageOverlay(selectedOverlay.id, { duration: value });
              }
            }}
          />
          <RangeField
            label="X"
            min={0}
            max={90}
            step={1}
            value={selectedOverlay.x}
            onChange={(value) => {
              if (selectedOverlay.type === 'text') {
                updateTextOverlay(selectedOverlay.id, { x: value });
              } else {
                updateImageOverlay(selectedOverlay.id, { x: value });
              }
            }}
          />
          <RangeField
            label="Y"
            min={0}
            max={90}
            step={1}
            value={selectedOverlay.y}
            onChange={(value) => {
              if (selectedOverlay.type === 'text') {
                updateTextOverlay(selectedOverlay.id, { y: value });
              } else {
                updateImageOverlay(selectedOverlay.id, { y: value });
              }
            }}
          />

          {selectedOverlay.type === 'text' ? (
            <>
              <label className="field">
                <span>Text</span>
                <input
                  value={selectedOverlay.text}
                  onChange={(event: ChangeEvent<HTMLInputElement>) =>
                    updateTextOverlay(selectedOverlay.id, { text: event.target.value })
                  }
                />
              </label>
              <label className="field">
                <span>Color</span>
                <input
                  type="color"
                  value={selectedOverlay.color}
                  onChange={(event) => updateTextOverlay(selectedOverlay.id, { color: event.target.value })}
                />
              </label>
              <RangeField
                label="Font Size"
                min={18}
                max={84}
                step={2}
                value={selectedOverlay.fontSize}
                onChange={(value) => updateTextOverlay(selectedOverlay.id, { fontSize: value })}
              />
            </>
          ) : null}
        </div>
      ) : null}

      {!selectedClip && !selectedOverlay ? (
        <div className="inspector-section">
          <h3>Project Snapshot</h3>
          <p>{project.clips.length} clips in sequence</p>
          <p>{project.overlays.length} overlays staged</p>
          <p>{selectedAsset ? `${selectedAsset.name} is selected in the media bin.` : 'Select an asset, clip, or overlay to edit it.'}</p>
        </div>
      ) : null}
    </aside>
  );
}

function RangeField({
  label,
  min,
  max,
  step,
  value,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="field">
      <span>
        {label} <strong>{value.toFixed(1)}</strong>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}
