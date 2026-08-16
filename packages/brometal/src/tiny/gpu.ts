/// <reference types="@webgpu/types" />
// Facts both runtimes must agree on.
//
// A separate module with *no state* on purpose. These first lived alongside the
// core's device and canvas variables, and importing them from `full` dragged
// that whole module in — mutable module-level bindings defeat tree-shaking, and
// the regular runtime grew 575 bytes gzipped to share four constants.
//
// Nothing here holds state, so a bundler drops whatever a consumer does not use.
// `--js13k` concatenates this ahead of the core, so the tiny build pays only for
// what it actually references.

// These are the WebGPU and compiler details that have no room for two answers.
// `full` imports them rather than restating them, because every one of them has
// a wrong spelling that fails silently rather than throwing.

/** COPY_DST 8 | VERTEX 32. Spelled numerically: `GPUBufferUsage.VERTEX` is a
 *  property access no minifier can shorten, and this file ships to a 13 kB budget. */
export const BUF_VERTEX = 40;
/** COPY_DST 8 | INDEX 16. */
export const BUF_INDEX = 24;
/** COPY_DST 8 | UNIFORM 64. */
export const BUF_UNIFORM = 72;
/** COPY_DST 8 | STORAGE 128. */
export const BUF_STORAGE = 136;
/** COPY_DST 2 | TEXTURE_BINDING 4 | RENDER_ATTACHMENT 16. */
export const TEX_UPLOAD = 22;
/**
 * TEXTURE_BINDING 4 | RENDER_ATTACHMENT 16, for a render target. No COPY_DST:
 * nothing is uploaded into one, it is drawn into. Drop either bit and it fails
 * silently in its own way — without 16 the pass rejects the texture, without 4
 * the draw that samples it back rejects the bind group, a frame later.
 */
export const TEX_TARGET = 20;
/**
 * The format render targets are drawn in. Half float, not the canvas format,
 * and that is most of the reason to have targets at all: an 8-bit one clamps at
 * 1 on the way in, so the values a post-process pass is looking for — the ones
 * brighter than white — are gone before it runs.
 */
export const TEX_HDR = 'rgba16float';

/** The entry points the compiler emits. Renaming one breaks both runtimes. */
export const VS_ENTRY = 'vs_main';
export const FS_ENTRY = 'fs_main';
export const CS_ENTRY = 'cs_main';

/**
 * Which stages a binding is visible to: VERTEX 1 | FRAGMENT 2 | COMPUTE 4.
 *
 * Naming a stage the pipeline does not have invalidates the layout, and with it
 * the pipeline, the bind group and the submit — the error names the submit.
 *
 * The last two differ by spec, not preference: a `read_write` storage binding
 * may not be visible to the vertex stage, a read-only one may be visible
 * anywhere. That asymmetry is the seam compute writes through to rendering —
 * the restriction is on the binding, so the same buffer bound read-only in a
 * second program is fine.
 */
export const VIS_RENDER = 3;
export const VIS_COMPUTE = 4;
export const VIS_STORAGE_RW = 6;
export const VIS_STORAGE_RO = 7;

/**
 * Component count to vertex format. One component is `float32`, not
 * `float32x1` — the latter is not a WebGPU format and rejects the whole
 * pipeline, so a scalar instance attribute silently draws nothing.
 */
export function vertexFormat(n: number): GPUVertexFormat {
  return (n > 1 ? `float32x${n}` : 'float32') as GPUVertexFormat;
}

/**
 * writeBuffer needs a 4-byte multiple from the source as well as the
 * destination, and a Uint16 index list usually is not one — three indices for a
 * triangle is six bytes. Returns the input untouched when it already aligns.
 */
export function padTo4(data: ArrayBufferView<ArrayBuffer>): ArrayBufferView<ArrayBuffer> {
  if ((data.byteLength & 3) === 0) return data;
  const padded = new Uint8Array((data.byteLength + 3) & ~3);
  padded.set(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
  return padded;
}

