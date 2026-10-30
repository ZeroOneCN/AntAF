const fs = require('fs');
const path = require('path');

const files = [
  'utils.js',
  'state.js',
  'render.js',
  'ws.js',
  'modal.js',
  'three-effects.js',
  'main.js'
];

let bundle = '';
for (const file of files) {
  const content = fs.readFileSync(path.join(__dirname, file), 'utf-8');
  const cleaned = content
    .replace(/import\s+(?:[\w*{}\s,$]+)\s+from\s+["'][^"']+["'];?/g, '')
    .replace(/import\s+["'][^"']+["'];?/g, '')
    .replace(/^export\s+\{[^}]*\};?\s*$/gm, '')
    .replace(/^export\s+/gm, '');
  bundle += cleaned + '\n';
}

new Function(bundle);
fs.writeFileSync(path.join(__dirname, 'bundle.js'), bundle);
console.log('Bundled', files.length, 'files into bundle.js');
