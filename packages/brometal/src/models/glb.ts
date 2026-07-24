/**
 * A minimal glTF-Binary (.glb) loader: parses meshes into typed arrays ready
 * for program.attributes.*.set(), plus any embedded images for createTexture.
 *
 * Scope: glTF 2.0 GLB containers with the binary chunk as the only buffer,
 * triangle primitives, float32 attributes, and embedded (bufferView) images.
 * Node transforms, Draco compression, sparse accessors, and external .bin or
 * image URIs are out of scope and throw descriptive errors.
 */

export interface ModelMesh {
  name: string;
  /** xyz per vertex. */
  positions: Float32Array;
  /** xyz per vertex, or null if the primitive has no NORMAL attribute. */
  normals: Float32Array | null;
  /** TEXCOORD_0 uv per vertex (glTF convention: v grows downward), or null. */
  uvs: Float32Array | null;
  /** Triangle indices, or null for non-indexed primitives. */
  indices: Uint16Array | Uint32Array | null;
  /** Index into Model.images for the material's base-color texture, or null. */
  imageIndex: number | null;
}

export interface ModelImage {
  name: string;
  /** e.g. 'image/png' — pass to Blob for createImageBitmap. */
  mimeType: string;
  data: Uint8Array;
}

export interface Model {
  meshes: ModelMesh[];
  images: ModelImage[];
}

const GLB_MAGIC = 0x46546c67;
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;

const COMPONENT_BYTES: Record<number, number> = {
  5121: 1, // unsigned byte
  5123: 2, // unsigned short
  5125: 4, // unsigned int
  5126: 4, // float
};

const TYPE_COMPONENTS: Record<string, number> = {
  SCALAR: 1,
  VEC2: 2,
  VEC3: 3,
  VEC4: 4,
};

interface GltfAccessor {
  bufferView?: number;
  byteOffset?: number;
  componentType: number;
  count: number;
  type: string;
  sparse?: unknown;
}

interface GltfBufferView {
  buffer: number;
  byteOffset?: number;
  byteLength: number;
  byteStride?: number;
}

interface GltfJson {
  buffers?: { uri?: string; byteLength: number }[];
  bufferViews?: GltfBufferView[];
  accessors?: GltfAccessor[];
  meshes?: {
    name?: string;
    primitives: {
      attributes: Record<string, number>;
      indices?: number;
      material?: number;
      mode?: number;
    }[];
  }[];
  materials?: {
    pbrMetallicRoughness?: { baseColorTexture?: { index: number } };
  }[];
  textures?: { source?: number }[];
  images?: { name?: string; mimeType?: string; bufferView?: number; uri?: string }[];
}

