/// <reference lib="webworker" />
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import type { Project } from '../../types/editor';

interface ExportRequest {
  project: Project;
  assets: Record<string, Blob>;
}

const ffmpeg = new FFmpeg();

function postStatus(status: string, progress: number, message: string, output?: Blob) {
  self.postMessage({ type: 'status', status, progress, message, output });
}

async function loadCore() {
  if (ffmpeg.loaded) {
    return;
  }
  postStatus('loading-core', 0.1, 'Loading ffmpeg.wasm core…');
  const base = 'https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd';
  await ffmpeg.load({
    coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, 'application/wasm'),
  });
}

function buildInputs(project: Project, assets: Record<string, Blob>) {
  const clips = [...project.clips].sort((left, right) => left.startTime - right.startTime);
  const args: string[] = [];
  const filterParts: string[] = [];
  let filterIndex = 0;
  let inputIndex = 0;
  let cursor = 0;

  clips.forEach((clip) => {
    if (clip.startTime > cursor + 0.02) {
      const gap = Math.max(0.1, clip.startTime - cursor).toFixed(2);
      args.push('-f', 'lavfi', '-t', gap, '-i', 'color=c=black:s=1280x720:r=30');
      filterParts.push(`[${inputIndex}:v]scale=1280:720,setsar=1[v${filterIndex}]`);
      inputIndex += 1;
      filterIndex += 1;
    }

    const asset = project.assets.find((item) => item.id === clip.assetId);
    if (!asset) {
      return;
    }

    const assetBlob = assets[asset.id];
    if (!assetBlob) {
      return;
    }

    const ext = asset.type === 'image' ? 'png' : 'mp4';
    const fileName = `input-${clip.id}.${ext}`;
    args.push('-ss', clip.sourceStart.toFixed(2), '-t', clip.duration.toFixed(2));
    if (asset.type === 'image') {
      args.push('-loop', '1');
    }
    args.push('-i', fileName);
    filterParts.push(`[${inputIndex}:v]scale=1280:720,setsar=1,fps=30,format=yuv420p[v${filterIndex}]`);
    inputIndex += 1;
    filterIndex += 1;
    cursor = clip.startTime + clip.duration;
  });

  return { args, filterParts };
}

async function burnPrimaryTimeline(project: Project, assets: Record<string, Blob>) {
  const clips = [...project.clips].sort((left, right) => left.startTime - right.startTime);
  for (const clip of clips) {
    const asset = project.assets.find((item) => item.id === clip.assetId);
    const assetBlob = assets[asset?.id ?? ''];
    if (!asset || !assetBlob) {
      continue;
    }
    const ext = asset.type === 'image' ? 'png' : 'mp4';
    await ffmpeg.writeFile(`input-${clip.id}.${ext}`, await fetchFile(assetBlob));
  }

  const { args, filterParts } = buildInputs(project, assets);
  const filterInputLabels = filterParts.map((_, index) => `[v${index}]`).join('');
  const filter = `${filterParts.join(';')};${filterInputLabels}concat=n=${filterParts.length}:v=1:a=0[outv]`;

  postStatus(
    'rendering',
    0.45,
    project.overlays.length > 0
      ? 'Rendering primary timeline. Overlay burn-in is preview-only in this MVP.'
      : 'Rendering primary timeline…',
  );

  await ffmpeg.exec([
    ...args,
    '-filter_complex',
    filter,
    '-map',
    '[outv]',
    '-pix_fmt',
    'yuv420p',
    'output.mp4',
  ]);
}

self.onmessage = async (event: MessageEvent<ExportRequest>) => {
  try {
    const { project, assets } = event.data;
    postStatus('queued', 0.02, 'Queueing export job…');
    await loadCore();
    await burnPrimaryTimeline(project, assets);
    postStatus('muxing', 0.9, 'Packaging video output…');
    const data = await ffmpeg.readFile('output.mp4');
    const outputBytes =
      typeof data === 'string'
        ? new TextEncoder().encode(data)
        : new Uint8Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
    const normalized = new Uint8Array(outputBytes.length);
    normalized.set(outputBytes);
    const blob = new Blob([normalized.buffer], { type: 'video/mp4' });
    postStatus(
      'completed',
      1,
      project.overlays.length > 0
        ? 'Export completed. Primary timeline rendered; overlays remain preview-only in this MVP.'
        : 'Export completed.',
      blob,
    );
  } catch (error) {
    postStatus('failed', 1, error instanceof Error ? error.message : 'Export failed');
  }
};

export type {};
