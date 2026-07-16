// Inlines dist/bundle.js + styles.css into one self-contained HTML file that
// works from file:// with no server and no network — the true offline artifact.
// Run via: npm run build:standalone
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const [html, css, js] = await Promise.all([
  readFile(join(root, 'index.html'), 'utf8'),
  readFile(join(root, 'styles.css'), 'utf8'),
  readFile(join(root, 'dist', 'bundle.js'), 'utf8'),
]);

// a literal "</script>" inside the bundle would terminate the inline tag early
const safeJs = js.replace(/<\/script/gi, '<\\/script');

// function replacements — a plain replacement string would have its $-patterns
// ($&, $', $`…) expanded, and minified code is full of them
const out = html
  .replace('<link rel="stylesheet" href="./styles.css">', () => `<style>\n${css}\n</style>`)
  .replace(
    '<script src="./dist/bundle.js"></script>',
    () => `<script>\n${safeJs}\n</script>`
  );

const target = join(root, 'dist', 'spacesaver.html');
await writeFile(target, out);
console.log(`standalone build -> ${target} (${(out.length / 1024).toFixed(0)} kB)`);
