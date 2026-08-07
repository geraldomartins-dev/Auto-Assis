'use strict';

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const bcrypt = require('bcrypt');


const app = express();
const PORT = Number(process.env.PORT || 3000);
const AUTH_SECRET = process.env.AUTH_SECRET || 'DESENVOLVIMENTO-ALTERE-ESTA-CHAVE-IMEDIATAMENTE';
const AUTH_EXPIRES_SECONDS = Number(process.env.AUTH_EXPIRES_SECONDS || 28800);
const CORS_ORIGIN = process.env.CORS_ORIGIN || `http://localhost:${PORT}`;
const FRONTEND_URL = process.env.FRONTEND_URL || `http://localhost:${PORT}`;

if (process.env.NODE_ENV === 'production' && AUTH_SECRET.startsWith('DESENVOLVIMENTO')) {
  throw new Error('Defina AUTH_SECRET antes de iniciar em produção.');
}

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'autoassis_novo',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4'
});


app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' http://localhost:3000; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
  next();
});
app.use(cors({
  origin(origin, callback) {
    if (!origin || origin === CORS_ORIGIN || origin === FRONTEND_URL) return callback(null, true);
    return callback(new Error('Origem não autorizada pelo CORS.'));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '100kb' }));
app.use(express.static(__dirname, { extensions: ['html'] }));

app.get('/', (_req, res) => {
  res.redirect('/login.html');
});

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}
function assinarToken(usuario) {
  const payload = {
    sub: usuario.id,
    nome: usuario.nome,
    email: usuario.email,
    tipo: usuario.tipo,
    exp: Math.floor(Date.now() / 1000) + AUTH_EXPIRES_SECONDS
  };
  const encoded = base64url(JSON.stringify(payload));
  const signature = crypto.createHmac('sha256', AUTH_SECRET).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}
function verificarToken(token) {
  const [encoded, signature] = String(token || '').split('.');
  if (!encoded || !signature) throw new Error('Token inválido.');
  const expected = crypto.createHmac('sha256', AUTH_SECRET).update(encoded).digest('base64url');
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new Error('Assinatura inválida.');
  const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) throw new Error('Token expirado.');
  return payload;
}
function autenticar(req, res, next) {
  try {
    const auth = req.headers.authorization || '';
    if (!auth.startsWith('Bearer ')) return res.status(401).json({ erro: 'Autenticação necessária.' });
    req.usuario = verificarToken(auth.slice(7));
    next();
  } catch {
    return res.status(401).json({ erro: 'Sessão inválida ou expirada.' });
  }
}
function somenteGerente(req, res, next) {
  if (req.usuario.tipo !== 'gerente') return res.status(403).json({ erro: 'Acesso permitido somente para gerente.' });
  next();
}

const tentativas = new Map();
function limitar({ janelaMs, limite }) {
  return (req, res, next) => {
    const chave = `${req.ip}:${req.path}`;
    const agora = Date.now();
    const atual = tentativas.get(chave);
    if (!atual || atual.reset <= agora) {
      tentativas.set(chave, { count: 1, reset: agora + janelaMs });
      return next();
    }
    atual.count += 1;
    if (atual.count > limite) return res.status(429).json({ erro: 'Muitas tentativas. Aguarde alguns minutos.' });
    next();
  };
}
const limiteAuth = limitar({ janelaMs: 15 * 60 * 1000, limite: 8 });

function texto(value, campo, min = 1, max = 255) {
  const v = String(value ?? '').trim();
  if (v.length < min || v.length > max) throw new Error(`${campo} deve ter entre ${min} e ${max} caracteres.`);
  return v;
}
function emailValido(value) {
  const v = texto(value, 'E-mail', 5, 150).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) throw new Error('E-mail inválido.');
  return v;
}
function inteiro(value, campo, min = 0) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min) throw new Error(`${campo} inválido.`);
  return n;
}
function decimal(value, campo, min = 0) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < min) throw new Error(`${campo} inválido.`);
  return n;
}
function idNumerico(value) {
  const n = Number(String(value).replace(/\D/g, ''));
  if (!Number.isInteger(n) || n <= 0) throw new Error('ID inválido.');
  return n;
}
function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

