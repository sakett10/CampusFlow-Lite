const pg = require('pg');
require('dotenv').config();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

async function check() {
  try {
    const c = await pool.query("SELECT table_name, column_name, data_type, is_nullable FROM information_schema.columns WHERE column_name = 'user_id' AND table_name IN ('courses', 'assignments', 'campus_items');");
    console.log('Columns:');
    console.table(c.rows);
    
    const i = await pool.query("SELECT tablename, indexname FROM pg_indexes WHERE indexname IN ('idx_courses_user_id', 'idx_assignments_user_id', 'idx_campus_items_user_id');");
    console.log('Indexes:');
    console.table(i.rows);
    
    const fk = await pool.query("SELECT tc.table_name, kcu.column_name, ccu.table_name AS foreign_table_name, ccu.column_name AS foreign_column_name, rc.delete_rule FROM information_schema.table_constraints AS tc JOIN information_schema.key_column_usage AS kcu ON tc.constraint_name = kcu.constraint_name JOIN information_schema.referential_constraints AS rc ON tc.constraint_name = rc.constraint_name JOIN information_schema.constraint_column_usage AS ccu ON ccu.constraint_name = tc.constraint_name WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_name='assignments';");
    console.log('Foreign Keys:');
    console.table(fk.rows);
  } finally {
    pool.end();
  }
}
check();
