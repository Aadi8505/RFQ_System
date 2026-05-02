require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function checkDB() {
  try {
    const tables = await pool.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`
    );
    console.log('\n📋 Tables in DB:');
    if (tables.rows.length === 0) {
      console.log('  (none)');
    } else {
      tables.rows.forEach(r => console.log(' -', r.table_name));
    }

    const hasUsers = tables.rows.some(r => r.table_name === 'users');
    if (hasUsers) {
      const users = await pool.query(
        'SELECT id, name, email, role, is_active, created_at FROM users ORDER BY id'
      );
      console.log(`\n👥 users table EXISTS — ${users.rows.length} row(s):`);
      users.rows.forEach(u => {
        console.log(`  [${u.id}] ${u.name} | ${u.email} | role: ${u.role} | active: ${u.is_active}`);
      });
    } else {
      console.log('\n❌ users table does NOT exist yet.');
    }
  } catch (err) {
    console.error('DB Error:', err.message);
  } finally {
    await pool.end();
  }
}

checkDB();
