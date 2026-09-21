import type { Geometry } from './types.js';

export interface TeapotOptions {
  /** Total height of the teapot. */
  size?: number;
  /** Bézier subdivisions per patch edge. */
  segments?: number;
}

// Utah teapot patch topology and control points from Three.js TeapotGeometry,
// itself based on Martin Newell's public-domain dataset. Keeping the source data
// local makes this example a BroMetal-only render with no Three.js dependency.
const PATCH_DATA =
  'AAABAAIAAwAEAAUABgAHAAgACQAKAAsADAANAA4ADwADABAAEQASAAcAEwAUABUACwAWABcAGAAPABkAGgAbABIAHAAdAB4AFQAfACAAIQAYACIAIwAkABsAJQAmACcAHgAoACkAAAAhACoAKwAEACQALAAtAAgAJwAuAC8ADAAMAA0ADgAPADAAMQAyADMANAA1ADYANwA4ADkAOgA7AA8AGQAaABsAMwA8AD0APgA3AD8AQABBADsAQgBDAEQAGwAlACYAJwA+AEUARgBHAEEASABJAEoARABLAEwATQAnAC4ALwAMAEcATgBPADAASgBQAFEANABNAFIAUwA4ADgAOQA6ADsAVABVAFYAVwBYAFkAWgBbAFwAXQBeAF8AOwBCAEMARABXAGAAYQBiAFsAYwBkAGUAXwBmAGcAaABEAEsATABNAGIAaQBqAGsAZQBsAG0AbgBoAG8AcABxAE0AUgBTADgAawByAHMAVABuAHQAdQBYAHEAdgB3AFwAeAB5AHoAewB8AH0AfgB/AIAAgQCCAIMAhACFAIYAhwB7AIgAiQB4AH8AigCLAHwAgwCMAI0AgACHAI4AjwCEAIQAhQCGAIcAkACRAJIAkwCUAJUAlgCXAEQAmACZAJoAhwCOAI8AhACTAJsAnACQAJcAnQCeAJQAmgCfAKAARAChAKIAowCkAKUApgCnAKgAqQCqAKsArACtAK4ArwCwAKQAsQCyAKEAqACzALQApQCsALUAtgCpALAAtwC4AK0ArQCuAK8AsAC5ALoAuwC8AL0AvgC/AMAAwQDCAMMAxACwALcAuACtALwAxQDGALkAwADHAMgAvQDEAMkAygDBAMsAywDLAMsAzADNAM4AzwDQANAA0ADQANEA0gDTANQAywDLAMsAywDPANUA1gDXANAA0ADQANAA1ADYANkA2gDLAMsAywDLANcA2wDcAN0A0ADQANAA0ADaAN4A3wDgAMsAywDLAMsA3QDhAOIAzADQANAA0ADQAOAA4wDkANEA0QDSANMA1ADlAOYA5wDoAOkA6gDrAOwA7QDuAO8A8ADUANgA2QDaAOgA8QDyAPMA7AD0APUA9gDwAPcA+AD5ANoA3gDfAOAA8wD6APsA/AD2AP0A/gD/APkAAAEBAQIB4ADjAOQA0QD8AAMBBAHlAP8ABQEGAekAAgEHAQgB7QAJAQkBCQEJAQoBCwEMAQ0BDgEPARABEQFcAHcAdgBxAAkBCQEJAQkBDQESARMBFAERARUBFgEXAXEAcABvAGgACQEJAQkBCQEUARgBGQEaARcBGwEcAR0BaABnAGYAXwAJAQkBCQEJARoBHgEfAQoBHQEgASEBDgFfAF4AXQBcAA==';

const VERTEX_DATA =
  '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';

