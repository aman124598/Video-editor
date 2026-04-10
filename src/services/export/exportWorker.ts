/// <reference lib="webworker" />
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import type { ImageOverlay, Overlay, Project, TextOverlay } from '../../types/editor';

interface ExportRequest {
  project: Project;
  assets: Record<string, Blob>;
}

const ffmpeg = new FFmpeg();
const EXPORT_WIDTH = 1280;
const EXPORT_HEIGHT = 720;
const EDGE_MARGIN_X = Math.round(EXPORT_WIDTH * 0.03);
const EDGE_MARGIN_Y = Math.round(EXPORT_HEIGHT * 0.03);

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

function scaleWidth(percent: number) {
  return Math.max(2, Math.round((EXPORT_WIDTH * percent) / 100));
}

function scaleHeight(percent: number) {
  return Math.max(2, Math.round((EXPORT_HEIGHT * percent) / 100));
}

function getOverlayPosition(overlay: Overlay) {
  const width = scaleWidth(overlay.width);
  const height = scaleHeight(overlay.height);

  switch (overlay.anchor) {
    case 'top-left':
      return { width, height, x: EDGE_MARGIN_X, y: EDGE_MARGIN_Y };
    case 'top-right':
      return { width, height, x: Math.max(0, EXPORT_WIDTH - width - EDGE_MARGIN_X), y: EDGE_MARGIN_Y };
    case 'bottom-left':
      return { width, height, x: EDGE_MARGIN_X, y: Math.max(0, EXPORT_HEIGHT - height - EDGE_MARGIN_Y) };
    case 'bottom-right':
      return {
        width,
        height,
        x: Math.max(0, EXPORT_WIDTH - width - EDGE_MARGIN_X),
        y: Math.max(0, EXPORT_HEIGHT - height - EDGE_MARGIN_Y),
      };
    default:
      return {
        width,
        height,
        x: Math.max(0, Math.round((EXPORT_WIDTH * overlay.x) / 100)),
        y: Math.max(0, Math.round((EXPORT_HEIGHT * overlay.y) / 100)),
      };
  }
}

function escapeDrawtext(value: string) {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\\\'")
    .replace(/,/g, '\\,')
    .replace(/\[/g, '\\[')
    .replace(/]/g, '\\]');
}

function normalizeColor(value: string) {
  return value.startsWith('#') ? `0x${value.slice(1)}` : value;
}

function buildPrimaryInputs(project: Project, assets: Record<string, Blob>) {
  const clips = [...project.clips].sort((left, right) => left.startTime - right.startTime);
  const args: string[] = [];
  const filterParts: string[] = [];
  let filterIndex = 0;
  let inputIndex = 0;
  let cursor = 0;

  clips.forEach((clip) => {
    if (clip.startTime > cursor + 0.02) {
      const gap = Math.max(0.1, clip.startTime - cursor).toFixed(2);
      args.push('-f', 'lavfi', '-t', gap, '-i', `color=c=black:s=${EXPORT_WIDTH}x${EXPORT_HEIGHT}:r=30`);
      filterParts.push(`[${inputIndex}:v]scale=${EXPORT_WIDTH}:${EXPORT_HEIGHT},setsar=1[v${filterIndex}]`);
      inputIndex += 1;
      filterIndex += 1;
    }

    const asset = project.assets.find((item) => item.id === clip.assetId);
    if (!asset || !assets[asset.id]) {
      return;
    }

    const ext = asset.type === 'image' ? 'png' : 'mp4';
    const fileName = `input-${clip.id}.${ext}`;
    args.push('-ss', clip.sourceStart.toFixed(2), '-t', clip.duration.toFixed(2));
    if (asset.type === 'image') {
      args.push('-loop', '1');
    }
    args.push('-i', fileName);
    filterParts.push(`[${inputIndex}:v]scale=${EXPORT_WIDTH}:${EXPORT_HEIGHT},setsar=1,fps=30,format=yuv420p[v${filterIndex}]`);
    inputIndex += 1;
    filterIndex += 1;
    cursor = clip.startTime + clip.duration;
  });

  return { args, filterParts, nextInputIndex: inputIndex, segmentCount: filterIndex };
}

