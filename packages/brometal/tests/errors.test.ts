import { describe, expect, it, vi, afterEach } from 'vitest';
import { BroMetalError, errorTitle, isBroMetalError } from '../src/runtime/errors.js';
import type { BroMetalErrorCode } from '../src/runtime/errors.js';
import { createRenderer } from '../src/runtime/context.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('BroMetalError', () => {
  it('carries a code an application can branch on', () => {
    const error = new BroMetalError('gpu-adapter-unavailable', 'no adapter');
    expect(error.code).toBe('gpu-adapter-unavailable');
    expect(error.name).toBe('BroMetalError');
    expect(error).toBeInstanceOf(Error);
  });

  it('keeps the underlying failure as a cause', () => {
    const cause = new Error('driver said no');
    expect(new BroMetalError('gpu-device-unavailable', 'refused', { cause }).cause).toBe(cause);
  });

  it('narrows an unknown caught value', () => {
    // The interesting cases all arrive through a catch, where the value is
    // typed unknown and instanceof is the only thing available.
    expect(isBroMetalError(new BroMetalError('gpu-error', 'x'))).toBe(true);
    expect(isBroMetalError(new Error('x'))).toBe(false);
    expect(isBroMetalError('not an error')).toBe(false);
    expect(isBroMetalError(null)).toBe(false);
  });
});

describe('createRenderer without WebGPU', () => {
  const canvas = {} as HTMLCanvasElement;

  it('rejects with a coded error rather than a bare one', async () => {
    vi.stubGlobal('navigator', {});
    await expect(createRenderer(canvas)).rejects.toThrow(BroMetalError);
    await expect(createRenderer(canvas)).rejects.toMatchObject({
      code: 'webgpu-unavailable',
    });
  });

  it('leaves the canvas entirely alone', async () => {
    vi.stubGlobal('navigator', {});
    // The library renders nothing on failure — no message drawn, no DOM
    // touched. Where and how to show it belongs to the application.
    const touched: string[] = [];
    const probe = new Proxy(
      {},
      {
        get(_t, key: string) {
          touched.push(key);
          return undefined;
        },
      },
    ) as HTMLCanvasElement;

    await expect(createRenderer(probe)).rejects.toThrow(/does not support WebGPU/);
    expect(touched).toEqual([]);
  });

  it('says what to do about it, not just what failed', async () => {
    vi.stubGlobal('navigator', {});
    await expect(createRenderer(canvas)).rejects.toThrow(/Chrome, Edge and Safari 26\+/);
  });
});

describe('errorTitle', () => {
  // The whole point of deriving the title is that a code and its label cannot
  // disagree. This pins the exact rendering of every code in the union, so a new
  // code that reads badly out loud fails here rather than reaching a user.
  const EXPECTED: Record<BroMetalErrorCode, string> = {
    'webgpu-unavailable': 'WebGPU unavailable',
    'gpu-adapter-unavailable': 'GPU adapter unavailable',
    'gpu-device-unavailable': 'GPU device unavailable',
    'canvas-context-unavailable': 'Canvas context unavailable',
    'gpu-device-lost': 'GPU device lost',
    'gpu-error': 'GPU error',
  };

  it.each(Object.entries(EXPECTED))('renders %s as "%s"', (code, title) => {
    expect(errorTitle(code)).toBe(title);
  });

  it('reads back as the code it came from', () => {
    // Round-trip: lowercasing the title and re-hyphenating must return the code.
    // If it does not, the words drifted from the key.
    for (const code of Object.keys(EXPECTED) as BroMetalErrorCode[]) {
      expect(errorTitle(code).toLowerCase().replace(/ /g, '-')).toBe(code);
    }
  });

  it('handles a code the library does not define', () => {
    // Applications add their own — the website uses 'unknown-error' for a throw
    // that was never a BroMetalError.
    expect(errorTitle('unknown-error')).toBe('Unknown error');
  });
});
