import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';

const profile = process.argv[2] || path.join(process.env.LOCALAPPDATA, 'Microsoft', 'Edge', 'User Data', 'Default');
const dbPath = path.join(profile, 'Network', 'Cookies');
const db = new DatabaseSync(dbPath, { readOnly: true });
const rows = db.prepare(`
  SELECT host_key, name
  FROM cookies
  WHERE host_key LIKE '%github%' OR host_key LIKE '%cloudflare%' OR host_key LIKE '%workers.dev%'
  ORDER BY host_key, name
`).all();
console.log(JSON.stringify({ dbPath, count: rows.length, rows }, null, 2));
db.close();
