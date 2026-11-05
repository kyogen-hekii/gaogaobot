import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
export const now = () => new Date().toISOString();
export const id = (prefix='') => `${prefix}${randomUUID()}`;
export const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export class AppError extends Error {
  constructor(message, status=400, code='INVALID') { super(message); this.status=status; this.code=code; }
}
export function assert(value, message, status=400, code='INVALID') { if (!value) throw new AppError(message,status,code); }
export function text(value, name, max=12000, required=true) {
  assert(typeof value==='string' && value.length<=max && (!required || value.trim()), `${name}を確認してください（最大${max}文字）。`);
  return value.trim();
}
export class Store {
  constructor(path) {
    if(path!==':memory:') mkdirSync(dirname(path), {recursive:true,mode:0o700});
    this.db=new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS entities(kind TEXT NOT NULL,id TEXT NOT NULL,data TEXT NOT NULL,PRIMARY KEY(kind,id));
      CREATE TABLE IF NOT EXISTS events(seq INTEGER PRIMARY KEY AUTOINCREMENT,at TEXT NOT NULL,type TEXT NOT NULL,work_id TEXT,data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS dedup(key TEXT PRIMARY KEY,hash TEXT NOT NULL,result TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);`);
    this.inTx=false;
  }
  transaction(fn) {
    if(this.inTx) return fn();
    this.db.exec('BEGIN IMMEDIATE'); this.inTx=true;
    try { const result=fn(); this.db.exec('COMMIT'); return result; }
    catch(e){this.db.exec('ROLLBACK');throw e;} finally {this.inTx=false;}
  }
  get(kind,key) { const r=this.db.prepare('SELECT data FROM entities WHERE kind=? AND id=?').get(kind,key); return r?JSON.parse(r.data):null; }
  must(kind,key) {const v=this.get(kind,key);assert(v,'対象が見つかりません。',404,'NOT_FOUND');return v;}
  list(kind) { return this.db.prepare('SELECT data FROM entities WHERE kind=? ORDER BY rowid').all(kind).map(x=>JSON.parse(x.data)); }
  put(kind,obj) { assert(obj.id,'IDがありません。'); this.db.prepare('INSERT INTO entities VALUES(?,?,?) ON CONFLICT(kind,id) DO UPDATE SET data=excluded.data').run(kind,obj.id,JSON.stringify(obj)); return obj; }
  remove(kind,key){this.db.prepare('DELETE FROM entities WHERE kind=? AND id=?').run(kind,key);}
  meta(key,value) { if(arguments.length===1){const r=this.db.prepare('SELECT value FROM meta WHERE key=?').get(key);return r?JSON.parse(r.value):null;} this.db.prepare('INSERT INTO meta VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,JSON.stringify(value));return value; }
  event(type, data={}, workId=null) { const at=now();const r=this.db.prepare('INSERT INTO events(at,type,work_id,data) VALUES(?,?,?,?)').run(at,type,workId,JSON.stringify(data));return {seq:Number(r.lastInsertRowid),at,type,workId,...data}; }
  events(after=0,limit=300) {return this.db.prepare('SELECT * FROM events WHERE seq>? ORDER BY seq DESC LIMIT ?').all(after,limit).reverse().map(x=>({seq:x.seq,at:x.at,type:x.type,workId:x.work_id,...JSON.parse(x.data)}));}
  once(key,body,fn) {
    return this.transaction(()=>{const h=hash(body);const row=this.db.prepare('SELECT * FROM dedup WHERE key=?').get(key);
      if(row){assert(row.hash===h,'同じ操作IDで内容が変わっています。',409,'IDEMPOTENCY_CONFLICT');return JSON.parse(row.result);}
      const result=fn();this.db.prepare('INSERT INTO dedup VALUES(?,?,?)').run(key,h,JSON.stringify(result));return result;});
  }
  close(){this.db.close();}
}
