const connectionParameterMap = {
  host: 'PGHOST',
  port: 'PGPORT',
  user: 'PGUSER',
  password: 'PGPASSWORD',
  dbname: 'PGDATABASE',
  sslmode: 'PGSSLMODE',
  sslcert: 'PGSSLCERT',
  sslkey: 'PGSSLKEY',
  sslrootcert: 'PGSSLROOTCERT',
  sslcrl: 'PGSSLCRL',
  gssencmode: 'PGGSSENCMODE',
  connect_timeout: 'PGCONNECT_TIMEOUT',
  application_name: 'PGAPPNAME',
  options: 'PGOPTIONS',
  target_session_attrs: 'PGTARGETSESSIONATTRS',
  channel_binding: 'PGCHANNELBINDING',
  passfile: 'PGPASSFILE',
};

export function parsePostgresUrl(connectionString) {
  let url;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error('A valid PostgreSQL connection URL is required.');
  }

  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error('The connection URL must use the PostgreSQL protocol.');
  }

  const database = decodeURIComponent(url.pathname.slice(1));
  if (!url.hostname || !database) {
    throw new Error('The PostgreSQL URL must include a host and database name.');
  }

  const pgEnv = {
    PGHOST: url.hostname.replace(/^\[|\]$/g, ''),
    PGPORT: url.port || '5432',
    PGDATABASE: database,
  };
  if (url.username) pgEnv.PGUSER = decodeURIComponent(url.username);
  if (url.password) pgEnv.PGPASSWORD = decodeURIComponent(url.password);

  const seenParameters = new Set();
  for (const [key, value] of url.searchParams) {
    const envName = connectionParameterMap[key];
    if (!envName || seenParameters.has(key)) {
      throw new Error(`Unsupported or duplicate PostgreSQL URL parameter: ${key}`);
    }
    seenParameters.add(key);
    pgEnv[envName] = value;
  }

  return {
    pgEnv,
    identity: {
      host: pgEnv.PGHOST.toLowerCase().replace(/\.$/, ''),
      port: pgEnv.PGPORT,
      database: pgEnv.PGDATABASE,
    },
  };
}

export function sameDatabase(left, right) {
  return left.host === right.host && left.port === right.port && left.database === right.database;
}

export function buildPgDumpArgs(outputPath) {
  return ['--no-password', '--format=custom', `--file=${outputPath}`];
}

export function buildPgRestoreArgs(dumpPath, schema, database) {
  return [
    '--no-password',
    '--exit-on-error',
    '--single-transaction',
    '--no-owner',
    '--no-privileges',
    ...(schema ? [`--schema=${schema}`] : []),
    ...(database ? [`--dbname=${database}`] : []),
    dumpPath,
  ];
}

export function buildPsqlArgs(query) {
  return ['--no-psqlrc', '--no-password', '--tuples-only', '--no-align', '--field-separator=|', '--set=ON_ERROR_STOP=1', `--command=${query}`];
}

export function parseDatabaseInspection(output) {
  const [database, address, port, objectCount] = output.trim().split('|');
  if (!database || !/^\d+$/.test(objectCount ?? '')) {
    throw new Error('Could not validate the PostgreSQL database state.');
  }
  return { database, address, port, objectCount: Number(objectCount) };
}

export function makeChildEnvironment(pgEnv) {
  const inherited = { ...process.env };
  delete inherited.DATABASE_URL;
  delete inherited.RESTORE_TARGET_DATABASE_URL;
  for (const name of [...Object.values(connectionParameterMap), 'PGHOSTADDR', 'PGSERVICE', 'PGSERVICEFILE']) {
    delete inherited[name];
  }
  return { ...inherited, ...pgEnv };
}
