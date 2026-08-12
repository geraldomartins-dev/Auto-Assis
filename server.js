'use strict';

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const path = require('path');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const NODE_ENV = String(process.env.NODE_ENV || 'development').toLowerCase();
const CONFIGURED_AUTH_SECRET = String(process.env.AUTH_SECRET || '').trim();
const AUTH_SECRET = CONFIGURED_AUTH_SECRET || crypto.randomBytes(48).toString('hex');
const AUTH_EXPIRES_SECONDS = Number(process.env.AUTH_EXPIRES_SECONDS || 28800);
const CORS_ORIGIN = process.env.CORS_ORIGIN || `http://localhost:${PORT}`;
const FRONTEND_URL = process.env.FRONTEND_URL || `http://localhost:${PORT}`;
const SMTP_REPLY_TO_INPUT = String(process.env.SMTP_REPLY_TO || '').trim();
let SMTP_REPLY_TO = '';
if (SMTP_REPLY_TO_INPUT) {
  try {
    SMTP_REPLY_TO = emailValido(SMTP_REPLY_TO_INPUT);
  } catch {
    throw new Error('SMTP_REPLY_TO deve conter um endereço de e-mail válido.');
  }
}
const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = Number(process.env.DB_PORT || 3306);
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const DB_NAME = process.env.DB_NAME || 'autoassis_novo';
const DB_CONNECTION_LIMIT = Number(process.env.DB_CONNECTION_LIMIT || 10);
const DB_QUEUE_LIMIT = Number(process.env.DB_QUEUE_LIMIT || 50);
const TRUST_PROXY_HOPS = Number(process.env.TRUST_PROXY_HOPS || 0);
const DUMMY_PASSWORD_HASH = '$2b$12$yYpr3fMIH3Zu.T9uAEYenOliMZcpLv2kSFDzJ0xWrwjXhZI04xEiK';
const PUBLIC_FILES = new Set([
  'auth.js',
  'auditoria.html',
  'cadastro.html',
  'cliente.html',
  'consultas.html',
  'criarpeca.html',
  'dashboard.html',
  'estoque.html',
  'favicon.svg',
  'gerenciar_solicitacao.html',
  'gerentes.html',
  'login.html',
  'manifest.webmanifest',
  'movimentacao.html',
  'novamovimentacao.html',
  'novaos.html',
  'nova-senha.html',
  'novasoli.html',
  'product.css',
  'recuperar.html',
  'relatorio.html',
  'scripts.js',
  'servicos.html',
  'ui.js'
]);

if (!CONFIGURED_AUTH_SECRET) {
  process.env.AUTH_SECRET = AUTH_SECRET;
  console.warn('AUTH_SECRET não definido: usando uma chave temporária; as sessões expirarão ao reiniciar.');
}
const authSecretInseguro = !CONFIGURED_AUTH_SECRET
  || CONFIGURED_AUTH_SECRET.length < 32
  || /desenvolvimento|troque|altere|change|exemplo|example/i.test(CONFIGURED_AUTH_SECRET);
if (NODE_ENV === 'production' && authSecretInseguro) {
  throw new Error('Defina AUTH_SECRET com pelo menos 32 caracteres aleatórios antes de iniciar em produção.');
}
if (!Number.isInteger(AUTH_EXPIRES_SECONDS) || AUTH_EXPIRES_SECONDS < 300 || AUTH_EXPIRES_SECONDS > 604800) {
  throw new Error('AUTH_EXPIRES_SECONDS deve estar entre 300 e 604800 segundos.');
}
if (!Number.isInteger(TRUST_PROXY_HOPS) || TRUST_PROXY_HOPS < 0 || TRUST_PROXY_HOPS > 2) {
  throw new Error('TRUST_PROXY_HOPS deve ser 0, 1 ou 2.');
}
if (!Number.isInteger(DB_CONNECTION_LIMIT) || DB_CONNECTION_LIMIT < 1 || DB_CONNECTION_LIMIT > 50) {
  throw new Error('DB_CONNECTION_LIMIT deve estar entre 1 e 50.');
}
if (!Number.isInteger(DB_QUEUE_LIMIT) || DB_QUEUE_LIMIT < 1 || DB_QUEUE_LIMIT > 1000) {
  throw new Error('DB_QUEUE_LIMIT deve estar entre 1 e 1000.');
}
if (NODE_ENV === 'production') {
  const urlsSeguras = [FRONTEND_URL, CORS_ORIGIN].every((value) => {
    try { return new URL(value).protocol === 'https:'; } catch { return false; }
  });
  if (!urlsSeguras) throw new Error('FRONTEND_URL e CORS_ORIGIN devem usar HTTPS em produção.');
  if (DB_USER.toLowerCase() === 'root' || DB_PASSWORD.length < 12) {
    throw new Error('Use um usuário MySQL dedicado e DB_PASSWORD forte em produção.');
  }
  if (!process.env.SMTP_USER || !process.env.SMTP_PASSWORD || !process.env.SMTP_FROM) {
    throw new Error('Configure SMTP_USER, SMTP_PASSWORD e SMTP_FROM em produção.');
  }
}

const pool = mysql.createPool({
  host: DB_HOST,
  port: DB_PORT,
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
  waitForConnections: true,
  connectionLimit: DB_CONNECTION_LIMIT,
  queueLimit: DB_QUEUE_LIMIT,
  connectTimeout: 10_000,
  enableKeepAlive: true,
  charset: 'utf8mb4'
});

function snapshotAuditoria(valor, profundidade = 0) {
  if (valor === null || valor === undefined) return null;
  if (profundidade > 4) return '[limite]';
  if (Array.isArray(valor)) return valor.slice(0, 50).map((item) => snapshotAuditoria(item, profundidade + 1));
  if (typeof valor !== 'object') return typeof valor === 'string' ? valor.slice(0, 2000) : valor;
  const seguro = {};
  for (const [chave, item] of Object.entries(valor)) {
    if (/senha|password|token|secret|hash/i.test(chave)) {
      seguro[chave] = '[protegido]';
    } else {
      seguro[chave] = snapshotAuditoria(item, profundidade + 1);
    }
  }
  return seguro;
}

