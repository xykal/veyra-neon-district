// GPS kota: cari tempat (POI), bikin rute jalan, marker tujuan 3D, dan rute di minimap.
import * as THREE from './vendor/three.module.js';
import { routeBetween } from '../shared/map.js';

const SYNONYMS = {
  bank: ['bank', 'uang', 'atm', 'tabungan', 'bengkel'],
  hospital: ['rs', 'rumah sakit', 'sakit', 'hospital', 'puskesmas', 'klinik', 'medis', 'dokter'],
  police: ['polisi', 'kantor polisi', 'pos', 'map', 'keamanan'],
  hotel: ['hotel', 'menginap', 'penginapan', 'stay'],
  cafe: ['kafe', 'kopi', 'cafe', 'coffee', 'minum'],
  resto: ['resto', 'restoran', 'warung', 'makan', 'food', 'jajan'],
  market: ['pasar', 'market', 'belanja', 'supermarket', 'toko'],
  gas: ['spbu', 'gas', 'bensin', 'pertamina', 'pom', 'isiPertamax'],
  park: ['taman', 'park', 'hijau', 'taman kota'],
  kantor: ['kantor', 'wali kota', 'gedung', 'pemprov', 'kota'],
  sekolah: ['sekolah', 'smp', 'sma', 'sd', 'pendidikan', 'kampus'],
  gudang: ['gudang', 'warehouse', 'logistik', 'kargo'],
  bengkel: ['bengkel', 'montir', 'oli', 'tukang', 'bengkel mobil'],
};