app.get('/api/saude', asyncRoute(async (_req, res) => {
  await pool.query('SELECT 1');
  res.json({ status: 'ok' });
}));

app.post('/api/cadastro', limiteAuth, asyncRoute(async (req, res) => {
  const nome = texto(req.body.nome, 'Nome', 2, 100);
  const email = emailValido(req.body.email);
  const senha = texto(req.body.senha, 'Senha', 8, 128);
  const [existentes] = await pool.execute('SELECT id FROM usuarios WHERE email = ? LIMIT 1', [email]);
  if (existentes.length) return res.status(409).json({ erro: 'Este e-mail já está cadastrado.' });
  const hash = await bcrypt.hash(senha, 12);
  const [resultado] = await pool.execute(
    "INSERT INTO usuarios (nome, email, senha, tipo) VALUES (?, ?, ?, 'cliente')",
    [nome, email, hash]
  );
  res.status(201).json({ mensagem: 'Cadastro realizado com sucesso.', id: resultado.insertId });
}));

app.post('/api/login', limiteAuth, asyncRoute(async (req, res) => {
  const email = emailValido(req.body.email);
  const senha = texto(req.body.senha, 'Senha', 1, 128);
  const [usuarios] = await pool.execute(
    'SELECT id, nome, email, senha, tipo FROM usuarios WHERE email = ? LIMIT 1',
    [email]
  );
  if (!usuarios.length || !(await bcrypt.compare(senha, usuarios[0].senha))) {
    return res.status(401).json({ erro: 'E-mail ou senha inválidos.' });
  }
  const usuario = usuarios[0];
  const token = assinarToken(usuario);
  res.json({
    mensagem: 'Login realizado com sucesso.',
    token,
    usuario: { id: usuario.id, nome: usuario.nome, email: usuario.email, tipo: usuario.tipo }
  });
}));

app.post('/api/recuperar-senha', limiteAuth, asyncRoute(async (req, res) => {
  const email = emailValido(req.body.email);
  const respostaGenerica = { mensagem: 'Se o e-mail estiver cadastrado, enviaremos as instruções.' };
  const [usuarios] = await pool.execute('SELECT id, nome FROM usuarios WHERE email = ? LIMIT 1', [email]);
  if (!usuarios.length) return res.json(respostaGenerica);

  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  await pool.execute(
    'UPDATE usuarios SET reset_token = ?, reset_token_expira = DATE_ADD(NOW(), INTERVAL 1 HOUR) WHERE id = ?',
    [tokenHash, usuarios[0].id]
  );

  if (!process.env.SMTP_USER || !process.env.SMTP_PASSWORD) {
    console.warn('SMTP não configurado. Link de recuperação não enviado.');
    return res.json(respostaGenerica);
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || 'false') === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
  });
  const link = `${FRONTEND_URL}/nova-senha.html?token=${token}`;
  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: email,
    subject: 'Recuperação de senha - Auto+Assis',
    text: `Olá, ${usuarios[0].nome}. Acesse ${link} para redefinir sua senha. O link expira em 1 hora.`
  });
  res.json(respostaGenerica);
}));

app.post('/api/resetar-senha', limiteAuth, asyncRoute(async (req, res) => {
  const token = texto(req.body.token, 'Token', 32, 200);
  const novaSenha = texto(req.body.novaSenha, 'Nova senha', 8, 128);
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const [usuarios] = await pool.execute(
    'SELECT id FROM usuarios WHERE reset_token = ? AND reset_token_expira > NOW() LIMIT 1',
    [tokenHash]
  );
  if (!usuarios.length) return res.status(400).json({ erro: 'Token inválido ou expirado.' });
  const hash = await bcrypt.hash(novaSenha, 12);
  await pool.execute(
    'UPDATE usuarios SET senha = ?, reset_token = NULL, reset_token_expira = NULL WHERE id = ?',
    [hash, usuarios[0].id]
  );
  res.json({ mensagem: 'Senha atualizada com sucesso.' });
}));

