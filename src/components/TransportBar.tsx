import { useMemo } from 'react';
import { useEditorStore } from '../store/editorStore';

function ActionButton({
  children,
  onClick,
  accent,
}: {
  children: string;
  onClick?: () => void;
  accent?: boolean;
}) {
  return (
    <button type="button" className={`toolbar-action ${accent ? 'accent' : ''}`} onClick={onClick}>
      {children}
    </button>
  );
}

export function TransportBar({ onOpenExport }: { onOpenExport: () => void }) {
  const project = useEditorStore((state) => state.project);
  const statusMessage = useEditorStore((state) => state.statusMessage);
  const selectedAssetId = useEditorStore((state) => state.selectedAssetId);
  const setPlayhead = useEditorStore((state) => state.setPlayhead);
  const splitSelectedClip = useEditorStore((state) => state.splitSelectedClip);
  const duplicateSelection = useEditorStore((state) => state.duplicateSelection);
  const deleteSelection = useEditorStore((state) => state.deleteSelection);
  const addTextOverlay = useEditorStore((state) => state.addTextOverlay);
  const addImageOverlay = useEditorStore((state) => state.addImageOverlay);
  const updateProjectName = useEditorStore((state) => state.updateProjectName);

  const clipCount = useMemo(() => project.clips.length, [project.clips.length]);

  return (
    <header className="transport-bar transport-bar-mock">
      <div className="brand-lockup compact">
        <span className="brand-badge">C</span>
        <div>
          <input
            className="project-name-input"
            value={project.name}
            onChange={(event) => updateProjectName(event.target.value)}
            aria-label="Project name"
          />
          <p>Always-visible primary actions</p>
        </div>
      </div>

      <div className="toolbar-strip">
        <ActionButton onClick={() => setPlayhead(0)}>Undo</ActionButton>
        <ActionButton onClick={duplicateSelection}>Redo</ActionButton>
        <ActionButton>Select</ActionButton>
        <ActionButton onClick={deleteSelection}>Cut</ActionButton>
        <ActionButton onClick={splitSelectedClip}>Razor</ActionButton>
        <ActionButton onClick={splitSelectedClip}>Trim</ActionButton>
        <ActionButton onClick={addTextOverlay}>Text</ActionButton>
        <ActionButton>Color</ActionButton>
        <ActionButton>Project</ActionButton>
        <ActionButton accent onClick={onOpenExport}>
          Export
        </ActionButton>
        {selectedAssetId ? (
          <ActionButton onClick={() => addImageOverlay(selectedAssetId, { anchor: 'top-right', asLogo: true })}>
            Logo
          </ActionButton>
        ) : null}
      </div>

      <div className="status-strip">{statusMessage || `${clipCount} clips ready`}</div>
    </header>
  );
}
