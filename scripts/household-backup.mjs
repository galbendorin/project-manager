import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export const excludedTables = ['ai_generation_reservations', 'api_rate_limits', 'billing_checkout_sessions',
  'meal_ingredient_calorie_cache', 'push_subscriptions', 'user_profiles'];
export const coveredTables = `baby_feed_entries baby_nappy_entries baby_profiles baby_sleep_blocks baby_weight_entries
finance_actual_entries finance_balance_snapshots finance_budget_items finance_categories finance_goals
finance_household_members finance_month_reconciliation_lines finance_month_reconciliations finance_mortgages
finance_profiles finance_scenario_changes finance_scenarios habit_entries habit_items habit_reminders
manual_todos meal_library_ingredients meal_library_meals meal_plan_entries meal_plan_grocery_batches
meal_plan_weeks profiles project_member_invites project_members projects shopping_contribution_intents
shopping_contributions shopping_list_operation_receipts task_board_cards task_board_columns
task_card_checklist_items task_card_checklists task_eisenhower_preferences time_entries weekly_timesheet_entries weekly_timesheets
weight_entries weight_tracker_settings`.split(/\s+/);

export function identifier(value) {
  if (typeof value !== 'string' || !/^[a-z][a-z0-9_]{0,62}$/.test(value)) throw new Error('Invalid SQL identifier');
  return `"${value}"`;
}
export function columnType(value) {
  if (!/^(uuid|text|boolean|smallint|integer|bigint|real|double precision|jsonb|date|timestamp (with|without) time zone|time without time zone|numeric(\([1-9][0-9]{0,3},[0-9]{1,4}\))?)(\[\])?$/.test(value)) {
    throw new Error(`Unsupported backup column type: ${value}`);
  }
  return value;
}
export const inventoryQuery = `SELECT jsonb_agg(jsonb_build_object('name',c.relname,
 'columns',(SELECT jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'nullable',not a.attnotnull) ORDER BY a.attnum)
 FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped),
 'constraints',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',con.conname,'kind',con.contype,
 'columns',(SELECT jsonb_agg(a.attname ORDER BY k.ord) FROM unnest(con.conkey) WITH ORDINALITY k(num,ord) JOIN pg_attribute a ON a.attrelid=con.conrelid AND a.attnum=k.num),
 'parent_schema',pn.nspname,'parent_table',pc.relname,
 'parent_columns',(SELECT jsonb_agg(a.attname ORDER BY k.ord) FROM unnest(con.confkey) WITH ORDINALITY k(num,ord) JOIN pg_attribute a ON a.attrelid=con.confrelid AND a.attnum=k.num))), '[]'::jsonb)
 FROM pg_constraint con LEFT JOIN pg_class pc ON pc.oid=con.confrelid LEFT JOIN pg_namespace pn ON pn.oid=pc.relnamespace WHERE con.conrelid=c.oid)) ORDER BY c.relname)
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r'`;

export function scopeFor(table) {
  const cols = new Set(table.columns.map(c => c.name));
  const projects = '(SELECT id FROM selected_projects)';
  if (table.name === 'projects') return 'user_id = (SELECT owner_id FROM scope)';
  if (table.name === 'profiles') return 'id = (SELECT owner_id FROM scope)';
  if (table.name === 'task_eisenhower_preferences') return `user_id = (SELECT owner_id FROM scope) AND ((manual_todo_id IS NOT NULL AND manual_todo_id IN (SELECT id FROM selected_manual_todos)) OR (project_id IN ${projects}))`;
  if (table.name === 'meal_library_ingredients') return 'meal_id IN (SELECT id FROM selected_meal_library_meals)';
  if (table.name === 'shopping_contribution_intents') return 'operation_id IN (SELECT operation_id FROM selected_shopping_contributions)';
  if (table.name === 'weekly_timesheets') return `id IN (SELECT timesheet_id FROM selected_weekly_timesheet_entries) OR user_id = (SELECT owner_id FROM scope)`;
  for (const col of ['project_id', 'shopping_project_id', 'household_project_id']) {
    if (cols.has(col)) return `${identifier(col)} IN ${projects}${cols.has('user_id') ? ` OR (${identifier(col)} IS NULL AND user_id = (SELECT owner_id FROM scope))` : ''}`;
  }
  if (table.name === 'finance_household_members') return 'owner_user_id = (SELECT owner_id FROM scope)';
  if (cols.has('user_id')) return 'user_id = (SELECT owner_id FROM scope)';
  throw new Error(`No approved household scope for ${table.name}`);
}