app.get('/api/pecas', autenticar, asyncRoute(async (_req, res) => {
  const [rows] = await pool.query('SELECT id, nome, descricao, categoria, localizacao, quantidade, min, preco FROM pecas ORDER BY nome');
  res.json(rows);
}));

app.post('/api/pecas', autenticar, somenteGerente, asyncRoute(async (req, res) => {
  const nome = texto(req.body.nome, 'Nome', 2, 100);
  const descricao = String(req.body.descricao || '').trim().slice(0, 1000);
  const categoria = texto(req.body.categoria, 'Categoria', 2, 50);
  const localizacao = String(req.body.localizacao || '').trim().slice(0, 100);
  const quantidade = inteiro(req.body.quantidade, 'Quantidade');
  const min = inteiro(req.body.min, 'Quantidade mínima');
  const preco = decimal(req.body.preco, 'Preço');
  const [resultado] = await pool.execute(
    'INSERT INTO pecas (nome, descricao, categoria, localizacao, quantidade, min, preco) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [nome, descricao, categoria, localizacao, quantidade, min, preco]
  );
  res.status(201).json({ mensagem: 'Peça cadastrada com sucesso.', id: resultado.insertId });
}));

app.put('/api/pecas/:id', autenticar, somenteGerente, asyncRoute(async (req, res) => {
  const id = idNumerico(req.params.id);
  const nome = texto(req.body.nome, 'Nome', 2, 100);
  const descricao = String(req.body.descricao || '').trim().slice(0, 1000);
  const categoria = texto(req.body.categoria, 'Categoria', 2, 50);
  const localizacao = String(req.body.localizacao || '').trim().slice(0, 100);
  const quantidade = inteiro(req.body.quantidade, 'Quantidade');
  const min = inteiro(req.body.min, 'Quantidade mínima');
  const preco = decimal(req.body.preco, 'Preço');
  const [resultado] = await pool.execute(
    'UPDATE pecas SET nome=?, descricao=?, categoria=?, localizacao=?, quantidade=?, min=?, preco=? WHERE id=?',
    [nome, descricao, categoria, localizacao, quantidade, min, preco, id]
  );
  if (!resultado.affectedRows) return res.status(404).json({ erro: 'Peça não encontrada.' });
  res.json({ mensagem: 'Peça atualizada com sucesso.' });
}));

app.delete('/api/pecas/:id', autenticar, somenteGerente, asyncRoute(async (req, res) => {
  const id = idNumerico(req.params.id);
  const [historico] = await pool.execute('SELECT id FROM movimentacoes WHERE pecaId = ? LIMIT 1', [id]);
  if (historico.length) return res.status(409).json({ erro: 'A peça possui movimentações e não pode ser excluída.' });
  const [resultado] = await pool.execute('DELETE FROM pecas WHERE id = ?', [id]);
  if (!resultado.affectedRows) return res.status(404).json({ erro: 'Peça não encontrada.' });
  res.status(204).end();
}));

app.get('/api/movimentacoes', autenticar, somenteGerente, asyncRoute(async (_req, res) => {
  const [rows] = await pool.query(`
    SELECT m.id, m.tipo, m.pecaId, m.quantidade, m.data, m.obs,
           COALESCE(p.nome, 'Peça removida') AS nome_peca
    FROM movimentacoes m
    LEFT JOIN pecas p ON p.id = m.pecaId
    ORDER BY m.data DESC, m.id DESC
  `);
  res.json(rows);
}));

