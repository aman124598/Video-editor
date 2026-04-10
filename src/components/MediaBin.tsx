import type { ChangeEvent } from 'react';
import { useMemo, useState } from 'react';
import { formatTime } from '../lib/time';
import { useEditorStore } from '../store/editorStore';
import type { AssetType } from '../types/editor';

type LibraryTab = 'all' | AssetType;

export function MediaBin() {
  const assets = useEditorStore((state) => state.project.assets);
  const selectedAssetId = useEditorStore((state) => state.selectedAssetId);
  const importFiles = useEditorStore((state) => state.importFiles);
  const addAssetToTimeline = useEditorStore((state) => state.addAssetToTimeline);
  const addImageOverlay = useEditorStore((state) => state.addImageOverlay);
  const selectAsset = useEditorStore((state) => state.selectAsset);
  const [tab, setTab] = useState<LibraryTab>('all');

  const visibleAssets = useMemo(
    () => assets.filter((asset) => (tab === 'all' ? true : asset.type === tab)),
    [assets, tab],
  );

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
          <span className="panel-kicker">Media Library</span>
          <h2>Browser</h2>
        </div>
        <button type="button" className="library-plus-button">
          +
        </button>
      </div>

      <div className="library-tabs">
        {[
          { id: 'all', label: 'All' },
          { id: 'video', label: 'Video' },
          { id: 'audio', label: 'Audio' },
          { id: 'image', label: 'Images' },
        ].map((item) => (
          <button
            key={item.id}
            type="button"
            className={`library-tab ${tab === item.id ? 'is-active' : ''}`}
            onClick={() => setTab(item.id as LibraryTab)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div
        className="asset-grid"
        onDragOver={(event) => event.preventDefault()}
        onDrop={async (event) => {
          event.preventDefault();
          if (event.dataTransfer.files.length > 0) {
            await importFiles(event.dataTransfer.files);
          }
        }}
      >
        {visibleAssets.map((asset) => (
          <button
            type="button"
            key={asset.id}
            className={`asset-card asset-card-grid ${selectedAssetId === asset.id ? 'selected' : ''}`}
            onClick={() => selectAsset(asset.id)}
          >
            <div className="asset-preview">
              <span>{getAssetBadge(asset.type)}</span>
            </div>
            <div className="asset-meta">
              <strong>{asset.name}</strong>
              <small>{asset.type === 'audio' ? formatTime(asset.duration) : `${asset.width || 0}x${asset.height || 0}`}</small>
            </div>
            <div className="asset-actions asset-actions-stack">
              <span
                className="mini-action"
                onClick={(event) => {
                  event.stopPropagation();
                  addAssetToTimeline(asset.id);
                }}
              >
                Add
              </span>
              {asset.type === 'image' ? (
                <span
                  className="mini-action"
                  onClick={(event) => {
                    event.stopPropagation();
                    addImageOverlay(asset.id, { anchor: 'top-right', asLogo: true });
                  }}
                >
                  Logo
                </span>
              ) : null}
            </div>
          </button>
        ))}
        {visibleAssets.length === 0 ? (
          <div className="empty-state">
            <p>No media in this tab yet.</p>
          </div>
        ) : null}
      </div>

      <label className="import-footer">
        + Import media
        <input type="file" accept="video/*,image/*,audio/*" multiple onChange={onChange} hidden />
      </label>
    </aside>
  );
}

function getAssetBadge(type: AssetType) {
  if (type === 'video') {
    return 'VID';
  }
  if (type === 'audio') {
    return 'AUD';
  }
  return 'IMG';
}
