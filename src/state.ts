import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Reply } from './protocol.js';
export class State {
  readonly db: DatabaseSync;
  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), {recursive: true, mode: 0o700});
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=1000;
      CREATE TABLE IF NOT EXISTS tasks(id TEXT PRIMARY KEY, digest TEXT NOT NULL, reply TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS refs(ref TEXT PRIMARY KEY, task TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS audit(task TEXT PRIMARY KEY, evidence TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS nonces(nonce TEXT PRIMARY KEY, expires INTEGER NOT NULL);`);
  }
  claim(id: string, digest: string, ref: string): {kind: 'new'|'reused'} | {kind:'cached', reply: Reply} | {kind:'conflict'} {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const prior = this.db.prepare('SELECT digest,reply FROM tasks WHERE id=?').get(id) as {digest:string,reply:string}|undefined;
      if (prior) {
        this.db.exec('COMMIT');
        return prior.digest === digest ? {kind:'cached',reply:JSON.parse(prior.reply) as Reply} : {kind:'conflict'};
      }
      const exists = this.db.prepare('SELECT task FROM refs WHERE ref=?').get(ref.toLowerCase());
      this.db.prepare('INSERT INTO tasks VALUES(?,?,?)').run(id,digest,JSON.stringify({decision:'REJECT',reason_code:'INCOMPLETE_TASK'}));
      if (!exists) this.db.prepare('INSERT INTO refs VALUES(?,?)').run(ref.toLowerCase(),id);
      this.db.exec('COMMIT');
      return {kind: exists ? 'reused' : 'new'};
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  save(id: string, reply: Reply) { this.db.prepare('UPDATE tasks SET reply=? WHERE id=?').run(JSON.stringify(reply),id); }
  audit(id: string, evidence: unknown) { this.db.prepare('INSERT OR REPLACE INTO audit VALUES(?,?)').run(id,JSON.stringify(evidence)); }
  nonce(value: string): boolean {
    this.db.prepare('DELETE FROM nonces WHERE expires < ?').run(Date.now());
    return this.db.prepare('INSERT OR IGNORE INTO nonces VALUES(?,?)').run(value,Date.now()+120000).changes === 1;
  }
  close() {this.db.close();}
}
