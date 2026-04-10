import { create } from 'zustand';
import { getAssetBlob, putAssetBlob } from '../lib/idb';
import { clamp, createId } from '../lib/time';
import type {
  Asset,
  Clip,
  ExportJob,
  ImageOverlay,
  OverlayAnchor,
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
    { id: 'track-video-1', kind: 'video', label: 'Video 1', accepts: ['clip'], clipIds: [], muteable: true, muted: false },
    { id: 'track-video-2', kind: 'video', label: 'Video 2', accepts: ['clip', 'image-overlay'], clipIds: [], muteable: true, muted: false },
    { id: 'track-titles', kind: 'titles', label: 'Titles', accepts: ['text-overlay'], clipIds: [] },
    { id: 'track-audio-1', kind: 'audio', label: 'Audio 1', accepts: ['clip'], clipIds: [], muteable: true, muted: false },
    { id: 'track-effects', kind: 'effects', label: 'Effects', accepts: ['clip'], clipIds: [] },
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
  addImageOverlay: (assetId: string, options?: { anchor?: OverlayAnchor; asLogo?: boolean }) => void;
  toggleTrackMute: (trackId: string) => void;
  selectAsset: (assetId: string | null) => void;
  selectClip: (clipId: string | null) => void;
  selectOverlay: (overlayId: string | null) => void;
  moveClip: (clipId: string, startTime: number) => void;
  moveOverlay: (overlayId: string, startTime: number) => void;
  trimClip: (clipId: string, edge: 'start' | 'end', delta: number) => void;
  updateClip: (clipId: string, patch: Partial<Clip>) => void;
  splitSelectedClip: () => void;
  duplicateSelection: () => void;
  deleteSelection: () => void;
  setPlayhead: (time: number) => void;
  nudgePlayhead: (deltaSeconds: number) => void;
  setPlaying: (isPlaying: boolean) => void;
  tickPlayback: (deltaSeconds: number) => void;
  setZoom: (zoom: number) => void;
  updateProjectName: (name: string) => void;
  updateTextOverlay: (overlayId: string, patch: Partial<TextOverlay>) => void;
  updateImageOverlay: (overlayId: string, patch: Partial<ImageOverlay>) => void;
  snapOverlayToAnchor: (overlayId: string, anchor: OverlayAnchor) => void;
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

function normalizeOverlay<T extends Overlay>(overlay: T): T {
  return {
    ...overlay,
    anchor: overlay.anchor ?? 'free',
  };
}

function normalizeProject(project: Project): Project {
  const fallbackTracks = emptyProject().tracks;
  return updateProject({
    ...project,
    overlays: project.overlays.map((overlay) => normalizeOverlay(overlay)),
    clips: project.clips.map((clip) => ({
      ...clip,
      trackId:
        clip.trackId ??
        (project.assets.find((asset) => asset.id === clip.assetId)?.type === 'audio' ? 'track-audio-1' : 'track-video-1'),
      volume: clip.volume ?? 1,
      playbackRate: clip.playbackRate ?? 1,
    })),
    tracks:
      project.tracks?.length
        ? project.tracks.map((track) => {
            if (track.id === 'track-primary' || track.kind === ('primary' as never)) {
              return fallbackTracks[0];
            }
            if (track.id === 'track-overlay' || track.kind === ('overlay' as never)) {
              return fallbackTracks[1];
            }
            return track;
          })
        : fallbackTracks,
  });
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

  if (file.type.startsWith('audio/')) {
    const audio = document.createElement('audio');
    audio.src = objectUrl;
    audio.preload = 'metadata';
    await new Promise<void>((resolve, reject) => {
      audio.onloadedmetadata = () => resolve();
      audio.onerror = () => reject(new Error(`Could not load ${file.name}`));
    });
    URL.revokeObjectURL(objectUrl);
    return {
      name: file.name,
      type: 'audio',
      mimeType: file.type,
      duration: Number.isFinite(audio.duration) ? audio.duration : 5,
      width: 0,
      height: 0,
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
      project: normalizeProject({ ...payload.project, assets }),
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
      if (!file.type.startsWith('video/') && !file.type.startsWith('image/') && !file.type.startsWith('audio/')) {
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
      const trackId = asset.type === 'audio' ? 'track-audio-1' : 'track-video-1';
      const clip: Clip = {
        id: createId('clip'),
        assetId,
        trackId,
        startTime: currentEnd,
        duration: asset.duration,
        sourceStart: 0,
        volume: 1,
        playbackRate: 1,
      };
      const project = updateProject({
        ...state.project,
        clips: sortByStart([...state.project.clips, clip]),
        tracks: state.project.tracks.map((track) =>
          track.id === trackId ? { ...track, clipIds: [...track.clipIds, clip.id] } : track,
        ),
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
        statusMessage: `${asset.name} added to ${asset.type === 'audio' ? 'Audio 1' : 'Video 1'}.`,
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
        anchor: 'free',
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

  addImageOverlay: (assetId, options) => {
    set((state) => {
      const asset = state.project.assets.find((item) => item.id === assetId && item.type === 'image');
      if (!asset) {
        return {
          ...state,
          statusMessage: 'Select an image asset before adding an image overlay.',
        };
      }
      const anchor = options?.anchor ?? 'free';
      const size = options?.asLogo ? 18 : 22;
      const overlay: ImageOverlay = {
        id: createId('overlay'),
        type: 'image',
        assetId,
        startTime: state.playback.currentTime,
        duration: options?.asLogo ? Math.max(4, state.project.duration - state.playback.currentTime) : 4,
        x: anchor === 'free' ? 68 : 0,
        y: anchor === 'free' ? 8 : 0,
        width: size,
        height: size,
        opacity: 1,
        anchor,
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
        statusMessage:
          anchor === 'free' ? `${asset.name} added as an overlay.` : `${asset.name} added as a ${anchor} logo.`,
      };
    });
  },

  toggleTrackMute: (trackId) => {
    set((state) => {
      const project = updateProject({
        ...state.project,
        tracks: state.project.tracks.map((track) =>
          track.id === trackId ? { ...track, muted: !track.muted } : track,
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

  updateClip: (clipId, patch) => {
    set((state) => {
      const clip = state.project.clips.find((item) => item.id === clipId);
      if (!clip) {
        return state;
      }
      const asset = state.project.assets.find((item) => item.id === clip.assetId);
      const nextSourceStart = clamp(patch.sourceStart ?? clip.sourceStart, 0, Math.max(0, asset?.duration ?? 3600));
      const maxDuration = Math.max(0.25, (asset?.duration ?? 3600) - nextSourceStart);
      const nextDuration = clamp(patch.duration ?? clip.duration, 0.25, maxDuration);
      const nextClip: Clip = {
        ...clip,
        ...patch,
        sourceStart: nextSourceStart,
        duration: nextDuration,
        startTime: clamp(patch.startTime ?? clip.startTime, 0, 3600),
      };
      const project = updateProject({
        ...state.project,
        clips: sortByStart(state.project.clips.map((item) => (item.id === clipId ? nextClip : item))),
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
        tracks: state.project.tracks.map((track) =>
          track.id === clip.trackId ? { ...track, clipIds: track.clipIds.flatMap((id) => (id === clip.id ? [clip.id, rightClip.id] : [id])) } : track,
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

  duplicateSelection: () => {
    set((state) => {
      if (state.selectedClipId) {
        const clip = state.project.clips.find((item) => item.id === state.selectedClipId);
        if (!clip) {
          return state;
        }
        const duplicate: Clip = {
          ...clip,
          id: createId('clip'),
          startTime: clip.startTime + clip.duration,
        };
        const project = updateProject({
          ...state.project,
          clips: sortByStart([...state.project.clips, duplicate]),
          tracks: state.project.tracks.map((track) =>
            track.id === clip.trackId ? { ...track, clipIds: [...track.clipIds, duplicate.id] } : track,
          ),
        });
        syncProject(project, {
          selectedAssetId: state.selectedAssetId,
          selectedClipId: duplicate.id,
          selectedOverlayId: null,
          zoom: state.zoom,
        });
        return {
          project,
          selectedClipId: duplicate.id,
          selectedOverlayId: null,
          statusMessage: 'Clip duplicated.',
        };
      }

      if (state.selectedOverlayId) {
        const overlay = state.project.overlays.find((item) => item.id === state.selectedOverlayId);
        if (!overlay) {
          return state;
        }
        const duplicate = normalizeOverlay({
          ...overlay,
          id: createId('overlay'),
          startTime: overlay.startTime + 0.5,
        });
        const project = updateProject({
          ...state.project,
          overlays: sortByStart([...state.project.overlays, duplicate]),
        });
        syncProject(project, {
          selectedAssetId: state.selectedAssetId,
          selectedClipId: null,
          selectedOverlayId: duplicate.id,
          zoom: state.zoom,
        });
        return {
          project,
          selectedClipId: null,
          selectedOverlayId: duplicate.id,
          statusMessage: 'Overlay duplicated.',
        };
      }

      return {
        ...state,
        statusMessage: 'Select a clip or overlay before duplicating.',
      };
    });
  },

  deleteSelection: () => {
    set((state) => {
      if (state.selectedClipId) {
        const project = updateProject({
          ...state.project,
          clips: state.project.clips.filter((clip) => clip.id !== state.selectedClipId),
          tracks: state.project.tracks.map((track) => ({
            ...track,
            clipIds: track.clipIds.filter((id) => id !== state.selectedClipId),
          })),
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

  nudgePlayhead: (deltaSeconds) =>
    set((state) => ({
      playback: {
        ...state.playback,
        currentTime: clamp(state.playback.currentTime + deltaSeconds, 0, state.project.duration),
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

  updateProjectName: (name) =>
    set((state) => {
      const project = updateProject({
        ...state.project,
        name: name.trim() || 'Untitled Sequence',
      });
      syncProject(project, {
        selectedAssetId: state.selectedAssetId,
        selectedClipId: state.selectedClipId,
        selectedOverlayId: state.selectedOverlayId,
        zoom: state.zoom,
      });
      return { project };
    }),

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

  snapOverlayToAnchor: (overlayId, anchor) => {
    set((state) => {
      const overlay = state.project.overlays.find((item) => item.id === overlayId);
      if (!overlay) {
        return state;
      }
      const project = updateProject({
        ...state.project,
        overlays: state.project.overlays.map((item) =>
          item.id === overlayId
            ? {
                ...item,
                anchor,
                x: anchor === 'free' ? item.x : 0,
                y: anchor === 'free' ? item.y : 0,
              }
            : item,
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
