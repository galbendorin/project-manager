/**
 * Import SD-WAN project data into your app
 * 
 * Usage:
 *   1. Open your app, create a new project called "SD-WAN Project Plan"
 *   2. Open the project, then look at the URL — it won't show the ID, so instead:
 *      Go to Supabase Dashboard → Table Editor → projects → find your new project → copy the 'id' value
 *   3. Paste the ID below where it says PROJECT_ID
 *   4. Run: node import_sdwan.js
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

// ---- PASTE YOUR PROJECT ID HERE ----
const PROJECT_ID = '4c400249-f691-4eca-becc-a8f11b1d6111';
// -------------------------------------

const supabase = createClient(
  'https://jbmcmtzizlckhgpogbev.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpibWNtdHppemxja2hncG9nYmV2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzMzc3NTMsImV4cCI6MjA4NjkxMzc1M30.fSTHfKwWRAdLvm0RJHs2-MloBrrMs6REmiZ1KTlB8aY'
);

async function importData() {
  if (PROJECT_ID === 'PASTE_PROJECT_ID_HERE') {
    console.error('❌ Please paste your project ID in the script first!');
    console.log('\nTo find it:');
    console.log('1. Go to https://supabase.com/dashboard → your project');
    console.log('2. Click "Table Editor" → "projects"');
    console.log('3. Find your new project row and copy the "id" column value');
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync('./sdwan_project_data.json', 'utf8'));

  console.log('📦 Importing data...');
  console.log(`   Tasks: ${data.tasks.length}`);
  console.log(`   Risks: ${data.registers.risks.length}`);
  console.log(`   Issues: ${data.registers.issues.length}`);
  console.log(`   Actions: ${data.registers.actions.length}`);
  console.log(`   Changes: ${data.registers.changes.length}`);
  console.log(`   Comms: ${data.registers.comms.length}`);

  const { error } = await supabase
    .from('projects')
    .update({
      tasks: data.tasks,
      registers: data.registers,
      updated_at: new Date().toISOString()
    })
    .eq('id', PROJECT_ID);

  if (error) {
    console.error('❌ Import failed:', error.message);
  } else {
    console.log('✅ Import successful! Refresh your app to see the data.');
  }
}

importData();
