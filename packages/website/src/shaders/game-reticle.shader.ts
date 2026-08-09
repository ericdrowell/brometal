import { shader, vec2, vec4, abs, min, smoothstep } from 'brometal';
import { sdBox2, strokeAA } from 'brometal/shader-functions';

/**
 * Aiming reticles: four thin "L" corner brackets — a square outline with the
 * edge midpoints masked out.
 *
 * Positioned in **clip space**, because the far bracket is a cursor and has to
 * sit exactly under the pointer. A world-space point cannot do that here: the
 * chase camera translates with the ship, so its projection slides across the
 * screen even when the mouse has not moved. Writing clip coordinates pins it.
 *
 * The cost of leaving world space is that perspective no longer sizes the two
 * brackets, so `iSize` has to imitate it: the far bracket — the one riding the
 * cursor — is the **smaller** of the two, and the near one, partway back toward
 * the ship, is larger. They read as one sight seen in depth.
 *
 * The near bracket exists to show where the shot will pass, so it has to lie on
 * the screen-space line from the *ship* to the cursor. That means the ship's own
 * projected position, not the middle of the screen: the camera only loosely
 * follows the ship now, so the two are not the same point and assuming they were
 * put the bracket off the line of fire.
 */
export const GameReticle = shader({
  attributes: { aPosition: 'vec3', aUv: 'vec2' },
  /** All static. `iAlong` is the fraction of the way out to the cursor. */
  instanceAttributes: { iAlong: 'float', iSize: 'float', iAlpha: 'float' },
  uniforms: {
    uColor: 'vec3',
    /** Pointer position in normalised device coordinates, -1..1 on both axes. */
    uCursor: 'vec2',
    /** The ship's projected position, same coordinates. */
    uShip: 'vec2',
    /** Drawing-buffer aspect, so the brackets stay square rather than stretching. */
    uAspect: 'float',
  },
  varyings: { vUv: 'vec2', vAlpha: 'float' },

  vertex(
    { aPosition, aUv, iAlong, iSize, iAlpha },
    { uCursor, uShip, uAspect },
    v,
  ) {
    v.vUv = aUv;
    v.vAlpha = iAlpha;
    // Walk the line of sight: 0 is the ship, 1 is the cursor.
    const centre = uShip.add(uCursor.sub(uShip).scale(iAlong));
    // z = -1 is the near plane of the GL-style clip space the compiler remaps,
    // so the brackets sit in front of the scene as an overlay.
    return vec4(
      centre.x + (aPosition.x * iSize) / uAspect,
      centre.y + aPosition.y * iSize,
      0 - 1,
      1,
    );
  },

  fragment({ uColor }, { vUv, vAlpha }) {
    const p = vUv.sub(vec2(0.5, 0.5));
    const outline = strokeAA(sdBox2(p, vec2(0.34, 0.34)), 0.012, 0.008);
    // Keep only the corners: fragments near an edge midpoint have one small
    // coordinate, so gate on min(|x|, |y|) to carve the four gaps.
    const corner = smoothstep(0.2, 0.23, min(abs(p.x), abs(p.y)));
    return vec4(uColor, outline * corner * vAlpha);
  },
});
