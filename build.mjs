import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const version = pkg.version;

rmSync('dist', { recursive: true, force: true });
mkdirSync('dist', { recursive: true });
cpSync('src', 'dist', { recursive: true });

for (const file of ['dist/app.js', 'dist/index.html']) {
  let raw = readFileSync(file, 'utf8').replaceAll('0.2.0', version);
  if (file.endsWith('app.js')) {
    raw = raw
      .replace("let selectedStyle = 'clean';", "let selectedStyle = 'dynamic';")
      .replace("let zoomMode = 'soft';", "let zoomMode = 'dynamic';")
      .replace("applyEditPreset('clean');", "selectSegment('#stylePicker','dynamic');applyEditPreset('dynamic');");
  }
  if (file.endsWith('index.html')) {
    raw = raw.replace('id="highlightKeywords" type="checkbox"', 'id="highlightKeywords" type="checkbox" checked');
  }
  writeFileSync(file, raw, 'utf8');
}

console.log(`ReelsFactory frontend built · v${version} · AI Dynamic default`);
