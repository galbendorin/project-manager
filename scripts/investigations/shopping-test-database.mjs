import { mkdtemp, appendFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { pathToFileURL } from 'node:url';

// Never accept a connection URL: the fixture creates/truncates tables. Native
// mode always launches a fresh, loopback-only cluster under a unique temp path.
export async function createShoppingTestDatabase() {
  if (!process.env.PMW_NATIVE_POSTGRES_MODULE) {
    const { PGlite } = await import(process.env.PGLITE_MODULE
      ? pathToFileURL(process.env.PGLITE_MODULE).href : '@electric-sql/pglite');
    return new PGlite();
  }
  const { default: EmbeddedPostgres } = await import(pathToFileURL(process.env.PMW_NATIVE_POSTGRES_MODULE).href);
  const root = await mkdtemp(join(tmpdir(), 'pmw-shopping-pg-'));
  const listener = createServer();
  await new Promise((resolve, reject) => {
    listener.once('error', reject);
    listener.listen(0, '127.0.0.1', resolve);
  });
  const port = listener.address().port;
  await new Promise((resolve, reject) => listener.close(error => error ? reject(error) : resolve()));
  const log = message => { void appendFile(join(root, 'postgres.log'), String(message)).catch(() => {}); };
  const cluster = new EmbeddedPostgres({
    databaseDir: join(root, 'data'), port, user: 'pmw_contract_test', password: randomUUID(),
    authMethod: 'scram-sha-256', persistent: false, createPostgresUser: false,
    initdbFlags: ['--encoding=UTF8', '--locale=C'],
    postgresFlags: ['-h', '127.0.0.1', '-k', root, '-c', 'statement_timeout=8000', '-c', 'deadlock_timeout=500ms'],
    onLog: log, onError: log,
  });
  const clients = new Set();
  async function connection() {
    const client = cluster.getPgClient('postgres', '127.0.0.1');
    await client.connect();
    clients.add(client);
    client.exec = query => client.query(query);
    const end = client.end.bind(client);
    client.close = async () => { clients.delete(client); await end(); };
    return client;
  }
  try {
    await cluster.initialise();
    await cluster.start();
    const main = await connection();
    const version = (await main.query('select version() as version')).rows[0].version;
    console.log(`Native SQL fixture: ${version}; logs ${root}/postgres.log`);
    return {
      native: true, connection,
      query: (...args) => main.query(...args), exec: query => main.query(query),
      transaction: async callback => {
        const client = await connection();
        try {
          await client.query('begin');
          const result = await callback(client);
          await client.query('commit');
          return result;
        } catch (error) {
          await client.query('rollback');
          throw error;
        } finally { await client.close(); }
      },
      close: async () => {
        await Promise.allSettled([...clients].map(client => client.close()));
        await cluster.stop();
      },
    };
  } catch (error) {
    await Promise.allSettled([...clients].map(client => client.close()));
    await cluster.stop();
    throw new Error(`Native test database failed; inspect ${root}/postgres.log`, { cause: error });
  }
}
