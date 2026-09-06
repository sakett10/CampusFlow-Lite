const pg = require('pg');
require('dotenv').config();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

async function migrate() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS notification_dismissals (
        user_id TEXT NOT NULL,
        notification_id TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, notification_id)
      );

      CREATE INDEX IF NOT EXISTS idx_notification_dismissals_user_id
      ON notification_dismissals(user_id);
    `);

    console.log('Notification dismissals schema created successfully.');
  } catch (error) {
    console.error('Notification dismissals migration failed:', error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

migrate();