/** Parses a .glb file's bytes into meshes and embedded images. */
export function parseGlb(data: ArrayBuffer): Model {
  const view = new DataView(data);
  if (data.byteLength < 20 || view.getUint32(0, true) !== GLB_MAGIC) {
    throw new Error('BroMetal: not a GLB file (bad magic)');
  }
  const version = view.getUint32(4, true);
  if (version !== 2) {
    throw new Error(`BroMetal: unsupported GLB version ${version} (expected 2)`);
  }

  let json: GltfJson | null = null;
  let bin: Uint8Array | null = null;
  let offset = 12;
  while (offset + 8 <= data.byteLength) {
    const chunkLength = view.getUint32(offset, true);
    const chunkType = view.getUint32(offset + 4, true);
    const chunkStart = offset + 8;
    if (chunkType === CHUNK_JSON) {
      const text = new TextDecoder().decode(new Uint8Array(data, chunkStart, chunkLength));
      json = JSON.parse(text) as GltfJson;
    } else if (chunkType === CHUNK_BIN) {
      bin = new Uint8Array(data, chunkStart, chunkLength);
    }
    offset = chunkStart + chunkLength;
  }
  if (json === null) {
    throw new Error('BroMetal: GLB file has no JSON chunk');
  }

  for (const buffer of json.buffers ?? []) {
    if (buffer.uri !== undefined) {
      throw new Error('BroMetal: GLB buffers with external or data URIs are not supported');
    }
  }

  const bufferViews = json.bufferViews ?? [];
  const accessors = json.accessors ?? [];

  const viewBytes = (index: number): { bytes: Uint8Array; stride?: number } => {
    const bv = bufferViews[index];
    if (bv === undefined) {
      throw new Error(`BroMetal: GLB bufferView ${index} does not exist`);
    }
    if (bin === null) {
      throw new Error('BroMetal: GLB file has no binary chunk');
    }
    return {
      bytes: bin.subarray(bv.byteOffset ?? 0, (bv.byteOffset ?? 0) + bv.byteLength),
      stride: bv.byteStride,
    };
  };

  const readAccessor = (index: number): { data: Float32Array | Uint16Array | Uint32Array | Uint8Array; components: number } => {
    const accessor = accessors[index];
    if (accessor === undefined) {
      throw new Error(`BroMetal: GLB accessor ${index} does not exist`);
    }
    if (accessor.sparse !== undefined) {
      throw new Error('BroMetal: sparse GLB accessors are not supported');
    }
    const components = TYPE_COMPONENTS[accessor.type];
    const componentBytes = COMPONENT_BYTES[accessor.componentType];
    if (components === undefined || componentBytes === undefined) {
      throw new Error(
        `BroMetal: unsupported GLB accessor type ${accessor.type}/${accessor.componentType}`,
      );
    }
    if (accessor.bufferView === undefined) {
      throw new Error('BroMetal: GLB accessors without a bufferView are not supported');
    }
    const { bytes, stride } = viewBytes(accessor.bufferView);
    const start = bytes.byteOffset + (accessor.byteOffset ?? 0);
    const elementBytes = components * componentBytes;
    const packed = stride === undefined || stride === elementBytes;

    const makeView = (
      Ctor: typeof Float32Array | typeof Uint16Array | typeof Uint32Array | typeof Uint8Array,
    ) => {
      if (packed) {
        // Copy so the result stays alive independently of the source buffer.
        return new Ctor(bytes.buffer.slice(start, start + accessor.count * elementBytes) as ArrayBuffer);
      }
      const out = new Ctor(accessor.count * components);
      const dv = new DataView(bytes.buffer);
      for (let i = 0; i < accessor.count; i++) {
        for (let c = 0; c < components; c++) {
          const at = start + i * stride! + c * componentBytes;
          out[i * components + c] =
            Ctor === Float32Array
              ? dv.getFloat32(at, true)
              : componentBytes === 1
                ? dv.getUint8(at)
                : componentBytes === 2
                  ? dv.getUint16(at, true)
                  : dv.getUint32(at, true);
        }
      }
      return out;
    };

    switch (accessor.componentType) {
      case 5126:
        return { data: makeView(Float32Array) as Float32Array, components };
      case 5125:
        return { data: makeView(Uint32Array) as Uint32Array, components };
      case 5123:
        return { data: makeView(Uint16Array) as Uint16Array, components };
      default:
        return { data: makeView(Uint8Array) as Uint8Array, components };
    }
  };

  const images: ModelImage[] = (json.images ?? []).map((image, i) => {
    if (image.bufferView === undefined) {
      throw new Error('BroMetal: GLB images with external URIs are not supported');
    }
    const { bytes } = viewBytes(image.bufferView);
    return {
      name: image.name ?? `image${i}`,
      mimeType: image.mimeType ?? 'image/png',
      data: new Uint8Array(bytes),
    };
  });

  const materialImage = (materialIndex: number | undefined): number | null => {
    if (materialIndex === undefined) return null;
    const textureIndex = json.materials?.[materialIndex]?.pbrMetallicRoughness?.baseColorTexture?.index;
    if (textureIndex === undefined) return null;
    const source = json.textures?.[textureIndex]?.source;
    return source ?? null;
  };

  const meshes: ModelMesh[] = [];
  for (const [meshIndex, mesh] of (json.meshes ?? []).entries()) {
    for (const [primIndex, primitive] of mesh.primitives.entries()) {
      if (primitive.mode !== undefined && primitive.mode !== 4) {
        throw new Error('BroMetal: only triangle GLB primitives are supported');
      }
      const positionAccessor = primitive.attributes['POSITION'];
      if (positionAccessor === undefined) {
        throw new Error('BroMetal: GLB primitive has no POSITION attribute');
      }
      const positions = readAccessor(positionAccessor).data;
      if (!(positions instanceof Float32Array)) {
        throw new Error('BroMetal: GLB POSITION attribute must be float32');
      }

      let normals: Float32Array | null = null;
      if (primitive.attributes['NORMAL'] !== undefined) {
        normals = readAccessor(primitive.attributes['NORMAL']).data as Float32Array;
      }
      let uvs: Float32Array | null = null;
      if (primitive.attributes['TEXCOORD_0'] !== undefined) {
        uvs = readAccessor(primitive.attributes['TEXCOORD_0']).data as Float32Array;
      }

      let indices: Uint16Array | Uint32Array | null = null;
      if (primitive.indices !== undefined) {
        const raw = readAccessor(primitive.indices).data;
        indices = raw instanceof Uint8Array ? new Uint16Array(raw) : (raw as Uint16Array | Uint32Array);
      }

      const suffix = mesh.primitives.length > 1 ? `/${primIndex}` : '';
      meshes.push({
        name: (mesh.name ?? `mesh${meshIndex}`) + suffix,
        positions,
        normals,
        uvs,
        indices,
        imageIndex: materialImage(primitive.material),
      });
    }
  }

  return { meshes, images };
}

/** Fetches and parses a .glb model from a URL. */
export async function loadGlb(url: string): Promise<Model> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`BroMetal: could not load model '${url}' (HTTP ${response.status})`);
  }
  return parseGlb(await response.arrayBuffer());
}
