import { ProfileModel } from './profile-model.js';
import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { dirname } from 'node:path';

export class Profiles extends ProfileModel {
  constructor(file) {
    super();
    this.file = file;
    try {
      const saved = JSON.parse(readFileSync(file, 'utf8'));
      for (const [key, row] of Object.entries(saved.profiles || {})) {
        if (/^[a-f0-9]{64}$/.test(key) && row && typeof row.name === 'string') this.rows.set(key, row);
      }
    } catch (e) {
      if (e.code !== 'ENOENT') throw new Error('Tidak bisa membaca progres; periksa file/izin dan pulihkan backup sebelum restart: '+e.message);
    }
  }
  save() {
    if (!this.dirty) return;
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = this.file + '.tmp';
    writeFileSync(tmp, JSON.stringify({ version: 1, profiles: Object.fromEntries(this.rows) }), { mode: 0o600 });
    renameSync(tmp, this.file);
    this.dirty = false;
  }
}
