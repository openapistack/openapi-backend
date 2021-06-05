#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const Toc = require('markdown-toc');

function main() {
  const filename = path.join(__dirname, '..', 'DOCS.md');
  const docs = fs.readFileSync(filename, 'utf8');
  const opts = {
    maxdepth: 3,
    bullets: '-',
    slugify: (text) =>
      text
        .toLowerCase()
        .replace(/\s/g, '-')
        .replace(/[^\w-]/g, ''),
  };
  const output = Toc.insert(docs, opts);
  fs.writeFileSync(filename, output);
  console.log('Done!');
}

if (require.main === module) {
  main();
}
