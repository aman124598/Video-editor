import { create } from 'zustand';
import { getAssetBlob, putAssetBlob } from '../lib/idb';
import { clamp, createId } from '../lib/time';
import type {
  Asset,
  Clip,
  ExportJob,
  ImageOverlay,
  Overlay,
  PersistedProject,
  Project,
  TextOverlay,
  ThemeTokens,
} from '../types/editor';

const STORAGE_KEY = 'black-red-video-editor-project';

const theme: ThemeTokens = {
  workspace: '#050505',
  panel: '#111111',
  panelAlt: '#171717',
  accent: '#ef233c',
  accentMuted: '#7f1d1d',
  text: '#f6f4f3',
  textMuted: '#9f9b99',
  border: '#2c1316',
};

const emptyProject = (): Project => ({
  id: createId('project'),
  name: 'Untitled Sequence',
  version: 1,
  assets: [],
  clips: [],
  overlays: [],
  tracks: [
    { id: 'track-primary', kind: 'primary', clipIds: [] },
    { id: 'track-overlay', kind: 'overlay', clipIds: [] },
  ],
  duration: 30,
  theme,
  updatedAt: new Date().toISOString(),
});

interface EditorState {
  project: Project;
  playback: {
    currentTime: number;
    isPlaying: boolean;
    fps: number;
  };
  selectedAssetId: string | null;
  selectedClipId: string | null;
  selectedOverlayId: string | null;
  zoom: number;
  exportJob: ExportJob;
  statusMessage: string;
  hydrateProject: () => Promise<void>;
  importFiles: (files: FileList | File[]) => Promise<void>;
  addAssetToTimeline: (assetId: string) => void;
  addTextOverlay: () => void;
  addImageOverlay: (assetId: string) => void;
  selectAsset: (assetId: string | null) => void;
  selectClip: (clipId: string | null) => void;
  selectOverlay: (overlayId: string | null) => void;
  moveClip: (clipId: string, startTime: number) => void;
  moveOverlay: (overlayId: string, startTime: number) => void;
  trimClip: (clipId: string, edge: 'start' | 'end', delta: number) => void;
  splitSelectedClip: () => void;
  deleteSelection: () => void;
  setPlayhead: (time: number) => void;
  setPlaying: (isPlaying: boolean) => void;
  tickPlayback: (deltaSeconds: number) => void;
  setZoom: (zoom: number) => void;
  updateTextOverlay: (overlayId: string, patch: Partial<TextOverlay>) => void;
  updateImageOverlay: (overlayId: string, patch: Partial<ImageOverlay>) => void;
  setExportJob: (job: Partial<ExportJob>) => void;
}

function syncProject(project: Project, selection: Partial<PersistedProject>) {
  const payload: PersistedProject = {
    project: {
      ...project,
      updatedAt: new Date().toISOString(),
    },
    selectedAssetId: selection.selectedAssetId ?? null,
    selectedClipId: selection.selectedClipId ?? null,
    selectedOverlayId: selection.selectedOverlayId ?? null,
    zoom: selection.zoom ?? 120,
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function getProjectDuration(project: Project) {
  const clipEnd = project.clips.reduce((max, clip) => Math.max(max, clip.startTime + clip.duration), 0);
  const overlayEnd = project.overlays.reduce(
    (max, overlay) => Math.max(max, overlay.startTime + overlay.duration),
    0,
  );
  return Math.max(30, clipEnd, overlayEnd);
}

function sortByStart<T extends { startTime: number }>(items: T[]) {
  return [...items].sort((left, right) => left.startTime - right.startTime);
}

function updateProject(project: Project) {
  return {
    ...project,
    duration: getProjectDuration(project),
    updatedAt: new Date().toISOString(),
  };
}

async function readAssetMetadata(file: File): Promise<Omit<Asset, 'id' | 'fileName'>> {
  const objectUrl = URL.createObjectURL(file);

  if (file.type.startsWith('video/')) {
    const video = document.createElement('video');
    video.src = objectUrl;
    video.preload = 'metadata';
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error(`Could not load ${file.name}`));
    });
    URL.revokeObjectURL(objectUrl);
    return {
      name: file.name,
      type: 'video',
      mimeType: file.type,
      duration: Number.isFinite(video.duration) ? video.duration : 5,
      width: video.videoWidth || 1280,
      height: video.videoHeight || 720,
    };
  }

  const image = document.createElement('img');
  image.src = objectUrl;
  await image.decode();
  URL.revokeObjectURL(objectUrl);
  return {
    name: file.name,
    type: 'image',
    mimeType: file.type,
    duration: 5,
    width: image.naturalWidth || 1280,
    height: image.naturalHeight || 720,
  };
}

