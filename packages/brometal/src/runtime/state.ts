/**
 * Per-context GL state cache so repeated useProgram / bindVertexArray calls
 * with the same object become no-ops instead of driver round-trips.
 */

interface CachedState {
  program: WebGLProgram | null;
  vao: WebGLVertexArrayObject | null;
}

const stateByContext = new WeakMap<WebGL2RenderingContext, CachedState>();

function stateFor(gl: WebGL2RenderingContext): CachedState {
  let state = stateByContext.get(gl);
  if (state === undefined) {
    state = { program: null, vao: null };
    stateByContext.set(gl, state);
  }
  return state;
}

export function useProgramCached(gl: WebGL2RenderingContext, program: WebGLProgram): void {
  const state = stateFor(gl);
  if (state.program !== program) {
    gl.useProgram(program);
    state.program = program;
  }
}

export function bindVaoCached(gl: WebGL2RenderingContext, vao: WebGLVertexArrayObject): void {
  const state = stateFor(gl);
  if (state.vao !== vao) {
    gl.bindVertexArray(vao);
    state.vao = vao;
  }
}

export function forgetProgram(gl: WebGL2RenderingContext, program: WebGLProgram): void {
  const state = stateFor(gl);
  if (state.program === program) {
    gl.useProgram(null);
    state.program = null;
  }
}

export function forgetVao(gl: WebGL2RenderingContext, vao: WebGLVertexArrayObject): void {
  const state = stateFor(gl);
  if (state.vao === vao) {
    gl.bindVertexArray(null);
    state.vao = null;
  }
}
