import { describe, expect, it } from 'vitest';
import { parseGlb } from '../src/models/glb.js';

/** Builds a minimal valid GLB from a gltf JSON object and a binary chunk. */
function buildGlb(gltf: object, bin: Uint8Array): ArrayBuffer {
  let json = new TextEncoder().encode(JSON.stringify(gltf));
  const jsonPad = (4 - (json.length % 4)) % 4;
  json = new Uint8Array([...json, ...new Array(jsonPad).fill(0x20)]);
  const binPad = (4 - (bin.length % 4)) % 4;
  const paddedBin = new Uint8Array([...bin, ...new Array(binPad).fill(0)]);

  const total = 12 + 8 + json.length + (bin.length > 0 ? 8 + paddedBin.length : 0);
  const out = new ArrayBuffer(total);
  const view = new DataView(out);
  const bytes = new Uint8Array(out);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);
  view.setUint32(12, json.length, true);
  view.setUint32(16, 0x4e4f534a, true);
  bytes.set(json, 20);
  if (bin.length > 0) {
    view.setUint32(20 + json.length, paddedBin.length, true);
    view.setUint32(24 + json.length, 0x004e4942, true);
    bytes.set(paddedBin, 28 + json.length);
  }
  return out;
}

function triangleGlb(): ArrayBuffer {
  // One triangle: positions (3 x vec3 f32), uvs (3 x vec2 f32), indices (3 x u16),
  // and a 4-byte fake PNG image at the end.
  const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  const uvs = new Float32Array([0, 0, 1, 0, 0, 1]);
  const indices = new Uint16Array([0, 1, 2]);
  const image = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
  // Layout: positions 0-35, uvs 36-59, indices 60-65, pad, image 68-71.
  const bin = new Uint8Array(72);
  bin.set(new Uint8Array(positions.buffer), 0);
  bin.set(new Uint8Array(uvs.buffer), 36);
  bin.set(new Uint8Array(indices.buffer, 0, 6), 60);
  bin.set(image, 68);
  const gltf = {
    asset: { version: '2.0' },
    buffers: [{ byteLength: bin.length }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 36 },
      { buffer: 0, byteOffset: 36, byteLength: 24 },
      { buffer: 0, byteOffset: 60, byteLength: 6 },
      { buffer: 0, byteOffset: 68, byteLength: 4 },
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: 'VEC3' },
      { bufferView: 1, componentType: 5126, count: 3, type: 'VEC2' },
      { bufferView: 2, componentType: 5123, count: 3, type: 'SCALAR' },
    ],
    images: [{ name: 'skin', mimeType: 'image/png', bufferView: 3 }],
    textures: [{ source: 0 }],
    materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }],
    meshes: [
      {
        name: 'tri',
        primitives: [{ attributes: { POSITION: 0, TEXCOORD_0: 1 }, indices: 2, material: 0 }],
      },
    ],
  };
  return buildGlb(gltf, bin);
}

describe('parseGlb', () => {
  it('parses meshes, indices, uvs, and embedded images', () => {
    const model = parseGlb(triangleGlb());
    expect(model.meshes).toHaveLength(1);
    const mesh = model.meshes[0]!;
    expect(mesh.name).toBe('tri');
    expect(Array.from(mesh.positions)).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    expect(Array.from(mesh.uvs!)).toEqual([0, 0, 1, 0, 0, 1]);
    expect(Array.from(mesh.indices!)).toEqual([0, 1, 2]);
    expect(mesh.normals).toBeNull();
    expect(mesh.imageIndex).toBe(0);
    expect(model.images).toHaveLength(1);
    expect(model.images[0]!.name).toBe('skin');
    expect(model.images[0]!.mimeType).toBe('image/png');
    expect(Array.from(model.images[0]!.data)).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });

  it('deinterleaves strided attributes', () => {
    // Two vertices interleaved as [pos vec3][uv vec2], stride 20 bytes.
    const bin = new Uint8Array(40);
    const dv = new DataView(bin.buffer);
    const verts = [
      { pos: [1, 2, 3], uv: [0.5, 0.25] },
      { pos: [4, 5, 6], uv: [0.75, 1] },
    ];
    verts.forEach((v, i) => {
      const base = i * 20;
      v.pos.forEach((p, c) => dv.setFloat32(base + c * 4, p, true));
      v.uv.forEach((u, c) => dv.setFloat32(base + 12 + c * 4, u, true));
    });
    const gltf = {
      asset: { version: '2.0' },
      buffers: [{ byteLength: bin.length }],
      bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 40, byteStride: 20 }],
      accessors: [
        { bufferView: 0, byteOffset: 0, componentType: 5126, count: 2, type: 'VEC3' },
        { bufferView: 0, byteOffset: 12, componentType: 5126, count: 2, type: 'VEC2' },
      ],
      meshes: [{ primitives: [{ attributes: { POSITION: 0, TEXCOORD_0: 1 } }] }],
    };
    const model = parseGlb(buildGlb(gltf, bin));
    expect(Array.from(model.meshes[0]!.positions)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(Array.from(model.meshes[0]!.uvs!)).toEqual([0.5, 0.25, 0.75, 1]);
    expect(model.meshes[0]!.indices).toBeNull();
    expect(model.meshes[0]!.imageIndex).toBeNull();
  });

  it('widens uint8 indices to uint16', () => {
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const bin = new Uint8Array(40);
    bin.set(new Uint8Array(positions.buffer), 0);
    bin.set([0, 1, 2], 36);
    const gltf = {
      asset: { version: '2.0' },
      buffers: [{ byteLength: bin.length }],
      bufferViews: [
        { buffer: 0, byteOffset: 0, byteLength: 36 },
        { buffer: 0, byteOffset: 36, byteLength: 3 },
      ],
      accessors: [
        { bufferView: 0, componentType: 5126, count: 3, type: 'VEC3' },
        { bufferView: 1, componentType: 5121, count: 3, type: 'SCALAR' },
      ],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
    };
    const model = parseGlb(buildGlb(gltf, bin));
    expect(model.meshes[0]!.indices).toBeInstanceOf(Uint16Array);
    expect(Array.from(model.meshes[0]!.indices!)).toEqual([0, 1, 2]);
  });

  it('rejects non-GLB data', () => {
    expect(() => parseGlb(new ArrayBuffer(8))).toThrow(/not a GLB/);
    const wrongVersion = triangleGlb();
    new DataView(wrongVersion).setUint32(4, 1, true);
    expect(() => parseGlb(wrongVersion)).toThrow(/unsupported GLB version/);
  });

  it('rejects external buffer and image URIs', () => {
    const gltf = {
      asset: { version: '2.0' },
      buffers: [{ uri: 'model.bin', byteLength: 4 }],
      meshes: [],
    };
    expect(() => parseGlb(buildGlb(gltf, new Uint8Array(0)))).toThrow(/external or data URIs/);
  });
});
