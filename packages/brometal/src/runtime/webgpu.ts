/// <reference types="@webgpu/types" />
import type { AttributeLayoutEntry, CompiledShader, GpuRecord, GpuType } from '../dsl/types.js';
import type { AttributeHandle, BroMetalProgram, DrawOptions, UniformHandle } from './program.js';
import type { DrawToOptions, Renderer, RendererOptions } from './context.js';
import type { BroMetalTexture, TextureOptions } from './texture.js';
import type { UniformValue } from './uniforms.js';
import type { RenderTarget } from './render-target.js';
import { resizeToDisplaySize } from './canvas.js';
import { resolveDrawCount } from './buffers.js';

/**
 * Render targets hold numbers, not pictures. rgba16float rather than 32: full
 * float is `unfilterable-float` in WebGPU unless the device opts into the
 * float32-filterable feature, so it cannot bind to the same sampler layout
 * every other texture uses. Half float is filterable everywhere, and its ~1e-3
 * resolution is finer than a simulation step moves anything in one frame.
 */
const TARGET_FORMAT: GPUTextureFormat = 'rgba16float';

/** WebGPU-backed render target internals (not part of the public API). */
export interface WebgpuTargetInternals {
  texture: GPUTexture;
  view: GPUTextureView;
  depthView: GPUTextureView | null;
}

/** Internal fields carried by WebGPU-backed renderers (not part of the public API). */
export interface WebgpuInternals {
  device: GPUDevice;
  context: GPUCanvasContext;
  format: GPUTextureFormat;
  clearColor: readonly [number, number, number, number];
  cull: 'back' | 'none';
  /** 4 when antialiasing (the default), 1 when the renderer was created with antialias: false. */
  sampleCount: number;
  /** Live only while a loop callback runs. */
  pass: GPURenderPassEncoder | null;
  /**
   * Attachment shape of the open pass. A pipeline bakes in its colour format,
   * sample count and whether a depth attachment exists, so a program drawing
   * into a render target needs a different pipeline than the same program
   * drawing to the screen.
   */
  passFormat: GPUTextureFormat;
  passSamples: number;
  passDepth: boolean;
  /** Increments once per rendered frame — programs use it to reset their uniform slot rings. */
  frame: number;
}

const INTERNALS = new WeakMap<Renderer, WebgpuInternals>();

export function webgpuInternals(renderer: Renderer): WebgpuInternals {
  const internals = INTERNALS.get(renderer);
  if (internals === undefined) {
    throw new Error('BroMetal: renderer is not WebGPU-backed');
  }
  return internals;
}