function buildOverlayFilters(project: Project, startInputIndex: number, segmentCount: number, imageOverlays: ImageOverlay[]) {
  let currentLabel = 'base0';
  let nextLabelIndex = 1;
  let imageInputIndex = startInputIndex;
  const filterParts: string[] = [];

  filterParts.push(
    `${Array.from({ length: segmentCount }, (_, index) => `[v${index}]`).join('')}concat=n=${segmentCount}:v=1:a=0[base0]`,
  );

  project.overlays.forEach((overlay) => {
    if (overlay.type === 'image') {
      const overlayInput = imageOverlays.find((item) => item.id === overlay.id);
      if (!overlayInput) {
        return;
      }
      const position = getOverlayPosition(overlay);
      const preparedLabel = `img${nextLabelIndex}`;
      const outputLabel = `base${nextLabelIndex}`;
      filterParts.push(
        `[${imageInputIndex}:v]format=rgba,scale=${position.width}:${position.height},colorchannelmixer=aa=${overlay.opacity.toFixed(2)}[${preparedLabel}]`,
      );
      filterParts.push(
        `[${currentLabel}][${preparedLabel}]overlay=${position.x}:${position.y}:enable='between(t,${overlay.startTime.toFixed(2)},${(overlay.startTime + overlay.duration).toFixed(2)})'[${outputLabel}]`,
      );
      currentLabel = outputLabel;
      imageInputIndex += 1;
      nextLabelIndex += 1;
      return;
    }

    const textOverlay = overlay as TextOverlay;
    const position = getOverlayPosition(textOverlay);
    const outputLabel = `base${nextLabelIndex}`;
    filterParts.push(
      `[${currentLabel}]drawtext=text='${escapeDrawtext(textOverlay.text)}':fontsize=${Math.round(textOverlay.fontSize)}:fontcolor=${normalizeColor(textOverlay.color)}@${textOverlay.opacity.toFixed(2)}:x=${position.x}:y=${position.y}:enable='between(t,${textOverlay.startTime.toFixed(2)},${(textOverlay.startTime + textOverlay.duration).toFixed(2)})'[${outputLabel}]`,
    );
    currentLabel = outputLabel;
    nextLabelIndex += 1;
  });

  return { filter: filterParts.join(';'), finalLabel: currentLabel };
}

async function writeProjectFiles(project: Project, assets: Record<string, Blob>) {
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

  const imageOverlays = project.overlays.filter((overlay): overlay is ImageOverlay => overlay.type === 'image');
  for (const overlay of imageOverlays) {
    const asset = project.assets.find((item) => item.id === overlay.assetId);
    const assetBlob = assets[asset?.id ?? ''];
    if (!asset || !assetBlob) {
      continue;
    }
    await ffmpeg.writeFile(`overlay-${overlay.id}.png`, await fetchFile(assetBlob));
  }
}

async function renderProject(project: Project, assets: Record<string, Blob>) {
  const { args, filterParts, nextInputIndex, segmentCount } = buildPrimaryInputs(project, assets);
  if (filterParts.length === 0) {
    throw new Error('No clips available to export.');
  }

  const overlayArgs: string[] = [];
  const imageOverlays = project.overlays.filter(
    (overlay): overlay is ImageOverlay =>
      overlay.type === 'image' &&
      Boolean(project.assets.find((asset) => asset.id === overlay.assetId)) &&
      Boolean(assets[overlay.assetId]),
  );
  imageOverlays.forEach((overlay) => {
    overlayArgs.push('-loop', '1', '-i', `overlay-${overlay.id}.png`);
  });

  const overlayGraph = buildOverlayFilters(project, nextInputIndex, segmentCount, imageOverlays);
  postStatus('rendering', 0.45, project.overlays.length > 0 ? 'Rendering timeline with overlays and logos…' : 'Rendering primary timeline…');

  await ffmpeg.exec([
    ...args,
    ...overlayArgs,
    '-filter_complex',
    `${filterParts.join(';')};${overlayGraph.filter}`,
    '-map',
    `[${overlayGraph.finalLabel}]`,
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
    await writeProjectFiles(project, assets);
    await renderProject(project, assets);
    postStatus('muxing', 0.9, 'Packaging video output…');
    const data = await ffmpeg.readFile('output.mp4');
    const outputBytes =
      typeof data === 'string'
        ? new TextEncoder().encode(data)
        : new Uint8Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
    const normalized = new Uint8Array(outputBytes.length);
    normalized.set(outputBytes);
    const blob = new Blob([normalized.buffer], { type: 'video/mp4' });
    postStatus('completed', 1, project.overlays.length > 0 ? 'Export completed with overlays and logos.' : 'Export completed.', blob);
  } catch (error) {
    postStatus('failed', 1, error instanceof Error ? error.message : 'Export failed');
  }
};

export type {};
