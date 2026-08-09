import type { Metadata } from 'next';
import Link from 'next/link';
import { pageMetadata } from '@/lib/seo';
import { readJs13kSource } from '@/lib/js13k';
import CopyBlock from '@/components/CopyBlock';
import CodeBlock from '@/components/CodeBlock';

export const metadata: Metadata = pageMetadata({
  title: 'BroMetal for js13k',
  description:
    'A 2 kB WebGPU runtime for 13-kilobyte games. Shaders are written in typed TypeScript and compiled to WGSL on your machine, so the compiler never counts against the budget. Copy the runtime and start.',
  path: '/js13k',
});

export default function Js13kPage() {
  const { runtime, game, shader } = readJs13kSource();

  return (
    <main className="page prose">
      <h1>BroMetal for js13k</h1>
      <p className="page-intro">
        The core of BroMetal was built for exactly this: a renderer small enough
        to leave the budget for your game, with the expensive part — turning
        shaders into something a GPU can run — moved off the wire entirely.
      </p>

      <table className="js13k-numbers">
        <tbody>
          <tr>
            <td>Runtime, minified and gzipped</td>
            <td>
              <strong>2,125 bytes</strong>
            </td>
          </tr>
          <tr>
            <td>Runtime + a shader + a working game, zipped</td>
            <td>
              <strong>3,008 bytes</strong>
            </td>
          </tr>
          <tr>
            <td>Left for your game</td>
            <td>
              <strong>10,304 bytes</strong>
            </td>
          </tr>
        </tbody>
      </table>

      <h2>How is it so small?</h2>
      <p>
        <strong>The compiler never ships.</strong> You write shaders as typed
        TypeScript; a build step compiles them to WGSL on your machine and your
        game receives finished shader text. Nothing parses, type-checks or
        generates code in the browser, so none of that costs you bytes — and
        there is no compilation pause on the first frame.
      </p>
      <p>
        <strong>A mistake is a build error, not a black screen.</strong> Shader
        bugs normally surface as a blank canvas with an empty console. Here a
        misspelled uniform, a wrong vector width or a reserved word fails on your
        machine with a file and line number, while you still have budget left to
        care.
      </p>
      <p>
        <strong>Nothing is spent on being defensive.</strong> No validation, no
        error messages, no pipeline caching, no uniform ring buffers. Those are
        the right calls for a general-purpose library and the wrong ones at
        thirteen kilobytes, so this build simply does not have them.
      </p>
      <p>
        What it does have is what a real entry needs: multiple shader programs,
        2D textures from a canvas, instancing, alpha blending with depth writes
        off, depth testing, back-face culling, a matrix stack and mat4 helpers.
      </p>

      <h2>1. Copy the runtime</h2>
      <p>
        Plain source, global functions, no imports — so your minifier can rename
        all of it alongside your own code. Save it as <code>brometal.js</code>.
      </p>
      <CopyBlock label="brometal.js" code={runtime} maxHeight={420} />

      <h2>2. Set up your game</h2>
      <p>
        Everything is a global, so the whole program minifies as one unit. This
        one draws a spinning textured cube.
      </p>
      <CopyBlock label="game.js" code={game} maxHeight={420} />

      <h2>3. Add a shader</h2>
      <p>
        Typed TypeScript, checked before it reaches a GPU. Save it as{' '}
        <code>src/cube.shader.ts</code>.
      </p>
      <CopyBlock label="src/cube.shader.ts" code={shader} maxHeight={340} />
      <p>Then compile it:</p>
      <CodeBlock code={`npm install --save-dev brometal
npx brometal prod --js13k`} />
      <p>
        That writes <code>js13k/shaders.js</code>, where your shader becomes the
        global <code>BM_CUBE</code> the game above uses. BroMetal is a dev
        dependency — the compiler never ships.
      </p>

      <h2>4. Build the dist</h2>
      <CodeBlock code={`npm install --save-dev terser

cat brometal.js js13k/shaders.js game.js > out.js
terser out.js --compress --mangle --toplevel -o game.min.js
# inline game.min.js into index.html, then zip that one file`} />
      <p>
        <code>--toplevel</code> is what pays: it renames the runtime&rsquo;s
        functions and drops every one you never call. Inlining into the page
        saves another ~150 bytes, since a zip charges per file.
      </p>
      <p>
        The result opens straight from disk — <code>file://</code> is a secure
        context, so WebGPU works without a server.
      </p>

      <h2>Built for coding agents</h2>
      <p>
        Most of these entries get written with an assistant, and a graphics
        library is a hard thing to hand one: it will confidently produce GLSL
        that never compiles, or WebGL calls for a WebGPU runtime. So the npm
        package ships what an agent needs to get it right.
      </p>
      <p>
        <strong>
          <code>CLAUDE.md</code> and <code>AGENTS.md</code> are installed into{' '}
          <code>node_modules/brometal</code>
        </strong>{' '}
        — the DSL rules, and more usefully the mistakes that fail <em>silently</em>:
        reserved words that produce a blank canvas, sampling a texture inside an{' '}
        <code>if</code>, the row order of a render target. An agent reads them
        the way it reads any other file in your project.
      </p>
      <p>
        <strong>43 shaders and 19 complete demos ship alongside them</strong>, in{' '}
        <code>node_modules/brometal/examples</code> — every example from this
        site as real, compiling source rather than documentation snippets. Point
        an assistant at one and ask for something similar.
      </p>
      <p>
        <strong>The compiler closes the loop.</strong> This is the part that
        matters most for an agent: a wrong uniform name, a mismatched vector
        width or an unsupported construct is a build error with a file and a
        line, not a black screen. That is a signal it can act on and iterate
        against — which is exactly what a blank canvas and an empty console are
        not.
      </p>

      <h2>Requirements</h2>
      <p>
        Shaders compile to WGSL, so this needs WebGPU. It ships on by default
        here:
      </p>
      <table className="js13k-numbers">
        <tbody>
          <tr>
            <td>Chrome, Edge</td>
            <td>113+</td>
          </tr>
          <tr>
            <td>Firefox</td>
            <td>141+</td>
          </tr>
          <tr>
            <td>Safari (macOS)</td>
            <td>26+</td>
          </tr>
          <tr>
            <td>Android — Chrome</td>
            <td>121+, on Android 12 or newer</td>
          </tr>
          <tr>
            <td>iOS, iPadOS</td>
            <td>26+</td>
          </tr>
        </tbody>
      </table>
      <p>
        <strong>On iOS the browser makes no difference.</strong> Every browser
        there runs on WebKit, so Chrome and Firefox on an iPhone are Safari
        underneath — the iOS version is the only thing that decides it.
      </p>
      <p>
        A browser version is often tied to the OS, so someone on an older machine
        cannot simply upgrade. And a link opened inside another app — a chat
        client, a social feed — usually runs in an embedded web view rather than
        the real browser, which frequently lacks it.
      </p>

      <p className="js13k-footer">
        <Link href="/examples">Examples</Link>
        <span aria-hidden="true"> · </span>
        <Link href="/changelog">Changelog</Link>
        <span aria-hidden="true"> · </span>
        <a href="https://www.npmjs.com/package/brometal">npm</a>
      </p>
    </main>
  );
}
