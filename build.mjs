import { readFileSync, writeFileSync } from 'node:fs';
const strip = f => readFileSync(f, 'utf8').replace(/^import .*$/gm, '').replace(/^export /gm, '');
const js = ['teams.js', 'game.js', 'app.js'].map(strip).join('\n');
const html = readFileSync('template.html', 'utf8').replace('/*APP*/', () => js);
writeFileSync('dist/index.html', html);
console.log('built dist/index.html', html.length, 'bytes');