async function registrarAuditoria(executor, req, evento) {
  const usuario = req.usuario || {};
  const antes = evento.antes == null ? null : JSON.stringify(snapshotAuditoria(evento.antes));
  const depois = evento.depois == null ? null : JSON.stringify(snapshotAuditoria(evento.depois));
  await executor.execute(
    `INSERT INTO auditoria
      (usuarioId, usuarioNome, usuarioEmail, usuarioTipo, acao, entidade, entidadeId,
       resumo, dadosAntes, dadosDepois, ip, requisicaoId)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      usuario.id || null,
      String(usuario.nome || 'Sistema').slice(0, 100),
      usuario.email ? String(usuario.email).slice(0, 150) : null,
      ['cliente', 'gerente', 'mecanico'].includes(usuario.tipo) ? usuario.tipo : 'sistema',
      evento.acao,
      evento.entidade,
      evento.entidadeId == null ? null : String(evento.entidadeId).slice(0, 64),
      String(evento.resumo || '').slice(0, 255),
      antes,
      depois,
      String(req.ip || req.socket?.remoteAddress || '').slice(0, 45) || null,
      String(req.id || '').slice(0, 64) || null
    ]
  );
}

app.disable('x-powered-by');
if (TRUST_PROXY_HOPS > 0) app.set('trust proxy', TRUST_PROXY_HOPS);
app.use((req, res, next) => {
  req.id = crypto.randomUUID();
  res.setHeader('X-Request-ID', req.id);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
  if (req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');
  if (NODE_ENV === 'production') res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
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

app.get('/', (_req, res) => {
  res.redirect('/login.html');
});

app.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  const requestedFile = req.path.replace(/^\/+/, '');
  if (!PUBLIC_FILES.has(requestedFile)) return next();

  const isHtml = requestedFile.endsWith('.html');
  res.setHeader('Cache-Control', isHtml || process.env.NODE_ENV !== 'production'
    ? 'no-cache'
    : 'public, max-age=3600');
  return res.sendFile(path.join(__dirname, requestedFile));
});

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}
function assinarToken(usuario) {
  const payload = {
    aud: 'autoassis',
    sub: usuario.id,
    nome: usuario.nome,
    email: usuario.email,
    tipo: usuario.tipo,
    ver: Number(usuario.auth_version),
    exp: Math.floor(Date.now() / 1000) + AUTH_EXPIRES_SECONDS
  };
  const encoded = base64url(JSON.stringify(payload));
  const signature = crypto.createHmac('sha256', AUTH_SECRET).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}
function verificarToken(token) {
  const partes = String(token || '').split('.');
  if (partes.length !== 2) throw new Error('Token inválido.');
  const [encoded, signature] = partes;
  if (!encoded || !signature) throw new Error('Token inválido.');
  const expected = crypto.createHmac('sha256', AUTH_SECRET).update(encoded).digest('base64url');
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new Error('Assinatura inválida.');
  const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  const versaoValida = Number.isSafeInteger(Number(payload.ver)) && Number(payload.ver) >= 1;
  if (payload.aud !== 'autoassis' || !Number.isSafeInteger(Number(payload.sub)) || !versaoValida
    || !['cliente', 'gerente', 'mecanico'].includes(payload.tipo)) {
    throw new Error('Token inválido.');
  }
  if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) throw new Error('Token expirado.');
  return payload;
}
async function autenticar(req, res, next) {
  try {
    const auth = req.headers.authorization || '';
    if (!auth.startsWith('Bearer ')) return res.status(401).json({ erro: 'Autenticação necessária.' });
    const sessao = verificarToken(auth.slice(7));
    const [usuarios] = await pool.execute(
      'SELECT id, nome, email, tipo, auth_version FROM usuarios WHERE id = ? LIMIT 1',
      [Number(sessao.sub)]
    );
    const usuario = usuarios[0];
    if (!usuario || usuario.tipo !== sessao.tipo || Number(usuario.auth_version) !== Number(sessao.ver)) {
      return res.status(401).json({ erro: 'Sessão inválida ou expirada.' });
    }
    req.usuario = usuario;
    next();
  } catch (error) {
    if (error && (error.code || error.errno)) return next(error);
    return res.status(401).json({ erro: 'Sessão inválida ou expirada.' });
  }
}
function somenteGerente(req, res, next) {
  if (req.usuario.tipo !== 'gerente') return res.status(403).json({ erro: 'Acesso permitido somente para gerente.' });
  next();
}
function somenteEquipe(req, res, next) {
  if (!['gerente', 'mecanico'].includes(req.usuario.tipo)) {
    return res.status(403).json({ erro: 'Acesso permitido somente para a equipe da oficina.' });
  }
  next();
}

const tentativas = new Map();
const limparTentativas = setInterval(() => {
  const agora = Date.now();
  for (const [chave, tentativa] of tentativas) {
    if (tentativa.reset <= agora) tentativas.delete(chave);
  }
}, 60_000);
limparTentativas.unref();
function limitar({ janelaMs, limite, criarChave, limparAoSucesso = false }) {
  return (req, res, next) => {
    const chave = criarChave ? criarChave(req) : `${req.ip}:${req.path}`;
    const agora = Date.now();
    const atual = tentativas.get(chave);
    if (!atual || atual.reset <= agora) {
      tentativas.set(chave, { count: 1, reset: agora + janelaMs });
      if (limparAoSucesso) {
        res.once('finish', () => {
          if (res.statusCode >= 200 && res.statusCode < 400) tentativas.delete(chave);
        });
      }
      return next();
    }
    atual.count += 1;
    if (atual.count > limite) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil((atual.reset - agora) / 1000))));
      return res.status(429).json({ erro: 'Muitas tentativas. Aguarde alguns minutos.' });
    }
    if (limparAoSucesso) {
      res.once('finish', () => {
        if (res.statusCode >= 200 && res.statusCode < 400) tentativas.delete(chave);
      });
    }
    next();
  };
}
const limiteAuth = limitar({ janelaMs: 15 * 60 * 1000, limite: 8 });
const limiteLogin = limitar({
  janelaMs: 15 * 60 * 1000,
  limite: 8,
  limparAoSucesso: true,
  criarChave(req) {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const emailHash = crypto.createHash('sha256').update(email, 'utf8').digest('hex').slice(0, 24);
    return `${req.ip}:${req.path}:${emailHash}`;
  }
});

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
function escaparHtmlEmail(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
function primeiroNomeEmail(value) {
  const nome = String(value ?? '').normalize('NFC').trim().replace(/\s+/gu, ' ');
  if (!nome || nome.includes('@')) return '';
  const [primeiroNome = ''] = nome.split(' ');
  if (!/^[\p{L}\p{M}][\p{L}\p{M}'’.-]{0,59}$/u.test(primeiroNome)) return '';
  return primeiroNome;
}
function urlRecuperacaoSegura(value) {
  let url;
  try {
    url = new URL(String(value || ''));
  } catch {
    throw new Error('URL de recuperação inválida.');
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('URL de recuperação inválida.');
  }
  return url.toString();
}
function criarEmailRecuperacao({ nome, link }) {
  const url = urlRecuperacaoSegura(link);
  const primeiroNome = primeiroNomeEmail(nome);
  const saudacao = primeiroNome ? `Olá, ${primeiroNome}!` : 'Olá!';
  const saudacaoHtml = escaparHtmlEmail(saudacao);
  const urlHtml = escaparHtmlEmail(url);
  const subject = 'Redefina sua senha com segurança | Auto+Assis';
  const text = `${saudacao}

Recebemos uma solicitação para redefinir a senha da sua conta Auto+Assis.

Redefina sua senha pelo endereço abaixo:
${url}

Este link é de uso único e expira em 1 hora. Depois desse prazo, solicite uma nova recuperação na tela de acesso.

Se você não solicitou esta alteração, ignore este e-mail. Sua senha atual continuará válida.

Por segurança, não encaminhe este link para outras pessoas.

Equipe Auto+Assis
Gestão profissional de oficina`;
  const html = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
  <title>${escaparHtmlEmail(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:#ecebe6;color:#1b1e20;font-family:Arial,Helvetica,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">Seu link seguro para redefinir a senha do Auto+Assis expira em 1 hora.</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;background-color:#ecebe6;">
    <tr>
      <td align="center" style="padding:28px 12px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;border-collapse:collapse;background-color:#ffffff;border:1px solid #d2d0c8;">
          <tr>
            <td style="padding:24px 30px;background-color:#1b1e20;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;">
                <tr>
                  <td width="52" valign="middle" style="width:52px;">
                    <div style="width:44px;height:44px;line-height:44px;text-align:center;background-color:#f36a2d;color:#17191a;font-size:17px;font-weight:800;">A+</div>
                  </td>
                  <td valign="middle" style="padding-left:10px;color:#ffffff;">
                    <div style="font-size:20px;line-height:24px;font-weight:800;letter-spacing:-0.3px;">Auto+Assis</div>
                    <div style="padding-top:3px;color:#bfc3c5;font-size:11px;line-height:16px;text-transform:uppercase;letter-spacing:1px;">Gestão profissional de oficina</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:34px 30px 18px;">
              <p style="margin:0 0 18px;color:#1b1e20;font-size:16px;line-height:24px;font-weight:700;">${saudacaoHtml}</p>
              <h1 style="margin:0 0 14px;color:#1b1e20;font-size:25px;line-height:32px;font-weight:800;">Redefinição de senha</h1>
              <p style="margin:0 0 24px;color:#505659;font-size:15px;line-height:24px;">Recebemos uma solicitação para redefinir a senha da sua conta Auto+Assis.</p>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
                <tr>
                  <td align="center" bgcolor="#f36a2d" style="background-color:#f36a2d;">
                    <a href="${urlHtml}" style="display:inline-block;padding:14px 24px;color:#17191a;font-size:15px;line-height:20px;font-weight:800;text-decoration:none;">Redefinir minha senha</a>
                  </td>
                </tr>
              </table>
              <p style="margin:24px 0 7px;color:#686d70;font-size:12px;line-height:19px;">Se o botão não funcionar, copie e cole este endereço no navegador:</p>
              <p style="margin:0;word-break:break-all;color:#3f4649;font-size:12px;line-height:19px;"><a href="${urlHtml}" style="color:#b84618;text-decoration:underline;">${urlHtml}</a></p>
            </td>
          </tr>
          <tr>
            <td style="padding:12px 30px 22px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;background-color:#f5f3ed;border-left:4px solid #f36a2d;">
                <tr>
                  <td style="padding:16px 18px;">
                    <p style="margin:0 0 7px;color:#24282a;font-size:13px;line-height:20px;font-weight:700;">Este link expira em 1 hora.</p>
                    <p style="margin:0;color:#5c6265;font-size:12px;line-height:19px;">Ele é de uso único. Depois desse prazo, solicite uma nova recuperação na tela de acesso.</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:0 30px 32px;">
              <p style="margin:0 0 8px;color:#353a3d;font-size:13px;line-height:21px;font-weight:700;">Não reconhece esta solicitação?</p>
              <p style="margin:0;color:#666c6f;font-size:12px;line-height:20px;">Ignore este e-mail. Sua senha atual continuará válida. Por segurança, não encaminhe este link para outras pessoas.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 30px;background-color:#f7f6f2;border-top:1px solid #dedcd5;color:#73787a;font-size:11px;line-height:18px;">
              Mensagem automática do Auto+Assis. Não envie senhas ou códigos de acesso por e-mail.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, text, html };
}
function senhaGerenteValida(value) {
  const senha = typeof value === 'string' ? value : '';
  if (senha.length < 10 || senha.length > 128) {
    throw new Error('A senha deve ter entre 10 e 128 caracteres.');
  }
  if (/\s/u.test(senha)) {
    throw new Error('Senha inválida: não use espaços ou outros caracteres em branco.');
  }
  if (!/[a-z]/.test(senha) || !/[A-Z]/.test(senha) || !/\d/.test(senha) || !/[^A-Za-z0-9]/.test(senha)) {
    throw new Error('Senha inválida: use letra maiúscula, letra minúscula, número e caractere especial.');
  }
  return senha;
}
function nomePessoaValido(value) {
  const nome = texto(value, 'Nome', 2, 100).replace(/\s+/g, ' ');
  if (!/^[\p{L}\p{M}][\p{L}\p{M}'’. -]*$/u.test(nome)) {
    throw new Error('Nome inválido. Use apenas letras, espaços, apóstrofo, ponto ou hífen.');
  }
  return nome;
}
function tipoEquipeValido(value) {
  const tipo = String(value || '').trim().toLowerCase();
  if (!['gerente', 'mecanico'].includes(tipo)) {
    throw new Error('Perfil inválido. Use gerente ou mecanico.');
  }
  return tipo;
}
function erroHttp(status, message) {
  return Object.assign(new Error(message), { status });
}
function dataIsoValida(value, campo = 'Data') {
  const data = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) throw new Error(`${campo} inválida.`);
  const normalizada = new Date(`${data}T00:00:00.000Z`);
  if (Number.isNaN(normalizada.getTime()) || normalizada.toISOString().slice(0, 10) !== data) {
    throw new Error(`${campo} inválida.`);
  }
  return data;
}
function gerarNumeroOs(id, ano = new Date().getUTCFullYear()) {
  const numero = idNumerico(id);
  const anoNumerico = Number(ano);
  const anoSeguro = Number.isInteger(anoNumerico) && anoNumerico >= 2000 && anoNumerico <= 9999
    ? anoNumerico
    : new Date().getUTCFullYear();
  return `OS-${anoSeguro}-${String(numero).padStart(6, '0')}`;
}
function hashOrcamento({ id, osNumero, custoSugerido, versao }) {
  const registroCanonico = JSON.stringify({
    id: idNumerico(id),
    osNumero: texto(osNumero, 'Número da OS', 3, 50),
    custoSugerido: decimal(custoSugerido, 'Custo sugerido').toFixed(2),
    versao: inteiro(versao, 'Versão do orçamento', 1)
  });
  return crypto.createHash('sha256').update(registroCanonico, 'utf8').digest('hex');
}
const TRANSICOES_SERVICO = Object.freeze({
  Pendente: Object.freeze(['Em Análise', 'Rejeitado']),
  'Em Análise': Object.freeze(['Aguardando Aprovação', 'Rejeitado']),
  'Aguardando Aprovação': Object.freeze(['Aprovado', 'Rejeitado']),
  Aprovado: Object.freeze(['Em Andamento']),
  'Em Andamento': Object.freeze(['Concluído']),
  Concluído: Object.freeze([]),
  Rejeitado: Object.freeze([])
});
function transicaoServicoPermitida(statusAtual, novoStatus) {
  return Boolean(TRANSICOES_SERVICO[statusAtual]?.includes(novoStatus));
}
function configuracaoOficinaValida(dados) {
  const nome = texto(dados.nome, 'Nome da oficina', 2, 150).replace(/\s+/g, ' ');
  const documento = texto(dados.documento, 'Documento', 5, 30);
  if (!/^[\p{L}\p{N}./ -]+$/u.test(documento)) {
    throw new Error('Documento inválido.');
  }
  const telefone = texto(dados.telefone, 'Telefone', 8, 30);
  const digitosTelefone = telefone.replace(/\D/g, '');
  if (!/^\+?[\d\s().-]+$/.test(telefone) || digitosTelefone.length < 8 || digitosTelefone.length > 15) {
    throw new Error('Telefone inválido.');
  }
  const email = emailValido(dados.email);
  const endereco = texto(dados.endereco, 'Endereço', 5, 250).replace(/\s+/g, ' ');
  if (/[\u0000-\u001f\u007f<>{}]/u.test(nome + endereco)) {
    throw new Error('Nome ou endereço inválido.');
  }
  return { nome, documento, telefone, email, endereco };
}
function configuracaoOficinaPublica(dados) {
  const nome = String(dados.nome || '').trim();
  const documento = String(dados.documento || '').trim();
  const telefone = String(dados.telefone || '').trim();
  const email = String(dados.email || '').trim();
  const endereco = String(dados.endereco || '').trim();
  const cnpj = documento.replace(/\D/g, '').length === 14 ? documento : '';
  return {
    nome,
    documento,
    cnpj,
    telefone,
    email,
    endereco,
    completa: [nome, documento, telefone, email, endereco].every(Boolean),
    OFICINA_NOME: nome,
    OFICINA_DOCUMENTO: documento,
    OFICINA_TELEFONE: telefone,
    OFICINA_EMAIL: email,
    OFICINA_ENDERECO: endereco
  };
}
function configuracaoOficinaAmbiente() {
  const valor = (nome, padrao = '') => String(process.env[nome] || padrao).trim().slice(0, 250);
  return {
    nome: valor('OFICINA_NOME', 'Auto+Assis'),
    documento: valor('OFICINA_DOCUMENTO'),
    telefone: valor('OFICINA_TELEFONE'),
    email: valor('OFICINA_EMAIL'),
    endereco: valor('OFICINA_ENDERECO')
  };
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
  const valor = String(value ?? '').trim();
  if (!/^[1-9]\d*$/.test(valor)) throw new Error('ID inválido.');
  const n = Number(valor);
  if (!Number.isSafeInteger(n)) throw new Error('ID inválido.');
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
  const senha = senhaGerenteValida(req.body.senha);
  const [existentes] = await pool.execute('SELECT id FROM usuarios WHERE email = ? LIMIT 1', [email]);
  if (existentes.length) return res.status(409).json({ erro: 'Este e-mail já está cadastrado.' });
  const hash = await bcrypt.hash(senha, 12);
  const [resultado] = await pool.execute(
    "INSERT INTO usuarios (nome, email, senha, tipo) VALUES (?, ?, ?, 'cliente')",
    [nome, email, hash]
  );
  res.status(201).json({ mensagem: 'Cadastro realizado com sucesso.', id: resultado.insertId });
}));

app.post('/api/login', limiteLogin, asyncRoute(async (req, res) => {
  const email = emailValido(req.body.email);
  const senha = typeof req.body.senha === 'string' ? req.body.senha : '';
  const formatoSenhaValido = senha.length >= 1 && senha.length <= 128;
  const [usuarios] = await pool.execute(
    'SELECT id, nome, email, senha, tipo, auth_version FROM usuarios WHERE email = ? LIMIT 1',
    [email]
  );
  const senhaCorreta = await bcrypt.compare(senha, usuarios[0]?.senha || DUMMY_PASSWORD_HASH);
  if (!formatoSenhaValido || !usuarios.length || !senhaCorreta) {
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

async function criarMembroEquipe(req, res, tipoForcado = null) {
  const dados = req.body || {};
  const nome = nomePessoaValido(dados.nome);
  const email = emailValido(dados.email);
  const senha = senhaGerenteValida(dados.senha);
  const tipo = tipoForcado || tipoEquipeValido(dados.tipo);

  const [existentes] = await pool.execute('SELECT id FROM usuarios WHERE email = ? LIMIT 1', [email]);
  if (existentes.length) return res.status(409).json({ erro: 'Este e-mail já está cadastrado.' });

  const hash = await bcrypt.hash(senha, 12);
  try {
    const [resultado] = await pool.execute(
      'INSERT INTO usuarios (nome, email, senha, tipo) VALUES (?, ?, ?, ?)',
      [nome, email, hash, tipo]
    );
    const membro = { id: resultado.insertId, nome, email, tipo };
    await registrarAuditoria(pool, req, { acao: 'CRIAR', entidade: 'equipe', entidadeId: membro.id, resumo: `${tipo === 'gerente' ? 'Gerente' : 'Mecânico'} adicionado: ${nome}`, depois: membro });
    if (tipoForcado === 'gerente') {
      return res.status(201).json({ mensagem: 'Gerente cadastrado com sucesso.', gerente: membro });
    }
    return res.status(201).json({ mensagem: 'Membro da equipe cadastrado com sucesso.', membro });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ erro: 'Este e-mail já está cadastrado.' });
    }
    throw error;
  }
}

async function editarMembroEquipe(req, res) {
  const id = idNumerico(req.params.id);
  const dados = req.body || {};
  const nome = nomePessoaValido(dados.nome);
  const email = emailValido(dados.email);
  const tipo = tipoEquipeValido(dados.tipo);
  const senhaInformada = dados.senha !== undefined && dados.senha !== null && String(dados.senha) !== '';
  const hash = senhaInformada ? await bcrypt.hash(senhaGerenteValida(dados.senha), 12) : null;

  if (id === Number(req.usuario.id) && tipo !== 'gerente') {
    return res.status(409).json({ erro: 'Você não pode rebaixar o próprio perfil.' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [gerentes] = await conn.execute(
      "SELECT id FROM usuarios WHERE tipo = 'gerente' ORDER BY id FOR UPDATE"
    );
    const [membros] = await conn.execute(
      "SELECT id, nome, email, tipo, auth_version FROM usuarios WHERE id = ? AND tipo IN ('gerente', 'mecanico') LIMIT 1 FOR UPDATE",
      [id]
    );
    const atual = membros[0];
    if (!atual) throw erroHttp(404, 'Membro da equipe não encontrado.');
    if (atual.tipo === 'gerente' && tipo !== 'gerente' && gerentes.length <= 1) {
      throw erroHttp(409, 'A oficina precisa manter pelo menos um gerente ativo.');
    }

    if (hash) {
      await conn.execute(
        'UPDATE usuarios SET nome = ?, email = ?, tipo = ?, senha = ?, auth_version = auth_version + 1 WHERE id = ?',
        [nome, email, tipo, hash, id]
      );
    } else {
      await conn.execute(
        'UPDATE usuarios SET nome = ?, email = ?, tipo = ?, auth_version = auth_version + 1 WHERE id = ?',
        [nome, email, tipo, id]
      );
    }
    await registrarAuditoria(conn, req, {
      acao: 'EDITAR', entidade: 'equipe', entidadeId: id, resumo: `Acesso atualizado: ${nome}`,
      antes: { id: atual.id, nome: atual.nome, email: atual.email, tipo: atual.tipo },
      depois: { id, nome, email, tipo, senhaAlterada: Boolean(hash) }
    });
    await conn.commit();
    const membro = { id, nome, email, tipo };
    const resposta = {
      mensagem: 'Membro da equipe atualizado com sucesso.',
      membro
    };
    if (id === Number(req.usuario.id)) {
      resposta.token = assinarToken({
        ...membro,
        auth_version: Number(atual.auth_version) + 1
      });
    }
    return res.json(resposta);
  } catch (error) {
    await conn.rollback();
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ erro: 'Este e-mail já está cadastrado.' });
    }
    if (error.status) return res.status(error.status).json({ erro: error.message });
    throw error;
  } finally {
    conn.release();
  }
}

async function excluirMembroEquipe(req, res) {
  const id = idNumerico(req.params.id);
  if (id === Number(req.usuario.id)) {
    return res.status(409).json({ erro: 'Você não pode excluir o próprio perfil.' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [gerentes] = await conn.execute(
      "SELECT id FROM usuarios WHERE tipo = 'gerente' ORDER BY id FOR UPDATE"
    );
    const [membros] = await conn.execute(
      "SELECT id, nome, email, tipo FROM usuarios WHERE id = ? AND tipo IN ('gerente', 'mecanico') LIMIT 1 FOR UPDATE",
      [id]
    );
    const atual = membros[0];
    if (!atual) throw erroHttp(404, 'Membro da equipe não encontrado.');
    if (atual.tipo === 'gerente' && gerentes.length <= 1) {
      throw erroHttp(409, 'A oficina precisa manter pelo menos um gerente ativo.');
    }
    await conn.execute('DELETE FROM usuarios WHERE id = ?', [id]);
    await registrarAuditoria(conn, req, { acao: 'EXCLUIR', entidade: 'equipe', entidadeId: id, resumo: `Acesso excluído: ${atual.nome}`, antes: atual });
    await conn.commit();
    return res.json({ mensagem: 'Membro da equipe excluído com sucesso.' });
  } catch (error) {
    await conn.rollback();
    if (error.status) return res.status(error.status).json({ erro: error.message });
    throw error;
  } finally {
    conn.release();
  }
}

app.get('/api/equipe', autenticar, somenteGerente, asyncRoute(async (_req, res) => {
  const [membros] = await pool.execute(
    "SELECT id, nome, email, tipo FROM usuarios WHERE tipo IN ('gerente', 'mecanico') ORDER BY nome ASC, id ASC"
  );
  res.json(membros);
}));

app.post('/api/equipe', autenticar, somenteGerente, asyncRoute((req, res) => criarMembroEquipe(req, res)));
app.put('/api/equipe/:id', autenticar, somenteGerente, asyncRoute(editarMembroEquipe));
app.delete('/api/equipe/:id', autenticar, somenteGerente, asyncRoute(excluirMembroEquipe));

app.get('/api/gerentes', autenticar, somenteGerente, asyncRoute(async (_req, res) => {
  const [gerentes] = await pool.execute(
    "SELECT id, nome, email, tipo FROM usuarios WHERE tipo = 'gerente' ORDER BY nome ASC, id ASC"
  );
  res.json(gerentes);
}));

app.post('/api/gerentes', autenticar, somenteGerente, asyncRoute((req, res) => criarMembroEquipe(req, res, 'gerente')));

app.get('/api/configuracao-oficina', autenticar, somenteEquipe, asyncRoute(async (_req, res) => {
  const [configuracoes] = await pool.execute(
    'SELECT nome, documento, telefone, email, endereco FROM configuracao_oficina WHERE id = 1 LIMIT 1'
  );
  const configuracao = configuracoes[0] || configuracaoOficinaAmbiente();
  res.json(configuracaoOficinaPublica(configuracao));
}));

app.put('/api/configuracao-oficina', autenticar, somenteGerente, asyncRoute(async (req, res) => {
  const configuracao = configuracaoOficinaValida(req.body || {});
  const [anteriores] = await pool.execute('SELECT nome, documento, telefone, email, endereco FROM configuracao_oficina WHERE id = 1 LIMIT 1');
  await pool.execute(
    `INSERT INTO configuracao_oficina
     (id, nome, documento, telefone, email, endereco, atualizadoEm, atualizadoPor)
     VALUES (1, ?, ?, ?, ?, ?, NOW(), ?)
     ON DUPLICATE KEY UPDATE
       nome = VALUES(nome), documento = VALUES(documento), telefone = VALUES(telefone),
       email = VALUES(email), endereco = VALUES(endereco), atualizadoEm = NOW(),
       atualizadoPor = VALUES(atualizadoPor)`,
    [
      configuracao.nome,
      configuracao.documento,
      configuracao.telefone,
      configuracao.email,
      configuracao.endereco,
      req.usuario.id
    ]
  );
  await registrarAuditoria(pool, req, { acao: 'CONFIGURAR', entidade: 'oficina', entidadeId: 1, resumo: 'Dados da oficina atualizados', antes: anteriores[0] || null, depois: configuracao });
  res.json({
    mensagem: 'Configuração da oficina atualizada com sucesso.',
    configuracao: configuracaoOficinaPublica(configuracao)
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
  const link = new URL('/nova-senha.html', FRONTEND_URL);
  link.searchParams.set('token', token);
  const mensagem = criarEmailRecuperacao({ nome: usuarios[0].nome, link: link.toString() });
  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: email,
    ...(SMTP_REPLY_TO ? { replyTo: SMTP_REPLY_TO } : {}),
    subject: mensagem.subject,
    text: mensagem.text,
    html: mensagem.html
  });
  res.json(respostaGenerica);
}));

app.post('/api/resetar-senha', limiteAuth, asyncRoute(async (req, res) => {
  const token = texto(req.body.token, 'Token', 32, 200);
  const novaSenha = senhaGerenteValida(req.body.novaSenha);
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const hash = await bcrypt.hash(novaSenha, 12);
  const [resultado] = await pool.execute(
    'UPDATE usuarios SET senha = ?, reset_token = NULL, reset_token_expira = NULL, auth_version = auth_version + 1 WHERE reset_token = ? AND reset_token_expira > NOW()',
    [hash, tokenHash]
  );
  if (!resultado.affectedRows) return res.status(400).json({ erro: 'Token inválido ou expirado.' });
  res.json({ mensagem: 'Senha atualizada com sucesso.' });
}));

app.get('/api/pecas', autenticar, somenteEquipe, asyncRoute(async (req, res) => {
  const campos = req.usuario.tipo === 'gerente'
    ? 'id, nome, descricao, categoria, localizacao, quantidade, min, preco'
    : 'id, nome, descricao, categoria, localizacao, quantidade, min';
  const [rows] = await pool.query(`SELECT ${campos} FROM pecas ORDER BY nome`);
  res.json(rows);
}));

app.post('/api/pecas', autenticar, somenteEquipe, asyncRoute(async (req, res) => {
  const nome = texto(req.body.nome, 'Nome', 2, 100);
  const descricao = String(req.body.descricao || '').trim().slice(0, 1000);
  const categoria = texto(req.body.categoria, 'Categoria', 2, 50);
  const localizacao = String(req.body.localizacao || '').trim().slice(0, 100);
  const quantidade = inteiro(req.body.quantidade, 'Quantidade');
  const min = inteiro(req.body.min, 'Quantidade mínima');
  const preco = req.usuario.tipo === 'gerente' ? decimal(req.body.preco, 'Preço') : 0;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [resultado] = await conn.execute(
      'INSERT INTO pecas (nome, descricao, categoria, localizacao, quantidade, min, preco) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [nome, descricao, categoria, localizacao, quantidade, min, preco]
    );
    if (quantidade > 0) {
      await conn.execute(
        "INSERT INTO movimentacoes (pecaId, tipo, quantidade, data, obs) VALUES (?, 'Entrada', ?, CURRENT_DATE, ?)",
        [resultado.insertId, quantidade, 'Estoque inicial registrado no cadastro da peça']
      );
    }
    await registrarAuditoria(conn, req, {
      acao: 'CRIAR', entidade: 'peca', entidadeId: resultado.insertId,
      resumo: `Peça cadastrada: ${nome}`,
      depois: { nome, descricao, categoria, localizacao, quantidade, min, preco }
    });
    await conn.commit();
    res.status(201).json({ mensagem: 'Peça cadastrada com sucesso.', id: resultado.insertId });
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
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
  const [pecas] = await pool.execute('SELECT quantidade FROM pecas WHERE id = ? LIMIT 1', [id]);
  if (!pecas.length) return res.status(404).json({ erro: 'Peça não encontrada.' });
  if (Number(pecas[0].quantidade) !== quantidade) {
    return res.status(409).json({ erro: 'Altere a quantidade somente por uma movimentação de estoque.' });
  }
  await pool.execute(
    'UPDATE pecas SET nome=?, descricao=?, categoria=?, localizacao=?, min=?, preco=? WHERE id=?',
    [nome, descricao, categoria, localizacao, min, preco, id]
  );
  await registrarAuditoria(pool, req, {
    acao: 'EDITAR', entidade: 'peca', entidadeId: id, resumo: `Peça atualizada: ${nome}`,
    antes: pecas[0], depois: { nome, descricao, categoria, localizacao, quantidade, min, preco }
  });
  res.json({ mensagem: 'Peça atualizada com sucesso.' });
}));

app.delete('/api/pecas/:id', autenticar, somenteGerente, asyncRoute(async (req, res) => {
  const id = idNumerico(req.params.id);
  const [pecas] = await pool.execute('SELECT * FROM pecas WHERE id = ? LIMIT 1', [id]);
  if (!pecas.length) return res.status(404).json({ erro: 'Peça não encontrada.' });
  const [historico] = await pool.execute('SELECT id FROM movimentacoes WHERE pecaId = ? LIMIT 1', [id]);
  if (historico.length) return res.status(409).json({ erro: 'A peça possui movimentações e não pode ser excluída.' });
  const [resultado] = await pool.execute('DELETE FROM pecas WHERE id = ?', [id]);
  await registrarAuditoria(pool, req, { acao: 'EXCLUIR', entidade: 'peca', entidadeId: id, resumo: `Peça excluída: ${pecas[0].nome}`, antes: pecas[0] });
  res.status(204).end();
}));

app.get('/api/movimentacoes', autenticar, somenteEquipe, asyncRoute(async (_req, res) => {
  const [rows] = await pool.query(`
    SELECT m.id, m.tipo, m.pecaId, m.quantidade, m.data, m.obs,
           COALESCE(p.nome, 'Peça removida') AS nome_peca
    FROM movimentacoes m
    LEFT JOIN pecas p ON p.id = m.pecaId
    ORDER BY m.data DESC, m.id DESC
  `);
  res.json(rows);
}));

app.get('/api/auditoria', autenticar, somenteGerente, asyncRoute(async (req, res) => {
  const limiteInformado = Number(req.query.limite || 50);
  const limite = Number.isInteger(limiteInformado) ? Math.min(Math.max(limiteInformado, 1), 100) : 50;
  const cursor = req.query.antesDe ? idNumerico(req.query.antesDe) : null;
  const parametros = [];
  const condicoes = [];
  if (cursor) { condicoes.push('id < ?'); parametros.push(cursor); }
  if (req.query.acao) { condicoes.push('acao = ?'); parametros.push(texto(req.query.acao, 'Ação', 3, 30).toUpperCase()); }
  if (req.query.entidade) { condicoes.push('entidade = ?'); parametros.push(texto(req.query.entidade, 'Entidade', 2, 50).toLowerCase()); }
  const onde = condicoes.length ? `WHERE ${condicoes.join(' AND ')}` : '';
  const [registros] = await pool.execute(
    `SELECT id, usuarioId, usuarioNome, usuarioEmail, usuarioTipo, acao, entidade, entidadeId,
            resumo, dadosAntes, dadosDepois, ip, requisicaoId, criadoEm
       FROM auditoria ${onde} ORDER BY id DESC LIMIT ${limite}`,
    parametros
  );
  const normalizarJson = (valor) => {
    if (valor == null || typeof valor === 'object') return valor;
    try { return JSON.parse(valor); } catch { return null; }
  };
  res.json({
    registros: registros.map((item) => ({ ...item, dadosAntes: normalizarJson(item.dadosAntes), dadosDepois: normalizarJson(item.dadosDepois) })),
    proximoCursor: registros.length === limite ? registros.at(-1).id : null
  });
}));

app.get('/api/auditoria/meus-atendimentos', autenticar, asyncRoute(async (req, res) => {
  if (req.usuario.tipo !== 'cliente') return res.status(403).json({ erro: 'Esta consulta pertence ao portal do cliente.' });
  const [registros] = await pool.execute(
    `SELECT a.id, a.entidadeId AS solicitacaoId, a.acao, a.resumo, a.dadosAntes, a.dadosDepois, a.criadoEm,
            CASE a.usuarioTipo WHEN 'cliente' THEN 'Você' ELSE 'Oficina' END AS autor
       FROM auditoria a
       INNER JOIN solicitacoes s ON CAST(s.id AS CHAR) = a.entidadeId
      WHERE a.entidade = 'servico' AND s.emailCliente = ?
      ORDER BY a.id DESC LIMIT 100`,
    [req.usuario.email]
  );
  const ler = (valor) => { if (valor == null || typeof valor === 'object') return valor; try { return JSON.parse(valor); } catch { return null; } };
  res.json(registros.map((item) => ({
    id: item.id,
    solicitacaoId: Number(item.solicitacaoId),
    acao: item.acao,
    resumo: item.resumo,
    autor: item.autor,
    statusAnterior: ler(item.dadosAntes)?.status || null,
    statusAtual: ler(item.dadosDepois)?.status || null,
    criadoEm: item.criadoEm
  })));
}));

app.post('/api/movimentacoes', autenticar, somenteEquipe, asyncRoute(async (req, res) => {
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
    const [pecas] = await conn.execute('SELECT id, nome, quantidade FROM pecas WHERE id = ? FOR UPDATE', [pecaId]);
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
    const quantidadeAnterior = Number(pecas[0].quantidade);
    await registrarAuditoria(conn, req, {
      acao: 'MOVIMENTAR', entidade: 'estoque', entidadeId: pecaId,
      resumo: `${tipo} de ${qtd} unidade(s) — ${pecas[0].nome || `peça #${pecaId}`}`,
      antes: { pecaId, nome: pecas[0].nome, quantidade: quantidadeAnterior },
      depois: { pecaId, nome: pecas[0].nome, quantidade: quantidadeAnterior + delta, movimentacaoId: resultado.insertId, tipo, quantidade: qtd, data, obs }
    });
    await conn.commit();
    res.status(201).json({ mensagem: 'Movimentação registrada e estoque atualizado.', id: resultado.insertId });
  } catch (error) {
    await conn.rollback();
    res.status(error.status || 500).json({ erro: error.status ? error.message : 'Erro ao registrar movimentação.' });
  } finally {
    conn.release();
  }
}));

app.get('/api/consultas/resumo-operacional', autenticar, somenteEquipe, asyncRoute(async (_req, res) => {
  const [rows] = await pool.query(`
    SELECT
      (SELECT COUNT(*)
         FROM solicitacoes
        WHERE arquivado = 0 AND status NOT IN ('Concluído', 'Rejeitado')) AS servicosAtivos,
      (SELECT COUNT(*)
         FROM solicitacoes
        WHERE arquivado = 0 AND status = 'Aguardando Aprovação') AS aguardandoAprovacao,
      (SELECT COUNT(*)
         FROM movimentacoes
        WHERE data = CURRENT_DATE) AS movimentacoesHoje,
      (SELECT COUNT(*)
         FROM movimentacoes
        WHERE data = CURRENT_DATE AND LOWER(tipo) = 'entrada') AS entradasHoje
  `);
  const resumo = rows[0] || {};
  const movimentacoesHoje = Math.max(0, Number(resumo.movimentacoesHoje) || 0);
  const entradasHoje = Math.min(movimentacoesHoje, Math.max(0, Number(resumo.entradasHoje) || 0));

  res.json({
    servicosAtivos: Math.max(0, Number(resumo.servicosAtivos) || 0),
    aguardandoAprovacao: Math.max(0, Number(resumo.aguardandoAprovacao) || 0),
    movimentacoesHoje,
    entradasHoje,
    saidasHoje: movimentacoesHoje - entradasHoje
  });
}));

app.post('/api/ordens-servico', autenticar, somenteGerente, asyncRoute(async (req, res) => {
  const dados = req.body || {};
  const status = dados.status === undefined || dados.status === null || dados.status === ''
    ? 'Em Análise'
    : String(dados.status);
  if (!['Em Análise', 'Aguardando Aprovação'].includes(status)) {
    return res.status(400).json({
      erro: 'Uma ordem de serviço só pode ser criada em análise ou aguardando aprovação.'
    });
  }
  const nomeCliente = texto(dados.nomeCliente, 'Nome do cliente', 2, 100);
  const emailCliente = dados.emailCliente ? emailValido(dados.emailCliente) : '';
  const telefone = texto(dados.telefone, 'Telefone', 8, 20);
  const veiculo = texto(dados.veiculo, 'Veículo', 2, 100);
  const ano = String(dados.ano || '').trim().slice(0, 10);
  const placa = texto(dados.placa, 'Placa', 6, 20).toUpperCase();
  const problema = texto(dados.problema, 'Problema', 5, 2000);
  const urgencias = ['Baixa', 'Média', 'Alta'];
  const urgencia = urgencias.includes(dados.urgencia) ? dados.urgencia : 'Média';
  const informouCusto = dados.custoSugerido !== undefined
    && dados.custoSugerido !== null
    && dados.custoSugerido !== '';
  if (status === 'Aguardando Aprovação' && !informouCusto) {
    return res.status(400).json({ erro: 'Informe um custo maior que zero para enviar o orçamento à aprovação.' });
  }
  const custoSugerido = informouCusto
    ? decimal(dados.custoSugerido, 'Custo sugerido', status === 'Aguardando Aprovação' ? 0.01 : 0)
    : null;
  const orcamentoVersao = status === 'Aguardando Aprovação' ? 1 : 0;
  const responsavel = dados.responsavel
    ? texto(dados.responsavel, 'Responsável', 2, 100)
    : texto(req.usuario.nome, 'Responsável', 2, 100);
  const dataInicio = dados.dataInicio
    ? dataIsoValida(dados.dataInicio, 'Data de início')
    : new Date().toISOString().slice(0, 10);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [resultado] = await conn.execute(
      `INSERT INTO solicitacoes
       (nomeCliente, emailCliente, telefone, veiculo, ano, placa, problema, urgencia, status,
        dataCriacao, custoSugerido, responsavel, dataInicio, orcamentoVersao)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?, ?, ?)`,
      [
        nomeCliente, emailCliente, telefone, veiculo, ano, placa, problema, urgencia, status,
        custoSugerido, responsavel, dataInicio, orcamentoVersao
      ]
    );
    const id = idNumerico(resultado.insertId);
    const osNumero = gerarNumeroOs(id, dataInicio.slice(0, 4));
    const orcamentoHash = status === 'Aguardando Aprovação'
      ? hashOrcamento({ id, osNumero, custoSugerido, versao: orcamentoVersao })
      : null;
    const [atualizacao] = status === 'Aguardando Aprovação'
      ? await conn.execute(
        `UPDATE solicitacoes
         SET osNumero = ?, orcamentoHash = ?
         WHERE id = ? AND osNumero IS NULL
           AND status = 'Aguardando Aprovação' AND orcamentoVersao = 1`,
        [osNumero, orcamentoHash, id]
      )
      : await conn.execute(
        `UPDATE solicitacoes
         SET osNumero = ?, orcamentoHash = NULL
         WHERE id = ? AND osNumero IS NULL
           AND status = 'Em Análise' AND orcamentoVersao = 0`,
        [osNumero, id]
      );
    if (atualizacao.affectedRows !== 1) {
      throw erroHttp(409, 'Não foi possível reservar o número da ordem de serviço.');
    }
    await conn.commit();
    return res.status(201).json({
      mensagem: 'Ordem de serviço criada com sucesso.',
      id,
      osNumero,
      orcamentoVersao
    });
  } catch (error) {
    await conn.rollback();
    if (error.code === 'ER_DUP_ENTRY' || error.status === 409) {
      return res.status(409).json({ erro: error.message || 'Número de OS já utilizado.' });
    }
    throw error;
  } finally {
    conn.release();
  }
}));

app.get('/api/solicitacoes', autenticar, asyncRoute(async (req, res) => {
  if (req.usuario.tipo === 'gerente') {
    const [rows] = await pool.query('SELECT * FROM solicitacoes WHERE arquivado = 0 ORDER BY id DESC');
    return res.json(rows);
  }
  if (req.usuario.tipo === 'mecanico') {
    const [rows] = await pool.query(`
      SELECT id, nomeCliente, emailCliente, telefone, veiculo, ano, placa, problema,
             urgencia, status, dataCriacao, osNumero, responsavel, dataInicio, arquivado, arquivado_em
      FROM solicitacoes
      WHERE arquivado = 0
      ORDER BY id DESC
    `);
    return res.json(rows);
  }
  const [rows] = await pool.execute(
    'SELECT * FROM solicitacoes WHERE emailCliente = ? AND arquivado = 0 ORDER BY id DESC',
    [req.usuario.email]
  );
  res.json(rows);
}));

app.get('/api/solicitacoes/:id/contrato', autenticar, somenteEquipe, asyncRoute(async (req, res) => {
  const id = idNumerico(req.params.id);
  const [rows] = await pool.execute(
    `SELECT id, nomeCliente, emailCliente, telefone, veiculo, ano, placa, problema,
            urgencia, status, dataCriacao, osNumero, responsavel, dataInicio,
            custoSugerido, orcamentoVersao, orcamentoHash,
            decisao, decisaoEm, decisaoOrigem
     FROM solicitacoes
     WHERE id = ? AND arquivado = 0
       AND osNumero IS NOT NULL
       AND orcamentoVersao > 0
       AND orcamentoHash IS NOT NULL
       AND custoSugerido > 0
     LIMIT 1`,
    [id]
  );
  if (!rows.length) {
    return res.status(404).json({ erro: 'Contrato não encontrado ou ainda não disponível.' });
  }
  res.json(rows[0]);
}));

app.post('/api/solicitacoes', autenticar, asyncRoute(async (req, res) => {
  const gerente = req.usuario.tipo === 'gerente';
  const membroEquipe = ['gerente', 'mecanico'].includes(req.usuario.tipo);
  const nomeCliente = membroEquipe ? texto(req.body.nomeCliente, 'Nome do cliente', 2, 100) : req.usuario.nome;
  const emailCliente = membroEquipe && req.body.emailCliente ? emailValido(req.body.emailCliente) : req.usuario.email;
  const telefone = texto(req.body.telefone, 'Telefone', 8, 20);
  const veiculo = texto(req.body.veiculo, 'Veículo', 2, 100);
  const ano = String(req.body.ano || '').trim().slice(0, 10);
  const placa = texto(req.body.placa, 'Placa', 6, 20).toUpperCase();
  const problema = texto(req.body.problema, 'Problema', 5, 2000);
  const urgencias = ['Baixa', 'Média', 'Alta'];
  const urgencia = urgencias.includes(req.body.urgencia) ? req.body.urgencia : 'Média';
  const statusIniciais = ['Pendente', 'Em Análise'];
  if (gerente && req.body.status && !statusIniciais.includes(req.body.status)) {
    return res.status(400).json({ erro: 'Use a rota de ordem de serviço ou o fluxo de orçamento para este status.' });
  }
  const status = gerente && statusIniciais.includes(req.body.status) ? req.body.status : 'Pendente';
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
    if (Object.prototype.hasOwnProperty.call(req.body, 'custoSugerido')
      || Object.prototype.hasOwnProperty.call(req.body, 'osNumero')) {
      return res.status(403).json({ erro: 'A decisão do cliente não pode alterar custo ou número da OS.' });
    }
    const [resultado] = await pool.execute(
      `UPDATE solicitacoes
       SET status = ?, decisao = ?, decisaoEm = NOW(), decisaoUsuarioId = ?, decisaoOrigem = 'cliente'
       WHERE id = ? AND emailCliente = ? AND status = 'Aguardando Aprovação'
         AND osNumero IS NOT NULL AND custoSugerido > 0
         AND orcamentoHash IS NOT NULL AND orcamentoVersao > 0`,
      [status, status, req.usuario.id, id, req.usuario.email]
    );
    if (!resultado.affectedRows) return res.status(404).json({ erro: 'Solicitação não encontrada ou transição não permitida.' });
    await registrarAuditoria(pool, req, { acao: 'STATUS', entidade: 'servico', entidadeId: id, resumo: `Orçamento ${status.toLowerCase()} pelo cliente`, antes: { status: 'Aguardando Aprovação' }, depois: { status } });
    return res.json({ mensagem: 'Decisão registrada.', decisao: { status, origem: 'cliente' } });
  }

  if (req.usuario.tipo === 'mecanico') {
    const possuiCampoFinanceiro = Object.prototype.hasOwnProperty.call(req.body, 'custoSugerido')
      || Object.prototype.hasOwnProperty.call(req.body, 'osNumero');
    if (possuiCampoFinanceiro) {
      return res.status(403).json({ erro: 'Mecânico não pode alterar orçamento, custo ou número da OS.' });
    }
    const transicoesOperacionais = {
      'Em Análise': ['Pendente'],
      'Em Andamento': ['Aprovado'],
      'Concluído': ['Em Andamento']
    };
    if (!transicoesOperacionais[status]) {
      return res.status(403).json({ erro: 'Este status exige autorização de gerente.' });
    }
    const [solicitacoes] = await pool.execute(
      'SELECT status FROM solicitacoes WHERE id = ? AND arquivado = 0 LIMIT 1',
      [id]
    );
    if (!solicitacoes.length) return res.status(404).json({ erro: 'Solicitação não encontrada.' });
    const statusAtual = solicitacoes[0].status;
    if (!transicoesOperacionais[status].includes(statusAtual)) {
      return res.status(409).json({
        erro: `Transição de ${statusAtual} para ${status} não permitida para mecânico.`
      });
    }
    const [resultado] = await pool.execute(
      'UPDATE solicitacoes SET status = ? WHERE id = ? AND arquivado = 0 AND status = ?',
      [status, id, statusAtual]
    );
    if (!resultado.affectedRows) {
      return res.status(409).json({ erro: 'O serviço foi alterado por outro usuário. Atualize a tela e tente novamente.' });
    }
    await registrarAuditoria(pool, req, { acao: 'STATUS', entidade: 'servico', entidadeId: id, resumo: `Serviço atualizado para ${status}`, antes: { status: statusAtual }, depois: { status } });
    return res.json({ mensagem: 'Andamento do serviço atualizado.' });
  }

  const informouCusto = Object.prototype.hasOwnProperty.call(req.body, 'custoSugerido')
    && req.body.custoSugerido !== null && req.body.custoSugerido !== '';
  const informouOs = Object.prototype.hasOwnProperty.call(req.body, 'osNumero')
    && req.body.osNumero !== null && String(req.body.osNumero).trim() !== '';
  if (informouOs) {
    return res.status(400).json({ erro: 'O número da OS é gerado pelo servidor e não pode ser informado.' });
  }
  if (status !== 'Aguardando Aprovação' && informouCusto) {
    return res.status(400).json({
      erro: 'O custo somente pode ser definido ao enviar o orçamento para aprovação.'
    });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [solicitacoes] = await conn.execute(
      `SELECT status, custoSugerido, osNumero, orcamentoVersao, orcamentoHash,
              YEAR(dataCriacao) AS anoOs
       FROM solicitacoes
       WHERE id = ? AND arquivado = 0
       LIMIT 1 FOR UPDATE`,
      [id]
    );
    const atual = solicitacoes[0];
    if (!atual) throw erroHttp(404, 'Solicitação não encontrada.');

    if (status === 'Aguardando Aprovação') {
      if (atual.status !== 'Em Análise') {
        throw erroHttp(409, `Transição de ${atual.status} para ${status} não permitida.`);
      }
      const custo = informouCusto
        ? decimal(req.body.custoSugerido, 'Custo sugerido')
        : atual.custoSugerido === null ? null : decimal(atual.custoSugerido, 'Custo sugerido');
      if (custo === null || custo <= 0) {
        throw erroHttp(400, 'Informe um custo maior que zero antes de enviar o orçamento para aprovação.');
      }
      const osNumero = atual.osNumero || gerarNumeroOs(id, atual.anoOs);
      const orcamentoVersao = inteiro(atual.orcamentoVersao || 0, 'Versão do orçamento') + 1;
      const orcamentoHash = hashOrcamento({ id, osNumero, custoSugerido: custo, versao: orcamentoVersao });
      const [resultado] = await conn.execute(
        `UPDATE solicitacoes
         SET status = 'Aguardando Aprovação', custoSugerido = ?, osNumero = ?,
             orcamentoVersao = ?, orcamentoHash = ?, decisao = NULL, decisaoEm = NULL,
             decisaoUsuarioId = NULL, decisaoOrigem = NULL
         WHERE id = ? AND arquivado = 0 AND status = 'Em Análise'`,
        [custo, osNumero, orcamentoVersao, orcamentoHash, id]
      );
      if (resultado.affectedRows !== 1) throw erroHttp(409, 'Não foi possível versionar o orçamento.');
      await registrarAuditoria(conn, req, { acao: 'STATUS', entidade: 'servico', entidadeId: id, resumo: 'Orçamento enviado para aprovação', antes: { status: atual.status }, depois: { status, orcamentoVersao } });
      await conn.commit();
      return res.json({
        mensagem: 'Orçamento enviado para aprovação.',
        osNumero,
        orcamentoVersao
      });
    }

    if (status === 'Aprovado' || status === 'Rejeitado') {
      const rejeicaoPreOrcamento = status === 'Rejeitado'
        && ['Pendente', 'Em Análise'].includes(atual.status);
      const decisaoDeOrcamento = atual.status === 'Aguardando Aprovação';
      if (!rejeicaoPreOrcamento && !decisaoDeOrcamento) {
        throw erroHttp(409, `Transição de ${atual.status} para ${status} não permitida.`);
      }
      if (decisaoDeOrcamento
        && (!atual.osNumero || !atual.orcamentoHash
          || Number(atual.orcamentoVersao) < 1 || Number(atual.custoSugerido) <= 0)) {
        throw erroHttp(409, 'Registre e versione um orçamento válido antes da decisão.');
      }
      const [resultado] = await conn.execute(
        `UPDATE solicitacoes
         SET status = ?, decisao = ?, decisaoEm = NOW(), decisaoUsuarioId = ?, decisaoOrigem = 'gerente'
         WHERE id = ? AND arquivado = 0 AND status = ?`,
        [status, status, req.usuario.id, id, atual.status]
      );
      if (resultado.affectedRows !== 1) throw erroHttp(409, 'Não foi possível registrar a decisão.');
      await registrarAuditoria(conn, req, { acao: 'STATUS', entidade: 'servico', entidadeId: id, resumo: `Serviço atualizado para ${status}`, antes: { status: atual.status }, depois: { status } });
      await conn.commit();
      return res.json({ mensagem: 'Decisão registrada.', decisao: { status, origem: 'gerente' } });
    }

    if (!transicaoServicoPermitida(atual.status, status)) {
      throw erroHttp(409, `Transição de ${atual.status} para ${status} não permitida.`);
    }
    const [resultado] = await conn.execute(
      'UPDATE solicitacoes SET status = ? WHERE id = ? AND arquivado = 0 AND status = ?',
      [status, id, atual.status]
    );
    if (resultado.affectedRows !== 1) throw erroHttp(409, 'Não foi possível atualizar a solicitação.');
    await registrarAuditoria(conn, req, { acao: 'STATUS', entidade: 'servico', entidadeId: id, resumo: `Serviço atualizado para ${status}`, antes: { status: atual.status }, depois: { status } });
    await conn.commit();
    return res.json({ mensagem: 'Solicitação atualizada.' });
  } catch (error) {
    await conn.rollback();
    if (error.status) return res.status(error.status).json({ erro: error.message });
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ erro: 'Número de OS já utilizado.' });
    throw error;
  } finally {
    conn.release();
  }
}));

app.patch('/api/solicitacoes/:id/arquivar', autenticar, somenteGerente, asyncRoute(async (req, res) => {
  const id = idNumerico(req.params.id);
  const [resultado] = await pool.execute(
    "UPDATE solicitacoes SET arquivado=1, arquivado_em=NOW() WHERE id=? AND status IN ('Concluído','Rejeitado')",
    [id]
  );
  if (!resultado.affectedRows) return res.status(404).json({ erro: 'Solicitação não encontrada ou ainda não finalizada.' });
  res.json({ mensagem: 'Solicitação arquivada.' });
}));

app.delete('/api/solicitacoes/:id', autenticar, somenteGerente, asyncRoute(async (req, res) => {
  const id = idNumerico(req.params.id);
  const [resultado] = await pool.execute(
    "UPDATE solicitacoes SET arquivado=1, arquivado_em=NOW() WHERE id=? AND status IN ('Concluído','Rejeitado')",
    [id]
  );
  if (!resultado.affectedRows) return res.status(409).json({ erro: 'Somente solicitações finalizadas podem ser arquivadas.' });
  res.status(204).end();
}));

app.use((req, res) => res.status(404).json({ erro: 'Rota não encontrada.' }));
app.use((error, req, res, _next) => {
  console.error(`[${new Date().toISOString()}] [${req.id || 'sem-id'}] ${req.method} ${req.path}:`, error.message);
  if (error.message === 'Origem não autorizada pelo CORS.') return res.status(403).json({ erro: error.message });
  if (/deve ter|inválid|obrigatóri/i.test(error.message)) return res.status(400).json({ erro: error.message });
  res.status(500).json({ erro: 'Erro interno do servidor.' });
});

let servidorHttp;
async function iniciar() {
  await pool.query('SELECT 1');
  servidorHttp = app.listen(PORT, () => console.log(`Auto+Assis disponível em ${FRONTEND_URL}`));
  return servidorHttp;
}

async function encerrar(signal) {
  console.log(`${signal} recebido. Encerrando o Auto+Assis com segurança.`);
  const limite = setTimeout(() => process.exit(1), 10_000);
  limite.unref();
  if (servidorHttp) {
    await new Promise((resolve) => servidorHttp.close(resolve));
  }
  await pool.end();
  clearTimeout(limite);
  process.exit(0);
}

if (require.main === module) {
  iniciar().catch((error) => {
    console.error('Falha ao iniciar:', error.message);
    process.exit(1);
  });
  process.once('SIGTERM', () => encerrar('SIGTERM'));
  process.once('SIGINT', () => encerrar('SIGINT'));
}

module.exports = {
  app,
  pool,
  iniciar,
  encerrar,
  emailTemplates: {
    criarEmailRecuperacao
  },
  fluxoServico: {
    TRANSICOES_SERVICO,
    transicaoServicoPermitida
  },
  validacao: {
    texto,
    emailValido,
    senhaGerenteValida,
    nomePessoaValido,
    tipoEquipeValido,
    inteiro,
    decimal,
    idNumerico
  }
};