app.post('/api/movimentacoes', autenticar, somenteGerente, asyncRoute(async (req, res) => {
  const pecaId = idNumerico(req.body.pecaId);
  const qtd = inteiro(req.body.quantidade, 'Quantidade', 1);
  const tipoEntrada = String(req.body.tipo || '').toLowerCase();
  const tipo = tipoEntrada === 'entrada' ? 'Entrada' : tipoEntrada === 'saida' || tipoEntrada === 'saída' ? 'Saída' : null;
  if (!tipo) return res.status(400).json({ erro: 'Tipo deve ser Entrada ou Saída.' });
  const obs = String(req.body.obs || '').trim().slice(0, 500);
  const data = /^\d{4}-\d{2}-\d{2}$/.test(String(req.body.data || '')) ? req.body.data : new Date().toISOString().slice(0, 10);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [pecas] = await conn.execute('SELECT id, quantidade FROM pecas WHERE id = ? FOR UPDATE', [pecaId]);
    if (!pecas.length) throw Object.assign(new Error('Peça não encontrada.'), { status: 404 });
    if (tipo === 'Saída' && Number(pecas[0].quantidade) < qtd) {
      throw Object.assign(new Error('Estoque insuficiente para esta saída.'), { status: 409 });
    }
    const delta = tipo === 'Entrada' ? qtd : -qtd;
    await conn.execute('UPDATE pecas SET quantidade = quantidade + ? WHERE id = ?', [delta, pecaId]);
    const [resultado] = await conn.execute(
      'INSERT INTO movimentacoes (pecaId, tipo, quantidade, data, obs) VALUES (?, ?, ?, ?, ?)',
      [pecaId, tipo, qtd, data, obs]
    );
    await conn.commit();
    res.status(201).json({ mensagem: 'Movimentação registrada e estoque atualizado.', id: resultado.insertId });
  } catch (error) {
    await conn.rollback();
    res.status(error.status || 500).json({ erro: error.status ? error.message : 'Erro ao registrar movimentação.' });
  } finally {
    conn.release();
  }
}));

app.get('/api/solicitacoes', autenticar, asyncRoute(async (req, res) => {
  const gerente = req.usuario.tipo === 'gerente';
  const sql = gerente
    ? 'SELECT * FROM solicitacoes WHERE arquivado = 0 ORDER BY id DESC'
    : 'SELECT * FROM solicitacoes WHERE emailCliente = ? AND arquivado = 0 ORDER BY id DESC';
  const [rows] = gerente ? await pool.query(sql) : await pool.execute(sql, [req.usuario.email]);
  res.json(rows);
}));

