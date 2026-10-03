/* Builds the claude.ai artifact version of the page.
   An artifact gets its own <!doctype>/<head>/<body> wrapper, so this keeps only the part of
   index.html between the page:start/page:end markers (title, fonts, styles) plus the <body> content.
   Usage: npm run artifact [-- out.html]   (default: dist/artifact.html) */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const head = /<!-- page:start[^>]*-->([\s\S]*?)<!-- page:end -->/.exec(src);
const body = /<body>([\s\S]*?)<\/body>/.exec(src);
if (!head || !body) { console.error('index.html is missing the page:start/page:end markers or <body>'); process.exit(1); }

const out = path.resolve(process.argv[2] || path.join(root, 'dist', 'artifact.html'));
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, head[1].trim() + '\n' + body[1].trim() + '\n');
console.log(out);
