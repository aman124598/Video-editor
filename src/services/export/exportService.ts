import { getAssetBlob } from '../../lib/idb';
import type { ExportJob, Project } from '../../types/editor';

type ExportListener = (job: Partial<ExportJob>) => void;

export function startExport(project: Project, onUpdate: ExportListener) {
  const worker = new Worker(new URL('./exportWorker.ts', import.meta.url), { type: 'module' });

  worker.onmessage = (event: MessageEvent<{ type: string; status: ExportJob['status']; progress: number; message: string; output?: Blob }>) => {
    if (event.data.type !== 'status') {
      return;
    }

    const { status, progress, message, output } = event.data;
    onUpdate({
      status,
      progress,
      message,
      outputUrl: output ? URL.createObjectURL(output) : undefined,
      error: status === 'failed' ? message : undefined,
    });
  };

  Promise.all(
    project.assets.map(async (asset) => {
      const blob = await getAssetBlob(asset.id);
      return [asset.id, blob] as const;
    }),
  )
    .then((entries) => {
      const assets = Object.fromEntries(entries.filter((entry): entry is [string, Blob] => Boolean(entry[1])));
      worker.postMessage({ project, assets });
    })
    .catch((error: unknown) => {
      onUpdate({
        status: 'failed',
        progress: 1,
        message: error instanceof Error ? error.message : 'Could not prepare assets for export.',
      });
      worker.terminate();
    });

  return () => {
    worker.terminate();
    onUpdate({
      status: 'cancelled',
      progress: 0,
      message: 'Export cancelled.',
    });
  };
}
