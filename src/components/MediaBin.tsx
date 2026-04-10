import type { ChangeEvent } from 'react';
import { useEditorStore } from '../store/editorStore';
import { formatTime } from '../lib/time';

export function MediaBin() {
  const assets = useEditorStore((state) => state.project.assets);
  const selectedAssetId = useEditorStore((state) => state.selectedAssetId);
  const importFiles = useEditorStore((state) => state.importFiles);
  const addAssetToTimeline = useEditorStore((state) => state.addAssetToTimeline);
  const addImageOverlay = useEditorStore((state) => state.addImageOverlay);
  const selectAsset = useEditorStore((state) => state.selectAsset);

  const onChange = async (event: ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files) {
      return;
    }
    await importFiles(event.target.files);
    event.target.value = '';
  };

  return (
    <aside className="panel media-bin">
      <div className="panel-header">
        <div>
          <span className="panel-kicker">Media Bin</span>
          <h2>Assets</h2>
        </div>
        <label className="button accent">
          Import
          <input type="file" accept="video/*,image/*" multiple onChange={onChange} hidden />
        </label>
      </div>

      <div className="asset-list">
        {assets.map((asset) => (
          <button
            type="button"
            key={asset.id}
            className={`asset-card ${selectedAssetId === asset.id ? 'selected' : ''}`}
            onClick={() => selectAsset(asset.id)}
          >
            <div className="asset-preview">
              <span>{asset.type === 'video' ? 'VID' : 'IMG'}</span>
            </div>
            <div className="asset-meta">
              <strong>{asset.name}</strong>
              <small>
                {asset.width}x{asset.height} • {formatTime(asset.duration)}
              </small>
            </div>
            <div className="asset-actions">
              <span
                className="mini-action"
                onClick={(event) => {
                  event.stopPropagation();
                  addAssetToTimeline(asset.id);
                }}
              >
                To Timeline
              </span>
              {asset.type === 'image' ? (
                <span
                  className="mini-action"
                  onClick={(event) => {
                    event.stopPropagation();
                    addImageOverlay(asset.id);
                  }}
                >
                  As Overlay
                </span>
              ) : null}
            </div>
          </button>
        ))}
        {assets.length === 0 ? (
          <div className="empty-state">
            <p>Drop in video clips or artwork to start building the sequence.</p>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
