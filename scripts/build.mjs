import { readFile, readdir, writeFile } from 'node:fs/promises';
const types = { html: 'text/html; charset=utf-8', css: 'text/css; charset=utf-8', js: 'text/javascript; charset=utf-8', svg: 'image/svg+xml' };
const assets = {};
for (const name of await readdir(new URL('../public/', import.meta.url))) {
  assets['/' + name] = { type: types[name.split('.').pop()], content: await readFile(new URL('../public/' + name, import.meta.url), 'utf8') };
}
await writeFile(new URL('../src/assets.generated.js', import.meta.url), 'export const assets = ' + JSON.stringify(assets) + ';\n');
console.log('Built ' + Object.keys(assets).length + ' application assets.');