export const useEditorStore = create<EditorState>((set) => ({
  project: emptyProject(),
  playback: {
    currentTime: 0,
    isPlaying: false,
    fps: 30,
  },
  selectedAssetId: null,
  selectedClipId: null,
  selectedOverlayId: null,
  zoom: 120,
  exportJob: {
    status: 'idle',
    progress: 0,
    message: 'Ready to export',
  },
  statusMessage: 'Import media to start building a sequence.',

  hydrateProject: async () => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return;
    }

    const payload = JSON.parse(raw) as PersistedProject;
    const assets = await Promise.all(
      payload.project.assets.map(async (asset) => {
        const blob = await getAssetBlob(asset.id);
        return {
          ...asset,
          objectUrl: blob ? URL.createObjectURL(blob) : undefined,
        };
      }),
    );

    set({
      project: updateProject({ ...payload.project, assets }),
      selectedAssetId: payload.selectedAssetId,
      selectedClipId: payload.selectedClipId,
      selectedOverlayId: payload.selectedOverlayId,
      zoom: payload.zoom,
      statusMessage: assets.some((asset) => !asset.objectUrl)
        ? 'Project restored. Some local media will need to be re-imported.'
        : 'Project restored from local storage.',
    });
  },

  importFiles: async (files) => {
    const fileList = Array.from(files);
    const nextAssets: Asset[] = [];

    for (const file of fileList) {
      if (!file.type.startsWith('video/') && !file.type.startsWith('image/')) {
        continue;
      }
      const metadata = await readAssetMetadata(file);
      const id = createId('asset');
      await putAssetBlob(id, file);
      nextAssets.push({
        id,
        fileName: file.name,
        objectUrl: URL.createObjectURL(file),
        ...metadata,
      });
    }

    set((state) => {
      const project = updateProject({
        ...state.project,
        assets: [...state.project.assets, ...nextAssets],
      });
      syncProject(project, {
        selectedAssetId: nextAssets.at(-1)?.id ?? state.selectedAssetId,
        selectedClipId: state.selectedClipId,
        selectedOverlayId: state.selectedOverlayId,
        zoom: state.zoom,
      });
      return {
        project,
        selectedAssetId: nextAssets.at(-1)?.id ?? state.selectedAssetId,
        statusMessage:
          nextAssets.length > 0
            ? `${nextAssets.length} asset${nextAssets.length === 1 ? '' : 's'} imported into the media bin.`
            : 'No compatible media found in that selection.',
      };
    });
  },

  addAssetToTimeline: (assetId) => {
    set((state) => {
      const asset = state.project.assets.find((item) => item.id === assetId);
      if (!asset) {
        return state;
      }
      const currentEnd = state.project.clips.reduce(
        (max, clip) => Math.max(max, clip.startTime + clip.duration),
        0,
      );
      const clip: Clip = {
        id: createId('clip'),
        assetId,
        startTime: currentEnd,
        duration: asset.duration,
        sourceStart: 0,
      };
      const project = updateProject({
        ...state.project,
        clips: sortByStart([...state.project.clips, clip]),
      });
      syncProject(project, {
        selectedAssetId: state.selectedAssetId,
        selectedClipId: clip.id,
        selectedOverlayId: null,
        zoom: state.zoom,
      });
      return {
        project,
        selectedClipId: clip.id,
        selectedOverlayId: null,
        statusMessage: `${asset.name} added to the primary timeline.`,
      };
    });
  },

  addTextOverlay: () => {
    set((state) => {
      const overlay: TextOverlay = {
        id: createId('overlay'),
        type: 'text',
        text: 'Black + Red',
        color: '#f6f4f3',
        fontSize: 44,
        startTime: state.playback.currentTime,
        duration: 4,
        x: 12,
        y: 12,
        width: 40,
        height: 16,
        opacity: 1,
      };
      const project = updateProject({
        ...state.project,
        overlays: sortByStart([...state.project.overlays, overlay]),
      });
      syncProject(project, {
        selectedAssetId: state.selectedAssetId,
        selectedClipId: null,
        selectedOverlayId: overlay.id,
        zoom: state.zoom,
      });
      return {
        project,
        selectedClipId: null,
        selectedOverlayId: overlay.id,
        statusMessage: 'Text overlay added to the overlay lane.',
      };
    });
  },

  addImageOverlay: (assetId) => {
    set((state) => {
      const asset = state.project.assets.find((item) => item.id === assetId && item.type === 'image');
      if (!asset) {
        return {
          ...state,
          statusMessage: 'Select an image asset before adding an image overlay.',
        };
      }
      const overlay: ImageOverlay = {
        id: createId('overlay'),
        type: 'image',
        assetId,
        startTime: state.playback.currentTime,
        duration: 4,
        x: 68,
        y: 8,
        width: 22,
        height: 22,
        opacity: 1,
      };
      const project = updateProject({
        ...state.project,
        overlays: sortByStart([...state.project.overlays, overlay]),
      });
      syncProject(project, {
        selectedAssetId: state.selectedAssetId,
        selectedClipId: null,
        selectedOverlayId: overlay.id,
        zoom: state.zoom,
      });
      return {
        project,
        selectedClipId: null,
        selectedOverlayId: overlay.id,
        statusMessage: `${asset.name} added as an overlay.`,
      };
    });
  },

  selectAsset: (assetId) => set({ selectedAssetId: assetId, selectedClipId: null, selectedOverlayId: null }),
  selectClip: (clipId) => set({ selectedClipId: clipId, selectedOverlayId: null }),
  selectOverlay: (overlayId) => set({ selectedOverlayId: overlayId, selectedClipId: null }),

  moveClip: (clipId, startTime) => {
    set((state) => {
      const project = updateProject({
        ...state.project,
        clips: sortByStart(
          state.project.clips.map((clip) =>
            clip.id === clipId ? { ...clip, startTime: clamp(startTime, 0, 3600) } : clip,
          ),
        ),
      });
      syncProject(project, {
        selectedAssetId: state.selectedAssetId,
        selectedClipId: state.selectedClipId,
        selectedOverlayId: state.selectedOverlayId,
        zoom: state.zoom,
      });
      return { project };
    });
  },

  moveOverlay: (overlayId, startTime) => {
    set((state) => {
      const project = updateProject({
        ...state.project,
        overlays: sortByStart(
          state.project.overlays.map((overlay) =>
            overlay.id === overlayId ? { ...overlay, startTime: clamp(startTime, 0, 3600) } : overlay,
          ),
        ),
      });
      syncProject(project, {
        selectedAssetId: state.selectedAssetId,
        selectedClipId: state.selectedClipId,
        selectedOverlayId: state.selectedOverlayId,
        zoom: state.zoom,
      });
      return { project };
    });
  },

  trimClip: (clipId, edge, delta) => {
    set((state) => {
      const project = updateProject({
        ...state.project,
        clips: state.project.clips.map((clip) => {
          if (clip.id !== clipId) {
            return clip;
          }
          if (edge === 'start') {
            const nextSourceStart = clamp(clip.sourceStart + delta, 0, clip.sourceStart + clip.duration - 0.25);
            const diff = nextSourceStart - clip.sourceStart;
            return {
              ...clip,
              sourceStart: nextSourceStart,
              startTime: clamp(clip.startTime + diff, 0, 3600),
              duration: Math.max(0.25, clip.duration - diff),
            };
          }
          return {
            ...clip,
            duration: Math.max(0.25, clip.duration + delta),
          };
        }),
      });
      syncProject(project, {
        selectedAssetId: state.selectedAssetId,
        selectedClipId: state.selectedClipId,
        selectedOverlayId: state.selectedOverlayId,
        zoom: state.zoom,
      });
      return { project };
    });
  },

  splitSelectedClip: () => {
    set((state) => {
      if (!state.selectedClipId) {
        return {
          ...state,
          statusMessage: 'Select a clip before splitting at the playhead.',
        };
      }
      const clip = state.project.clips.find((item) => item.id === state.selectedClipId);
      if (!clip) {
        return state;
      }
      const splitAt = state.playback.currentTime;
      if (splitAt <= clip.startTime + 0.1 || splitAt >= clip.startTime + clip.duration - 0.1) {
        return {
          ...state,
          statusMessage: 'Place the playhead inside the clip to split it.',
        };
      }

      const leftDuration = splitAt - clip.startTime;
      const rightDuration = clip.duration - leftDuration;
      const rightClip: Clip = {
        ...clip,
        id: createId('clip'),
        startTime: splitAt,
        duration: rightDuration,
        sourceStart: clip.sourceStart + leftDuration,
      };

      const project = updateProject({
        ...state.project,
        clips: sortByStart(
          state.project.clips.flatMap((item) =>
            item.id === clip.id
              ? [{ ...item, duration: leftDuration }, rightClip]
              : [item],
          ),
        ),
      });
      syncProject(project, {
        selectedAssetId: state.selectedAssetId,
        selectedClipId: rightClip.id,
        selectedOverlayId: null,
        zoom: state.zoom,
      });
      return {
        project,
        selectedClipId: rightClip.id,
        selectedOverlayId: null,
        statusMessage: 'Clip split at the playhead.',
      };
    });
  },

  deleteSelection: () => {
    set((state) => {
      if (state.selectedClipId) {
        const project = updateProject({
          ...state.project,
          clips: state.project.clips.filter((clip) => clip.id !== state.selectedClipId),
        });
        syncProject(project, {
          selectedAssetId: state.selectedAssetId,
          selectedClipId: null,
          selectedOverlayId: state.selectedOverlayId,
          zoom: state.zoom,
        });
        return {
          project,
          selectedClipId: null,
          statusMessage: 'Clip removed from the timeline.',
        };
      }

      if (state.selectedOverlayId) {
        const project = updateProject({
          ...state.project,
          overlays: state.project.overlays.filter((overlay) => overlay.id !== state.selectedOverlayId),
        });
        syncProject(project, {
          selectedAssetId: state.selectedAssetId,
          selectedClipId: null,
          selectedOverlayId: null,
          zoom: state.zoom,
        });
        return {
          project,
          selectedOverlayId: null,
          statusMessage: 'Overlay removed from the timeline.',
        };
      }

      return {
        ...state,
        statusMessage: 'Select a clip or overlay before deleting.',
      };
    });
  },

  setPlayhead: (time) =>
    set((state) => ({
      playback: {
        ...state.playback,
        currentTime: clamp(time, 0, state.project.duration),
      },
    })),

  setPlaying: (isPlaying) =>
    set((state) => ({
      playback: {
        ...state.playback,
        isPlaying,
      },
    })),

  tickPlayback: (deltaSeconds) =>
    set((state) => {
      if (!state.playback.isPlaying) {
        return state;
      }
      const nextTime = state.playback.currentTime + deltaSeconds;
      if (nextTime >= state.project.duration) {
        return {
          playback: {
            ...state.playback,
            currentTime: state.project.duration,
            isPlaying: false,
          },
        };
      }
      return {
        playback: {
          ...state.playback,
          currentTime: nextTime,
        },
      };
    }),

  setZoom: (zoom) => set({ zoom }),

  updateTextOverlay: (overlayId, patch) => {
    set((state) => {
      const project = updateProject({
        ...state.project,
        overlays: state.project.overlays.map((overlay) =>
          overlay.id === overlayId && overlay.type === 'text' ? { ...overlay, ...patch } : overlay,
        ) as Overlay[],
      });
      syncProject(project, {
        selectedAssetId: state.selectedAssetId,
        selectedClipId: state.selectedClipId,
        selectedOverlayId: state.selectedOverlayId,
        zoom: state.zoom,
      });
      return { project };
    });
  },

  updateImageOverlay: (overlayId, patch) => {
    set((state) => {
      const project = updateProject({
        ...state.project,
        overlays: state.project.overlays.map((overlay) =>
          overlay.id === overlayId && overlay.type === 'image' ? { ...overlay, ...patch } : overlay,
        ) as Overlay[],
      });
      syncProject(project, {
        selectedAssetId: state.selectedAssetId,
        selectedClipId: state.selectedClipId,
        selectedOverlayId: state.selectedOverlayId,
        zoom: state.zoom,
      });
      return { project };
    });
  },

  setExportJob: (job) =>
    set((state) => ({
      exportJob: {
        ...state.exportJob,
        ...job,
      },
    })),
}));
