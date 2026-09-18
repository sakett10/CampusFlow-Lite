// Adds a partial unique index so one user can never create two tasks from the same notice.
// This is the database-level idempotency guard for POST /api/notices/:id/convert-to-task:
// two concurrent conversions serialize on the notices FOR UPDATE lock, and if the app-level
// duplicate SELECT is ever bypassed, the unique violation (23505) keeps the task count at one.
// Safe for existing data: verified production currently has zero duplicate
// (user_id, source, source_id) groups among source='notice' rows (read-only check).
// Idempotent: safe to run multiple times.
const pg = require('pg');
require('dotenv').config();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

async function migrateAssignmentsUserNoticeUnique() {
  const client = await pool.connect();
  try {
    console.log('--- Adding unique per-user notice-conversion index on assignments ---');

    // Fail loudly (before touching anything) if pre-existing duplicates would make the index impossible.
    const { rows } = await client.query(
      `SELECT user_id, source_id, COUNT(*) AS n
       FROM assignments
       WHERE source = 'notice' AND source_id IS NOT NULL
       GROUP BY user_id, source_id
       HAVING COUNT(*) > 1
       LIMIT 5`,
    );
    if (rows.length > 0) {
      console.error('Cannot create unique index: duplicate per-user notice tasks exist:');
      for (const r of rows) console.error(`  user_id=${r.user_id} source_id=${r.source_id} count=${r.n}`);
      process.exitCode = 1;
      return;
    }

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS assignments_user_notice_unique
        ON assignments (user_id, source, source_id)
        WHERE source = 'notice';
    `);

    console.log('✅ Unique index assignments_user_notice_unique is in place.');
  } catch (err) {
    console.error('Migration failed:', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

migrateAssignmentsUserNoticeUnique();
