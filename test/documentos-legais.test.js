'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const raiz = path.join(__dirname, '..');
const ler = (arquivo) => fs.readFileSync(path.join(raiz, arquivo), 'utf8');

test('política de privacidade cobre transparência e direitos da LGPD', () => {
  const politica = ler('politica-privacidade.html');
  for (const conteudo of [
    'controladora', 'Quais dados são tratados', 'bases legais', 'Compartilhamento',
    'Retenção', 'Segurança e incidentes', 'Direitos do titular', 'Canal de privacidade'
  ]) assert.match(politica, new RegExp(conteudo, 'i'));
  assert.match(politica, /data-legal="privacyEmail"/);
  assert.doesNotMatch(politica, /vender dados|publicidade comportamental.*utilizamos/i);
});

test('termos preservam direitos obrigatórios do consumidor', () => {
  const termos = ler('termos-uso.html');
  assert.match(termos, /Código de Defesa do Consumidor/);
  assert.match(termos, /foro legalmente competente/);
  assert.match(termos, /Nenhuma cláusula limita responsabilidade que não possa ser legalmente afastada/);
  assert.match(termos, /Política de Privacidade/);
});

test('documentos legais estão públicos e possuem configuração de implantação', () => {
  const servidor = ler('server.js');
  const ambiente = ler('.env.example');
  for (const arquivo of ['politica-privacidade.html', 'termos-uso.html', 'legal.css']) {
    assert.match(servidor, new RegExp(`['"]${arquivo.replace('.', '\\.')}['"]`));
  }
  assert.match(servidor, /\/api\/informacoes-legais/);
  assert.match(ambiente, /^PRIVACY_EMAIL=/m);
  assert.match(ambiente, /^TERMS_CITY=/m);
});
