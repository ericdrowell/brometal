/// <reference types="@webgpu/types" />
// BroMetal tiny — the core runtime.
//
// This is the single source of truth for the parts of WebGPU that are the same
// whatever you are building: how a buffer is created and filled, how an
// attribute format is spelled, which bindings the compiler assigns, how the
// depth texture tracks the canvas. Every runtime bug found so far lived here —
// buffer padding, usage bits, `float32x1` — which is the argument for one copy.
//
// It is also a complete renderer on its own. `brometal prod --js13k` emits it as
// plain source with the `export` keywords stripped, so a 13 kB game gets globals
// it can concatenate and mangle. `full` imports the same file and builds its
// heavier program and draw path on these primitives.
//
// Two rules keep it honest:
//   - No validation and no messages. Guards are bytes a game could have spent.
//   - No feature that only `full` needs. Every seam here costs the 13 kB build.

import {
  BUF_INDEX,
  BUF_UNIFORM,
  BUF_VERTEX,
  FS_ENTRY,
  TEX_UPLOAD,
  VS_ENTRY,
  padTo4,
  vertexFormat,
} from './gpu.js';

// Device-wide state. One device, one canvas, one depth buffer.
export let bmDevice: GPUDevice;
export let bmCtx: GPUCanvasContext;
export let bmFormat: GPUTextureFormat;
export let bmDepth: GPUTexture | null = null;
export let bmCanvas: HTMLCanvasElement;
export let bmClear: readonly number[];
/** The render pass currently open inside bmLoop's callback. */
export let bmPass: GPURenderPassEncoder;

// Model-view matrix stack, the shape SafeSpace used: mutate the current matrix,
// push before a subtree, pop after.
export let bmM: number[] = bmIdentity();
const bmStack: number[][] = [];

export async function bmInit(canvas: HTMLCanvasElement, clear?: readonly number[]): Promise<void> {
  bmCanvas = canvas;
  bmClear = clear || [0, 0, 0, 1];
  const adapter = (await navigator.gpu.requestAdapter())!;
  bmDevice = await adapter.requestDevice();
  bmCtx = canvas.getContext('webgpu')!;
  bmFormat = navigator.gpu.getPreferredCanvasFormat();
  bmCtx.configure({ device: bmDevice, format: bmFormat, alphaMode: 'opaque' });
}

// Build a pipeline from a compiled shader descriptor.
//
//   wgsl  shader source, emitted by the compiler
//   opts  { a:[3,2], i:[3,1], u:64, t:[[1,2]], blend:1, zwrite:0, cull:0 }
//     a       per-vertex attribute component counts, in shaderLocation order
//     i       per-instance attribute component counts, continuing those locations
//     u       size of the uniform block in bytes
//     t       [textureBinding, samplerBinding] pairs, as the compiler assigned them
//     blend   1 for alpha blending
//     zwrite  0 to keep depth writes off (transparent passes)
//     cull    1 for back-face culling
export interface BmProgramOpts {
  /** Per-vertex attribute component counts, in shaderLocation order. */
  a?: number[];
  /** Per-instance attribute component counts, continuing those locations. */
  i?: number[];
  /** Uniform block size in bytes. */
  u?: number;
  /** [textureBinding, samplerBinding] pairs, as the compiler assigned them. */
  t?: number[][];
  blend?: number;
  zwrite?: number;
  cull?: number;
}

export interface BmTexture {
  v: GPUTextureView;
  s: GPUSampler;
}

export interface BmProgram {
  p: GPURenderPipeline;
  l: GPUBindGroupLayout;
  ub: GPUBuffer;
  t: number[][];
  b: GPUBuffer[];
  ix: GPUBuffer | null;
  n: number;
  bg: GPUBindGroup | null;
  tx: BmTexture[];
}