export async function createWebgpuRenderer(
  canvas: HTMLCanvasElement,
  options: RendererOptions,
): Promise<Renderer> {
  const gpu = (navigator as Navigator & { gpu?: GPU }).gpu;
  if (gpu === undefined) {
    throw new Error('BroMetal: WebGPU is not available in this browser');
  }
  const adapter = await gpu.requestAdapter({
    powerPreference: options.powerPreference === 'low-power' ? 'low-power' : 'high-performance',
  });
  if (adapter === null) {
    throw new Error('BroMetal: WebGPU adapter request was refused');
  }
  const device = await adapter.requestDevice();
  const context = canvas.getContext('webgpu');
  if (context === null) {
    throw new Error('BroMetal: could not create a WebGPU canvas context');
  }
  const format = gpu.getPreferredCanvasFormat();
  context.configure({ device, format, alphaMode: 'opaque' });

  const internals: WebgpuInternals = {
    device,
    context,
    format,
    clearColor: options.clearColor ?? [0, 0, 0, 1],
    cull: options.cull === 'back' ? 'back' : 'none',
    sampleCount: options.antialias === false ? 1 : 4,
    pass: null,
    passFormat: format,
    passSamples: options.antialias === false ? 1 : 4,
    passDepth: true,
    frame: 0,
  };

  let depthTexture: GPUTexture | null = null;
  let depthView: GPUTextureView | null = null;
  let msaaTexture: GPUTexture | null = null;
  let msaaView: GPUTextureView | null = null;
  let needsResize = true;
  const observer =
    typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => {
          needsResize = true;
        })
      : null;
  observer?.observe(canvas);

  const activeStops = new Set<() => void>();

  const renderer: Renderer = {
    backend: 'webgpu',
    canvas,
    get aspect(): number {
      return canvas.width / Math.max(canvas.height, 1);
    },
    loop(callback: (elapsedSeconds: number) => void): () => void {
      let frameId = 0;
      let running = true;
      const startedAt = performance.now();

      const frame = (now: number): void => {
        if (!running) return;
        if (needsResize || observer === null) {
          needsResize = false;
          resizeToDisplaySize(canvas, window.devicePixelRatio || 1);
          if (depthTexture === null || depthTexture.width !== canvas.width || depthTexture.height !== canvas.height) {
            depthTexture?.destroy();
            depthTexture = device.createTexture({
              size: [canvas.width, canvas.height],
              format: 'depth24plus',
              sampleCount: internals.sampleCount,
              usage: GPUTextureUsage.RENDER_ATTACHMENT,
            });
            depthView = depthTexture.createView();
            if (internals.sampleCount > 1) {
              msaaTexture?.destroy();
              msaaTexture = device.createTexture({
                size: [canvas.width, canvas.height],
                format,
                sampleCount: internals.sampleCount,
                usage: GPUTextureUsage.RENDER_ATTACHMENT,
              });
              msaaView = msaaTexture.createView();
            }
          }
        }
        internals.frame++;
        const [r, g, b, a] = internals.clearColor;
        const encoder = device.createCommandEncoder();
        // With MSAA the pass renders into the multisampled texture and
        // resolves into the swapchain; the samples themselves are discarded.
        const swapchainView = context.getCurrentTexture().createView();
        internals.pass = encoder.beginRenderPass({
          colorAttachments: [
            msaaView !== null
              ? {
                  view: msaaView,
                  resolveTarget: swapchainView,
                  clearValue: { r, g, b, a },
                  loadOp: 'clear',
                  storeOp: 'discard',
                }
              : {
                  view: swapchainView,
                  clearValue: { r, g, b, a },
                  loadOp: 'clear',
                  storeOp: 'store',
                },
          ],
          depthStencilAttachment: {
            view: depthView!,
            depthClearValue: 1,
            depthLoadOp: 'clear',
            depthStoreOp: 'store',
          },
        });
        internals.passFormat = format;
        internals.passSamples = internals.sampleCount;
        internals.passDepth = true;
        callback((now - startedAt) / 1000);
        internals.pass.end();
        internals.pass = null;
        device.queue.submit([encoder.finish()]);
        frameId = requestAnimationFrame(frame);
      };
      frameId = requestAnimationFrame(frame);

      const stop = (): void => {
        running = false;
        cancelAnimationFrame(frameId);
      };
      activeStops.add(stop);
      return () => {
        stop();
        activeStops.delete(stop);
      };
    },
    drawTo(target: RenderTarget, draw: () => void, options: DrawToOptions = {}): void {
      const binding = (target as RenderTarget & { __wgpu?: WebgpuTargetInternals }).__wgpu;
      if (binding === undefined) {
        throw new Error('BroMetal: this render target was not created by the WebGPU renderer');
      }
      const [cr, cg, cb, ca] = options.clear ?? [0, 0, 0, 0];
      // A separate encoder, finished and submitted here: the frame's swapchain
      // pass may be open and must not be interrupted, and queue order puts this
      // work ahead of it — which is what a physics pass wants.
      const encoder = device.createCommandEncoder();
      const outerPass = internals.pass;
      const outerFormat = internals.passFormat;
      const outerSamples = internals.passSamples;
      const outerDepth = internals.passDepth;
      internals.pass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: binding.view,
            clearValue: { r: cr, g: cg, b: cb, a: ca },
            loadOp: 'clear',
            storeOp: 'store',
          },
        ],
        // The pass and the pipeline must agree on whether depth exists, which
        // is why passDepth below tracks this rather than being hardcoded.
        ...(binding.depthView === null
          ? {}
          : {
              depthStencilAttachment: {
                view: binding.depthView,
                depthClearValue: 1,
                depthLoadOp: 'clear' as const,
                depthStoreOp: 'store' as const,
              },
            }),
      });
      internals.passFormat = TARGET_FORMAT;
      internals.passSamples = 1;
      internals.passDepth = binding.depthView !== null;
      try {
        draw();
      } finally {
        internals.pass.end();
        internals.pass = outerPass;
        internals.passFormat = outerFormat;
        internals.passSamples = outerSamples;
        internals.passDepth = outerDepth;
        device.queue.submit([encoder.finish()]);
      }
    },
    destroy(): void {
      for (const stop of activeStops) {
        stop();
      }
      activeStops.clear();
      observer?.disconnect();
      depthTexture?.destroy();
      msaaTexture?.destroy();
      device.destroy();
    },
  };

  INTERNALS.set(renderer, internals);
  return renderer;
}

