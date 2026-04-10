export type AssetType = 'video' | 'image' | 'audio';

export interface Asset {
  id: string;
  name: string;
  type: AssetType;
  mimeType: string;
  duration: number;
  width: number;
  height: number;
  fileName: string;
  objectUrl?: string;
}

export interface Clip {
  id: string;
  assetId: string;
  trackId: string;
  startTime: number;
  duration: number;
  sourceStart: number;
  volume: number;
  playbackRate: number;
  muted?: boolean;
}

export type OverlayAnchor = 'free' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export interface OverlayBase {
  id: string;
  startTime: number;
  duration: number;
  x: number;
  y: number;
  width: number;
  height: number;
  opacity: number;
  anchor: OverlayAnchor;
}

export interface TextOverlay extends OverlayBase {
  type: 'text';
  text: string;
  color: string;
  fontSize: number;
}

export interface ImageOverlay extends OverlayBase {
  type: 'image';
  assetId: string;
}

export type Overlay = TextOverlay | ImageOverlay;

export interface TimelineTrack {
  id: string;
  kind: 'video' | 'audio' | 'titles' | 'effects';
  label: string;
  accepts: Array<'clip' | 'image-overlay' | 'text-overlay'>;
  muteable?: boolean;
  muted?: boolean;
  clipIds: string[];
}

export interface PlaybackState {
  currentTime: number;
  isPlaying: boolean;
  fps: number;
}

export type ExportStatus =
  | 'idle'
  | 'queued'
  | 'loading-core'
  | 'rendering'
  | 'muxing'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface ExportJob {
  status: ExportStatus;
  progress: number;
  message: string;
  outputUrl?: string;
  error?: string;
}

export interface ThemeTokens {
  workspace: string;
  panel: string;
  panelAlt: string;
  accent: string;
  accentMuted: string;
  text: string;
  textMuted: string;
  border: string;
}

export interface Project {
  id: string;
  name: string;
  version: 1;
  assets: Asset[];
  clips: Clip[];
  overlays: Overlay[];
  tracks: TimelineTrack[];
  duration: number;
  theme: ThemeTokens;
  updatedAt: string;
}

export interface PersistedProject {
  project: Project;
  selectedAssetId: string | null;
  selectedClipId: string | null;
  selectedOverlayId: string | null;
  zoom: number;
}