export function bmProgram(wgsl: string, opts: BmProgramOpts): BmProgram {
  const module = bmDevice.createShaderModule({ code: wgsl });
  const attrs = opts.a || [];
  const insts = opts.i || [];
  const texes = opts.t || [];

  // Binding 0 is always the uniform block; textures follow at the indices the
  // compiler chose, so this layout has to mirror the emitted WGSL exactly.
  const layoutEntries: GPUBindGroupLayoutEntry[] = [{ binding: 0, visibility: 3, buffer: {} }];
  for (const [tex, samp] of texes) {
    layoutEntries.push({ binding: tex, visibility: 2, texture: {} });
    layoutEntries.push({ binding: samp, visibility: 2, sampler: {} });
  }
  const bindLayout = bmDevice.createBindGroupLayout({ entries: layoutEntries });

  // One vertex buffer per attribute: simpler than interleaving, and the extra
  // bind cost is irrelevant next to the bytes a packing scheme would take.
  const buffers: GPUVertexBufferLayout[] = attrs.map((n, i) => ({
    arrayStride: n * 4,
    attributes: [{ shaderLocation: i, offset: 0, format: vertexFormat(n) }],
  }));
  insts.forEach((n: number, i: number) => {
    buffers.push({
      arrayStride: n * 4,
      stepMode: 'instance',
      attributes: [
        { shaderLocation: attrs.length + i, offset: 0, format: vertexFormat(n) },
      ],
    });
  });

  const pipeline = bmDevice.createRenderPipeline({
    layout: bmDevice.createPipelineLayout({ bindGroupLayouts: [bindLayout] }),
    vertex: { module, entryPoint: VS_ENTRY, buffers },
    fragment: {
      module,
      entryPoint: FS_ENTRY,
      targets: [{
        format: bmFormat,
        // A ternary, not `&&`: the falsy branch has to be undefined, and 0 is
        // not a blend state.
        blend: opts.blend
          ? {
              color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha' },
              alpha: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha' },
            }
          : undefined,
      }],
    },
    primitive: { topology: 'triangle-list', cullMode: opts.cull ? 'back' : 'none' },
    // Transparent geometry tests against depth but must not write it, or the
    // layers behind it get clipped away.
    depthStencil: {
      format: 'depth24plus',
      depthWriteEnabled: opts.zwrite !== 0,
      depthCompare: 'less',
    },
  });

  const uniforms = bmDevice.createBuffer({ size: opts.u || 16, usage: BUF_UNIFORM });
  return {
    p: pipeline,
    l: bindLayout,
    ub: uniforms,
    t: texes,
    b: [],
    ix: null,
    n: 0,
    bg: null,
    tx: [],
  };
}

