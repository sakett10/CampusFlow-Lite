const pg = require('pg');
require('dotenv').config();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // 1. Row counts before
    const cBefore = await client.query('SELECT count(*) FROM courses');
    const aBefore = await client.query('SELECT count(*) FROM assignments');
    const iBefore = await client.query('SELECT count(*) FROM campus_items');
    
    console.log('--- Before Migration ---');
    console.log('Courses:', cBefore.rows[0].count);
    console.log('Assignments:', aBefore.rows[0].count);
    console.log('Campus Items:', iBefore.rows[0].count);

    // 2. Add column user_id TEXT
    // Idempotent column addition
    await client.query(`ALTER TABLE courses ADD COLUMN IF NOT EXISTS user_id TEXT;`);
    await client.query(`ALTER TABLE assignments ADD COLUMN IF NOT EXISTS user_id TEXT;`);
    await client.query(`ALTER TABLE campus_items ADD COLUMN IF NOT EXISTS user_id TEXT;`);

    // 3. Update existing records
    await client.query(`UPDATE courses SET user_id = 'legacy_system_user' WHERE user_id IS NULL;`);
    await client.query(`UPDATE assignments SET user_id = 'legacy_system_user' WHERE user_id IS NULL;`);
    await client.query(`UPDATE campus_items SET user_id = 'legacy_system_user' WHERE user_id IS NULL;`);

    // 4. Set NOT NULL constraint
    await client.query(`ALTER TABLE courses ALTER COLUMN user_id SET NOT NULL;`);
    await client.query(`ALTER TABLE assignments ALTER COLUMN user_id SET NOT NULL;`);
    await client.query(`ALTER TABLE campus_items ALTER COLUMN user_id SET NOT NULL;`);

    // 5. Create indexes
    await client.query(`CREATE INDEX IF NOT EXISTS idx_courses_user_id ON courses(user_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_assignments_user_id ON assignments(user_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_campus_items_user_id ON campus_items(user_id);`);

    await client.query('COMMIT');
    
    // 6. Row counts after
    const cAfter = await client.query('SELECT count(*) FROM courses');
    const aAfter = await client.query('SELECT count(*) FROM assignments');
    const iAfter = await client.query('SELECT count(*) FROM campus_items');
    
    console.log('--- After Migration ---');
    console.log('Courses:', cAfter.rows[0].count);
    console.log('Assignments:', aAfter.rows[0].count);
    console.log('Campus Items:', iAfter.rows[0].count);
    
    console.log('Migration completed successfully.');

  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', e);
  } finally {
    client.release();
    pool.end();
  }
}

migrate();
