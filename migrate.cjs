const pg = require('pg');
require('dotenv').config();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

const createTables = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS courses (
        id UUID PRIMARY KEY,
        code TEXT NOT NULL,
        title TEXT NOT NULL,
        instructor TEXT NOT NULL,
        credits INTEGER NOT NULL DEFAULT 3,
        attended_classes INTEGER NOT NULL DEFAULT 0,
        total_classes INTEGER NOT NULL DEFAULT 0,
        attendance_threshold INTEGER NOT NULL DEFAULT 75,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS assignments (
        id UUID PRIMARY KEY,
        course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        description TEXT,
        due_date TEXT,
        status TEXT NOT NULL CHECK (status IN ('PENDING', 'IN_PROGRESS', 'COMPLETED')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('Schema created successfully.');
  } catch (err) {
    console.error('Error creating schema:', err);
  } finally {
    pool.end();
  }
};

createTables();
