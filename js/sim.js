// The simulator: a table, four test objects, a bin and the hand controller behind sim.hw, which is all the VM ever touches.
// The real model is held in the hand: motor A only works the claw, the student's hand carries the rest. Here too.
(function () {
  const RA = window.RA;
  const T = THREE;
  const Q = Math.PI / 2;
  const clamp = T.MathUtils.clamp;
  const wrap = (deg) => ((((deg + 180) % 360) + 360) % 360) - 180;
  const sleep = (sec) => new Promise((res) => setTimeout(res, sec * 1000));

  const STEP = 1 / 120, MAX_FRAME = 1;        // physics runs on real time: a slow PC gets a choppy claw, not a slow one
  const MAX_SPEED = 600, ACCEL = 6000;        // °/s at 100 %, °/s²
  const STALL_END = 0.4;
  const OPEN = 30, SHUT = -15, START_POSE = 5, TRAVEL = OPEN - SHUT;   // motor A, °: grip t = (30 - pos) / 45
  const TILT = T.MathUtils.degToRad(32);      // claw down, like a litter picker
  const TOUCH = 0.6;                          // Н, as in the VM
  const GRAVITY = 160;                        // modules/s², slower than real so a drop can be followed
  const LIFT = 0.8;                           // off its support by this much, an object hangs in the grip and may slip
  const KEY_SPEED = 16, HAND_SPEED = 70;      // modules/s
  const HAND = { x: [-10, 25], y: [0, 22], z: [-24, 24], home: [-2, 12, 0] };    // the grip point
  const TABLE = { x: 34, z: 33 };
  const ZONE = { x0: -9, x1: 9, z0: -24, z1: 24 };
  const BIN = { x: 18, z: 0, r: 8, h: 6, t: 0.7, floor: 0.5 };                     // r: inner half size
  const FOV = 24, AIM = [-1, 7, 0], VIEW = [0.2, 0.7, 0.68], FIT_U = 40, FIT_V = 30;  // half sizes the camera must show
  const ORIENT = { upright: 0, right: 1, upsidedown: 2, left: 3 };
  const SCROLL_MS = 90;

  // w: across the jaws, h: height, l: along the tool. need: grip force in % that holds it in the air, per grabber.
  const OBJECTS = [
    { id: 'cube', name: 'Кубик', w: 2, h: 2.4, l: 4, at: [0, -16], need: { 1: 1, 2: 1 } },
    { id: 'ball', name: 'Шарик', w: 5, h: 5, l: 5, at: [0, -6.5], need: { 1: 1, 2: 1 }, squash: 50 },
    { id: 'bottle', name: 'Бутылка', w: 6, h: 6, l: 13, at: [0, 4], need: { 1: Infinity, 2: 1 } },
    { id: 'apple', name: 'Яблоко', w: 7, h: 7, l: 7, at: [0, 16], need: { 1: Infinity, 2: 60 } },
  ];
  const SLIP = { bottle: { 1: 'Большая и гладкая: петли не удерживают' }, apple: { 1: 'Тяжёлое и гладкое: выскальзывает', 2: 'Тяжёлое: захват сжал слабее 60 %' } };
  const LOOSE = 'Мотор не сжимает, предмет выскользнул';
  const SMALL = 'Слишком маленький: проскальзывает между зубцами';
  const SQUASHED_W = 3.5;
  const FIT = 1;              // per side. The jaws open to 25°, not to their stop: the apple, 0.8 wider than claw 1's gap there, still has to get in by hand
  // Synthesised: the kit's recordings are not ours to ship. Parts are [wave, from Hz, to Hz, seconds]; no wave is a pause.
  const SOUNDS = {
    'Cat Meow 1': [['sawtooth', 430, 800, 0.22], ['sawtooth', 800, 380, 0.4]],
    'Dog Bark 1': [['square', 340, 160, 0.13], [null, 0, 0, 0.07], ['square', 320, 150, 0.17]],
    Laser: [['square', 1800, 180, 0.4]],
    Hello: [['triangle', 300, 430, 0.17], ['triangle', 430, 260, 0.3]],
    Applause: [['noise', 0, 0, 1.2]],
  };

  function createSound(onBeep) {
    let ctx = null, main = null, panner = null, volume = 100, tone = null;
    const effects = { pitch: 0, pan: 0 };
    const voices = new Set();
    const apply = () => {
      if (!ctx) return;
      main.gain.value = (volume / 100) * 0.25;
      panner.pan.value = clamp(effects.pan, -100, 100) / 100;
    };
    const rate = () => 2 ** (clamp(effects.pitch, -360, 360) / 120);     // 10 is one semitone, as in Scratch
    const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);
    const fade = (at, dur) => {
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(1, at + 0.01);
      g.gain.setValueAtTime(1, at + Math.max(0.01, dur - 0.03));
      g.gain.linearRampToValueAtTime(0, at + dur);
      g.connect(main);
      return g;
    };
    const voice = (node, out) => {
      voices.add(node);
      node.onended = () => voices.delete(node);
      node.connect(out);
    };
    const noise = (at, dur) => {
      const n = ctx.createBufferSource();
      n.buffer = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
      n.buffer.getChannelData(0).forEach((v, i, a) => { a[i] = (Math.random() - 0.5) * 0.7; });
      voice(n, fade(at, dur));
      n.start(at);
    };
    const osc = (type, f0, f1, at, dur) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(f0 * rate(), at);
      o.frequency.exponentialRampToValueAtTime(f1 * rate(), at + dur);
      voice(o, fade(at, dur));
      o.start(at);
      o.stop(at + dur);
    };
    const play = (parts) => {
      if (!ctx) return;
      let at = ctx.currentTime;
      parts.forEach(([wave, f0, f1, dur]) => {
        if (wave === 'noise') noise(at, dur);
        else if (wave) osc(wave, f0, f1, at, dur);
        at += dur;
      });
    };
    const silence = () => { voices.forEach((v) => v.stop()); voices.clear(); tone = null; };
    return {
      // Browsers only open audio from a user gesture: Play and the hub's buttons call this.
      unlock() {
        if (!ctx) {
          const Ctx = window.AudioContext || window.webkitAudioContext;
          if (!Ctx) return;
          ctx = new Ctx();
          main = ctx.createGain();
          panner = ctx.createStereoPanner();
          main.connect(panner).connect(ctx.destination);
          apply();
        }
        ctx.resume();
      },
      beep(midi, sec) {
        onBeep();
        play([['square', hz(midi), hz(midi), Math.max(0.05, sec)]]);
        return sleep(sec);
      },
      beepStart(midi) {
        onBeep();
        if (tone) tone.stop();
        if (!ctx) return;
        tone = ctx.createOscillator();
        tone.type = 'square';
        tone.frequency.value = hz(midi) * rate();
        voice(tone, main);
        tone.start();
      },
      stop: silence,
      play(name, untilDone) {
        const parts = SOUNDS[name] || SOUNDS.Laser;
        play(parts);
        return untilDone ? sleep(parts.reduce((sum, p) => sum + p[3], 0)) : Promise.resolve();
      },
      get volume() { return volume; },
      set volume(v) { volume = clamp(v, 0, 100); apply(); },
      setEffect(name, val) { effects[name] = val; apply(); },
      changeEffect(name, delta) { effects[name] += delta; apply(); },
      clearEffects() { effects.pitch = effects.pan = 0; apply(); },
    };
  }

  // Any alphabet, no font table: the browser draws each letter and its columns are read back for the 5×5 screen.
  function textColumns(text) {
    const SIZE = 12, c = document.createElement('canvas'), g = c.getContext('2d', { willReadFrequently: true }), cols = [];
    c.width = SIZE;
    c.height = 7;
    g.font = '7px Arial, sans-serif';
    for (const letter of text) {
      g.clearRect(0, 0, SIZE, 7);
      g.fillText(letter, 1, 6);
      const data = g.getImageData(0, 0, SIZE, 7).data, glyph = [];
      for (let x = 0; x < SIZE; x++) {
        const col = [1, 2, 3, 4, 5].map((y) => data[(y * SIZE + x) * 4 + 3] > 70);
        if (col.some(Boolean)) glyph.push(col);
      }
      cols.push(...(glyph.length ? glyph : [[], []]), []);
    }
    return cols;
  }

  function tableMesh() {
    const S = 14, W = TABLE.x * 2, D = TABLE.z * 2, c = document.createElement('canvas');
    c.width = W * S;
    c.height = D * S;
    const g = c.getContext('2d'), px = (x) => (x + TABLE.x) * S, pz = (z) => (z + TABLE.z) * S;
    g.fillStyle = '#f8fafb';
    g.fillRect(0, 0, c.width, c.height);
    g.strokeStyle = '#e4ebef';
    g.lineWidth = 2;
    g.beginPath();
    for (let x = -32; x < TABLE.x; x += 8) { g.moveTo(px(x), 0); g.lineTo(px(x), c.height); }
    for (let z = -32; z < TABLE.z; z += 8) { g.moveTo(0, pz(z)); g.lineTo(c.width, pz(z)); }
    g.stroke();
    const x = px(ZONE.x0), y = pz(ZONE.z0), w = (ZONE.x1 - ZONE.x0) * S, h = (ZONE.z1 - ZONE.z0) * S;
    g.fillStyle = '#00788c1c';
    g.fillRect(x, y, w, h);
    g.strokeStyle = '#00788c';
    g.lineWidth = 5;
    g.setLineDash([26, 16]);
    g.strokeRect(x, y, w, h);
    const map = new T.CanvasTexture(c);
    map.colorSpace = T.SRGBColorSpace;
    map.anisotropy = 8;
    const top = new T.Mesh(new T.PlaneGeometry(W, D).rotateX(-Q), new T.MeshStandardMaterial({ map, roughness: 0.75, envMapIntensity: 0.5 }));
    top.receiveShadow = true;
    const edge = new T.Mesh(new T.BoxGeometry(W, 1.4, D).translate(0, -0.71, 0), new T.MeshStandardMaterial({ color: '#c7d3da', roughness: 0.7 }));
    return new T.Group().add(top, edge);
  }

  const solid = (g) => { const n = g.index ? g.toNonIndexed() : g; n.deleteAttribute('uv'); return n; };
  const plastic = (color, o) => new T.MeshStandardMaterial(Object.assign({ color, roughness: 0.4, envMapIntensity: 0.4 }, o));
  const shadowed = (m) => { m.traverse((o) => { o.castShadow = o.receiveShadow = true; }); return m; };

  // Each mesh sits on y = 0 with its middle over x = z = 0.
  const MESHES = {
    cube() {
      const parts = [solid(new T.RoundedBoxGeometry(4, 2.4, 2, 1, 0.06)).translate(0, 1.2, 0)];
      for (const x of [-1.5, -0.5, 0.5, 1.5]) for (const z of [-0.5, 0.5]) parts.push(solid(new T.CylinderGeometry(0.3, 0.3, 0.2, 12)).translate(x, 2.5, z));
      return new T.Mesh(T.BufferGeometryUtils.mergeGeometries(parts), plastic('#e8352e', { roughness: 0.35 }));
    },
    ball() {
      // Crumpled: a coarse sphere with every corner pushed in or out a little, the same way every time.
      const g = new T.IcosahedronGeometry(2.5, 2), p = g.attributes.position, v = new T.Vector3();
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i);
        const k = 1 + 0.09 * Math.sin(v.x * 3.1 + v.y * 1.7) * Math.cos(v.z * 2.3 - v.y);
        p.setXYZ(i, v.x * k, v.y * k + 2.5, v.z * k);
      }
      g.computeVertexNormals();
      return new T.Mesh(g, plastic('#f1eee4', { roughness: 0.95, flatShading: true }));
    },
    bottle() {
      const pts = [[0, 0], [2.9, 0], [3, 0.4], [3, 9], [2.6, 10.3], [1.1, 11.5], [1.1, 12.2], [1.3, 12.2], [1.3, 13], [0, 13]].map(([r, y]) => new T.Vector2(r, y));
      const g = new T.LatheGeometry(pts, 28).rotateZ(-Q).translate(-6.5, 3, 0);
      return new T.Mesh(g, plastic('#a8dcef', { roughness: 0.15, transparent: true, opacity: 0.6, depthWrite: false }));
    },
    apple() {
      const g = new T.SphereGeometry(3.5, 28, 18).scale(1, 0.92, 1).translate(0, 3.22, 0);
      const stem = new T.Mesh(new T.CylinderGeometry(0.18, 0.25, 1.4, 8).rotateZ(0.25).translate(0.1, 6.7, 0), plastic('#6b4a2b'));
      return new T.Group().add(new T.Mesh(g, plastic('#d8262b', { roughness: 0.3 })), stem);
    },
  };

  function binMesh() {
    const { r, h, t, floor } = BIN, mat = plastic('#2f8a57', { roughness: 0.5 }), parts = [new T.BoxGeometry(2 * (r + t), floor, 2 * (r + t)).translate(0, floor / 2, 0)];
    [-1, 1].forEach((s) => {
      parts.push(new T.BoxGeometry(t, h, 2 * (r + t)).translate(s * (r + t / 2), h / 2, 0));
      parts.push(new T.BoxGeometry(2 * r, h, t).translate(0, h / 2, s * (r + t / 2)));
    });
    const m = shadowed(new T.Mesh(T.BufferGeometryUtils.mergeGeometries(parts.map(solid)), mat));
    m.position.set(BIN.x, 0, BIN.z);
    return m;
  }
  const inBinArea = (x, z, pad) => Math.abs(x - BIN.x) < BIN.r + BIN.t + (pad || 0) && Math.abs(z - BIN.z) < BIN.r + BIN.t + (pad || 0);
  const onRim = (x, z) => inBinArea(x, z) && !(Math.abs(x - BIN.x) < BIN.r && Math.abs(z - BIN.z) < BIN.r);
  // Where something standing at x, z rests: the table, the bin's floor or the top of its wall.
  const ground = (x, z) => (onRim(x, z) ? BIN.h : inBinArea(x, z) ? BIN.floor : 0);

  // Sensor plunger travel for a force: touch is the first 2 mm up to 2.5 Н, then 2–8 mm for 2.5–10 Н. Percent of the 8 mm.
  const travel = (n) => (n < 2.5 ? (n / 2.5) * 2 : 2 + ((n - 2.5) / 7.5) * 6) / 8 * 100;

  RA.createSim = (container) => {
    const stage = RA.stage(container, { fov: FOV, target: AIM, camera: AIM.map((v, i) => v + VIEW[i] * 130), shadowBox: 50 });
    const { scene, camera } = stage;
    const arm = RA.createGrabber();
    arm.setLayout('tool');
    const tilt = new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 0, 1), -TILT);
    const untilt = tilt.clone().invert();
    arm.group.quaternion.copy(tilt);

    const guideMat = new T.MeshBasicMaterial({ color: '#00788c', transparent: true, opacity: 0.55, depthWrite: false });
    const stem = new T.Mesh(new T.CylinderGeometry(0.07, 0.07, 1, 6).translate(0, 0.5, 0), guideMat);
    const ring = new T.Mesh(new T.RingGeometry(1.15, 1.5, 36).rotateX(-Q), guideMat);
    scene.add(arm.group, tableMesh(), binMesh(), stem, ring);

    const objects = OBJECTS.map((o) => {
      const mesh = shadowed(MESHES[o.id]());
      scene.add(mesh);
      return Object.assign({}, o, { mesh });
    });
    const byId = (id) => objects.find((o) => o.id === id);

    let time = 0, held = null, hold = null, missed = null, force = 0, listener = null, jaw = null;
    const buttons = { left: false, right: false };
    const hand = { x: 0, y: 0, z: 0 }, goal = { x: 0, y: 0, z: 0 }, input = { x: 0, y: 0, z: 0 };
    const emit = (e) => { if (listener) listener(e); };
    const v3 = new T.Vector3();

    /* ---------- Motor A ---------- */
    const M = { pos: START_POSE, vel: 0, want: 0, mode: 'stop', speed: 0, goal: 0, until: 0, raw: false, pressing: 0, zero: 0, def: 75, low: SHUT, blocked: false, push: 0, done: null };
    const finish = () => { const d = M.done; M.done = null; if (d) d(); };
    // A new command interrupts the old one, whose promise then ends.
    const drive = (mode, o) => { finish(); Object.assign(M, { mode, until: 0, raw: false, pressing: 0 }, o); };
    const driveAsync = (mode, o) => { drive(mode, o); return new Promise((res) => { M.done = res; }); };
    const degS = (pct) => (clamp(pct, -100, 100) * MAX_SPEED) / 100;

    const motorStep = (dt) => {
      if (M.until && time >= M.until) drive('stop', {});
      let want = 0;
      if (M.mode === 'run') want = M.speed;
      if (M.mode === 'to') {
        const left = M.goal - M.pos;
        if (Math.abs(left) < 1.5 && M.goal >= M.low) { M.pos = clamp(M.goal, M.low, OPEN); M.vel = 0; drive('stop', {}); }
        else want = Math.sign(left) * Math.min(M.speed, Math.sqrt(2 * ACCEL * Math.abs(left)));
      }
      M.want = want;
      M.vel += clamp(want - M.vel, -ACCEL * dt, ACCEL * dt);
      const free = M.pos + M.vel * dt, p = clamp(free, M.low, OPEN);
      if (p !== free) M.vel = 0;
      M.pressing = (p === OPEN && want > 0) || (p === M.low && want < 0) ? M.pressing + dt : 0;
      M.blocked = p === M.low && M.low > SHUT && want < 0;
      // How hard the jaws squeeze what is between them, in %: a regulated motor pushes with all it has.
      M.push = M.blocked ? (M.raw ? Math.abs(want) / 6 : 100) : 0;
      M.pos = p;
      // A stalled move ends for the program, but the motor keeps pushing towards its goal, as a held position does.
      if (M.mode === 'to' && M.pressing >= STALL_END) finish();
    };
    // Read after the motor's own step: a command the program gave since then has not pushed yet.
    const squeeze = () => M.push;

    /* ---------- Jaws ---------- */
    // The attached claw's box from the model, turned with the tool: how far its lowest corner hangs below the grip point.
    const measure = () => {
      const G = arm.GRABBERS[arm.grabber], g = arm.gripPoint.position;
      jaw = { G, drop: 0, x0: G.reach[0] - g.x, x1: G.reach[1] - g.x, half: (G.height[1] - G.height[0]) / 2 };
      for (const x of G.reach) for (const y of G.height) jaw.drop = Math.max(jaw.drop, -v3.set(x - g.x, y - g.y, 0).applyQuaternion(tilt).y);
    };
    // The object's middle in the claw's own frame, taken at its part nearest the grip point (a bottle is long).
    const local = (o) => {
      const reach = Math.max(0, (o.l - o.w) / 2), x = clamp(hand.x, o.x - reach, o.x + reach);
      return v3.set(x - hand.x, o.y + o.h / 2 - hand.y, 0).applyQuaternion(untilt);
    };
    const inJaws = (o, gap) => {
      const p = local(o);
      return p.x > jaw.x0 - 1 && p.x < jaw.x1 + 1 && Math.abs(p.y) < jaw.half + o.h / 2 && Math.abs(o.z - hand.z) + o.w / 2 <= gap / 2 + FIT;
    };
    const contact = (w) => OPEN - TRAVEL * arm.tForGap(w);

    const letGo = (o, text) => {
      Object.assign(o, { state: 'fall', vy: 0, slipped: !!text });
      if (o === held) held = null;
      if (text) emit({ type: 'slip', obj: o, grabber: arm.grabber, text, loose: text === LOOSE });
    };
    const squash = (o) => {
      Object.assign(o, { squashed: true, w: SQUASHED_W });
      emit({ type: 'squash', obj: o, grabber: arm.grabber, text: 'Слишком сильно: шарик смят' });
    };

    const grip = () => {
      const gap = arm.tipGap(), push = squeeze();
      if (held) {
        // Opening jaws let go of it: that is a drop, not a slip.
        if (gap > held.w + 0.2 || M.want > 0) return letGo(held);
        if (held.squash && arm.grabber === 2 && !held.squashed && push > held.squash) {
          squash(held);
          M.low = Math.max(SHUT, contact(held.w));
          M.pos = M.low;          // the jaws crush it at once: on their way in they would not press, and it would fall out
        }
        const need = held.need[arm.grabber];
        if (held.y - held.base > LIFT && push < need) letGo(held, push > 0 && need > push ? (SLIP[held.id] || {})[arm.grabber] || LOOSE : LOOSE);
        return;
      }
      const o = objects.find((b) => b.state === 'rest' && inJaws(b, gap));
      const tooSmall = o && o.w <= jaw.G.closedGap;
      M.low = o && !tooSmall ? Math.max(SHUT, contact(o.w)) : SHUT;
      if (M.pos > SHUT + 10) missed = null;
      if (!o) return;
      // The closing jaws push it to the middle.
      const room = Math.max(0, (gap - o.w) / 2);
      o.z = clamp(o.z, hand.z - room, hand.z + room);
      if (tooSmall) {
        if (M.pos <= SHUT + 1 && missed !== o) { missed = o; emit({ type: 'miss', obj: o, grabber: arm.grabber, text: SMALL }); }
        return;
      }
      if (M.pos > M.low + 0.5 || !push) return;
      if (o.squash && arm.grabber === 2 && !o.squashed && push > o.squash) return squash(o);
      held = o;
      hold = { x: o.x - hand.x, y: o.y - hand.y, z: o.z - hand.z };
      Object.assign(o, { state: 'held', base: o.y, slipped: false, by: arm.grabber });
      emit({ type: 'grab', obj: o, grabber: arm.grabber });
    };

    /* ---------- Objects ---------- */
    // What a falling object lands on: the ground there, or the top of another object under it.
    const support = (o) => objects.reduce((y, b) => {
      if (b === o || b.state !== 'rest' || Math.hypot(b.x - o.x, b.z - o.z) > (Math.max(b.w, b.l) + Math.max(o.w, o.l)) / 2 * 0.6) return y;
      return Math.max(y, b.y + b.h);
    }, ground(o.x, o.z));

    const objectsStep = (dt) => {
      if (held) Object.assign(held, { x: hand.x + hold.x, y: hand.y + hold.y, z: hand.z + hold.z });
      objects.forEach((o) => {
        if (o.state !== 'fall') return;
        // Whatever drops over the bin's wall goes in: a wall only a module thick does not hold a thing on its top.
        if (inBinArea(o.x, o.z)) {
          o.x = clamp(o.x, BIN.x - BIN.r + o.l / 2, BIN.x + BIN.r - o.l / 2);
          o.z = clamp(o.z, BIN.z - BIN.r + o.w / 2, BIN.z + BIN.r - o.w / 2);
        }
        o.vy -= GRAVITY * dt;
        o.y += o.vy * dt;
        const f = support(o);
        if (o.y > f) return;
        Object.assign(o, { y: f, vy: 0, state: 'rest', base: f, inBin: inBinArea(o.x, o.z) });
        emit({ type: 'land', obj: o });
      });
    };

    /* ---------- The hand that carries the tool ---------- */
    // The lowest the grip point can go here: the claw's tip stands on the table, the bin, or an object it cannot close around.
    const floor = () => {
      const gap = arm.tipGap();
      let base = ground(hand.x + 3, hand.z);
      objects.forEach((o) => {
        if (o === held || o.state !== 'rest' || Math.abs(o.x - hand.x) > o.l / 2 + 3) return;
        const dz = Math.abs(o.z - hand.z);
        if (dz + o.w / 2 <= gap / 2 + FIT || dz - o.w / 2 > gap / 2 + 1.2) return;
        base = Math.max(base, o.y + o.h);
      });
      let y = base + jaw.drop;
      if (held) y = Math.max(y, ground(held.x, held.z) - hold.y);
      return y;
    };

    const moveHand = (dt) => {
      ['x', 'y', 'z'].forEach((k) => { goal[k] = clamp(goal[k] + input[k] * KEY_SPEED * dt, HAND[k][0], HAND[k][1]); });
      const reach = HAND_SPEED * dt, f = floor();
      hand.x += clamp(goal.x - hand.x, -reach, reach);
      hand.z += clamp(goal.z - hand.z, -reach, reach);
      const y = hand.y + clamp(goal.y - hand.y, -reach, reach);
      hand.y = Math.max(f, y);
      if (hand.y > y) goal.y = hand.y;           // stopped from below: a held-down key does not dig on into the table
    };

    const step = (dt) => {
      time += dt;
      moveHand(dt);
      motorStep(dt);
      arm.setGrip((OPEN - M.pos) / TRAVEL);
      grip();
      objectsStep(dt);
    };

    /* ---------- Hub ---------- */
    const screen = new Array(25).fill(0);
    let turn = 0, bright = 100, scrolling = 0;
    const paint = () => {
      const px = new Array(25);
      for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) {
        const [y, x] = [[r, c], [c, 4 - r], [4 - r, 4 - c], [4 - c, r]][turn];
        px[y * 5 + x] = (screen[r * 5 + c] * bright) / 100;
      }
      arm.setMatrix(px);
      emit({ type: 'display', px });
    };
    const sound = createSound(() => emit({ type: 'beep' }));
    const display = {
      setImage(arr) { scrolling++; arr.forEach((v, i) => { screen[i] = v; }); paint(); },
      clear() { scrolling++; screen.fill(0); paint(); },
      setPixel(x, y, pct) {
        if (x < 1 || x > 5 || y < 1 || y > 5) return;
        scrolling++;
        screen[(Math.round(y) - 1) * 5 + Math.round(x) - 1] = clamp(pct, 0, 100);
        paint();
      },
      setBrightness(pct) { bright = clamp(pct, 0, 100); paint(); },
      rotate(dir) { turn = (turn + dir + 4) % 4; paint(); },
      setOrientation(name) { turn = ORIENT[name] || 0; paint(); },
      scroll(text) {
        const run = ++scrolling, cols = textColumns(text.toUpperCase());
        return new Promise((done) => {
          let at = -5;
          const next = () => {
            if (run !== scrolling) return done();
            for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) screen[r * 5 + c] = cols[at + c] && cols[at + c][r] ? 100 : 0;
            paint();
            if (++at > cols.length) return done();
            setTimeout(next, SCROLL_MS);
          };
          next();
        });
      },
    };

    const hw = {
      ports: { A: 'motor', B: null, C: null, D: null, E: 'force', F: null },
      motor: {
        run(pct, dir) { drive('run', { speed: degS(pct) * dir }); },
        runPower(pct) { drive('run', { speed: degS(pct), raw: true }); },
        stop() { drive('stop', {}); },
        runFor(deg, pct) {
          if (!pct) return Promise.resolve();
          return driveAsync('to', { goal: M.pos + deg * Math.sign(pct), speed: Math.abs(degS(pct)) });
        },
        runForSeconds(sec, pct, dir) { return driveAsync('run', { speed: degS(pct) * dir, until: time + sec }); },
        goTo(deg, mode, pct) {
          const d = wrap(deg) - wrap(M.pos);
          const turnBy = mode === 'clockwise' ? ((d % 360) + 360) % 360 : mode === 'counterclockwise' ? -(((-d % 360) + 360) % 360) : wrap(d);
          return hw.motor.runFor(turnBy, Math.abs(pct));
        },
        get position() { return wrap(Math.round(M.pos)); },
        get relative() { return Math.round(M.pos - M.zero); },
        set relative(v) { M.zero = M.pos - v; },
        get speedPct() { return Math.round(M.vel / 6); },
        get powerPct() { return Math.round(M.pressing && !M.raw ? Math.sign(M.want) * 100 : M.want / 6); },
        get defaultSpeed() { return M.def; },
        set defaultSpeed(v) { M.def = clamp(v, -100, 100); },
      },
      display,
      centerLight(css) { arm.setCenterLight(css); emit({ type: 'light', css }); },
      sound,
      sensors: {
        force: () => force,
        button: (side) => buttons[side],
        tilted: () => false,                                 // the hand keeps the hub steady
        orientationUp: (name) => name === 'rightside',
        gesture: () => false,
        angle: () => 0,
        resetYaw() {},
      },
      onEvent(fn) { listener = fn; },
      reset() {
        hw.motor.stop();
        bright = 100;
        turn = 0;
        display.clear();
        hw.centerLight(null);
        sound.stop();
        sound.clearEffects();
        sound.volume = 100;
      },
    };

    const press = (side, on) => {
      if (buttons[side] === on) return;
      buttons[side] = on;
      if (on) sound.unlock();
      emit({ type: 'button', side, state: on ? 'pressed' : 'released' });
    };
    // Newtons on the force sensor, 0..10 in steps of 0.1 like the real one.
    const setForce = (n) => {
      n = clamp(Math.round(n * 10) / 10, 0, 10);
      if (n === force) return;
      if (n >= TOUCH && force < TOUCH) sound.unlock();
      force = n;
      arm.setForce(travel(n));
      emit({ type: 'force', n });
    };

    const setGrabber = (n) => {
      if (held) letGo(held);
      arm.setGrabber(n);
      measure();
      drive('stop', {});
      Object.assign(M, { pos: START_POSE, vel: 0, want: 0, low: SHUT, blocked: false, push: 0 });
      missed = null;
      step(0);
      draw();
    };

    const resetTable = () => {
      held = null;
      missed = null;
      objects.forEach((o, i) => {
        Object.assign(o, OBJECTS[i], { x: OBJECTS[i].at[0], y: 0, z: OBJECTS[i].at[1], base: 0, state: 'rest', vy: 0, squashed: false, slipped: false, inBin: false, by: 0 });
      });
      ['x', 'y', 'z'].forEach((k, i) => { hand[k] = goal[k] = HAND.home[i]; });
      setGrabber(arm.grabber);
      if (stage.controls) { const d = camera.position.distanceTo(stage.target); camera.position.copy(stage.target).add(new T.Vector3(...VIEW).setLength(d)); stage.controls.update(); }
    };

    /* ---------- Picture ---------- */
    const surface = (x, z) => objects.reduce((top, o) => {
      const inside = o.state === 'rest' && o !== held && Math.abs(o.x - x) < o.l / 2 && Math.abs(o.z - z) < o.w / 2;
      return inside ? Math.max(top, o.y + o.h) : top;
    }, ground(x, z));
    const press3d = (m, on) => { if (m.userData.z0 === undefined) m.userData.z0 = m.position.z; m.position.z = m.userData.z0 - (on ? 0.08 : 0); };
    const draw = () => {
      arm.group.position.set(hand.x, hand.y, hand.z).sub(v3.copy(arm.gripPoint.position).applyQuaternion(tilt));
      press3d(arm.hubButtons.left, buttons.left);
      press3d(arm.hubButtons.right, buttons.right);
      objects.forEach((o) => {
        o.mesh.position.set(o.x, o.y, o.z);
        if (o.squashed) o.mesh.scale.set(1.15, 1, SQUASHED_W / 5);
        else o.mesh.scale.set(1, 1, 1);
      });
      const s = surface(hand.x, hand.z);
      ring.position.set(hand.x, s + 0.04, hand.z);
      stem.position.set(hand.x, s, hand.z);
      stem.scale.y = Math.max(0.01, hand.y - s);
    };

    let last = 0, ticker = 0, seen = null, running = false;
    const tick = (dt) => {
      const now = performance.now();
      let left = Math.min((now - last) / 1000, MAX_FRAME);
      last = now;
      for (; left > 1e-6; left -= STEP) step(Math.min(left, STEP));
      arm.update(dt || 0.05);
      draw();
      if (sim.onTick) sim.onTick();
      if (stage.size !== seen && stage.controls) {
        seen = stage.size;
        const tan = Math.tan((camera.fov * Math.PI) / 360), d = Math.max(FIT_V, FIT_U / camera.aspect) / tan;
        camera.position.sub(stage.target).setLength(d).add(stage.target);
        stage.controls.minDistance = d * 0.35;
        stage.controls.maxDistance = d * 1.5;
      }
    };
    stage.frame(tick);
    // A resize wipes the canvas; drawing at once keeps the splitter drag from flickering.
    if (stage.renderer) new ResizeObserver(() => { if (running) stage.renderer.render(scene, camera); }).observe(container);

    /* ---------- Pointer on the 3D view ---------- */
    const el = stage.renderer && stage.renderer.domElement;
    if (el) {
      const ray = new T.Raycaster(), ndc = new T.Vector2(), plane = new T.Plane(new T.Vector3(0, 1, 0), 0), p = new T.Vector3();
      const aim = (e) => {
        const r = el.getBoundingClientRect();
        ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
        ray.setFromCamera(ndc, camera);
      };
      const shown = (o) => { for (; o; o = o.parent) if (!o.visible) return false; return true; };
      const within = (o, root) => { for (; o; o = o.parent) if (o === root) return true; return false; };
      let pressed = null, drag = null, cap = false;
      const end = () => {
        if (pressed) press(pressed, false);
        if (cap) setForce(0);
        pressed = drag = null;
        cap = false;
        stage.controls.enabled = true;
      };
      // Capture phase: this has to decide before OrbitControls starts an orbit.
      container.addEventListener('pointerdown', (e) => {
        if (e.target !== el || e.button !== 0) return;
        aim(e);
        const hit = ray.intersectObject(arm.group, true).find((h) => shown(h.object));
        if (!hit) return;
        stage.controls.enabled = false;
        el.setPointerCapture(e.pointerId);
        const o = hit.object, b = arm.hubButtons;
        if (within(o, b.center)) emit({ type: 'center' });
        else if (within(o, b.left)) press((pressed = 'left'), true);
        else if (within(o, b.right)) press((pressed = 'right'), true);
        else if (within(o, arm.sensorCap)) { cap = true; setForce(4); }
        else {
          plane.constant = -hit.point.y;
          drag = { x: hand.x - hit.point.x, z: hand.z - hit.point.z };
        }
      }, true);
      el.addEventListener('pointermove', (e) => {
        if (!drag) return;
        aim(e);
        if (!ray.ray.intersectPlane(plane, p)) return;
        goal.x = clamp(p.x + drag.x, HAND.x[0], HAND.x[1]);
        goal.z = clamp(p.z + drag.z, HAND.z[0], HAND.z[1]);
      });
      el.addEventListener('pointerup', end);
      el.addEventListener('pointercancel', end);
    }

    const sim = {
      hw, stage, arm, objects, hand, goal, input, motor: M, press, setForce, setGrabber, resetTable, step, draw, byId, onTick: null,
      OBJECTS, TOUCH,
      get time() { return time; },
      get held() { return held; },
      get force() { return force; },
      get grabber() { return arm.grabber; },
      get squeeze() { return Math.round(squeeze()); },
      start() {
        running = true;
        last = performance.now();
        stage.start();
        if (!el) ticker = setInterval(tick, 50);        // no WebGL: the blocks and the 2D hub still work
      },
      stop() {
        running = false;
        stage.stop();
        clearInterval(ticker);
      },
    };
    measure();
    resetTable();
    return sim;
  };
})();
