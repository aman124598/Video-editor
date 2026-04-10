import { useEffect, useMemo, useRef } from 'react';
import { useEditorStore } from '../store/editorStore';
import type { Asset, Clip, ImageOverlay, Overlay } from '../types/editor';

interface PreviewStageProps {
  currentTime: number;
}

type RendererState = {
  device: GPUDevice;
  context: GPUCanvasContext;
  format: GPUTextureFormat;
  videoPipeline: GPURenderPipeline;
  imagePipeline: GPURenderPipeline;
  sampler: GPUSampler;
};

async function setupRenderer(canvas: HTMLCanvasElement): Promise<RendererState> {
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) {
    throw new Error('No GPU adapter available.');
  }

  const device = await adapter.requestDevice();
  const context = canvas.getContext('webgpu') as GPUCanvasContext | null;
  if (!context) {
    throw new Error('Could not create a WebGPU canvas context.');
  }

  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({
    device,
    format,
    alphaMode: 'opaque',
  });

  const vertexModule = device.createShaderModule({
    code: `
      struct VertexOutput {
        @builtin(position) position: vec4f,
        @location(0) uv: vec2f,
      };

      @vertex
      fn main(@builtin(vertex_index) index: u32) -> VertexOutput {
        var positions = array<vec2f, 6>(
          vec2f(-1.0, -1.0),
          vec2f(1.0, -1.0),
          vec2f(-1.0, 1.0),
          vec2f(-1.0, 1.0),
          vec2f(1.0, -1.0),
          vec2f(1.0, 1.0)
        );
        var uvs = array<vec2f, 6>(
          vec2f(0.0, 1.0),
          vec2f(1.0, 1.0),
          vec2f(0.0, 0.0),
          vec2f(0.0, 0.0),
          vec2f(1.0, 1.0),
          vec2f(1.0, 0.0)
        );
        var output: VertexOutput;
        output.position = vec4f(positions[index], 0.0, 1.0);
        output.uv = uvs[index];
        return output;
      }
    `,
  });

  const videoModule = device.createShaderModule({
    code: `
      @group(0) @binding(0) var videoSampler: sampler;
      @group(0) @binding(1) var videoTexture: texture_external;

      @fragment
      fn main(@location(0) uv: vec2f) -> @location(0) vec4f {
        return textureSampleBaseClampToEdge(videoTexture, videoSampler, uv);
      }
    `,
  });

  const imageModule = device.createShaderModule({
    code: `
      @group(0) @binding(0) var imageSampler: sampler;
      @group(0) @binding(1) var imageTexture: texture_2d<f32>;

      @fragment
      fn main(@location(0) uv: vec2f) -> @location(0) vec4f {
        return textureSample(imageTexture, imageSampler, uv);
      }
    `,
  });

  const pipelineBase = {
    layout: 'auto',
    vertex: {
      module: vertexModule,
      entryPoint: 'main',
    },
    primitive: {
      topology: 'triangle-list',
    },
  } as const;

  const videoPipeline = device.createRenderPipeline({
    ...pipelineBase,
    fragment: {
      module: videoModule,
      entryPoint: 'main',
      targets: [{ format }],
    },
  });

  const imagePipeline = device.createRenderPipeline({
    ...pipelineBase,
    fragment: {
      module: imageModule,
      entryPoint: 'main',
      targets: [{ format }],
    },
  });

  const sampler = device.createSampler({
    magFilter: 'linear',
    minFilter: 'linear',
  });

  return { device, context, format, videoPipeline, imagePipeline, sampler };
}

async function createImageTexture(device: GPUDevice, image: HTMLImageElement) {
  const bitmap = await createImageBitmap(image);
  const texture = device.createTexture({
    size: [bitmap.width, bitmap.height, 1],
    format: 'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
  });
  device.queue.copyExternalImageToTexture({ source: bitmap }, { texture }, [bitmap.width, bitmap.height]);
  return texture;
}

function findActiveClip(clips: Clip[], currentTime: number) {
  return clips.find(
    (clip) => currentTime >= clip.startTime && currentTime <= clip.startTime + clip.duration,
  );
}

function findVisibleOverlays(overlays: Overlay[], currentTime: number) {
  return overlays.filter(
    (overlay) => currentTime >= overlay.startTime && currentTime <= overlay.startTime + overlay.duration,
  );
}

