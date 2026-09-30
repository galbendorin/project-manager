import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { coveredTables, identifier, columnType } from './household-backup.mjs';

export function unwrapBackup(value) {
  const result = Array.isArray(value) ? value[0]?.household_backup : value;
  const backup = typeof result === 'string' ? JSON.parse(result) : result;
  if (backup?.format !== 'pmw-household-v1' || !Array.isArray(backup.schema) || !Array.isArray(backup.tables)) throw new Error('Unsupported household backup');
  return backup;
}

export async function verifyBackup(value, createDatabase) {
  const backup = unwrapBackup(value);
  if (backup.scope_gaps?.timesheet_entries_outside_owned_projects !== 0) throw new Error('Incomplete timesheet scope; review shared-project coverage before restoring');
  const expected = [...coveredTables, 'identity_stubs'];
  if (backup.tables.length !== expected.length || new Set(backup.tables.map(t=>t.name)).size !== expected.length || expected.some(n=>!backup.tables.some(t=>t.name===n))) throw new Error('Incomplete or duplicate table manifest');
  const schema = coveredTables.map(name => {
    const matches = backup.schema.filter(t=>t.name===name);
    if (matches.length !== 1) throw new Error(`Missing/duplicate schema ${name}`);
    return matches[0];
  });
  schema.push({name:'identity_stubs',columns:[{name:'id',type:'uuid',nullable:false}],constraints:[{kind:'p',name:'identity_stubs_pkey',columns:['id']}]});
  const definition = new Map(schema.map(t=>[t.name,t]));
  const qualified = name => `public.${identifier(name)}`;
  const columns = (table, names) => {
    if (!Array.isArray(names) || !names.length || names.some(n=>!table.columns.some(c=>c.name===n))) throw new Error('Invalid constraint columns');
    return names.map(identifier).join(',');
  };
  // Always a brand-new, in-memory PostgreSQL instance; no connection URL or disk target exists.
  const db = await createDatabase();
  try {
    await db.exec(`SET TIME ZONE 'UTC'; SET DateStyle = 'ISO, YMD';`);
    for (const t of schema) {
      if (!Array.isArray(t.columns) || !t.columns.length || new Set(t.columns.map(c=>c.name)).size !== t.columns.length) throw new Error('Invalid columns');
      await db.exec(`CREATE TABLE ${qualified(t.name)} (${t.columns.map(c=>`${identifier(c.name)} ${columnType(c.type)}${c.nullable === false?' NOT NULL':''}`).join(',')})`);
    }
    for (const data of backup.tables) {
      if (!Number.isSafeInteger(data.count) || data.count < 0 || typeof data.rows_json !== 'string' || !/^[a-f0-9]{64}$/.test(data.sha256)) throw new Error('Invalid table payload');
      // PostgreSQL parses numeric values directly: JS never rounds bigint/decimal row data.
      const t = definition.get(data.name);
      await db.query(`INSERT INTO ${qualified(data.name)} SELECT * FROM jsonb_populate_recordset(NULL::${qualified(data.name)},$1::jsonb)`, [data.rows_json]);
      const result = (await db.query(`SELECT count(*)::int AS count, encode(sha256(convert_to(coalesce(string_agg(to_jsonb(r)::text,E'\n' ORDER BY to_jsonb(r)::text COLLATE "C"),''),'UTF8')),'hex') AS sha256 FROM ${qualified(t.name)} r`)).rows[0];
      if (result.count !== data.count || result.sha256 !== data.sha256) throw new Error(`Content/count mismatch: ${data.name}`);
    }
    let keys = 0; let relationships = 0; let checksExcluded = 0;
    for (const t of schema) {
      for (const c of t.constraints) {
        if (c.kind === 'p' || c.kind === 'u') {
          await db.exec(`ALTER TABLE ${qualified(t.name)} ADD ${c.kind === 'p'?'PRIMARY KEY':'UNIQUE'} (${columns(t,c.columns)})`);
          keys++;
        } else if (c.kind !== 'f') checksExcluded++;
      }
    }
    for (const t of schema) {
      for (const c of t.constraints.filter(c=>c.kind==='f')) {
        const parentName = c.parent_schema === 'auth' && c.parent_table === 'users' ? 'identity_stubs' : c.parent_schema === 'public' ? c.parent_table : null;
        const parent = definition.get(parentName);
        if (!parent) throw new Error(`Missing relationship parent for ${t.name}`);
        if (c.columns.length !== c.parent_columns?.length) throw new Error('Invalid relationship arity');
        // Composite referenced uniqueness can be a live index instead of pg_constraint.
        await db.exec(`CREATE UNIQUE INDEX ON ${qualified(parentName)} (${columns(parent,c.parent_columns)})`);
        await db.exec(`ALTER TABLE ${qualified(t.name)} ADD FOREIGN KEY (${columns(t,c.columns)}) REFERENCES ${qualified(parentName)} (${columns(parent,c.parent_columns)})`);
        relationships++;
      }
    }
    return {status:'passed',format:backup.format,exportedAt:backup.exported_at,
      engine:(await db.query('SELECT version() AS version')).rows[0].version,
      tables:backup.tables.map(t=>({name:t.name,rows:t.count,sha256:t.sha256})),
      totalRows:backup.tables.reduce((n,t)=>n+t.count,0),keys,relationships,
      excludedChecks:checksExcluded,
      limits:['Data/relationship rehearsal only; no production writes.', 'Identity UUID stubs do not restore logins.',
        'RLS, SQL functions, triggers, CHECK expressions and indexes outside referenced keys are not restored or certified.',
        'Storage object bytes, billing/operational tables, integrations/secrets and unsent device drafts are excluded.']};
  } finally { await db.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [backupPath, reportPath] = process.argv.slice(2);
  if (!backupPath || !reportPath || process.argv.length !== 4) throw new Error('Usage: node scripts/verify-household-restore.mjs backup.json report.json (no remote targets)');
  const { PGlite } = await import(process.env.PGLITE_MODULE ? pathToFileURL(process.env.PGLITE_MODULE).href : '@electric-sql/pglite');
  const report = await verifyBackup(JSON.parse(await readFile(backupPath,'utf8')), () => new PGlite());
  await writeFile(reportPath, JSON.stringify(report,null,2)+'\n', {flag:'wx',mode:0o600});
  console.log(`Isolated restore passed: ${report.totalRows} rows, ${report.relationships} foreign keys. Report saved.`);
}
