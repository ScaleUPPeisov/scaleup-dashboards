import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const version = pkg.version;

rmSync('dist', { recursive: true, force: true });
mkdirSync('dist', { recursive: true });
cpSync('src', 'dist', { recursive: true });

for (const file of ['dist/app.js', 'dist/index.html']) {
  const raw = readFileSync(file, 'utf8');
  writeFileSync(file, raw.replaceAll('0.2.0', version), 'utf8');
}

console.log(`ReelsFactory frontend built · v${version}`);