export function PreviewStage({ currentTime }: PreviewStageProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<RendererState | null>(null);
  const project = useEditorStore((state) => state.project);
  const overlays = useMemo(() => findVisibleOverlays(project.overlays, currentTime), [project.overlays, currentTime]);
  const activeClip = useMemo(() => findActiveClip(project.clips, currentTime), [project.clips, currentTime]);
  const activeAsset = useMemo(
    () => project.assets.find((asset) => asset.id === activeClip?.assetId),
    [project.assets, activeClip?.assetId],
  );
  const videoElementRef = useRef<HTMLVideoElement | null>(null);
  const imageTextureRef = useRef<GPUTexture | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    setupRenderer(canvas)
      .then((renderer) => {
        rendererRef.current = renderer;
      })
      .catch(() => {
        rendererRef.current = null;
      });
  }, []);

  useEffect(() => {
    if (!activeAsset?.objectUrl) {
      videoElementRef.current = null;
      imageTextureRef.current?.destroy();
      imageTextureRef.current = null;
      return;
    }

    if (activeAsset.type === 'video') {
      const video = document.createElement('video');
      video.src = activeAsset.objectUrl;
      video.crossOrigin = 'anonymous';
      video.muted = true;
      video.playsInline = true;
      video.preload = 'auto';
      void video.play().catch(() => undefined);
      videoElementRef.current = video;
      imageTextureRef.current?.destroy();
      imageTextureRef.current = null;
      return;
    }

    const image = new Image();
    image.src = activeAsset.objectUrl;
    image.onload = async () => {
      const renderer = rendererRef.current;
      if (renderer) {
        imageTextureRef.current?.destroy();
        imageTextureRef.current = await createImageTexture(renderer.device, image);
      }
    };
    videoElementRef.current = null;
  }, [activeAsset]);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) {
      return;
    }

    const commandEncoder = renderer.device.createCommandEncoder();
    const view = renderer.context.getCurrentTexture().createView();
    const pass = commandEncoder.beginRenderPass({
      colorAttachments: [
        {
          view,
          loadOp: 'clear',
          storeOp: 'store',
          clearValue: { r: 0.02, g: 0.02, b: 0.02, a: 1 },
        },
      ],
    });

    const video = videoElementRef.current;
    if (activeClip && activeAsset?.type === 'video' && video && video.readyState >= 2) {
      const clipTime = activeClip.sourceStart + (currentTime - activeClip.startTime);
      if (Math.abs(video.currentTime - clipTime) > 0.05) {
        video.currentTime = clipTime;
      }
      const bindGroup = renderer.device.createBindGroup({
        layout: renderer.videoPipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: renderer.sampler },
          { binding: 1, resource: renderer.device.importExternalTexture({ source: video }) },
        ],
      });
      pass.setPipeline(renderer.videoPipeline);
      pass.setBindGroup(0, bindGroup);
      pass.draw(6);
    } else if (activeAsset?.type === 'image' && imageTextureRef.current) {
      const bindGroup = renderer.device.createBindGroup({
        layout: renderer.imagePipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: renderer.sampler },
          { binding: 1, resource: imageTextureRef.current.createView() },
        ],
      });
      pass.setPipeline(renderer.imagePipeline);
      pass.setBindGroup(0, bindGroup);
      pass.draw(6);
    }

    pass.end();
    renderer.device.queue.submit([commandEncoder.finish()]);
  }, [activeAsset, activeClip, currentTime]);

  return (
    <section className="panel preview-stage">
      <div className="panel-header">
        <div>
          <span className="panel-kicker">Preview</span>
          <h2>GPU stage</h2>
        </div>
        <div className="pill">{activeAsset ? activeAsset.name : 'No clip at playhead'}</div>
      </div>

      <div className="stage-frame">
        <canvas ref={canvasRef} className="preview-canvas" width={1280} height={720} />
        <div className="overlay-layer">
          {overlays.map((overlay) =>
            overlay.type === 'text' ? (
              <div
                key={overlay.id}
                className="text-overlay"
                style={{
                  left: `${overlay.x}%`,
                  top: `${overlay.y}%`,
                  width: `${overlay.width}%`,
                  height: `${overlay.height}%`,
                  opacity: overlay.opacity,
                  color: overlay.color,
                  fontSize: `${overlay.fontSize}px`,
                }}
              >
                {overlay.text}
              </div>
            ) : (
              <ImageOverlayView key={overlay.id} overlay={overlay} assets={project.assets} />
            ),
          )}
          {!activeAsset ? <div className="stage-placeholder">Import media and add it to the timeline to preview.</div> : null}
        </div>
      </div>
    </section>
  );
}

function ImageOverlayView({ overlay, assets }: { overlay: ImageOverlay; assets: Asset[] }) {
  const asset = assets.find((item) => item.id === overlay.assetId);
  if (!asset?.objectUrl) {
    return null;
  }

  return (
    <img
      className="image-overlay"
      src={asset.objectUrl}
      alt=""
      style={{
        left: `${overlay.x}%`,
        top: `${overlay.y}%`,
        width: `${overlay.width}%`,
        height: `${overlay.height}%`,
        opacity: overlay.opacity,
      }}
    />
  );
}
