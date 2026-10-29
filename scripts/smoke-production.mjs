import 'dotenv/config';

function parseBaseUrl() {
  const args = process.argv.slice(2);
  const flagIndex = args.indexOf('--url');
  const explicit = flagIndex >= 0 ? args[flagIndex + 1] : undefined;
  const candidate = explicit || process.env.APP_URL || '';
  if (!candidate) {
    throw new Error('Fournir --url <https://domaine> ou définir APP_URL.');
  }
  const parsed = new URL(candidate);
  if (parsed.protocol !== 'https:' && parsed.hostname !== 'localhost' && !parsed.hostname.startsWith('127.')) {
    throw new Error('Le smoke test de production exige HTTPS (sauf sur localhost).');
  }
  return candidate.replace(/\/$/, '');
}

const baseUrl = parseBaseUrl();
const results = [];
let failures = 0;

function record(ok, label, detail = '') {
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures += 1;
}

const forwardedProto = String(process.env.SMOKE_FORWARDED_PROTO || '').trim();

async function request(path) {
  const headers = { 'User-Agent': 'MaTable.ci-production-smoke/1.0' };
  if (forwardedProto) headers['X-Forwarded-Proto'] = forwardedProto;
  const response = await fetch(`${baseUrl}${path}`, {
    redirect: 'follow',
    signal: AbortSignal.timeout(15000),
    headers,
  });
  const body = await response.text();
  return { response, body };
}

async function checkPage(path, expected = 200) {
  try {
    const { response, body } = await request(path);
    const type = response.headers.get('content-type') || '';
    record(response.status === expected, `GET ${path} → ${expected}`, `reçu ${response.status}`);
    record(type.includes('text/html'), `GET ${path} : contenu HTML`, type);
    return body;
  } catch (error) {
    record(false, `GET ${path}`, error instanceof Error ? error.message : 'échec réseau');
    return '';
  }
}

async function checkJson(path, expected = 200) {
  try {
    const { response, body } = await request(path);
    record(response.status === expected, `GET ${path} → ${expected}`, `reçu ${response.status}`);
    const type = response.headers.get('content-type') || '';
    record(type.includes('application/json'), `GET ${path} : contenu JSON`, type);
    if (type.includes('application/json')) {
      try {
        return JSON.parse(body);
      } catch {
        record(false, `GET ${path} : JSON valide`);
      }
    }
    return null;
  } catch (error) {
    record(false, `GET ${path}`, error instanceof Error ? error.message : 'échec réseau');
    return null;
  }
}

async function checkAsset(path, expectedType) {
  try {
    const { response } = await request(path);
    const type = response.headers.get('content-type') || '';
    record(response.status === 200, `GET ${path} → 200`, `reçu ${response.status}`);
    record(expectedType.test(type), `${path} : type de contenu`, type);
  } catch (error) {
    record(false, `GET ${path}`, error instanceof Error ? error.message : 'échec réseau');
  }
}

console.log(`== Smoke production : ${baseUrl} ==`);

const home = await checkPage('/');
record(home.includes('<div id="root">'), 'Accueil : point de montage React');
record(home.includes('rel="manifest"'), 'Accueil : manifeste PWA déclaré');

for (const path of ['/boutiques', '/promotions', '/comment-ca-marche', '/faq', '/commercants', '/connexion']) {
  await checkPage(path);
}

const health = await checkJson('/health');
record(health?.status === 'ok', 'Santé : base de données disponible', JSON.stringify(health));

await checkJson('/api/admin/health', 401);
await checkJson('/api/does-not-exist-smoke', 404);
await checkJson('/api/shops', 200);

await checkAsset('/manifest.json', /^application\/(manifest\+)?json/);
await checkAsset('/sw.js', /^(application|text)\/javascript/);
await checkAsset('/brand-kit/icon-192.png', /^image\/png/);
await checkAsset('/brand-kit/icon-512.png', /^image\/png/);
await checkAsset('/brand-kit/social-share.png', /^image\/png/);
await checkAsset('/robots.txt', /^text\/plain/);
await checkAsset('/sitemap.xml', /^(application|text)\/xml/);

try {
  const { response, body } = await request('/manifest.json');
  const manifest = JSON.parse(body);
  const icons = Array.isArray(manifest.icons) ? manifest.icons : [];
  record(icons.length >= 3, 'Manifeste : icônes déclarées', `${icons.length}`);
  record(icons.every((icon) => String(icon.src || '').startsWith('/brand-kit/')), 'Manifeste : icônes servies depuis /brand-kit/');
  record(response.status === 200, 'Manifeste : accessible', String(response.status));
} catch (error) {
  record(false, 'Manifeste : lecture', error instanceof Error ? error.message : 'échec');
}

try {
  const { response } = await request('/');
  const requiredHeaders = {
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'strict-origin-when-cross-origin',
  };
  for (const [header, expected] of Object.entries(requiredHeaders)) {
    const actual = response.headers.get(header) || '';
    record(actual.toLowerCase() === expected.toLowerCase(), `En-tête ${header}`, actual || 'absent');
  }
  record(Boolean(response.headers.get('content-security-policy')), 'En-tête Content-Security-Policy présent');
  record(Boolean(response.headers.get('strict-transport-security')), 'En-tête HSTS présent');
} catch (error) {
  record(false, 'En-têtes de sécurité', error instanceof Error ? error.message : 'échec');
}

for (const line of results) console.log(line);
console.log(`\nRésultat : ${results.length - failures} réussi(s), ${failures} échec(s).`);

if (failures > 0) process.exitCode = 1;
