import type { ExportJob } from '../types/editor';

export function ExportDialog({
  open,
  job,
  onClose,
  onCancel,
}: {
  open: boolean;
  job: ExportJob;
  onClose: () => void;
  onCancel: () => void;
}) {
  if (!open) {
    return null;
  }

  return (
    <div className="dialog-scrim" role="presentation" onClick={onClose}>
      <div className="dialog-card" onClick={(event) => event.stopPropagation()}>
        <div className="panel-header">
          <div>
            <span className="panel-kicker">Export</span>
            <h2>Render Queue</h2>
          </div>
          <button type="button" className="button" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="export-progress">
          <div className="progress-bar">
            <span style={{ width: `${Math.max(job.progress * 100, 4)}%` }} />
          </div>
          <p>{job.message}</p>
          <small>Status: {job.status}</small>
        </div>

        {job.outputUrl ? (
          <a className="button accent export-download" href={job.outputUrl} download="blackframe-export.mp4">
            Download MP4
          </a>
        ) : null}

        {job.error ? <p className="export-error">{job.error}</p> : null}

        <div className="dialog-actions">
          <button type="button" className="button" onClick={onCancel}>
            Cancel Job
          </button>
        </div>
      </div>
    </div>
  );
}