const TYPE_LABEL = {
  bank: 'Bank',
  hospital: 'Rumah Sakit',
  police: 'Polisi',
  hotel: 'Hotel',
  cafe: 'Kafe',
  resto: 'Restoran',
  market: 'Pasar',
  gas: 'Pompa Bensin',
  park: 'Taman',
  kantor: 'Kantor',
  sekolah: 'Sekolah',
  gudang: 'Gudang',
  bengkel: 'Bengkel',
};

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export class Gps {
  constructor(scene, minimap) {
    this.scene = scene;
    this.minimap = minimap;
    this.pois = [];
    this.routeTimer = 0; this.lastRoutePos = null;
    this.dest = null;      // {poi, route:{points,length}}
    this.marker = null;
    this.line = null;
    this.map = null;
    this.panel = document.getElementById('gpspanel');
    this.search = document.getElementById('gpssearch');
    this.list = document.getElementById('gpslist');
    this.info = document.getElementById('gpsinfo');
    this.hud = document.getElementById('gpshud');
    if (this.search) {
      this.search.addEventListener('input', () => this.renderList(this.search.value));
      this.search.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Escape') { this.close(); }
        if (e.key === 'Enter') {
          const first = this.list.querySelector('.poi');
          if (first) first.click();
        }
      });
    }
  }

  setMap(map) {
    this.map = map;
    this.pois = map.pois || [];
  }

  get isOpen() {
    return this.panel && !this.panel.classList.contains('hidden');
  }

  toggle() {
    if (!this.panel) return;
    if (this.isOpen) this.close();
    else this.open();
  }

  open() {
    if (!this.panel) return;
    this.panel.classList.remove('hidden');
    this.renderList(this.search ? this.search.value : '');
    this.search?.focus();
  }

  close() {
    this.search?.blur();
    this.panel?.classList.add('hidden');
  }

  /** Filter POI berdasarkan kata kunci + sinonim. */
  matches(poi, q) {
    if (!q) return true;
    const hay = (poi.name + ' ' + poi.type + ' ' + (TYPE_LABEL[poi.type] || '')).toLowerCase();
    if (hay.includes(q)) return true;
    const syn = SYNONYMS[poi.type] || [];
    return syn.some((s) => s.includes(q) || q.includes(s));
  }

  renderList(q = '') {
    if (!this.list) return;
    const query = q.trim().toLowerCase();
    const rows = this.pois.filter((p) => this.matches(p, query)).slice(0, 24);
    if (!rows.length) {
      this.list.innerHTML = '<div class="poiempty">Tempat ga ketemu. Coba: bank, rs, pasar, taman, spbu, hotel...</div>';
      return;
    }
    this.list.innerHTML = rows.map((p) => {
      const d = this.dest && this.dest.poi.id === p.id;
      return `<div class="poi${d ? ' active' : ''}" data-id="${p.id}">
        <span class="poi-type">${esc(TYPE_LABEL[p.poiType] || TYPE_LABEL[p.type] || p.type)}</span>
        <span class="poi-name">${esc(p.name)}</span>
      </div>`;
    }).join('');
    for (const el of this.list.querySelectorAll('.poi')) {
      el.addEventListener('click', () => {
        const poi = this.pois.find((p) => String(p.id) === el.dataset.id);
        if (poi) this.setDestination(poi);
      });
    }
  }

  /** Set tujuan: bikin rute + marker 3D + rute minimap. */
  setDestination(poi) {
    if (!this.map || !poi) return;
    const route = routeBetween(this.map, this.playerPos || poi, poi);
    this.dest = { poi, route };
    this.lastRoutePos = null; this.routeTimer = .5;
    this.close();
    this.buildMarker(poi);
    this.buildLine(route.points);
    this.minimap?.setRoute(route.points);
    this.updateInfo();
  }

  clear() {
    this.dest = null;
    if (this.marker) this.marker.visible = false;
    if (this.line) this.line.visible = false;
    this.minimap?.setRoute(null);
    if (this.hud) this.hud.classList.add('hidden');
    if (this.info) this.info.textContent = 'Belum ada tujuan. Pilih tempat di daftar.';
  }

  buildMarker(poi) {
    if (!this.marker) {
      const g = new THREE.Group();
      const ring = new THREE.Mesh(
        new THREE.CylinderGeometry(24, 24, 3, 24),
        new THREE.MeshBasicMaterial({ color: 0x4fc3f7, transparent: true, opacity: 0.9 })
      );
      ring.position.y = 2;
      const beam = new THREE.Mesh(
        new THREE.CylinderGeometry(20, 24, 80, 18, 1, true),
        new THREE.MeshBasicMaterial({ color: 0x4fc3f7, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false })
      );
      beam.position.y = 40;
      const pin = new THREE.Mesh(
        new THREE.ConeGeometry(9, 16, 10),
        new THREE.MeshBasicMaterial({ color: 0x4fc3f7 })
      );
      pin.position.y = 58;
      pin.rotation.x = Math.PI;
      g.add(ring, beam, pin);
      g.visible = false;
      this.scene.add(g);
      this.marker = g;
    }
    this.marker.position.set(poi.x, 0, poi.y);
    this.marker.visible = true;
  }

  buildLine(points) {
    if (!this.line) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position',new THREE.BufferAttribute(new Float32Array(64*3),3));
      this.line = new THREE.Line(geo,new THREE.LineBasicMaterial({color:0x4fc3f7,transparent:true,opacity:.9}));
      this.scene.add(this.line);
    }
    const attr=this.line.geometry.attributes.position, n=Math.min(64,points.length);
    for(let i=0;i<n;i++) attr.setXYZ(i,points[i].x,2.5,points[i].y);
    this.line.geometry.setDrawRange(0,n);attr.needsUpdate=true;
    this.line.geometry.computeBoundingSphere();this.line.visible=n>1;
  }

  updateInfo() {
    if (!this.info) return;
    if (!this.dest) { this.info.textContent = 'Belum ada tujuan. Pilih tempat di daftar.'; return; }
    const m = Math.round(this.dest.route.length / 10);
    this.info.innerHTML = `Tujuan: <b>${esc(this.dest.poi.name)}</b> (${esc(TYPE_LABEL[this.dest.poi.type] || this.dest.poi.type)})<br>Jarak rute: <b>${m} m</b>`;
  }

  /** Dipanggil tiap frame: perbarui marker, rute, dan info jarak. */
  update(dt, player) {
    if (player) this.playerPos = { x: player.x, y: player.y };
    if (!this.dest) return;
    if (this.marker) {
      this.marker.rotation.y += dt * 1.2;
      const p = 1 + Math.sin(performance.now() / 300) * 0.07;
      this.marker.scale.set(p, 1, p);
    }
    this.routeTimer += dt;
    // Re-route at most twice a second and only after actually moving. Reuse GPU buffers.
    if (this.playerPos && this.routeTimer >= .5 && (!this.lastRoutePos || Math.hypot(this.playerPos.x-this.lastRoutePos.x,this.playerPos.y-this.lastRoutePos.y)>15)) {
      this.routeTimer=0; this.lastRoutePos={...this.playerPos};
      const r = routeBetween(this.map, this.playerPos, this.dest.poi);
      this.dest.route = r;
      this.buildLine(r.points);
      this.minimap?.setRoute(r.points);
    }
    if (this.hud) {
      this.hud.classList.remove('hidden');
      const m = Math.round(this.dest.route.length / 10);
      const arrived = this.playerPos && Math.hypot(this.playerPos.x-this.dest.poi.x,this.playerPos.y-this.dest.poi.y)<38;
      const status=this.dest.route.unreachable?'Cari akses ke jalan':arrived?'Tiba di tujuan':`${m} m`;
      const text=`GPS · ${this.dest.poi.name} · ${status}`;
      if(this.hud.textContent!==text)this.hud.textContent=text;
    }
  }
}