const VERTEX_FORMATS: Record<number, GPUVertexFormat> = {
  1: 'float32',
  2: 'float32x2',
  3: 'float32x3',
  4: 'float32x4',
};

interface GpuAttributeState {
  buffer: GPUBuffer;
  capacity: number;
  elementCount: number;
  /**
   * Byte offset the most recent upload was written at, and the frame it
   * happened in. A second upload within one frame appends rather than
   * overwriting — see `uploadAttribute`.
   */
  offset: number;
  writtenThisFrame: number;
  frame: number;
}

interface GpuTextureBinding {
  view: GPUTextureView;
  sampler: GPUSampler;
}

export function createWebgpuProgram<A extends GpuRecord, I extends GpuRecord, U extends GpuRecord>(
  renderer: Renderer,
  compiled: CompiledShader<A, I, U>,
  blend: 'none' | 'alpha' | 'additive' = 'none',
): BroMetalProgram<A, I, U> {
  const internals = webgpuInternals(renderer);
  const { device } = internals;
  if (compiled.wgslSrc === undefined || compiled.wgslSrc === '') {
    throw new Error(
      'BroMetal: this shader was compiled without the webgpu target — recompile with --targets=webgl2,webgpu',
    );
  }

  const module = device.createShaderModule({ code: compiled.wgslSrc });

  // Bind group layout mirrors the compile-time plan exactly.
  const bglEntries: GPUBindGroupLayoutEntry[] = [];
  if (compiled.layout.uniformBlockSize > 0) {
    bglEntries.push({
      binding: 0,
      visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
      // Dynamic offset: each draw binds its own 256-aligned slot of a shared
      // buffer, so multiple draws per frame keep their own uniform values.
      buffer: { type: 'uniform', hasDynamicOffset: true },
    });
  }
  for (const entry of compiled.layout.uniforms) {
    if (entry.type === 'sampler2D') {
      bglEntries.push({
        binding: entry.textureBinding!,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        texture: { sampleType: 'float', viewDimension: '2d' },
      });
      bglEntries.push({
        binding: entry.samplerBinding!,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        sampler: { type: 'filtering' },
      });
    }
  }
  const bindGroupLayout = device.createBindGroupLayout({ entries: bglEntries });

  const pipelines = new Map<string, GPURenderPipeline>();
  const pipelineFor = (
    targetFormat: GPUTextureFormat,
    sampleCount: number,
    withDepth: boolean,
  ): GPURenderPipeline => {
    const key = `${targetFormat}|${sampleCount}|${withDepth ? 'd' : ''}`;
    const cached = pipelines.get(key);
    if (cached !== undefined) {
      return cached;
    }
    const built = device.createRenderPipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] }),
    vertex: {
      module,
      entryPoint: 'vs_main',
      buffers: compiled.layout.attributes.map((entry) => ({
        arrayStride: entry.size * 4,
        stepMode: entry.divisor === 1 ? ('instance' as const) : ('vertex' as const),
        attributes: [
          { shaderLocation: entry.location, offset: 0, format: VERTEX_FORMATS[entry.size]! },
        ],
      })),
    },
    fragment: {
      module,
      entryPoint: 'fs_main',
      targets: [
        {
          format: targetFormat,
          ...(blend === 'none'
            ? {}
            : {
                blend: {
                  color: {
                    srcFactor: 'src-alpha',
                    dstFactor: blend === 'alpha' ? 'one-minus-src-alpha' : 'one',
                    operation: 'add',
                  },
                  alpha: {
                    srcFactor: 'one',
                    dstFactor: blend === 'alpha' ? 'one-minus-src-alpha' : 'one',
                    operation: 'add',
                  },
                },
              }),
        },
      ],
    },
    primitive: { topology: 'triangle-list', frontFace: 'ccw', cullMode: internals.cull },
      multisample: { count: sampleCount },
      // A target pass carries no depth attachment, so the pipeline must not
      // declare one either — the two have to agree exactly.
      ...(withDepth
        ? {
            depthStencil: {
              format: 'depth24plus' as const,
              depthWriteEnabled: blend === 'none',
              depthCompare: 'less' as const,
            },
          }
        : {}),
    });
    pipelines.set(key, built);
    return built;
  };

  // Per-draw uniform slots in one buffer, bound via dynamic offset — this is
  // what lets one program draw many times per frame with different uniforms.
  const uniformData = new Float32Array(compiled.layout.uniformBlockSize / 4);
  const slotStride = Math.ceil(compiled.layout.uniformBlockSize / 256) * 256;
  let slotCapacity = 64;
  let uniformBuffer =
    compiled.layout.uniformBlockSize > 0
      ? device.createBuffer({
          size: slotStride * slotCapacity,
          usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        })
      : null;
  let uniformsDirty = true;
  let slot = -1;
  let currentOffset = 0;
  let lastFrame = -1;

  // Samplers start bound to a 1px placeholder so draws never see a hole.
  const placeholderTexture = device.createTexture({
    size: [1, 1],
    format: 'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  device.queue.writeTexture(
    { texture: placeholderTexture },
    new Uint8Array([160, 160, 170, 255]),
    { bytesPerRow: 4 },
    [1, 1],
  );
  const placeholderBinding: GpuTextureBinding = {
    view: placeholderTexture.createView(),
    sampler: device.createSampler({ magFilter: 'linear', minFilter: 'linear' }),
  };

  const textureBindings = new Map<string, GpuTextureBinding>();
  let bindGroup: GPUBindGroup | null = null;

  const buildBindGroup = (): GPUBindGroup => {
    const entries: GPUBindGroupEntry[] = [];
    if (uniformBuffer !== null) {
      entries.push({
        binding: 0,
        resource: { buffer: uniformBuffer, offset: 0, size: compiled.layout.uniformBlockSize },
      });
    }
    for (const entry of compiled.layout.uniforms) {
      if (entry.type === 'sampler2D') {
        const binding = textureBindings.get(entry.name) ?? placeholderBinding;
        entries.push({ binding: entry.textureBinding!, resource: binding.view });
        entries.push({ binding: entry.samplerBinding!, resource: binding.sampler });
      }
    }
    return device.createBindGroup({ layout: bindGroupLayout, entries });
  };

  const vertexStates = new Map<string, GpuAttributeState>();
  const instanceStates = new Map<string, GpuAttributeState>();
  const attributes = {} as { [K in keyof A]: AttributeHandle };
  const instanceAttributes = {} as { [K in keyof I]: AttributeHandle };
  let isInstanced = false;

  /**
   * Buffers that a larger allocation replaced during a frame.
   *
   * Do not destroy these buffers immediately. A draw command that is already in
   * the open render pass still refers to them. If you destroy one, the whole
   * submit fails with the message "used in submit while destroyed". Every draw in
   * the frame then fails, and not only the draw that grew.
   *
   * The uniform ring below has the same problem, and it uses the same method.
   * Destroy these buffers at the next frame boundary. The submit that could refer
   * to them is complete at that time.
   *
   * One program that uploads several batches of different sizes in one frame
   * causes this. A sprite renderer that draws one atlas at a time is an example.
   */
  const retired: GPUBuffer[] = [];

  const uploadAttribute = (entry: AttributeLayoutEntry, data: Float32Array): void => {
    if (data.length % entry.size !== 0) {
      throw new Error(
        `BroMetal: attribute data length ${data.length} is not a multiple of ${entry.size} components per element`,
      );
    }
    const states = entry.divisor === 1 ? instanceStates : vertexStates;
    let state = states.get(entry.name);

    // A frame is one command encoder. The runtime submits it one time, at the end
    // of the frame. queue.writeBuffer is ordered against that submit, and not
    // against the draw commands in it. Therefore each draw in the frame reads the
    // data that was written LAST. If two draws each write at offset 0, both draws
    // read the second batch of data.
    //
    // The uniform ring above has the same problem, and it uses the same method. A
    // second upload in the same frame writes at a new offset, and the draw binds
    // the vertex buffer at that offset. This lets one program draw several batches
    // in one frame. A sprite renderer that draws one atlas at a time needs it.
    const repeat = state !== undefined && state.frame === internals.frame;
    const offset = repeat ? state!.writtenThisFrame : 0;
    const needed = offset + data.byteLength;

    if (state === undefined || state.capacity < needed) {
      const grown = Math.max(needed, (state?.capacity ?? 0) * 2);
      const replacement = device.createBuffer({
        size: grown,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      });
      if (state !== undefined) {
        // Draw commands from earlier in this frame still point into the old
        // buffer, at their own offsets. The buffer stays alive until the frame
        // boundary.
        retired.push(state.buffer);
        state.buffer = replacement;
        state.capacity = grown;
      } else {
        state = {
          buffer: replacement,
          capacity: grown,
          elementCount: 0,
          offset: 0,
          writtenThisFrame: 0,
          frame: -1,
        };
        states.set(entry.name, state);
      }
    }

    state.elementCount = data.length / entry.size;
    state.offset = offset;
    state.writtenThisFrame = offset + data.byteLength;
    state.frame = internals.frame;
    device.queue.writeBuffer(state.buffer, offset, data as unknown as BufferSource);
  };

  for (const entry of compiled.layout.attributes) {
    const handle: AttributeHandle = { set: (data: Float32Array) => uploadAttribute(entry, data) };
    if (entry.divisor === 1) {
      instanceAttributes[entry.name as keyof I] = handle;
      isInstanced = true;
    } else {
      attributes[entry.name as keyof A] = handle;
    }
  }

  const uniforms = {} as { [K in keyof U]: UniformHandle<U[K]> };
  for (const entry of compiled.layout.uniforms) {
    if (entry.type === 'sampler2D') {
      uniforms[entry.name as keyof U] = {
        set(value: UniformValue<U[keyof U]>): void {
          const binding = (value as unknown as { __wgpu?: GpuTextureBinding }).__wgpu;
          if (binding === undefined) {
            throw new Error(
              `BroMetal: uniform '${entry.name}' (sampler2D) expects a texture created from this WebGPU renderer`,
            );
          }
          textureBindings.set(entry.name, binding);
          bindGroup = null;
        },
      } as UniformHandle<U[keyof U & string]>;
      continue;
    }
    const offset = (entry.offset ?? 0) / 4;
    const size = entry.size;
    uniforms[entry.name as keyof U] = {
      set(value: UniformValue<U[keyof U]>): void {
        if (typeof value === 'number') {
          if (size !== 1) {
            throw new Error(`BroMetal: uniform '${entry.name}' (${entry.type}) expects an array of numbers`);
          }
          uniformData[offset] = value;
        } else {
          const values = value as Float32Array | readonly number[];
          if (values.length !== size) {
            throw new Error(
              `BroMetal: uniform '${entry.name}' (${entry.type}) expects ${size} values, got ${values.length}`,
            );
          }
          uniformData.set(values as ArrayLike<number>, offset);
        }
        uniformsDirty = true;
      },
    } as UniformHandle<U[keyof U & string]>;
  }

  let indexBuffer: GPUBuffer | null = null;
  let indexCount = 0;
  let indexFormat: GPUIndexFormat = 'uint16';

  const resolveCount = (states: Map<string, GpuAttributeState>, what: string): number => {
    let count: number | null = null;
    for (const state of states.values()) {
      if (count === null) {
        count = state.elementCount;
      } else if (state.elementCount !== count) {
        throw new Error(`BroMetal: attribute ${what} counts disagree`);
      }
    }
    if (count === null || count === 0) {
      throw new Error(`BroMetal: no ${what} data — call set(...) before draw()`);
    }
    return count;
  };

  return {
    attributes,
    instanceAttributes,
    uniforms,
    setIndices(data: Uint16Array | Uint32Array): void {
      // WebGPU buffer writes must be 4-byte aligned; pad odd uint16 counts.
      const byteLength = Math.ceil(data.byteLength / 4) * 4;
      if (indexBuffer === null || indexBuffer.size < byteLength) {
        if (indexBuffer !== null) {
          retired.push(indexBuffer);
        }
        indexBuffer = device.createBuffer({
          size: byteLength,
          usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
        });
      }
      const padded = new Uint8Array(byteLength);
      padded.set(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
      device.queue.writeBuffer(indexBuffer, 0, padded);
      indexCount = data.length;
      indexFormat = data instanceof Uint16Array ? 'uint16' : 'uint32';
    },
    draw(drawOptions: DrawOptions = {}): void {
      const pass = internals.pass;
      if (pass === null) {
        throw new Error('BroMetal: draw() must be called inside renderer.loop()');
      }
      // Do the per-frame bookkeeping before any early exit below. A frame in
      // which every draw is skipped must still release the retired buffers and
      // restart the slot ring. If it does not, the buffers stay alive until
      // dispose(), and the ring can write over an offset that a recorded draw
      // still uses.
      if (internals.frame !== lastFrame) {
        lastFrame = internals.frame;
        // The GPU has the previous frame, so the buffers that it retired are now
        // safe to destroy.
        for (const buffer of retired) {
          buffer.destroy();
        }
        retired.length = 0;
        slot = -1;
        uniformsDirty = true;
      }
      const vertexCount = resolveCount(vertexStates, 'vertex');
      const instanceCount = isInstanced
        ? resolveDrawCount(drawOptions.instanceCount, resolveCount(instanceStates, 'instance'))
        : 1;
      if (instanceCount === 0 || vertexCount === 0) return;
      for (const entry of compiled.layout.attributes) {
        const states = entry.divisor === 1 ? instanceStates : vertexStates;
        if (!states.has(entry.name)) {
          throw new Error(`BroMetal: attribute '${entry.name}' has no data — call set(...) before draw()`);
        }
      }
      if (uniformsDirty && uniformBuffer !== null) {
        slot++;
        if (slot >= slotCapacity) {
          // Grow the ring. The old buffer is NOT destroyed here — draws already
          // recorded this frame still reference it through the previous bind
          // group; it is released once nothing points at it.
          slotCapacity *= 2;
          uniformBuffer = device.createBuffer({
            size: slotStride * slotCapacity,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
          });
          bindGroup = null;
          slot = 0;
        }
        currentOffset = slot * slotStride;
        device.queue.writeBuffer(uniformBuffer, currentOffset, uniformData as unknown as BufferSource);
        uniformsDirty = false;
      }
      if (bindGroup === null) {
        bindGroup = buildBindGroup();
      }
      pass.setPipeline(pipelineFor(internals.passFormat, internals.passSamples, internals.passDepth));
      pass.setBindGroup(0, bindGroup, uniformBuffer === null ? [] : [currentOffset]);
      compiled.layout.attributes.forEach((entry, slot) => {
        const states = entry.divisor === 1 ? instanceStates : vertexStates;
        const state = states.get(entry.name)!;
        // Bind at the offset that holds this draw's data. Do not bind at 0.
        pass.setVertexBuffer(slot, state.buffer, state.offset);
      });
      if (indexBuffer !== null) {
        pass.setIndexBuffer(indexBuffer, indexFormat);
        pass.drawIndexed(indexCount, instanceCount);
      } else {
        pass.draw(vertexCount, instanceCount);
      }
    },
    dispose(): void {
      for (const state of vertexStates.values()) {
        state.buffer.destroy();
      }
      for (const state of instanceStates.values()) {
        state.buffer.destroy();
      }
      vertexStates.clear();
      instanceStates.clear();
      indexBuffer?.destroy();
      indexBuffer = null;
      for (const buffer of retired) {
        buffer.destroy();
      }
      retired.length = 0;
      uniformBuffer?.destroy();
      placeholderTexture.destroy();
    },
  };
}

/**
 * WGSL for the mip chain: a fullscreen triangle that samples the level above.
 * WebGPU has no generateMipmap, so the runtime builds the chain itself —
 * without it every minified texture samples level 0 and shimmers.
 */
const MIPMAP_WGSL = `
@group(0) @binding(0) var bm_src : texture_2d<f32>;
@group(0) @binding(1) var bm_samp : sampler;
struct BmMipOut {
  @builtin(position) pos : vec4f,
  @location(0) uv : vec2f,
}
@vertex
fn vs_main(@builtin(vertex_index) i : u32) -> BmMipOut {
  var corners = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  var out : BmMipOut;
  let p = corners[i];
  out.pos = vec4f(p, 0.0, 1.0);
  out.uv = vec2f((p.x + 1.0) * 0.5, 1.0 - (p.y + 1.0) * 0.5);
  return out;
}
@fragment
fn fs_main(in : BmMipOut) -> @location(0) vec4f {
  return textureSample(bm_src, bm_samp, in.uv);
}
`;

interface MipmapKit {
  pipeline: GPURenderPipeline;
  sampler: GPUSampler;
}

const MIPMAP_KITS = new WeakMap<GPUDevice, MipmapKit>();

function mipmapKit(device: GPUDevice): MipmapKit {
  let kit = MIPMAP_KITS.get(device);
  if (kit === undefined) {
    const module = device.createShaderModule({ code: MIPMAP_WGSL });
    kit = {
      pipeline: device.createRenderPipeline({
        layout: 'auto',
        vertex: { module, entryPoint: 'vs_main' },
        fragment: { module, entryPoint: 'fs_main', targets: [{ format: 'rgba8unorm' }] },
        primitive: { topology: 'triangle-list' },
      }),
      sampler: device.createSampler({ magFilter: 'linear', minFilter: 'linear' }),
    };
    MIPMAP_KITS.set(device, kit);
  }
  return kit;
}

/** Renders each mip level from the one above it, in a single command buffer. */
function generateWebgpuMipmaps(device: GPUDevice, texture: GPUTexture, levels: number): void {
  const kit = mipmapKit(device);
  const encoder = device.createCommandEncoder();
  for (let level = 1; level < levels; level++) {
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: texture.createView({ baseMipLevel: level, mipLevelCount: 1 }),
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    });
    pass.setPipeline(kit.pipeline);
    pass.setBindGroup(
      0,
      device.createBindGroup({
        layout: kit.pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: texture.createView({ baseMipLevel: level - 1, mipLevelCount: 1 }) },
          { binding: 1, resource: kit.sampler },
        ],
      }),
    );
    pass.draw(3);
    pass.end();
  }
  device.queue.submit([encoder.finish()]);
}

