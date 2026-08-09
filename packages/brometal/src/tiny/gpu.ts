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
/** COPY_DST 2 | TEXTURE_BINDING 4 | RENDER_ATTACHMENT 16. */
export const TEX_UPLOAD = 22;

/** The entry points the compiler emits. Renaming one breaks both runtimes. */
export const VS_ENTRY = 'vs_main';
export const FS_ENTRY = 'fs_main';

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

