import { describe, expect, it } from 'vitest';
import { createTexture3D } from '../src/runtime/texture.js';
import type { Renderer } from '../src/runtime/context.js';

/**
 * Only the backend-independent half of texture creation is reachable from node —
 * everything past the validation below needs a GPUDevice. The upload path, the
 * sampler parameters and anisotropy clamping are covered by `npm run test:gpu`,
 * which drives a real adapter.
 */
const renderer = {} as Renderer;

describe('3D textures', () => {
  it('rejects volume data whose length does not match its dimensions', () => {
    // 2x2x2 RGBA needs 32 bytes; hand it 16 and it should say so rather than
    // uploading a half-filled volume that reads as garbage on the GPU.
    expect(() =>
      createTexture3D(renderer, { width: 2, height: 2, depth: 2, data: new Uint8Array(16) }),
    ).toThrow(/16 bytes but 2x2x2 RGBA needs 32/);
  });

  it('checks the length before touching the device', () => {
    // The renderer stub has no device at all, so reaching the upload would throw
    // something unrelated — proof the size check runs first.
    expect(() =>
      createTexture3D(renderer, { width: 4, height: 4, depth: 4, data: new Uint8Array(0) }),
    ).toThrow(/RGBA needs 256/);
  });
});
