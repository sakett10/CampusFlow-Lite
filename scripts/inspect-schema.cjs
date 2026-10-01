const pg = require('pg');
require('dotenv').config();

const client = new pg.Client({ connectionString: process.env.DATABASE_URL.replace('-pooler.', '.') });

async function inspect() {
  await client.connect();

  const ciCols = await client.query(`
    SELECT column_name, data_type, is_nullable 
    FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'campus_items' 
    ORDER BY ordinal_position
  `);
  console.log('\n=== 1. CAMPUS_ITEMS COLUMNS (' + ciCols.rows.length + ') ===');
  ciCols.rows.forEach(r => console.log(`  - ${r.column_name} (${r.data_type}, nullable: ${r.is_nullable})`));

  const aCols = await client.query(`
    SELECT column_name, data_type, column_default, is_nullable 
    FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'assignments' 
    ORDER BY ordinal_position
  `);
  console.log('\n=== 2. ASSIGNMENTS COLUMNS (' + aCols.rows.length + ') ===');
  aCols.rows.forEach(r => console.log(`  - ${r.column_name} (${r.data_type}, default: ${r.column_default || 'none'}, nullable: ${r.is_nullable})`));

  console.log('\n=== 3. NOTICES SOURCE_TYPE COLUMN ===');
  const nCols = await client.query(`
    SELECT column_name, data_type, column_default, is_nullable 
    FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'notices' AND column_name = 'source_type'
  `);
  console.table(nCols.rows);

  console.log('\n=== 4. NOTICES CONSTRAINTS ===');
  const nCons = await client.query(`
    SELECT constraint_name, check_clause 
    FROM information_schema.check_constraints 
    WHERE constraint_name = 'notices_source_type_check'
  `);
  console.table(nCons.rows);

  console.log('\n=== 5. NOTICES INDEXES ===');
  const nIdx = await client.query(`
    SELECT indexname, indexdef 
    FROM pg_indexes 
    WHERE schemaname = 'public' AND tablename = 'notices'
    ORDER BY indexname
  `);
  console.table(nIdx.rows);

  await client.end();
}

inspect().catch(err => {
  console.error(err);
  process.exit(1);
});
