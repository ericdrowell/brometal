/// <reference types="@webgpu/types" />
import type { AttributeLayoutEntry, CompiledShader, GpuRecord, GpuType } from '../dsl/types.js';
import type { AttributeHandle, BroMetalProgram, UniformHandle } from './program.js';
import type { Renderer, RendererOptions } from './context.js';
import type { BroMetalTexture, TextureOptions } from './texture.js';
import type { UniformValue } from './uniforms.js';

/** Internal fields carried by WebGPU-backed renderers (not part of the public API). */
export interface WebgpuInternals {
  device: GPUDevice;
  context: GPUCanvasContext;
  format: GPUTextureFormat;
  clearColor: readonly [number, number, number, number];
  cull: 'back' | 'none';
  /** Live only while a loop callback runs. */
  pass: GPURenderPassEncoder | null;
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
    pass: null,
    frame: 0,
  };

  let depthTexture: GPUTexture | null = null;
  let depthView: GPUTextureView | null = null;
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
          const dpr = window.devicePixelRatio || 1;
          const width = Math.max(1, Math.floor(canvas.clientWidth * dpr));
          const height = Math.max(1, Math.floor(canvas.clientHeight * dpr));
          if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
          }
          if (depthTexture === null || depthTexture.width !== canvas.width || depthTexture.height !== canvas.height) {
            depthTexture?.destroy();
            depthTexture = device.createTexture({
              size: [canvas.width, canvas.height],
              format: 'depth24plus',
              usage: GPUTextureUsage.RENDER_ATTACHMENT,
            });
            depthView = depthTexture.createView();
          }
        }
        internals.frame++;
        const [r, g, b, a] = internals.clearColor;
        const encoder = device.createCommandEncoder();
        internals.pass = encoder.beginRenderPass({
          colorAttachments: [
            {
              view: context.getCurrentTexture().createView(),
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
    destroy(): void {
      for (const stop of activeStops) {
        stop();
      }
      activeStops.clear();
      observer?.disconnect();
      depthTexture?.destroy();
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

  const pipeline = device.createRenderPipeline({
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
          format: internals.format,
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
    depthStencil: {
      format: 'depth24plus',
      depthWriteEnabled: blend === 'none',
      depthCompare: 'less',
    },
  });

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

  const uploadAttribute = (entry: AttributeLayoutEntry, data: Float32Array): void => {
    if (data.length % entry.size !== 0) {
      throw new Error(
        `BroMetal: attribute data length ${data.length} is not a multiple of ${entry.size} components per element`,
      );
    }
    const states = entry.divisor === 1 ? instanceStates : vertexStates;
    let state = states.get(entry.name);
    if (state === undefined || state.capacity < data.byteLength) {
      state?.buffer.destroy();
      state = {
        buffer: device.createBuffer({
          size: data.byteLength,
          usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        }),
        capacity: data.byteLength,
        elementCount: 0,
      };
      states.set(entry.name, state);
    }
    state.elementCount = data.length / entry.size;
    device.queue.writeBuffer(state.buffer, 0, data as unknown as BufferSource);
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
        indexBuffer?.destroy();
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
    draw(): void {
      const pass = internals.pass;
      if (pass === null) {
        throw new Error('BroMetal: draw() must be called inside renderer.loop()');
      }
      const vertexCount = resolveCount(vertexStates, 'vertex');
      const instanceCount = isInstanced ? resolveCount(instanceStates, 'instance') : 1;
      for (const entry of compiled.layout.attributes) {
        const states = entry.divisor === 1 ? instanceStates : vertexStates;
        if (!states.has(entry.name)) {
          throw new Error(`BroMetal: attribute '${entry.name}' has no data — call set(...) before draw()`);
        }
      }
      if (internals.frame !== lastFrame) {
        // New frame: restart the slot ring. Forcing a write keeps this frame's
        // ascending slots from ever overwriting an offset already referenced.
        lastFrame = internals.frame;
        slot = -1;
        uniformsDirty = true;
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
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup, uniformBuffer === null ? [] : [currentOffset]);
      compiled.layout.attributes.forEach((entry, slot) => {
        const states = entry.divisor === 1 ? instanceStates : vertexStates;
        pass.setVertexBuffer(slot, states.get(entry.name)!.buffer);
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
      uniformBuffer?.destroy();
      placeholderTexture.destroy();
    },
  };
}

export function createWebgpuTexture(
  renderer: Renderer,
  source: TexImageSource,
  options: TextureOptions,
): BroMetalTexture {
  const { device } = webgpuInternals(renderer);
  const width = 'width' in source ? (source.width as number) : 1;
  const height = 'height' in source ? (source.height as number) : 1;
  const gpuTexture = device.createTexture({
    size: [width, height],
    format: 'rgba8unorm',
    usage:
      GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
  });
  device.queue.copyExternalImageToTexture(
    { source: source as GPUCopyExternalImageSource, flipY: options.flipY ?? true },
    { texture: gpuTexture },
    [width, height],
  );
  const filter: GPUFilterMode = options.filter === 'nearest' ? 'nearest' : 'linear';
  const address: GPUAddressMode = options.wrap === 'clamp' ? 'clamp-to-edge' : 'repeat';
  const sampler = device.createSampler({
    magFilter: filter,
    minFilter: filter,
    addressModeU: address,
    addressModeV: address,
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
