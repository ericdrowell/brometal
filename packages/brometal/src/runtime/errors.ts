/**
 * Errors BroMetal raises, tagged so an application can decide what to do about
 * each one.
 *
 * The library deliberately renders nothing on failure — no message drawn into
 * the canvas, no DOM touched. Where a failure should be shown, and in whose
 * design language, belongs to the application. What the runtime owes it is a
 * failure that is *catchable*, *distinguishable*, and never silent.
 *
 * Silence is the real hazard here. WebGPU reports most problems asynchronously:
 * a pipeline that fails validation does not throw, it becomes an invalid object
 * that draws nothing, and a lost device simply stops producing frames. Either
 * way the canvas goes black with no exception anywhere — which is exactly how an
 * unsupported browser came to look like a broken demo.
 */

/**
 * Every code names the exact thing that could not be obtained, walking down the
 * acquisition chain: the API, then an adapter, then a device, then a canvas
 * context. Read them as nouns — the words are what `errorTitle` shows a user, so
 * a code that reads badly out loud is a code that needs renaming.
 */
export type BroMetalErrorCode =
  /** The browser exposes no `navigator.gpu` at all. */
  | 'webgpu-unavailable'
  /** WebGPU exists, but no adapter was granted — blocklisted GPU, VM, or hardware acceleration off. */
  | 'gpu-adapter-unavailable'
  /** An adapter was granted but the device request failed. */
  | 'gpu-device-unavailable'
  /** The canvas would not return a WebGPU context, usually because it already has another kind. */
  | 'canvas-context-unavailable'
  /** The device was lost after the renderer was created. Nothing will draw again. */
  | 'gpu-device-lost'
  /** An uncaptured GPU error: failed validation, or out of memory. */
  | 'gpu-error';

export class BroMetalError extends Error {
  readonly code: BroMetalErrorCode;

  constructor(code: BroMetalErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options as ErrorOptions);
    this.name = 'BroMetalError';
    this.code = code;
  }
}

/**
 * Narrows an unknown caught value. Worth having because the interesting cases
 * arrive through a `catch`, where the value is typed `unknown`.
 */
export function isBroMetalError(value: unknown): value is BroMetalError {
  return value instanceof BroMetalError;
}

/**
 * Called when something fails after the renderer exists.
 *
 * Creation failures reject `createRenderer` and are caught normally; these
 * cannot be, because they happen frames later with no call of yours on the
 * stack.
 */
export type ErrorHandler = (error: BroMetalError) => void;

/** Words that are initialisms rather than ordinary nouns. */
const ACRONYMS: Record<string, string> = { webgpu: 'WebGPU', gpu: 'GPU' };

/**
 * Renders a code as the sentence a person should read: `gpu-adapter-unavailable`
 * becomes "GPU adapter unavailable".
 *
 * Deriving this rather than keeping a lookup table beside the codes is the whole
 * point. A table has to be edited in step with the union, and the moment it is
 * not, the label and the code disagree — which is worse than either being vague,
 * because a wrong label sends someone debugging the wrong layer. Here they
 * cannot disagree: there is only one string, spelled once.
 *
 * Applications are free to ignore this and write their own copy. It exists so
 * that the default is correct.
 */
export function errorTitle(code: BroMetalErrorCode | (string & {})): string {
  const [first = '', ...rest] = code.split('-').map((word) => ACRONYMS[word] ?? word);
  return [first.charAt(0).toUpperCase() + first.slice(1), ...rest].join(' ');
}
