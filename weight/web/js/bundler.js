const fs = require('fs');
const path = require('path');

const files = [
  'utils.js',
  'state.js', 
  'render.js',
  'ws.js',
  'modal.js',
  'main.js'
];

let bundle = '';
for (const file of files) {
  const content = fs.readFileSync(path.join(__dirname, file), 'utf-8');
  // Remove import and export statements
  const cleaned = content.replace(/^import .* from.*$/gm, '').replace(/^export /gm, '');
  bundle += cleaned + '\n';
}

fs.writeFileSync(path.join(__dirname, 'bundle.js'), bundle);
console.log('Bundled', files.length, 'files into bundle.js');