export function createWebgpuRenderTarget(
  renderer: Renderer,
  width: number,
  height: number,
  depth = false,
): RenderTarget {
  const { device } = webgpuInternals(renderer);
  const texture = device.createTexture({
    size: [width, height],
    format: TARGET_FORMAT,
    // COPY_SRC so the contents can be read back — a target holds simulation
    // state, and being unable to inspect it makes any bug in a physics pass
    // guesswork.
    usage:
      GPUTextureUsage.RENDER_ATTACHMENT |
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.COPY_SRC,
  });
  const view = texture.createView();
  // rgba32float is not filterable without an opt-in feature, and averaging two
  // particles' positions would be meaningless anyway — nearest, always.
  const sampler = device.createSampler({ magFilter: 'nearest', minFilter: 'nearest' });
  const binding: GpuTextureBinding = { view, sampler };

  // Never sampled — it exists only so the pass can sort its own triangles.
  const depthTexture = depth
    ? device.createTexture({
        size: [width, height],
        format: 'depth24plus',
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
      })
    : null;

  const target: RenderTarget & { __wgpu?: WebgpuTargetInternals } = {
    width,
    height,
    depth,
    texture: { __wgpu: binding, dispose(): void {} } as unknown as BroMetalTexture,
    dispose(): void {
      texture.destroy();
      depthTexture?.destroy();
    },
  };
  target.__wgpu = { texture, view, depthView: depthTexture?.createView() ?? null };
  return target;
}

