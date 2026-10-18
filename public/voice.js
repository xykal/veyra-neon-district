// Opt-in WebRTC voice. Server relays signalling only; audio is peer-to-peer.
// A TURN relay is needed for some mobile/carrier/corporate networks (see docs/HOSTING.md).
export class Voice {
  constructor(send) {
    this.send = send;
    this.id = null; this.config = { iceServers: [] };
    this.stream = null; this.enabled = false; this.enabling = null;
    this.held = false; this.talking = false; this.generation = 0;
    this.peers = new Map(); this.roster = new Set(); this.speakers = new Map();
    this.onStatus = null; this.status = 'Mic off';
    addEventListener('pagehide', () => this.disable());
    addEventListener('blur', () => this.hold(false));
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.hold(false); });
  }
  statusText(s) { this.status = s; this.onStatus?.(s); }
  setContext(id, settings = {}) {
    this.disable(false); this.id = id;
    this.config = { iceServers: Array.isArray(settings.iceServers) ? settings.iceServers : [] };
  }
  async enable() {
    if (this.enabled) return true;
    if (this.enabling) return this.enabling;
    if (!this.id) { this.statusText('Voice hanya tersedia saat online.'); return false; }
    if (!isSecureContext || !navigator.mediaDevices?.getUserMedia || !globalThis.RTCPeerConnection) {
      this.statusText('Voice perlu HTTPS dan izin mikrofon.'); return false;
    }
    const generation = this.generation;
    this.statusText('Izinkan mikrofon…');
    this.enabling = (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio:{ echoCancellation:true, noiseSuppression:true, autoGainControl:true }, video:false });
        // User may release PTT, disable mic, leave, or reconnect while permission is pending.
        if (generation !== this.generation) { stream.getTracks().forEach(t => t.stop()); return false; }
        this.stream = stream; this.enabled = true;
        for (const track of stream.getAudioTracks()) {
          track.enabled = false;
          track.onended = () => { if (this.enabled) this.disable(); };
        }
        this.send({ t:'vsig', d:{ k:'join' } });
        this.statusText('Mic siap · tahan V / VOX');
        this.setTalking(this.held);
        this.syncPeers();
        return true;
      } catch (e) {
        if (generation === this.generation) this.statusText(e.name === 'NotAllowedError' ? 'Izin mikrofon ditolak. Aktifkan di browser.' : 'Mikrofon tidak tersedia.');
        return false;
      } finally {
        if (generation === this.generation) this.enabling = null;
      }
    })();
    return this.enabling;
  }
  hold(on) {
    this.held = !!on;
    if (!on) { this.setTalking(false); return; }
    if (this.enabled) this.setTalking(true);
    else void this.enable();
  }
  setTalking(on) {
    const active = !!on && this.enabled;
    for (const track of this.stream?.getAudioTracks() || []) track.enabled = active;
    if (active === this.talking) return;
    this.talking = active;
    if (this.id != null) this.speakers.set(this.id, active);
    this.send({ t:'vsig', d:{ k:'talk', on:active } });
  }
  disable(notify = true) {
    this.generation++; this.held = false; this.enabling = null;
    this.setTalking(false);
    if (this.enabled && notify) this.send({ t:'vsig', d:{ k:'leave' } });
    this.enabled = false;
    for (const p of this.peers.values()) { p.pc.close(); p.audio.remove(); }
    this.peers.clear(); this.roster.clear(); this.speakers.clear();
    this.stream?.getTracks().forEach(t => { t.onended = null; t.stop(); }); this.stream = null;
    this.statusText('Mic off');
  }
  peersChanged(ids) {
    this.roster = new Set(ids.filter(id => Number.isInteger(id) && id !== this.id));
    for (const [id, p] of this.peers) if (!this.roster.has(id)) { p.pc.close(); p.audio.remove(); this.peers.delete(id); this.speakers.delete(id); }
    this.syncPeers();
  }
  syncPeers() {
    if (!this.enabled) return;
    for (const id of this.roster) this.peer(id);
  }
  peer(id) {
    if (!this.enabled || id === this.id || !this.roster.has(id)) return null;
    if (this.peers.has(id)) return this.peers.get(id);
    const pc = new RTCPeerConnection(this.config);
    const audio = document.createElement('audio'); audio.autoplay = true; audio.setAttribute('playsinline', ''); audio.hidden = true;
    document.body.append(audio);
    const p = { pc, audio, queue:[], makingOffer:false, ignoreOffer:false, polite:this.id > id };
    this.peers.set(id, p);
    for (const track of this.stream.getAudioTracks()) pc.addTrack(track, this.stream);
    pc.onicecandidate = ({ candidate }) => { if (candidate) this.send({ t:'vsig', to:id, d:{ k:'ice', c:candidate.toJSON() } }); };
    pc.ontrack = ({ streams, track }) => {
      audio.srcObject = streams[0] || new MediaStream([track]);
      audio.play().catch(() => this.statusText('Ketuk VOX untuk membuka audio browser.'));
    };
    pc.onnegotiationneeded = async () => {
      // Lower ID initiates. Perfect-negotiation collision handling also protects reconnects.
      if (this.id > id && !pc.remoteDescription) return;
      try {
        p.makingOffer = true;
        await pc.setLocalDescription();
        this.send({ t:'vsig', to:id, d:{ k:pc.localDescription.type, sdp:pc.localDescription.sdp } });
      } catch { this.statusText('Negosiasi voice gagal; matikan/nyalakan mic.'); }
      finally { p.makingOffer = false; }
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') this.statusText('Voice diblokir jaringan; server perlu TURN.');
    };
    return p;
  }
  async handle(from, d) {
    if (!Number.isInteger(from) || from === this.id || !d) return;
    if (d.k === 'talk') { if (this.enabled) this.speakers.set(from, !!d.on); return; }
    const p = this.peer(from); if (!p) return;
    const pc = p.pc;
    try {
      if (d.k === 'offer' || d.k === 'answer') {
        const collision = d.k === 'offer' && (p.makingOffer || pc.signalingState !== 'stable');
        p.ignoreOffer = !p.polite && collision;
        if (p.ignoreOffer) return;
        await pc.setRemoteDescription({ type:d.k, sdp:d.sdp });
        for (const c of p.queue.splice(0)) await pc.addIceCandidate(c);
        if (d.k === 'offer') {
          await pc.setLocalDescription();
          this.send({ t:'vsig', to:from, d:{ k:pc.localDescription.type, sdp:pc.localDescription.sdp } });
        }
      } else if (d.k === 'ice' && !p.ignoreOffer) {
        if (pc.remoteDescription) await pc.addIceCandidate(d.c);
        else p.queue.push(d.c);
      }
    } catch { if (!p.ignoreOffer && this.enabled) this.statusText('Voice belum terhubung; cek HTTPS / TURN.'); }
  }
  // Spatial volume runs locally; audio is not recorded or sent through the game server.
  update(players, me) {
    if (!me || !this.enabled) return;
    for (const [id, p] of this.peers) {
      const remote = players.get(id);
      const d = remote ? Math.hypot(remote.x - me.x, remote.y - me.y) : Infinity;
      p.audio.volume = d < 900 ? Math.max(0, 1 - d / 900) ** 2 : 0;
    }
  }
  active() { return [...this.speakers].filter(([, on]) => on).map(([id]) => id); }
}
