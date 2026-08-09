import { getDb, dbAll } from './src/database/db.js';
console.log(dbAll('SELECT * FROM agents;'));