app.post('/api/solicitacoes', autenticar, asyncRoute(async (req, res) => {
  const gerente = req.usuario.tipo === 'gerente';
  const nomeCliente = gerente ? texto(req.body.nomeCliente, 'Nome do cliente', 2, 100) : req.usuario.nome;
  const emailCliente = gerente && req.body.emailCliente ? emailValido(req.body.emailCliente) : req.usuario.email;
  const telefone = texto(req.body.telefone, 'Telefone', 8, 20);
  const veiculo = texto(req.body.veiculo, 'Veículo', 2, 100);
  const ano = String(req.body.ano || '').trim().slice(0, 10);
  const placa = texto(req.body.placa, 'Placa', 6, 20).toUpperCase();
  const problema = texto(req.body.problema, 'Problema', 5, 2000);
  const urgencias = ['Baixa', 'Média', 'Alta'];
  const urgencia = urgencias.includes(req.body.urgencia) ? req.body.urgencia : 'Média';
  const status = gerente && ['Pendente', 'Em Análise', 'Aguardando Aprovação', 'Aprovado', 'Em Andamento', 'Concluído', 'Rejeitado'].includes(req.body.status)
    ? req.body.status : 'Pendente';
  const [resultado] = await pool.execute(
    `INSERT INTO solicitacoes
     (nomeCliente, emailCliente, telefone, veiculo, ano, placa, problema, urgencia, status, dataCriacao)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
    [nomeCliente, emailCliente, telefone, veiculo, ano, placa, problema, urgencia, status]
  );
  res.status(201).json({ mensagem: 'Solicitação criada com sucesso.', id: resultado.insertId });
}));

app.put('/api/solicitacoes/:id', autenticar, asyncRoute(async (req, res) => {
  const id = idNumerico(req.params.id);
  const permitidos = ['Pendente', 'Em Análise', 'Aguardando Aprovação', 'Aprovado', 'Em Andamento', 'Concluído', 'Rejeitado'];
  const status = req.body.status;
  if (!permitidos.includes(status)) return res.status(400).json({ erro: 'Status inválido.' });

  if (req.usuario.tipo === 'cliente') {
    if (!['Aprovado', 'Rejeitado'].includes(status)) return res.status(403).json({ erro: 'Cliente somente pode aprovar ou rejeitar orçamento.' });
    const [resultado] = await pool.execute(
      "UPDATE solicitacoes SET status = ? WHERE id = ? AND emailCliente = ? AND status = 'Aguardando Aprovação'",
      [status, id, req.usuario.email]
    );
    if (!resultado.affectedRows) return res.status(404).json({ erro: 'Solicitação não encontrada ou transição não permitida.' });
    return res.json({ mensagem: 'Decisão registrada.' });
  }

  const custo = req.body.custoSugerido === undefined || req.body.custoSugerido === null || req.body.custoSugerido === ''
    ? null : decimal(req.body.custoSugerido, 'Custo sugerido');
  const osNumero = req.body.osNumero ? texto(req.body.osNumero, 'Número da OS', 3, 50) : null;
  const [resultado] = await pool.execute(
    'UPDATE solicitacoes SET status=?, custoSugerido=COALESCE(?, custoSugerido), osNumero=COALESCE(?, osNumero) WHERE id=?',
    [status, custo, osNumero, id]
  );
  if (!resultado.affectedRows) return res.status(404).json({ erro: 'Solicitação não encontrada.' });
  res.json({ mensagem: 'Solicitação atualizada.' });
}));

app.patch('/api/solicitacoes/:id/arquivar', autenticar, asyncRoute(async (req, res) => {
  const id = idNumerico(req.params.id);
  const gerente = req.usuario.tipo === 'gerente';
  const sql = gerente
    ? "UPDATE solicitacoes SET arquivado=1, arquivado_em=NOW() WHERE id=? AND status IN ('Concluído','Rejeitado')"
    : "UPDATE solicitacoes SET arquivado=1, arquivado_em=NOW() WHERE id=? AND emailCliente=? AND status IN ('Concluído','Rejeitado')";
  const [resultado] = gerente
    ? await pool.execute(sql, [id])
    : await pool.execute(sql, [id, req.usuario.email]);
  if (!resultado.affectedRows) return res.status(404).json({ erro: 'Solicitação não encontrada ou ainda não finalizada.' });
  res.json({ mensagem: 'Solicitação arquivada.' });
}));

app.delete('/api/solicitacoes/:id', autenticar, somenteGerente, asyncRoute(async (req, res) => {
  const id = idNumerico(req.params.id);
  const [resultado] = await pool.execute('DELETE FROM solicitacoes WHERE id = ?', [id]);
  if (!resultado.affectedRows) return res.status(404).json({ erro: 'Solicitação não encontrada.' });
  res.status(204).end();
}));


app.use((req, res) => res.status(404).json({ erro: 'Rota não encontrada.' }));
app.use((error, req, res, _next) => {
  console.error(`[${new Date().toISOString()}] ${req.method} ${req.path}:`, error.message);
  if (error.message === 'Origem não autorizada pelo CORS.') return res.status(403).json({ erro: error.message });
  if (/deve ter|inválid|obrigatóri/i.test(error.message)) return res.status(400).json({ erro: error.message });
  res.status(500).json({ erro: 'Erro interno do servidor.' });
});

async function iniciar() {
  await pool.query('SELECT 1');
  return app.listen(PORT, () => console.log(`Auto+Assis disponível em ${FRONTEND_URL}`));
}

if (require.main === module) {
  iniciar().catch((error) => {
    console.error('Falha ao iniciar:', error.message);
    process.exit(1);
  });
}

module.exports = {
  app,
  pool,
  iniciar,
  validacao: { texto, emailValido, inteiro, decimal, idNumerico }
};