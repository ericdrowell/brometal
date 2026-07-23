/** Vertex streams for one mesh, ready for program.attributes / setIndices. */
export interface Geometry {
  /** vec3 per vertex */
  positions: Float32Array;
  /** vec3 per vertex, unit length */
  normals: Float32Array;
  /** vec2 per vertex, 0..1 */
  uvs: Float32Array;
  indices: Uint16Array | Uint32Array;
}

export function buildGeometry(
  positions: number[],
  normals: number[],
  uvs: number[],
  indices: number[],
): Geometry {
  const vertexCount = positions.length / 3;
  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    uvs: new Float32Array(uvs),
    indices: vertexCount > 65535 ? new Uint32Array(indices) : new Uint16Array(indices),
  };
}

/**
 * Emits two CCW triangles per cell for a row-major vertex grid of
 * (rows + 1) × (cols + 1) vertices, where row r starts at r * (cols + 1).
 * The default winding assumes outward faces; pass flip for grids whose rows
 * advance the opposite way. skipTop/skipBottom drop the degenerate triangle
 * at pole rows (sphere caps).
 */
export function gridPatch(
  indices: number[],
  rows: number,
  cols: number,
  options: { flip?: boolean; skipTop?: boolean; skipBottom?: boolean } = {},
): void {
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const a = row * (cols + 1) + col;
      const b = a + 1;
      const c = a + (cols + 1);
      const d = c + 1;
      const first = options.flip ? [a, b, d] : [a, c, d];
      const second = options.flip ? [a, d, c] : [a, d, b];
      if (!(options.skipBottom === true && row === rows - 1)) {
        indices.push(first[0]!, first[1]!, first[2]!);
      }
      if (!(options.skipTop === true && row === 0)) {
        indices.push(second[0]!, second[1]!, second[2]!);
      }
    }
  }
}
