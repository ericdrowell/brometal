import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as shaderFunctions from '../src/shader-functions/index.js';

/**
 * AGENTS.md is shipped in the published package and is the file a coding agent
 * reads to orient itself. A stale list there is worse than no list: an agent
 * will confidently call a function that does not exist, or never reach for one
 * that does. These tests fail the build rather than let it drift.
 */
const DOC = readFileSync(join(import.meta.dirname, '..', 'AGENTS.md'), 'utf8');

describe('AGENTS.md', () => {
  it('lists every exported shader function', () => {
    const exported = Object.keys(shaderFunctions).filter((name) => name !== 'default');
    const missing = exported.filter((name) => !new RegExp(`\\b${name}\\b`).test(DOC));
    expect(missing).toEqual([]);
  });

  it('does not name functions that no longer exist', () => {
    // Only checks the API-surface section, so prose is free to mention anything.
    const section = DOC.slice(DOC.indexOf('brometal/shader-functions'));
    const backticked = [...section.matchAll(/`([a-z][A-Za-z0-9]+)`/g)].map((m) => m[1]!);
    const known = new Set(Object.keys(shaderFunctions));
    const bogus = backticked.filter(
      (name) => /^(sd|ease|hash|fbm|blend|tonemap)/.test(name) && !known.has(name),
    );
    expect(bogus).toEqual([]);
  });

  it('documents the traps that fail silently, since those cost the most time', () => {
    for (const trap of ['targetUv', 'uniform control flow', 'depth: true', 'reserved']) {
      expect(DOC.toLowerCase()).toContain(trap.toLowerCase());
    }
  });
});
