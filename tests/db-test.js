/**
 * Quick DB test to verify SQLite works correctly
 */
import { getDb, dbGet, dbRun } from '../src/database/db.js';

try {
  const db = getDb();
  console.log('✓ Database connected:', db.name);
  
  const agentCount = dbGet('SELECT COUNT(*) as c FROM agents');
  console.log('✓ Agents table OK, count:', agentCount.c);
  
  const postsCount = dbGet('SELECT COUNT(*) as c FROM posts');
  console.log('✓ Posts table OK, count:', postsCount.c);
  
  const editorialCount = dbGet('SELECT COUNT(*) as c FROM editorial_log');
  console.log('✓ Editorial log OK, count:', editorialCount.c);
  
  console.log('\n✓ All SQLite checks passed. Database is ready.\n');
  process.exit(0);
} catch (e) {
  console.error('✗ DB ERROR:', e.message);
  process.exit(1);
}
