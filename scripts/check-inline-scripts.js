'use strict';

const fs = require('node:fs');
const path = require('node:path');

const raiz = path.join(__dirname, '..');
const paginas = fs.readdirSync(raiz)
  .filter((arquivo) => arquivo.endsWith('.html'))
  .sort();

let total = 0;
for (const pagina of paginas) {
  const html = fs.readFileSync(path.join(raiz, pagina), 'utf8');
  const scripts = html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi);
  let indice = 0;
  for (const correspondencia of scripts) {
    const codigo = correspondencia[1].trim();
    if (!codigo) continue;
    indice += 1;
    try {
      new Function(codigo);
      total += 1;
    } catch (error) {
      throw new Error(`${pagina}, script inline ${indice}: ${error.message}`);
    }
  }
}

console.log(`${total} scripts inline validados em ${paginas.length} páginas.`);
