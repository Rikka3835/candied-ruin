import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';

const dbPath = path.join(process.env.LOCALAPPDATA, 'Microsoft', 'Edge', 'User Data', 'Default', 'Network', 'Cookies');
const db = new DatabaseSync(dbPath, { readOnly: true });
const rows = db.prepare(`
  SELECT host_key, name, length(encrypted_value) AS bytes,
         datetime((expires_utc / 1000000) - 11644473600, 'unixepoch') AS expires_utc,
         is_secure, is_httponly
  FROM cookies
  WHERE host_key LIKE '%github%' OR host_key LIKE '%cloudflare%'
  ORDER BY host_key, name
`).all();
console.log(JSON.stringify(rows, null, 2));
db.close();
