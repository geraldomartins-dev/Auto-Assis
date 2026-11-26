'use strict';

const express = require('express');
const path = require('node:path');

module.exports = async function globalSetup() {
  const app = express();
  const raiz = path.join(__dirname, '..', '..');
  app.use(express.static(raiz, { index: 'login.html' }));
  app.use((_req, res) => res.status(404).send('Arquivo não encontrado.'));

  const servidor = await new Promise((resolve, reject) => {
    const instancia = app.listen(4173, '127.0.0.1', () => resolve(instancia));
    instancia.once('error', reject);
  });

  return async () => {
    await new Promise((resolve, reject) => {
      servidor.close((erro) => erro ? reject(erro) : resolve());
    });
  };
};