function decode(encoded: string): Uint8Array {
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bernstein(value: number): [number[], number[]] {
  const inverse = 1 - value;
  return [
    [inverse ** 3, 3 * value * inverse ** 2, 3 * value ** 2 * inverse, value ** 3],
    [-3 * inverse ** 2, 3 * inverse ** 2 - 6 * value * inverse, 6 * value * inverse - 3 * value ** 2, 3 * value ** 2],
  ];
}

/** Tessellate the classic 32-patch Utah teapot into a BroMetal geometry. */
export function createTeapot(options: TeapotOptions = {}): Geometry {
  const patchBytes = decode(PATCH_DATA);
  const vertexBytes = decode(VERTEX_DATA);
  const patches = new Uint16Array(patchBytes.buffer);
  const controlPoints = new Float32Array(vertexBytes.buffer);
  const size = options.size ?? 1;
  const segments = Math.max(2, Math.floor(options.segments ?? 10));
  const rowSize = segments + 1;
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const scale = size / (3.15 / 2);

  for (let patch = 0; patch < 32; patch++) {
    const firstVertex = positions.length / 3;
    for (let row = 0; row <= segments; row++) {
      const s = row / segments;
      const [bs, ds] = bernstein(s);
      for (let column = 0; column <= segments; column++) {
        const t = column / segments;
        const [bt, dt] = bernstein(t);
        const point = [0, 0, 0];
        const tangentS = [0, 0, 0];
        const tangentT = [0, 0, 0];

        for (let r = 0; r < 4; r++) {
          for (let c = 0; c < 4; c++) {
            const control = patches[patch * 16 + r * 4 + c]! * 3;
            const lidScale = patch >= 20 && patch < 28 ? 1.077 : 1;
            for (let axis = 0; axis < 3; axis++) {
              let value = controlPoints[control + axis]!;
              if (axis !== 2) value *= lidScale;
              point[axis]! += bs[r]! * bt[c]! * value;
              tangentS[axis]! += ds[r]! * bt[c]! * value;
              tangentT[axis]! += bs[r]! * dt[c]! * value;
            }
          }
        }

        const nx = tangentT[1]! * tangentS[2]! - tangentT[2]! * tangentS[1]!;
        const ny = tangentT[2]! * tangentS[0]! - tangentT[0]! * tangentS[2]!;
        const nz = tangentT[0]! * tangentS[1]! - tangentT[1]! * tangentS[0]!;
        const length = Math.hypot(nx, ny, nz);
        const cusp = point[0] === 0 && point[1] === 0;

        positions.push(scale * point[0]!, scale * (point[2]! - 3.15 / 2), -scale * point[1]!);
        if (cusp) normals.push(0, point[2]! > 3.15 / 2 ? 1 : -1, 0);
        else normals.push(nx / length, nz / length, -ny / length);
        uvs.push(1 - t, 1 - s);
      }
    }

    for (let row = 0; row < segments; row++) {
      for (let column = 0; column < segments; column++) {
        const a = firstVertex + row * rowSize + column;
        const b = a + 1;
        const c = b + rowSize;
        const d = a + rowSize;
        if (!samePosition(positions, a, b) && !samePosition(positions, a, c) && !samePosition(positions, b, c)) indices.push(a, b, c);
        if (!samePosition(positions, a, c) && !samePosition(positions, a, d) && !samePosition(positions, c, d)) indices.push(a, c, d);
      }
    }
  }

  const vertexCount = positions.length / 3;
  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    uvs: new Float32Array(uvs),
    indices: vertexCount > 65_535 ? new Uint32Array(indices) : new Uint16Array(indices),
  };
}

function samePosition(positions: number[], a: number, b: number): boolean {
  // Bernstein evaluation can leave tiny floating-point residue at the two
  // cusps. Treat coincident control-point results as equal so those zero-area
  // faces are removed just like the canonical teapot implementation.
  return Math.abs(positions[a * 3]! - positions[b * 3]!) < 1e-7
    && Math.abs(positions[a * 3 + 1]! - positions[b * 3 + 1]!) < 1e-7
    && Math.abs(positions[a * 3 + 2]! - positions[b * 3 + 2]!) < 1e-7;
}