// A vertex, instance or index buffer. `index` picks the INDEX usage bit.
// The buffer is pinned to ArrayBuffer rather than ArrayBufferLike: WebGPU will
// not accept a SharedArrayBuffer view, and the wider type makes that a runtime
// surprise instead of a compile error.
export function bmBuffer(data: ArrayBufferView<ArrayBuffer>, index?: number): GPUBuffer {
  const size = (data.byteLength + 3) & ~3;
  // Usage bits, spelled as numbers because GPUBufferUsage.* is far longer:
  //   COPY_DST 8 | INDEX 16 = 24    COPY_DST 8 | VERTEX 32 = 40
  // Getting these wrong fails silently — WebGPU reports it as an uncaptured
  // error, not a throw, so the canvas just stays black.
  const buffer = bmDevice.createBuffer({ size, usage: index ? 24 : 40 });
  // writeBuffer wants a 4-byte multiple from the *source* as well as the
  // destination, and a Uint16 index list usually is not one — three indices for
  // a triangle is six bytes. Pad rather than make every caller think about it.
  if (data.byteLength & 3) {
    const padded = new Uint8Array(size);
    padded.set(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
    data = padded;
  }
  bmDevice.queue.writeBuffer(buffer, 0, data);
  return buffer;
}

export function bmAttr(prog: BmProgram, slot: number, data: ArrayBufferView<ArrayBuffer>): void {
  prog.b[slot] = bmBuffer(data);
}

export function bmIndex(prog: BmProgram, data: Uint16Array<ArrayBuffer>): void {
  prog.ix = bmBuffer(data, 1);
  prog.n = data.length;
}

// A 2D texture from anything drawImage-able: an ImageBitmap, a <canvas>, an
// <img>. Procedural textures painted into a 2D canvas are the js13k staple, and
// they arrive here directly.
export function bmTexture(source: GPUCopyExternalImageSource & { width: number; height: number }, smooth?: number): BmTexture {
  const texture = bmDevice.createTexture({
    size: [source.width, source.height],
    format: 'rgba8unorm',
    usage: TEX_UPLOAD,
  });
  bmDevice.queue.copyExternalImageToTexture(
    { source },
    { texture },
    [source.width, source.height],
  );
  const filter = smooth === 0 ? 'nearest' : 'linear';
  return {
    v: texture.createView(),
    s: bmDevice.createSampler({
      magFilter: filter,
      minFilter: filter,
      addressModeU: 'repeat',
      addressModeV: 'repeat',
    }),
  };
}

// Bind textures in the order the shader declares them. Rebuilding the bind
// group here rather than caching is deliberate: SafeSpace-style rendering swaps
// texture per batch, and a cache keyed on the set would cost more than it saves.
export function bmTextures(prog: BmProgram, ...textures: BmTexture[]): void {
  prog.tx = textures;
  prog.bg = null;
}

export function bmUniforms(prog: BmProgram, floats: Float32Array<ArrayBuffer>): void {
  bmDevice.queue.writeBuffer(prog.ub, 0, floats);
}

// Draw the bound geometry. `count` instances, defaulting to one.
export function bmDraw(prog: BmProgram, count?: number): void {
  if (!prog.bg) {
    const entries: GPUBindGroupEntry[] = [{ binding: 0, resource: { buffer: prog.ub } }];
    prog.t.forEach(([tex, samp], i) => {
      entries.push({ binding: tex, resource: prog.tx[i].v });
      entries.push({ binding: samp, resource: prog.tx[i].s });
    });
    prog.bg = bmDevice.createBindGroup({ layout: prog.l, entries });
  }
  bmPass.setPipeline(prog.p);
  bmPass.setBindGroup(0, prog.bg);
  for (let i = 0; i < prog.b.length; i++) bmPass.setVertexBuffer(i, prog.b[i]);
  bmPass.setIndexBuffer(prog.ix!, 'uint16');
  bmPass.drawIndexed(prog.n, count || 1);
}

// The frame loop. Sizes the drawing buffer to the CSS box, rebuilds the depth
// texture when that changes, opens one render pass, and hands it to you.
export function bmLoop(callback: (seconds: number) => void): void {
  const frame = (now: number): void => {
    const w = (bmCanvas.clientWidth * devicePixelRatio) | 0;
    const h = (bmCanvas.clientHeight * devicePixelRatio) | 0;
    if (bmCanvas.width != w || bmCanvas.height != h) {
      bmCanvas.width = w;
      bmCanvas.height = h;
      if (bmDepth) bmDepth.destroy();
      bmDepth = bmDevice.createTexture({
        size: [w, h],
        format: 'depth24plus',
        usage: 16,
      });
    }
    const encoder = bmDevice.createCommandEncoder();
    bmPass = encoder.beginRenderPass({
      colorAttachments: [{
        view: bmCtx.getCurrentTexture().createView(),
        clearValue: bmClear,
        loadOp: 'clear',
        storeOp: 'store',
      }],
      depthStencilAttachment: {
        view: bmDepth!.createView(),
        depthClearValue: 1,
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
      },
    });
    callback(now / 1000);
    bmPass.end();
    bmDevice.queue.submit([encoder.finish()]);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

// ── Matrices ──────────────────────────────────────────────────────────────
// Column-major, the order WGSL expects, so a Float32Array of these goes
// straight into the uniform block.

export function bmIdentity(): number[] {
  return [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
}

export function bmMul(a: number[], b: number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) sum += a[k * 4 + j] * b[i * 4 + k];
      out[i * 4 + j] = sum;
    }
  }
  return out;
}

export function bmPersp(fov: number, aspect: number, near: number, far: number): number[] {
  const f = 1 / Math.tan(fov / 2);
  const d = 1 / (near - far);
  return [f / aspect,0,0,0, 0,f,0,0, 0,0,(far + near) * d,-1, 0,0,2 * far * near * d,0];
}

export function bmLook(eye: number[], at: number[], up: number[]): number[] {
  let z = [eye[0] - at[0], eye[1] - at[1], eye[2] - at[2]];
  let l = Math.hypot(z[0], z[1], z[2]);
  z = z.map((v) => v / l);
  let x = [
    up[1] * z[2] - up[2] * z[1],
    up[2] * z[0] - up[0] * z[2],
    up[0] * z[1] - up[1] * z[0],
  ];
  l = Math.hypot(x[0], x[1], x[2]) || 1;
  x = x.map((v) => v / l);
  const y = [
    z[1] * x[2] - z[2] * x[1],
    z[2] * x[0] - z[0] * x[2],
    z[0] * x[1] - z[1] * x[0],
  ];
  return [
    x[0], y[0], z[0], 0,
    x[1], y[1], z[1], 0,
    x[2], y[2], z[2], 0,
    -(x[0] * eye[0] + x[1] * eye[1] + x[2] * eye[2]),
    -(y[0] * eye[0] + y[1] * eye[1] + y[2] * eye[2]),
    -(z[0] * eye[0] + z[1] * eye[1] + z[2] * eye[2]),
    1,
  ];
}

export function bmTrans(x: number, y: number, z: number): number[] {
  return [1,0,0,0, 0,1,0,0, 0,0,1,0, x,y,z,1];
}

export function bmScale(x: number, y: number, z: number): number[] {
  return [x,0,0,0, 0,y,0,0, 0,0,z,0, 0,0,0,1];
}

export function bmRotX(a: number): number[] {
  const s = Math.sin(a), c = Math.cos(a);
  return [1,0,0,0, 0,c,s,0, 0,-s,c,0, 0,0,0,1];
}

export function bmRotY(a: number): number[] {
  const s = Math.sin(a), c = Math.cos(a);
  return [c,0,-s,0, 0,1,0,0, s,0,c,0, 0,0,0,1];
}

export function bmRotZ(a: number): number[] {
  const s = Math.sin(a), c = Math.cos(a);
  return [c,s,0,0, -s,c,0,0, 0,0,1,0, 0,0,0,1];
}

// Matrix stack, as SafeSpace used it: save before drawing a subtree, restore
// after, and let the current matrix be mutated in between.
export function bmSave(): void {
  bmStack.push(bmM.slice());
}

export function bmRestore(): void {
  bmM = bmStack.pop()!;
}