// Metadata supplies only validated names/types. Never execute constraint definitions from a backup.
export function exportSql(schema, owner) {
  if (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(owner)) throw new Error('Expected an owner UUID');
  const tables = coveredTables.map(name => {
    const table = schema.tables.find(t => t.name === name);
    if (!table) throw new Error(`Missing live table ${name}; inventory before exporting`);
    table.columns.forEach(c => { identifier(c.name); columnType(c.type); });
    return table;
  });
  const selections = tables.map(t => `selected_${t.name} AS (SELECT * FROM public.${identifier(t.name)} WHERE ${scopeFor(t)})`);
  const ids = tables.flatMap(t => t.constraints.filter(c => c.kind === 'f' && c.parent_schema === 'auth' && c.parent_table === 'users')
    .flatMap(c => c.columns.map(col => `SELECT ${identifier(col)} AS id FROM selected_${t.name}`)));
  const rows = tables.map(t => `SELECT '${t.name}' AS name, to_jsonb(r) AS j FROM selected_${t.name} r`);
  rows.push(`SELECT 'identity_stubs', jsonb_build_object('id',id) FROM identity_ids WHERE id IS NOT NULL`);
  return `-- Read-only household export. Contains private data: keep downloaded results out of Git.\nBEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL TIME ZONE 'UTC'; SET LOCAL DateStyle = 'ISO, YMD';
WITH RECURSIVE scope AS (SELECT '${owner}'::uuid AS owner_id),
${selections.join(',\n')},
identity_ids AS (${ids.join('\nUNION\n')}),
export_rows AS (${rows.join('\nUNION ALL\n')}),
table_names AS (SELECT unnest(ARRAY[${[...coveredTables, 'identity_stubs'].map(t => `'${t}'`).join(',')}]) AS name),
payload AS (SELECT n.name, count(r.j) AS count,
 coalesce(jsonb_agg(r.j ORDER BY r.j::text COLLATE "C") FILTER (WHERE r.j IS NOT NULL), '[]'::jsonb)::text AS rows_json,
 encode(sha256(convert_to(coalesce(string_agg(r.j::text,E'\\n' ORDER BY r.j::text COLLATE "C"),''),'UTF8')),'hex') AS sha256
 FROM table_names n LEFT JOIN export_rows r ON r.name=n.name GROUP BY n.name)
SELECT jsonb_build_object('format','pmw-household-v2','exported_at',now(),'owner_id',(SELECT owner_id FROM scope),
 'scope_gaps',jsonb_build_object('timesheet_entries_outside_owned_projects',
 (SELECT count(*) FROM public.weekly_timesheet_entries e JOIN public.weekly_timesheets w ON w.id=e.timesheet_id
 WHERE w.user_id=(SELECT owner_id FROM scope) AND e.project_id NOT IN (SELECT id FROM selected_projects)),
 'matrix_preferences_outside_owned_scope',(SELECT count(*) FROM public.task_eisenhower_preferences m
 WHERE m.user_id=(SELECT owner_id FROM scope) AND m.id NOT IN (SELECT id FROM selected_task_eisenhower_preferences))),
 'schema',(${inventoryQuery}),
 'excluded_tables',to_jsonb(ARRAY[${excludedTables.map(t=>`'${t}'`).join(',')}]),
 'tables',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.name) FROM payload p)) AS household_backup;
COMMIT;\n`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv[2] === '--inventory' && process.argv.length === 4) {
    await writeFile(process.argv[3], `BEGIN READ ONLY; SELECT jsonb_build_object('tables',(${inventoryQuery})) AS inventory; COMMIT;\n`, {mode:0o600,flag:'wx'});
    console.log('Read-only inventory SQL written. Export the inventory object as schema.json.');
    process.exit(0);
  }
  const [schemaPath, owner, destination] = process.argv.slice(2);
  if (!schemaPath || !owner || !destination || process.argv.length !== 5) throw new Error('Usage: node scripts/household-backup.mjs schema.json OWNER_UUID export.sql');
  await writeFile(destination, exportSql(JSON.parse(await readFile(schemaPath, 'utf8')), owner), { mode: 0o600, flag: 'wx' });
  console.log('Read-only export SQL written. Run in Supabase SQL Editor; export the result as JSON.');
}