export function createWebgpuTexture(
  renderer: Renderer,
  source: TexImageSource,
  options: TextureOptions,
): BroMetalTexture {
  const { device } = webgpuInternals(renderer);
  const width = 'width' in source ? (source.width as number) : 1;
  const height = 'height' in source ? (source.height as number) : 1;
  const smooth = options.filter !== 'nearest';
  const mipLevels = smooth ? Math.floor(Math.log2(Math.max(width, height))) + 1 : 1;
  const gpuTexture = device.createTexture({
    size: [width, height],
    mipLevelCount: mipLevels,
    format: 'rgba8unorm',
    usage:
      GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
  });
  device.queue.copyExternalImageToTexture(
    { source: source as GPUCopyExternalImageSource, flipY: options.flipY ?? true },
    { texture: gpuTexture },
    [width, height],
  );
  if (mipLevels > 1) {
    generateWebgpuMipmaps(device, gpuTexture, mipLevels);
  }
  const filter: GPUFilterMode = smooth ? 'linear' : 'nearest';
  const address: GPUAddressMode = options.wrap === 'clamp' ? 'clamp-to-edge' : 'repeat';
  const sampler = device.createSampler({
    magFilter: filter,
    minFilter: filter,
    mipmapFilter: filter,
    addressModeU: address,
    addressModeV: address,
    // Anisotropy needs linear filtering on every axis; the spec clamps the
    // request to whatever the adapter supports.
    maxAnisotropy: smooth ? Math.max(1, Math.floor(options.anisotropy ?? 1)) : 1,
  });

  const binding: GpuTextureBinding = { view: gpuTexture.createView(), sampler };
  const texture: BroMetalTexture & { __wgpu?: GpuTextureBinding } = {
    dispose(): void {
      gpuTexture.destroy();
    },
  };
  texture.__wgpu = binding;
  return texture;
}
