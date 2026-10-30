import 'dotenv/config';

/**
 * Diagnostic non destructif des intégrations Didit et Google.
 *
 * Aucun secret n'est affiché. Aucune session Didit n'est créée.
 * La clé API Didit est validée par un GET sur une session inexistante :
 *   401 -> clé absente/invalide, 404 ou 403 -> clé acceptée.
 *
 * Usage :
 *   node scripts/check-integrations.mjs            # diagnostic complet
 *   node scripts/check-integrations.mjs --offline  # sans appel réseau
 */

const args = new Set(process.argv.slice(2));
const offline = args.has('--offline');

const passed = [];
const warnings = [];
const errors = [];

const value = (key) => String(process.env[key] ?? '').trim();
const isSet = (key) => value(key).length > 0;

const pass = (message) => passed.push(message);
const warn = (message) => warnings.push(message);
const fail = (message) => errors.push(message);

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
// Session volontairement inexistante : ne crée ni ne modifie aucune donnée.
const PROBE_SESSION_ID = '00000000-0000-4000-8000-000000000000';

function describeKey(key) {
  const v = value(key);
  if (!v) return 'absent';
  if (/SECRET|API_KEY|PRIVATE_KEY/.test(key)) return `défini (${v.length} caractères)`;
  return v;
}

function checkPresence(keys, label, { required = false } = {}) {
  const missing = keys.filter((key) => !isSet(key));
  if (missing.length === 0) {
    pass(`${label} : ${keys.map((key) => `${key}=${describeKey(key)}`).join(', ')}`);
    return true;
  }
  const message = `${label} : manquant(s) → ${missing.join(', ')}`;
  if (required) fail(message);
  else warn(message);
  return false;
}

// --- Didit -----------------------------------------------------------------

const merchantWorkflow = value('DIDIT_WORKFLOW_ID');
const driverWorkflow = value('DIDIT_DRIVER_WORKFLOW_ID');

const diditApiKeySet = checkPresence(['DIDIT_API_KEY'], 'Didit clé API');
checkPresence(['DIDIT_WORKFLOW_ID'], 'Didit workflow marchand');
checkPresence(['DIDIT_WEBHOOK_SECRET'], 'Didit secret webhook');

if (isSet('DIDIT_DRIVER_WORKFLOW_ID')) {
  if (!isSet('DIDIT_WORKFLOW_ID')) {
    warn('DIDIT_DRIVER_WORKFLOW_ID est défini sans DIDIT_WORKFLOW_ID de secours.');
  }
  if (!UUID_PATTERN.test(driverWorkflow)) {
    fail('DIDIT_DRIVER_WORKFLOW_ID n’est pas un UUID de workflow valide.');
  }
}
if (isSet('DIDIT_WORKFLOW_ID') && !UUID_PATTERN.test(merchantWorkflow)) {
  fail('DIDIT_WORKFLOW_ID n’est pas un UUID de workflow valide.');
}

// --- Google ----------------------------------------------------------------

checkPresence(['GOOGLE_OAUTH_CLIENT_ID'], 'Google client ID');
checkPresence(['GOOGLE_OAUTH_CLIENT_SECRET'], 'Google client secret');

const appUrl = value('APP_URL');
let appOrigin = null;
if (!appUrl) {
  warn('APP_URL est absent : impossible de calculer les URL de retour OAuth et webhook.');
} else {
  try {
    appOrigin = new URL(appUrl).origin;
    pass(`APP_URL = ${appOrigin}`);
  } catch {
    fail('APP_URL n’est pas une URL valide.');
  }
}

if (appOrigin && (isSet('GOOGLE_OAUTH_CLIENT_ID') || isSet('GOOGLE_OAUTH_CLIENT_SECRET'))) {
  pass(`URL de retour Google à déclarer : ${appOrigin}/api/auth/customer-oauth/google/callback`);
}

// --- Vérifications réseau --------------------------------------------------

