import type { ChangeEvent, ReactNode } from 'react';
import { formatTime } from '../lib/time';
import { useEditorStore } from '../store/editorStore';
import type { OverlayAnchor } from '../types/editor';

const overlayAnchors: OverlayAnchor[] = ['free', 'top-left', 'top-right', 'bottom-left', 'bottom-right'];

export function Inspector() {
  const project = useEditorStore((state) => state.project);
  const selectedAssetId = useEditorStore((state) => state.selectedAssetId);
  const selectedClipId = useEditorStore((state) => state.selectedClipId);
  const selectedOverlayId = useEditorStore((state) => state.selectedOverlayId);
  const trimClip = useEditorStore((state) => state.trimClip);
  const updateClip = useEditorStore((state) => state.updateClip);
  const updateTextOverlay = useEditorStore((state) => state.updateTextOverlay);
  const updateImageOverlay = useEditorStore((state) => state.updateImageOverlay);
  const snapOverlayToAnchor = useEditorStore((state) => state.snapOverlayToAnchor);
  const addAssetToTimeline = useEditorStore((state) => state.addAssetToTimeline);
  const addImageOverlay = useEditorStore((state) => state.addImageOverlay);

  const selectedAsset = project.assets.find((asset) => asset.id === selectedAssetId);
  const selectedClip = project.clips.find((clip) => clip.id === selectedClipId);
  const selectedOverlay = project.overlays.find((overlay) => overlay.id === selectedOverlayId);

  return (
    <aside className="panel inspector">
      <div className="panel-header">
        <div>
          <span className="panel-kicker">Properties</span>
          <h2>Inspector</h2>
        </div>
      </div>

      {selectedClip ? (
        <>
          <InspectorBlock title="Clip Properties">
            <NumberField label="Start" min={0} max={3600} step={0.1} value={selectedClip.startTime} onChange={(value) => updateClip(selectedClip.id, { startTime: value })} />
            <NumberField label="Duration" min={0.25} max={3600} step={0.1} value={selectedClip.duration} onChange={(value) => updateClip(selectedClip.id, { duration: value })} />
            <NumberField label="Source In" min={0} max={3600} step={0.1} value={selectedClip.sourceStart} onChange={(value) => updateClip(selectedClip.id, { sourceStart: value })} />
            <RangeField label="Opacity" min={0.1} max={1} step={0.05} value={1} disabled onChange={() => undefined} />
            <RangeField label="Playback Speed" min={0.25} max={2} step={0.05} value={selectedClip.playbackRate ?? 1} onChange={(value) => updateClip(selectedClip.id, { playbackRate: value })} />
          </InspectorBlock>
          <InspectorBlock title="Color Grading">
            <RangeField label="Brightness" min={-100} max={100} step={1} value={0} disabled onChange={() => undefined} />
            <RangeField label="Contrast" min={-100} max={100} step={1} value={0} disabled onChange={() => undefined} />
            <RangeField label="Saturation" min={-100} max={100} step={1} value={0} disabled onChange={() => undefined} />
          </InspectorBlock>
          <InspectorBlock title="Effects & Filters">
            <div className="chip-row">
              <span className="inspector-chip">Blur</span>
              <span className="inspector-chip">Sharpen</span>
              <span className="inspector-chip">Noise</span>
              <span className="inspector-chip">Glow</span>
            </div>
          </InspectorBlock>
          <InspectorBlock title="Audio">
            <RangeField label="Volume" min={0} max={1} step={0.05} value={selectedClip.volume ?? 1} onChange={(value) => updateClip(selectedClip.id, { volume: value })} />
            <p>Fade in, fade out, and keyframe lanes can be added next.</p>
          </InspectorBlock>
          <InspectorBlock title="Quick Trim">
            <div className="inspector-grid">
              <button type="button" className="button" onClick={() => trimClip(selectedClip.id, 'start', -0.5)}>Trim Start -0.5s</button>
              <button type="button" className="button" onClick={() => trimClip(selectedClip.id, 'start', 0.5)}>Trim Start +0.5s</button>
              <button type="button" className="button" onClick={() => trimClip(selectedClip.id, 'end', -0.5)}>Trim End -0.5s</button>
              <button type="button" className="button" onClick={() => trimClip(selectedClip.id, 'end', 0.5)}>Trim End +0.5s</button>
            </div>
          </InspectorBlock>
        </>
      ) : null}

      {selectedOverlay ? (
        <>
          <InspectorBlock title={selectedOverlay.type === 'text' ? 'Titles' : 'Overlay'}>
            <RangeField label="Start" min={0} max={project.duration} step={0.1} value={selectedOverlay.startTime} onChange={(value) => selectedOverlay.type === 'text' ? updateTextOverlay(selectedOverlay.id, { startTime: value }) : updateImageOverlay(selectedOverlay.id, { startTime: value })} />
            <RangeField label="Duration" min={0.5} max={Math.max(project.duration, 12)} step={0.1} value={selectedOverlay.duration} onChange={(value) => selectedOverlay.type === 'text' ? updateTextOverlay(selectedOverlay.id, { duration: value }) : updateImageOverlay(selectedOverlay.id, { duration: value })} />
            <RangeField label="Width" min={5} max={90} step={1} value={selectedOverlay.width} onChange={(value) => selectedOverlay.type === 'text' ? updateTextOverlay(selectedOverlay.id, { width: value }) : updateImageOverlay(selectedOverlay.id, { width: value })} />
            <RangeField label="Height" min={5} max={90} step={1} value={selectedOverlay.height} onChange={(value) => selectedOverlay.type === 'text' ? updateTextOverlay(selectedOverlay.id, { height: value }) : updateImageOverlay(selectedOverlay.id, { height: value })} />
            <RangeField label="Opacity" min={0.1} max={1} step={0.05} value={selectedOverlay.opacity} onChange={(value) => selectedOverlay.type === 'text' ? updateTextOverlay(selectedOverlay.id, { opacity: value }) : updateImageOverlay(selectedOverlay.id, { opacity: value })} />
          </InspectorBlock>

          {selectedOverlay.type === 'text' ? (
            <InspectorBlock title="Text">
              <label className="field">
                <span>Text</span>
                <input value={selectedOverlay.text} onChange={(event: ChangeEvent<HTMLInputElement>) => updateTextOverlay(selectedOverlay.id, { text: event.target.value })} />
              </label>
              <label className="field">
                <span>Color</span>
                <input type="color" value={selectedOverlay.color} onChange={(event) => updateTextOverlay(selectedOverlay.id, { color: event.target.value })} />
              </label>
              <RangeField label="Font Size" min={18} max={84} step={2} value={selectedOverlay.fontSize} onChange={(value) => updateTextOverlay(selectedOverlay.id, { fontSize: value })} />
            </InspectorBlock>
          ) : (
            <InspectorBlock title="Logo Position">
              <label className="field">
                <span>Anchor</span>
                <select value={selectedOverlay.anchor} onChange={(event) => snapOverlayToAnchor(selectedOverlay.id, event.target.value as OverlayAnchor)}>
                  {overlayAnchors.map((anchor) => (
                    <option key={anchor} value={anchor}>{anchor}</option>
                  ))}
                </select>
              </label>
            </InspectorBlock>
          )}
        </>
      ) : null}

      {!selectedClip && !selectedOverlay ? (
        <>
          <InspectorBlock title="Project Snapshot">
            <p>{project.clips.length} clips, {project.overlays.length} overlays, {project.assets.length} assets.</p>
            <p>{selectedAsset ? `${selectedAsset.name} is selected in the library.` : 'Select a clip, title, or asset to edit it here.'}</p>
          </InspectorBlock>
          {selectedAsset ? (
            <InspectorBlock title="Selected Asset">
              <p>{selectedAsset.name}</p>
              <p>{selectedAsset.type} • {formatTime(selectedAsset.duration)}</p>
              <div className="inspector-grid">
                <button type="button" className="button accent" onClick={() => addAssetToTimeline(selectedAsset.id)}>Add To Timeline</button>
                {selectedAsset.type === 'image' ? (
                  <button type="button" className="button" onClick={() => addImageOverlay(selectedAsset.id, { anchor: 'top-right', asLogo: true })}>
                    Add As Logo
                  </button>
                ) : null}
              </div>
            </InspectorBlock>
          ) : null}
        </>
      ) : null}
    </aside>
  );
}

function InspectorBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="inspector-section">
      <h3>{title}</h3>
      {children}
    </div>
  );
}

function RangeField({
  label,
  min,
  max,
  step,
  value,
  disabled,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <label className="field">
      <span>
        {label} <strong>{value.toFixed(2)}</strong>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} disabled={disabled} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

function NumberField({
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
      <span>{label}</span>
      <input type="number" min={min} max={max} step={step} value={value.toFixed(2)} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}