async function probeDiditKey() {
  if (!diditApiKeySet) {
    warn('Clé Didit absente : validation réseau ignorée.');
    return;
  }
  let response;
  try {
    response = await fetch(`https://verification.didit.me/v3/session/${PROBE_SESSION_ID}/`, {
      headers: { 'x-api-key': value('DIDIT_API_KEY'), accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    warn(`Didit injoignable : ${error instanceof Error ? error.message : String(error)}`);
    return;
  }
  if (response.status === 401) {
    fail('Didit refuse la clé API (401). Clé révoquée, expirée ou incorrecte.');
  } else if (response.status === 403) {
    warn('Didit accepte la clé mais limite son accès (403). Vérifier les scopes/IP de la clé.');
  } else if (response.status === 404) {
    pass('Clé API Didit acceptée (404 attendu sur la session sonde).');
  } else if (response.ok) {
    warn(`Réponse Didit inattendue (${response.status}) : à vérifier manuellement.`);
  } else {
    warn(`Didit a répondu ${response.status} : résultat non concluant.`);
  }
}

async function probeDiditWorkflows() {
  const ids = [merchantWorkflow, driverWorkflow].filter((id, index, all) => UUID_PATTERN.test(id) && all.indexOf(id) === index);
  if (!diditApiKeySet || ids.length === 0) return;

  let response;
  try {
    response = await fetch('https://verification.didit.me/v3/workflows/', {
      headers: { 'x-api-key': value('DIDIT_API_KEY'), accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    warn(`Liste des workflows Didit injoignable : ${error instanceof Error ? error.message : String(error)}`);
    return;
  }
  if (!response.ok) {
    warn(`Liste des workflows Didit : réponse ${response.status}, statut non vérifié.`);
    return;
  }

  const payload = await response.json().catch(() => null);
  const workflows = Array.isArray(payload?.results) ? payload.results : [];
  for (const id of ids) {
    const matches = workflows.filter((workflow) => workflow.workflow_id === id || workflow.uuid === id);
    if (matches.length === 0) {
      fail(`Workflow Didit ${id} introuvable dans l’application de cette clé API.`);
      continue;
    }
    // Une session ne peut démarrer que sur une version publiée.
    const published = matches.filter((workflow) => workflow.status === 'published' && !workflow.is_archived);
    const label = matches[0].workflow_label || '(sans nom)';
    if (published.length === 0) {
      fail(`Workflow Didit « ${label} » (${id}) est en brouillon : publiez-le dans la console Didit, sinon la création de session échouera.`);
    } else {
      const latest = published.sort((a, b) => (b.version || 0) - (a.version || 0))[0];
      pass(`Workflow Didit « ${label} » publié (v${latest.version}).`);
    }
  }
}

async function probeIvorianDocuments() {
  if (!diditApiKeySet || !UUID_PATTERN.test(merchantWorkflow)) return;
  let response;
  try {
    response = await fetch(`https://verification.didit.me/v3/workflows/${merchantWorkflow}/`, {
      headers: { 'x-api-key': value('DIDIT_API_KEY'), accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    warn(`Détail du workflow Didit injoignable : ${error instanceof Error ? error.message : String(error)}`);
    return;
  }
  if (!response.ok) {
    warn(`Détail du workflow Didit : réponse ${response.status}, pièces acceptées non vérifiées.`);
    return;
  }
  const workflow = await response.json().catch(() => null);
  const ivoryCoast = workflow?.documents_allowed?.CIV;
  if (!ivoryCoast || typeof ivoryCoast !== 'object') {
    fail('Le workflow Didit n’autorise aucune pièce ivoirienne (CIV absent de documents_allowed).');
    return;
  }
  const labels = [['ID', 'CNI'], ['P', 'passeport'], ['DL', 'permis de conduire']]
    .filter(([type]) => ivoryCoast[type]?.enabled)
    .map(([, label]) => label);
  if (labels.length === 0) {
    fail('Le workflow Didit n’accepte ni CNI, ni passeport, ni permis ivoirien.');
    return;
  }
  pass(`Pièces ivoiriennes acceptées par le workflow : ${labels.join(', ')}.`);
  if (!ivoryCoast.ID?.enabled) {
    warn('La CNI ivoirienne n’est pas activée dans le workflow Didit : activez-la pour éviter les échecs de marchands.');
  }
}

async function probeWebhook() {
  if (!appOrigin) return;
  const endpoint = `${appOrigin}/api/webhooks/didit`;
  let response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    warn(`Webhook injoignable sur ${endpoint} : ${error instanceof Error ? error.message : String(error)}`);
    return;
  }
  if (response.status === 503) {
    fail('Le secret de webhook Didit n’est pas configuré sur ce serveur (503).');
  } else if (response.status === 401) {
    pass('Secret de webhook Didit configuré (401 attendu sans signature valide).');
  } else if (response.status === 400) {
    warn('Le webhook répond 400 : le secret est probablement configuré, mais le corps vide est rejeté avant la signature.');
  } else {
    warn(`Webhook : réponse ${response.status} non concluante sur ${endpoint}.`);
  }
}

if (!offline) {
  await Promise.all([probeDiditKey(), probeDiditWorkflows(), probeIvorianDocuments(), probeWebhook()]);
} else {
  warn('Mode --offline : aucune vérification réseau effectuée.');
}

// --- Rapport ---------------------------------------------------------------

console.log('\nDidit / Google — diagnostic des intégrations\n');
for (const message of passed) console.log(`PASS  ${message}`);
for (const message of warnings) console.log(`WARN  ${message}`);
for (const message of errors) console.log(`FAIL  ${message}`);
console.log(`\nRésultat : ${passed.length} réussi(s), ${warnings.length} avertissement(s), ${errors.length} erreur(s).\n`);

process.exitCode = errors.length > 0 ? 1 : 0;
