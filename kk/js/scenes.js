// Six real grippers as short looping stories. Each entry is facts, one phase table and build(root, stage) => apply(pose, time, loop).
// The table is the only source for motion and captions: a row holds the pose reached at its end, a row with text opens a caption step.
// loop (0..1) is how much of the loop has played: a belt uses it to run at one even speed from start to end.
(function () {
  const RA = window.RA;
  const PI = Math.PI;
  const { lerp, clamp } = THREE.MathUtils;
  const UP = new THREE.Vector3(0, 1, 0);
  const NEG_Y = new THREE.Vector3(0, -1, 0);
  const vec = (x, y, z) => new THREE.Vector3(x, y, z);

  const mats = {};
  const mat = (color, o) => {
    const key = color + (o ? JSON.stringify(o) : '');
    return mats[key] || (mats[key] = new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.38, envMapIntensity: 0.5 }, o)));
  };

  const group = (parent, x = 0, y = 0, z = 0) => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    parent.add(g);
    return g;
  };

  // Collects shapes and merges them per material, so a rigid part costs one draw call per colour.
  function kit(parent) {
    const sets = new Map();
    const k = {
      geo(g, m, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
        g = (g.index ? g.toNonIndexed() : g).rotateX(rx).rotateY(ry).rotateZ(rz).translate(x, y, z);
        if (!sets.has(m)) sets.set(m, []);
        sets.get(m).push(g);
        return k;
      },
      box: (w, h, d, m, x, y, z, rx, ry, rz) => k.geo(new THREE.RoundedBoxGeometry(w, h, d, 1, Math.min(w, h, d) * 0.14), m, x, y, z, rx, ry, rz),
      bar: (w, h, d, m, x, y, z, rx, ry, rz) => k.geo(new THREE.BoxGeometry(w, h, d), m, x, y, z, rx, ry, rz), // sharp and cheap, for trusses and slats
      cyl: (r, h, m, x, y, z, axis, r2 = r) => k.geo(new THREE.CylinderGeometry(r, r2, h, 20), m, x, y, z, axis === 'z' ? PI / 2 : 0, 0, axis === 'x' ? -PI / 2 : 0),
      done() {
        sets.forEach((list, m) => {
          const mesh = new THREE.Mesh(list.length > 1 ? THREE.BufferGeometryUtils.mergeGeometries(list) : list[0], m);
          mesh.castShadow = mesh.receiveShadow = !m.transparent; // see-through parts must not throw a solid shadow
          parent.add(mesh);
        });
        return parent;
      },
    };
    return k;
  }

  const extrude = (shape, depth, bevel = 0.1, segs = 10) => new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0,
    bevelSize: bevel, bevelThickness: bevel, bevelSegments: 1, curveSegments: segs }).translate(0, 0, -depth / 2);

  // The colour comes from CSS and only shadows are drawn, so there is no horizon and no floor edge.
  function ground(root, opacity = 0.2) {
    const m = new THREE.Mesh(new THREE.CircleGeometry(300, 8).rotateX(-PI / 2), new THREE.ShadowMaterial({ opacity }));
    m.receiveShadow = true;
    root.add(m);
  }

  // A round-ended link: the silhouette that reads as "robot arm" from the back of a classroom.
  function linkGeo(len, r1, r2, width) {
    const th = Math.acos((r1 - r2) / len), s = new THREE.Shape();
    s.absarc(0, 0, r1, th, 2 * PI - th, false);
    s.absarc(len, 0, r2, -th, th, false);
    return extrude(s, width, 0.14, 14);
  }

  // Yaw base, shoulder, elbow, wrist, with analytic two-link IK in the vertical plane. The tool points along its local +X.
  function makeArm(o) {
    const g = new THREE.Group(), yaw = group(g), up = group(yaw, 0, o.h), fore = group(up, o.l1), wrist = group(fore, o.l2), tool = group(wrist);
    const B = mat(o.color), D = mat(o.dark || '#2b333b'), r = o.r;
    kit(g).cyl(r * 1.7, r * 0.5, D, 0, r * 0.25, 0).done();
    const top = o.h - r * 0.75; // the shoulder sits on the column, its joint cap stays fully visible
    kit(yaw).cyl(r * 1.15, top, B, 0, top / 2, 0, null, r * 1.4).done();
    kit(up).geo(linkGeo(o.l1, r, r * 0.72, r * 1.05), B).cyl(r * 0.6, r * 1.3, D, 0, 0, 0, 'z').cyl(r * 0.44, r * 1.3, D, o.l1, 0, 0, 'z').done();
    kit(fore).geo(linkGeo(o.l2, r * 0.72, r * 0.42, r * 0.8), B).box(r * 1.5, r * 1.3, r * 0.9, D, -r * 0.8, 0, 0).done();
    kit(wrist).cyl(r * 0.3, r * 0.95, D, 0, 0, 0, 'z').done();
    kit(tool).cyl(r * 0.34, r * 0.7, D, r * 0.35, 0, 0, 'x').done();
    return {
      group: g, tool,
      // Target in the parent's coordinates. A tool pointing down keeps its heading in the world, like a real wrist roll joint.
      reach(x, y, z, pitch = -PI / 2, twist = 0) {
        x -= g.position.x; y -= g.position.y; z -= g.position.z;
        const a = Math.atan2(-z, x), R = Math.hypot(x, z) - o.tool * Math.cos(pitch), H = y - o.h - o.tool * Math.sin(pitch);
        const d = clamp(Math.hypot(R, H), Math.abs(o.l1 - o.l2) + 0.01, o.l1 + o.l2 - 0.01);
        const e = Math.acos(clamp((d * d - o.l1 * o.l1 - o.l2 * o.l2) / (2 * o.l1 * o.l2), -1, 1));
        const s = Math.atan2(H, R) + Math.atan2(o.l2 * Math.sin(e), o.l1 + o.l2 * Math.cos(e));
        yaw.rotation.y = a;
        up.rotation.z = s;
        fore.rotation.z = -e;
        wrist.rotation.z = pitch - s + e;
        tool.rotation.x = twist - a * Math.sin(pitch);
      },
    };
  }

  // Translucent sensor cone with its apex at the sensor. Same look in every scene: blue means "the robot is looking".
  function beam(parent, radius, color = '#00adc4') {
    const m = new THREE.Mesh(new THREE.ConeGeometry(radius, 1, 32, 1, true).translate(0, -0.5, 0),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
    parent.add(m);
    const dir = vec(0, 0, 0);
    return (from, to, opacity) => {
      m.visible = opacity > 0.01;
      if (!m.visible) return;
      dir.subVectors(to, from);
      m.position.copy(from);
      m.scale.y = dir.length();
      m.quaternion.setFromUnitVectors(NEG_Y, dir.normalize());
      m.material.opacity = opacity * 0.34;
    };
  }

  // Puffs of air, bubbles. Positions are a pure function of time, so seeking and looping stay exact.
  function spray(parent, n, color, size, opts = {}) {
    const { speed = 12, gravity = -30, life = 0.7, dir = vec(0, 1, 0), spread = 1 } = opts;
    const seeds = Array.from({ length: n }, () => [Math.random(), Math.random() - 0.5, Math.random(), Math.random() - 0.5]);
    const pos = new THREE.BufferAttribute(new Float32Array(n * 3), 3);
    const pts = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', pos),
      new THREE.PointsMaterial({ color, size, transparent: true, depthWrite: false }));
    pts.frustumCulled = false;
    parent.add(pts);
    return (on, t, o) => {
      pts.visible = on;
      if (!on) return;
      seeds.forEach(([p, a, b, c], i) => {
        const age = ((t / life + p) % 1) * life, sp = speed * (0.5 + b * 0.8);
        pos.setXYZ(i, o.x + (dir.x + a * spread) * sp * age, o.y + (dir.y + b * 0.3) * sp * age + gravity * age * age / 2, o.z + (dir.z + c * spread) * sp * age);
      });
      pos.needsUpdate = true;
    };
  }

  // Crisp text and signs inside the scene, for the few words a still frame has to carry.
  function canvasSprite(parent, w, h, scale, draw) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'));
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    s.scale.set(scale, scale * h / w, 1);
    parent.add(s);
    return s;
  }
  function label(parent, text, x, y, z, scale, ink = '#10202a', paper = '#ffffff') {
    const s = canvasSprite(parent, 512, 128, scale, (g) => {
      g.fillStyle = paper;
      g.beginPath();
      g.roundRect(4, 12, 504, 104, 30);
      g.fill();
      g.fillStyle = ink;
      g.font = '800 62px "Golos Text", Arial, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(text, 256, 68);
    });
    s.position.set(x, y, z);
    return s;
  }
  // A ring that always faces the camera. Two kinds: a thick "yes" ring, and a thin "no" ring with a slash. Drawn over everything.
  function marker(parent, color, no) {
    const s = canvasSprite(parent, 128, 128, 5, (g) => {
      g.strokeStyle = color;
      g.lineWidth = no ? 8 : 14;
      g.beginPath();
      g.arc(64, 64, 52, 0, 2 * PI);
      if (no) { g.moveTo(28, 28); g.lineTo(100, 100); }
      g.stroke();
    });
    s.material.depthTest = false;
    return s;
  }
  // Rings that spread from a point and fade while `on` is up: a signal going out.
  function pulses(parent, color, x, y, z) {
    const list = [0, 1, 2].map(() => {
      const m = marker(parent, color);
      m.position.set(x, y, z);
      return m;
    });
    return (on, t) => list.forEach((m, i) => {
      const k = (t * 1.4 + i / 3) % 1;
      m.visible = on > 0.02;
      m.scale.setScalar(lerp(1.5, 5.5, k));
      m.material.opacity = on * (1 - k);
    });
  }

  // A cylinder stretched between two points each frame: people's limbs, cables.
  function limb(parent, m, r) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1, 12).translate(0, 0.5, 0), m);
    mesh.castShadow = true;
    parent.add(mesh);
    const dir = vec(0, 0, 0);
    return (a, b) => {
      dir.subVectors(b, a);
      mesh.position.copy(a);
      mesh.scale.y = dir.length();
      mesh.quaternion.setFromUnitVectors(UP, dir.normalize());
    };
  }
  // Elbow of a two-equal-segment arm, bent towards the pole direction.
  function elbow(s, h, len, pole) {
    const d = Math.min(s.distanceTo(h), 2 * len - 0.01), dir = h.clone().sub(s).normalize();
    const perp = pole.clone().addScaledVector(dir, -pole.dot(dir)).normalize();
    return s.clone().addScaledVector(dir, d / 2).addScaledVector(perp, Math.sqrt(len * len - d * d / 4));
  }

  /* ---------- 1. Recycling: a suction cup takes bottles off a running belt ---------- */

  function recycling(root) {
    ground(root);
    const D = mat('#2b333b'), K = mat('#16151a'), A = mat('#01adc4');
    const PET = mat('#9adcf0', { roughness: 0.1 }), CAP = mat('#0a7bb3'), CAN = mat('#d8232f', { roughness: 0.3 }), TIN = mat('#c4cbd0', { metalness: 0.5, roughness: 0.3 });
    const CARD = mat('#c9985a', { roughness: 0.7 }), PAPER = mat('#f4f1ea', { flatShading: true, roughness: 0.8 });
    const BY = 7, CX = -15, BX = 20, BZ = -11, X0 = -24; // belt top, camera arch, bin, where this loop's bottle starts
    const PERIOD = 40; // the belt moves one pattern of four items per loop, so the next bottle takes this one's place
    const k = kit(root);
    k.bar(130, 0.4, 12, K, -15, BY - 0.2, 0).box(130, 1.4, 1, D, -15, BY - 0.5, 6.6).box(130, 1.4, 1, D, -15, BY - 0.5, -6.6);
    for (let x = -75; x <= 45; x += 15) [6.6, -6.6].forEach((z) => k.box(1.2, BY - 1, 1.2, D, x, (BY - 1) / 2, z));
    // The camera looks down from an arch: everything that passes under it gets a name.
    [8.6, -8.6].forEach((z) => k.box(1.4, 21, 1.4, D, CX, 10.5, z));
    k.box(2, 1.6, 18.6, D, CX, 21, 0).box(3.4, 2.4, 3.4, K, CX, 19, 0).cyl(0.9, 0.6, A, CX, 17.6, 0);
    // Bin for plastic on a stand, so the belt does not hide it. Two bottles are already in it.
    k.box(10, 6, 0.8, A, BX, 7, BZ + 4.6).box(10, 6, 0.8, A, BX, 7, BZ - 4.6).box(0.8, 6, 8.4, A, BX - 4.6, 7, BZ).box(0.8, 6, 8.4, A, BX + 4.6, 7, BZ).bar(9, 0.6, 9, A, BX, 4.3, BZ);
    [[-4, -4], [4, -4], [-4, 4], [4, 4]].forEach(([x, z]) => k.box(0.9, 4, 0.9, D, BX + x, 2, BZ + z));
    const bottle = (kt, x, y, z) => kt.cyl(1.3, 4.4, PET, x, y + 1.3, z, 'x').cyl(0.5, 1.2, PET, x + 2.8, y + 1.3, z, 'x', 1.3).cyl(0.55, 0.6, CAP, x + 3.7, y + 1.3, z, 'x');
    bottle(k, BX - 1.4, 4.6, BZ - 2.6);
    bottle(k, BX - 1.4, 4.6, BZ + 2.6);
    k.done();
    label(root, 'пластик', BX, 13.4, BZ + 5.2, 9);

    const KINDS = [
      (kt) => bottle(kt, 0, 0, 0),
      (kt) => kt.cyl(1.1, 3.4, CAN, 0, 1.1, 0, 'z').cyl(1.12, 0.3, TIN, 0, 1.1, 1.75, 'z').cyl(1.12, 0.3, TIN, 0, 1.1, -1.75, 'z'),
      (kt) => kt.box(4.6, 0.7, 3.6, CARD, 0, 0.35, 0),
      (kt) => kt.geo(new THREE.IcosahedronGeometry(1.4, 0), PAPER, 0, 1.3, 0),
    ];
    const items = [];
    for (let j = -5; j <= 6; j++) {
      const g = group(root);
      KINDS[((j % 4) + 4) % 4](kit(g)).done();
      items.push({ g, x0: X0 + 10 * j, bottle: j % 4 === 0 });
    }
    const target = items[5].g, wrap = (x) => (((x + 74) % 120) + 120) % 120 - 74;
    const yes = marker(root, '#fed920'), nos = [marker(root, '#ffffff', true), marker(root, '#ffffff', true)];

    const a = makeArm({ l1: 12, l2: 12, h: 9, r: 2, tool: 4.6, color: '#01adc4' });
    a.group.position.set(5, 0, -14);
    root.add(a.group);
    kit(a.tool).cyl(0.45, 2.6, D, 1.3, 0, 0, 'x').done();
    const cup = group(a.tool, 2.6, 0, 0); // bellows: they squash when the air is pumped out
    kit(cup).cyl(0.7, 0.8, K, 0.4, 0, 0, 'x').cyl(1.3, 0.8, K, 1.2, 0, 0, 'x', 0.7).cyl(1.5, 0.4, K, 1.8, 0, 0, 'x', 1.3).done();

    const look = beam(root, 6), air = spray(root, 30, '#00adc4', 0.8, { speed: 14, gravity: 0, life: 0.5, spread: 0.3 });
    const HOME = vec(3, 17, -3), BIN = vec(BX, 15, BZ), to = vec(0, 0, 0), eye = vec(CX, 17.4, 0), belt = vec(CX, BY, 0), o = vec(0, 0, 0);
    return (s, t, loop) => {
      const u = PERIOD * loop, bx = X0 + u;
      items.forEach(({ g, x0, bottle: b }) => {
        g.position.set(wrap(x0 + u), BY, 0);
        g.visible = !b || g === target || g.position.x < 3; // bottles past the robot were taken on earlier loops
      });
      // The cup rides along with the bottle while the belt carries it, then swings over to the bin.
      to.set(bx + 0.4, BY + 2.6 + s.up * 6, 0);
      to.lerpVectors(HOME, to, s.near).lerp(BIN, s.bin);
      const lip = to.y - 0.6 * s.vac;
      a.reach(to.x, lip, to.z);
      cup.scale.x = 1 - 0.3 * s.vac;
      if (s.hold < 0.5) target.position.set(bx, BY, 0);
      else if (s.hold < 1.5) target.position.set(to.x - 0.4, to.y - 2.6, to.z); // right under the cup's mouth, which stays at to.y
      else target.position.set(BX - 0.4, lerp(BIN.y - 2.6, 4.6, Math.min(1, (s.hold - 1.5) * 2) ** 2), BZ);
      look(eye, belt, s.scan);
      air(s.vac > 0.05 && s.vac < 0.95, t, o.set(to.x, lip + 4.6, to.z));
      yes.visible = nos[0].visible = nos[1].visible = s.mark > 0.5;
      yes.position.set(bx + 0.8, BY + 5, 0);
      nos[0].position.copy(items[4].g.position).y += 5;
      nos[1].position.copy(items[6].g.position).y += 5;
    };
  }

  /* ---------- 2. Prosthetic hand: muscle signals close it around a paper cup ---------- */

  function prosthesis(root) {
    ground(root, 0.16);
    const SHELL = mat('#eceded'), D = mat('#2b333b'), K = mat('#16151a', { roughness: 0.7 }), SKIN = mat('#e8b58e', { roughness: 0.6 }), SLEEVE = mat('#fed920', { roughness: 0.7 });
    const SOCKET = mat('#01adc4', { transparent: true, opacity: 0.4, depthWrite: false, side: THREE.DoubleSide });
    const PAPER = mat('#f7f6f2', { roughness: 0.75, side: THREE.DoubleSide }), BAND = mat('#c92e85', { roughness: 0.6 }), WATER = mat('#7fd0ef', { roughness: 0.1 });
    const ELC = mat('#aab2b8', { emissive: '#c92e85' }), ELO = mat('#aab2b8', { emissive: '#01adc4' });

    const C = vec(4, 0, 0); // the cup stands here
    const cup = group(root, C.x, C.y, C.z);
    // Only a little flared: a wider rim would cut into the palm and the top finger.
    kit(cup).geo(new THREE.CylinderGeometry(3, 2.6, 8, 28, 1, true), PAPER, 0, 4, 0)
      .geo(new THREE.CylinderGeometry(2.88, 2.76, 2.4, 28, 1, true), BAND, 0, 4, 0)
      .geo(new THREE.CircleGeometry(2.6, 28).rotateX(-PI / 2), PAPER, 0, 0.05, 0)
      .geo(new THREE.TorusGeometry(3, 0.14, 6, 28).rotateX(PI / 2), PAPER, 0, 8, 0)
      .geo(new THREE.CircleGeometry(2.87, 28).rotateX(-PI / 2), WATER, 0, 5.5, 0).done();

    // Hand frame: palm centre at the origin, fingers along +X, the palm faces +Z where the cup is.
    const hand = group(root);
    kit(hand).box(7, 8, 2, SHELL, 0, 0, 0).box(6.4, 7.2, 0.4, D, 0, 0, -1.1).cyl(2.3, 1.6, D, -4.3, 0, 0, 'x')
      .geo(new THREE.CylinderGeometry(3.3, 2.7, 12, 24, 1, true), SOCKET, -11.1, 0, 0, 0, 0, PI / 2)
      .cyl(2.2, 26, SKIN, -21, 0, 0, 'x', 2.7).cyl(3.4, 12, SLEEVE, -36, 0, 0, 'x')
      // Two electrodes on the skin inside the socket, wires to the hand.
      .cyl(0.75, 0.3, ELC, -12, 2.4, 0).cyl(0.75, 0.3, ELO, -12, 0, 2.4, 'z').cyl(0.1, 7, K, -8.5, 2.45, 0, 'x').cyl(0.1, 7, K, -8.5, 0, 2.45, 'x').done();
    const chain = (x, y, z, lens, w) => {
      let p = group(hand, x, y, z);
      return lens.map((len) => {
        const seg = p;
        kit(seg).box(len - 0.2, w, w, SHELL, len / 2, 0, 0).cyl(w * 0.5, w + 0.06, D, 0, 0, 0).done();
        p = group(seg, len);
        return seg;
      });
    };
    // Closed angles lay each finger along a circle round the cup.
    const CLOSED = [1.0, 0.85, 0.69];
    const fingers = [2.6, 0.9, -0.8, -2.5].map((y) => chain(3.5, y, 0.3, [3.4, 2.8, 2.3], 1.3));
    const thumb = chain(-2.6, -0.6, 1, [3, 2.6], 1.5);
    const sigClose = pulses(hand, '#c92e85', -12, 3.6, 0), sigOpen = pulses(hand, '#01adc4', -12, 0, 3.6);
    const slip = marker(hand, '#fed920');
    slip.position.set(-1.7, -0.6, 6.6);

    const HAND = vec(C.x - 1.5, 4.6, C.z - 4); // palm centre when the cup sits in it
    return (s, t) => {
      hand.position.set(HAND.x + s.ax, HAND.y + s.ay, HAND.z);
      const g = s.grip, extra = 0.05 * s.tight;
      fingers.forEach((f) => f.forEach((seg, j) => { seg.rotation.y = -(lerp(0.1, CLOSED[j], g) + extra); }));
      thumb[0].rotation.y = -lerp(2.09, 1.57, g);
      thumb[1].rotation.y = lerp(0, 0.35, g);
      ELC.emissiveIntensity = s.sig;
      ELO.emissiveIntensity = s.open;
      sigClose(s.sig, t);
      sigOpen(s.open, t);
      slip.visible = s.open < 0.5 && s.tight > 0.02 && s.tight < 0.98; // not again while the hand lets go
      slip.material.opacity = Math.sin(PI * s.tight);
      if (s.hold >= 0.5 && s.hold < 1.5) cup.position.set(C.x + s.ax, s.ay - 0.6 * s.slip, C.z);
      else cup.position.copy(C);
    };
  }

  /* ---------- 3. Bakery: soft fingers bent by air ---------- */

  function bakery(root) {
    ground(root, 0.18);
    const D = mat('#2b333b'), K = mat('#16151a'), STEEL = mat('#c4cbd0', { metalness: 0.3, roughness: 0.4 }), A = mat('#01adc4'), W = mat('#eceded');
    const BUN = mat('#d48a3c', { roughness: 0.55 }), CARD = mat('#c9985a', { roughness: 0.7 }), FIRE = new THREE.MeshBasicMaterial({ color: '#ff9a3c' });
    const SOFT = mat('#01adc4', { roughness: 0.5 });
    const BY = 6, BUN_Y = BY + 1.15, SP = 6, TX = 13, TZ = 1, TY = 4.4;
    const bunGeo = new THREE.SphereGeometry(2.1, 14, 8).scale(1, 0.55, 1);
    const k = kit(root);
    k.bar(58, 0.4, 9, K, -21, BY - 0.2, 0).box(58, 1.3, 0.9, D, -21, BY - 0.5, 4.9).box(58, 1.3, 0.9, D, -21, BY - 0.5, -4.9);
    [-30, -18, -6, 4].forEach((x) => [4.9, -4.9].forEach((z) => k.box(1, BY - 1, 1, D, x, (BY - 1) / 2, z)));
    // Oven: the belt runs out of its glowing mouth.
    k.box(16, 17, 18, STEEL, -44, 8.5, 0).box(0.6, 6.4, 12, K, -35.9, 7.6, 0).geo(new THREE.PlaneGeometry(10, 3.8).rotateY(PI / 2), FIRE, -35.5, 8.2, 0).box(4, 6, 4, STEEL, -48, 19, -4);
    // 3D camera over the belt: two eyes looking down.
    k.box(1.2, 20, 1.2, D, -9, 10, -9.5).box(1.2, 1.2, 10, D, -9, 19.4, -4.6).box(2.4, 1.8, 4, K, -9, 18.2, 0).cyl(0.55, 0.4, A, -9, 17.2, 0.9).cyl(0.55, 0.4, A, -9, 17.2, -0.9);
    // A table with the box, three buns already packed.
    k.box(13, 0.8, 13, W, TX, TY - 0.4, TZ);
    [[-5.5, -5.5], [5.5, -5.5], [-5.5, 5.5], [5.5, 5.5]].forEach(([x, z]) => k.box(0.9, TY - 0.8, 0.9, D, TX + x, (TY - 0.8) / 2, TZ + z));
    k.bar(10.4, 0.3, 10.4, CARD, TX, TY + 0.15, TZ).bar(10.4, 2.6, 0.3, CARD, TX, TY + 1.3, TZ + 5.2).bar(10.4, 2.6, 0.3, CARD, TX, TY + 1.3, TZ - 5.2)
      .bar(0.3, 2.6, 10.4, CARD, TX + 5.2, TY + 1.3, TZ).bar(0.3, 2.6, 10.4, CARD, TX - 5.2, TY + 1.3, TZ);
    const slot = (i) => vec(TX + (i % 2 ? 2.5 : -2.5), TY + 0.3 + 1.15, TZ + (i > 1 ? 2.5 : -2.5));
    [0, 1, 2].forEach((i) => { const p = slot(i); k.geo(bunGeo, BUN, p.x, p.y, p.z); });
    k.done();
    const SLOT = slot(3);
    const buns = Array.from({ length: 9 }, () => {
      const m = new THREE.Mesh(bunGeo, BUN);
      m.castShadow = true;
      root.add(m);
      return m;
    });

    const a = makeArm({ l1: 11, l2: 11, h: 8, r: 1.8, tool: 4.4, color: '#eceded' });
    a.group.position.set(8, 0, -11);
    root.add(a.group);
    kit(a.tool).cyl(1.7, 1.2, D, 1, 0, 0, 'x').done();
    // Four hollow rubber fingers. Air pressure bends each one inwards; the angles lay them round the bun's sides.
    const OPEN = [1.0, 0.2, 0], SHUT = [0.55, -0.55, -0.6]; // shut, the middle segments just touch the bun's sides
    const fingers = [0, 1, 2, 3].map((i) => {
      const spin = group(a.tool);
      spin.rotation.x = i * PI / 2 + PI / 4;
      let p = group(spin, 1.6, 1.7, 0);
      return [0, 1, 2].map((j) => {
        const seg = p;
        kit(seg).box(1.5, 0.9, 1.5 - j * 0.15, SOFT, 0.75, 0, 0).done();
        p = group(seg, 1.5);
        return seg;
      });
    });

    const look = beam(root, 4.2), air = spray(root, 26, '#ffffff', 0.7, { speed: 10, gravity: 0, life: 0.45, spread: 0.6 });
    const eye = vec(-9, 17, 0), to = vec(0, BUN_Y, 0), o = vec(0, 0, 0);
    return (s, t) => {
      buns.forEach((b, i) => b.position.set(SP * (s.belt - 1 - i), BUN_Y, 0));
      a.reach(s.x, s.y, s.z);
      fingers.forEach((f) => f.forEach((seg, j) => { seg.rotation.z = lerp(OPEN[j], SHUT[j], s.grip); }));
      if (s.hold >= 0.5 && s.hold < 1.5) buns[0].position.set(s.x, s.y, s.z);
      else if (s.hold >= 1.5) buns[0].position.copy(SLOT);
      look(eye, to, s.scan);
      air(s.air > 0.05 && s.air < 0.95, t, o.set(s.x, s.y + 3.6, s.z));
    };
  }

  /* ---------- 4. Ocean: noodle fingers hold a jellyfish ---------- */

  function ocean(root) {
    ground(root, 0.25);
    const Y = mat('#fed920'), D = mat('#2b333b'), K = mat('#16151a'), A = mat('#01adc4'), W = mat('#eceded'), G = mat('#aab2b8');
    const ROCK = mat('#5d6b78', { flatShading: true, roughness: 0.9 }), CORAL = mat('#ff7a59', { roughness: 0.6 }), CORAL2 = mat('#c92e85', { roughness: 0.6 });
    const NOODLE = mat('#f4fbff', { roughness: 0.35 }), LAMP = new THREE.MeshBasicMaterial({ color: '#fffbe0' });
    const JELLY = mat('#f6b4d0', { transparent: true, opacity: 0.55, roughness: 0.2, emissive: '#f08ab8', emissiveIntensity: 0.3, side: THREE.DoubleSide, depthWrite: false });
    const TENT = mat('#f3a0c4', { transparent: true, opacity: 0.8, depthWrite: false }), RING = mat('#e0609f');
    const SY = 38; // sea surface
    const k = kit(root);
    [[-30, 2, -14, 4], [-14, 1.5, -18, 3], [22, 2, -12, 4.5], [30, 1.2, 4, 2.5], [-38, 1, 6, 2.6]].forEach(([x, y, z, r]) => k.geo(new THREE.IcosahedronGeometry(r, 0), ROCK, x, y, z));
    [[18, -6], [-24, -9], [27, -2]].forEach(([x, z], i) => {
      const m = i % 2 ? CORAL2 : CORAL;
      k.geo(new THREE.CylinderGeometry(0.35, 0.5, 6, 8), m, x, 3, z).geo(new THREE.CylinderGeometry(0.25, 0.35, 4, 8), m, x + 1.2, 4.8, z, 0, 0, -0.6)
        .geo(new THREE.CylinderGeometry(0.25, 0.35, 3.6, 8), m, x - 1.1, 4.4, z, 0, 0, 0.6);
    });
    // The ship on the surface, with the frame the cable hangs from.
    k.box(34, 4.5, 9, D, -18, SY, -50).box(10, 5, 7, W, -12, SY + 4.6, -50).box(1, 10, 1, Y, -32, SY + 5.5, -53.5).box(1, 10, 1, Y, -32, SY + 5.5, -46.5).box(1, 1, 8, Y, -32, SY + 10.5, -50);
    k.done();
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(500, 300).rotateX(-PI / 2),
      new THREE.MeshBasicMaterial({ color: '#bfeaf7', transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }));
    sea.position.y = SY - 0.5;
    root.add(sea);

    // The underwater robot: a yellow float on a frame, thrusters, lamps, a camera, a short arm with the palm.
    const rov = group(root);
    const r = kit(rov);
    r.box(12, 3, 8, Y, 0, 3.5, 0).box(9, 2.4, 5, W, -0.5, 0.3, 0);
    [[-5.5, -3.4], [5.5, -3.4], [-5.5, 3.4], [5.5, 3.4]].forEach(([x, z]) => r.box(0.7, 5.4, 0.7, D, x, -0.5, z));
    r.box(12, 0.7, 0.7, D, 0, -3, 3.4).box(12, 0.7, 0.7, D, 0, -3, -3.4);
    [-3.4, 3.4].forEach((z) => r.cyl(1.1, 2.6, K, -6.4, 1, z, 'x').cyl(1.15, 0.4, A, -5.3, 1, z, 'x'));
    r.geo(new THREE.SphereGeometry(1.2, 14, 10), K, 4.6, 0.6, 0).cyl(0.6, 0.4, LAMP, 6.2, 3.5, 2.6, 'x').cyl(0.6, 0.4, LAMP, 6.2, 3.5, -2.6, 'x');
    r.geo(new THREE.BoxGeometry(5.2, 0.9, 0.9), D, 8, -3.3, 0, 0, 0, -0.53).box(1.4, 1.4, 1.4, G, 10.4, -4.7, 0).done();
    const palm = group(rov, 10.4, -5.4, 0); // origin on the palm's underside, turned so the fingers curl across the view
    palm.rotation.y = PI / 2;
    kit(palm).box(6.2, 0.6, 3.6, W, 0, 0.3, 0).done();
    // Six flat silicone fingers in two rows. Water pumped in curls each one; the closed angles lay them round the bell.
    const OPEN = [-1.05, -0.17], SHUT = [-0.91, 0.39];
    const noodles = [];
    [-2, 0, 2].forEach((x) => [1, -1].forEach((side) => {
      let p = group(palm, x, 0, side * 1.5);
      const segs = [];
      for (let j = 0; j < 5; j++) {
        kit(p).box(1.1, 1.3, 0.24, NOODLE, 0, -0.65, 0).done();
        segs.push(p);
        p = group(p, 0, -1.3, 0);
      }
      noodles.push({ segs, side });
    }));

    // Moon jelly: a see-through bell with four pale rings inside, tentacles that sway.
    const jelly = group(root), bell = group(jelly);
    const jk = kit(bell).geo(new THREE.SphereGeometry(3, 22, 12, 0, 2 * PI, 0, PI * 0.56).scale(1, 0.8, 1), JELLY);
    for (let i = 0; i < 4; i++) jk.geo(new THREE.TorusGeometry(0.6, 0.16, 6, 14, PI * 1.5).rotateX(PI / 2), RING, Math.cos(i * PI / 2) * 1.1, 1.5, Math.sin(i * PI / 2) * 1.1, 0, i * PI / 2, 0);
    jk.done();
    const tentacles = Array.from({ length: 8 }, (_, i) => {
      let p = group(jelly, Math.cos(i * PI / 4) * 2.6, -0.3, Math.sin(i * PI / 4) * 2.6);
      return [0, 1, 2].map(() => {
        const seg = p;
        kit(seg).cyl(0.09, 2.2, TENT, 0, -1.1, 0).done();
        p = group(seg, 0, -2.2, 0);
        return seg;
      });
    });

    const cable = [limb(root, K, 0.3), limb(root, K, 0.3)], dots = [0, 1, 2, 3].map(() => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.55, 10, 8), new THREE.MeshBasicMaterial({ color: '#7fe6ff' }));
      root.add(m);
      return m;
    });
    const look = beam(root, 3.6), bubbles = spray(root, 40, '#e8f8ff', 0.6, { speed: 3, gravity: 4, life: 1.2, spread: 1.2 }); // short life: they burst before the surface
    const REL = vec(8, 12.2, 0), SWIM = vec(12, 10, -8), TOP = vec(-32, SY + 10.5, -50), SAG = vec(-4, -8, 6);
    const jp = vec(0, 0, 0), end = vec(0, 0, 0), mid = vec(0, 0, 0), eye = vec(0, 0, 0), o = vec(0, 0, 0);
    return (s, t) => {
      rov.position.set(s.rx, s.ry, 0);
      noodles.forEach(({ segs, side }) => segs.forEach((seg, j) => { seg.rotation.x = side * lerp(OPEN[j ? 1 : 0], SHUT[j ? 1 : 0], s.grip); }));
      // Free, held under the palm (bell top against it), or swimming away from where it was let go.
      if (s.hold < 0.5) jp.set(s.jx, s.jy, 0);
      else if (s.hold < 1.5) jp.set(s.rx + 10.4, s.ry - 7.8, 0);
      else jp.copy(REL).addScaledVector(SWIM, s.swim);
      jelly.position.copy(jp);
      const beat = Math.sin(t * 4.8);
      bell.scale.set(1 + 0.06 * beat, 1 - 0.08 * beat, 1 + 0.06 * beat);
      tentacles.forEach((tt, i) => tt.forEach((seg, j) => {
        seg.rotation.x = 0.22 * Math.sin(t * 2.2 + i + j * 0.9);
        seg.rotation.z = 0.18 * Math.cos(t * 1.7 + i * 1.3 + j);
      }));
      end.set(s.rx - 2, s.ry + 5, 0);
      mid.lerpVectors(TOP, end, 0.5).add(SAG);
      cable[0](TOP, mid);
      cable[1](mid, end);
      // Commands run down the cable from the pilot on the ship.
      dots.forEach((m, i) => {
        const q = (t * 0.35 + i / 4) % 1;
        if (q < 0.5) m.position.lerpVectors(TOP, mid, q * 2);
        else m.position.lerpVectors(mid, end, q * 2 - 1);
      });
      look(eye.set(s.rx + 4.6, s.ry + 0.6, 0), jp, s.scan);
      bubbles(true, t, o.set(s.rx - 7, s.ry + 1, 0));
    };
  }

  /* ---------- 5. Hot cell: the arm behind the glass copies the hand ---------- */

  function hotcell(root) {
    ground(root);
    const CONC = mat('#c4cbd0', { roughness: 0.85 }), CONC2 = mat('#dde2e6', { roughness: 0.85 }), GLASS = mat('#f3cf5a', { transparent: true, opacity: 0.42, roughness: 0.1, depthWrite: false });
    const D = mat('#2b333b'), K = mat('#16151a'), STEEL = mat('#8d99a3', { metalness: 0.4, roughness: 0.4 }), M = mat('#c92e85');
    const SKIN = mat('#e8b58e'), COAT = mat('#eceded'), PANTS = mat('#2b333b'), HAIR = mat('#5a3d2b'), TUBE = mat('#dff4fa', { transparent: true, opacity: 0.45, depthWrite: false });
    const k = kit(root);
    // The wall is cut open at the front so its thickness shows: concrete below and above, lead glass between.
    k.box(6, 9, 26, CONC, 0, 4.5, -5).box(6, 11, 26, CONC, 0, 26.5, -5).box(6, 12, 3, CONC, 0, 15, -16.5);
    k.geo(new THREE.BoxGeometry(5.6, 12, 23), GLASS, 0, 15, -3.5);
    // The through-wall tube of the manipulator.
    k.cyl(1.1, 15, STEEL, 0, 25, 0, 'x').cyl(1.8, 1, D, -7.5, 25, 0, 'x').cyl(1.8, 1, D, 7.5, 25, 0, 'x');
    // Inside the cell: back wall, bench, a heavy container.
    k.box(26, 32, 1, CONC2, 16, 16, -18).box(15, 1, 8, STEEL, 13.5, 9.5, 0);
    [[7, -3.4], [20, -3.4], [7, 3.4], [20, 3.4]].forEach(([x, z]) => k.box(0.8, 9, 0.8, D, x, 4.5, z));
    k.cyl(2, 3.6, D, 17.5, 11.8, 0).cyl(1.3, 0.1, K, 17.5, 13.65, 0);
    // The operator in a white coat. The left arm hangs, the right one holds the handle.
    const PX = -22.5;
    k.cyl(1, 9, PANTS, PX, 4.5, 1.1).cyl(1, 9, PANTS, PX, 4.5, -1.1).box(2.6, 1, 1.6, K, PX + 0.6, 0.5, 1.1).box(2.6, 1, 1.6, K, PX + 0.6, 0.5, -1.1);
    k.cyl(2.3, 9, COAT, PX, 13.4, 0, null, 2.7).geo(new THREE.SphereGeometry(2.4, 18, 12).scale(1, 0.6, 1.15), COAT, PX, 17.8, 0);
    k.cyl(0.8, 1.4, SKIN, PX, 19, 0).geo(new THREE.SphereGeometry(2, 18, 12), SKIN, PX + 0.2, 21, 0).geo(new THREE.SphereGeometry(2.12, 18, 12, 0, 2 * PI, 0, 1.4), HAIR, PX - 0.2, 21.3, 0);
    k.cyl(0.75, 8.5, COAT, PX + 0.3, 13.4, -2.9).done();
    canvasSprite(root, 128, 128, 6, (g) => { // radiation sign on the cell wall
      g.fillStyle = '#fed920';
      g.beginPath(); g.arc(64, 64, 60, 0, 2 * PI); g.fill();
      g.fillStyle = '#16151a';
      for (let i = 0; i < 3; i++) {
        const a = PI / 2 + i * 2 * PI / 3;
        g.beginPath(); g.moveTo(64, 64); g.arc(64, 64, 48, a - PI / 6, a + PI / 6); g.closePath(); g.fill();
      }
      g.fillStyle = '#fed920'; g.beginPath(); g.arc(64, 64, 14, 0, 2 * PI); g.fill();
      g.fillStyle = '#16151a'; g.beginPath(); g.arc(64, 64, 9, 0, 2 * PI); g.fill();
    }).position.set(16, 25, -17);

    // Handle outside, tongs inside: each hangs from its end of the tube on two links.
    const grip = group(root), tong = group(root);
    kit(grip).box(1.2, 3.4, 1.4, K, 0, -0.4, 0).box(2.4, 0.9, 0.9, D, 0, 2, 0).box(0.5, 1, 0.6, M, 0.8, 0, 0).done();
    kit(tong).box(1.6, 1.4, 1.6, STEEL, 0, 2, 0).done();
    const jaws = [-1, 1].map((sgn) => {
      const j = group(tong, sgn * 0.5, 1.3, 0);
      kit(j).box(0.4, 2.6, 1, D, 0, -1.3, 0).done();
      return j;
    });
    const vial = group(root); // origin at its bottom
    kit(vial).cyl(0.55, 3.4, TUBE, 0, 1.7, 0).cyl(0.47, 2, M, 0, 1.05, 0).done();
    const links = [0, 1, 2, 3].map(() => limb(root, STEEL, 0.65)), joints = [0, 1].map(() => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.95, 12, 8), D);
      root.add(m);
      return m;
    });
    const upP = limb(root, COAT, 0.75), loP = limb(root, COAT, 0.6), fist = new THREE.Mesh(new THREE.SphereGeometry(0.8, 12, 8), SKIN);
    root.add(fist);
    const feelH = pulses(grip, '#c92e85', 0, 0, 0), feelT = pulses(tong, '#c92e85', 0, 0, 0); // force felt at both ends
    const SM = vec(-7.5, 25, 0), SS = vec(7.5, 25, 0), SH = vec(PX + 0.4, 17.3, 2.6), H = vec(0, 0, 0), T = vec(0, 0, 0), top = vec(0, 0, 0);
    const POLE_M = vec(-1, 0.2, 0), POLE_S = vec(1, 0.2, 0), POLE_P = vec(0.2, -1, 0.6);
    return (s, t) => {
      H.set(s.hx, s.hy, 0);
      T.set(s.hx + 29.5, s.hy, 0); // the tongs copy the handle: push it towards the wall, the tongs go deeper into the cell
      grip.position.copy(H);
      tong.position.copy(T);
      jaws.forEach((j, i) => { j.rotation.z = (i ? 1 : -1) * lerp(0.32, 0.06, s.grip); });
      [[SM, H, POLE_M, 0], [SS, T, POLE_S, 2]].forEach(([sh, p, pole, n]) => {
        top.set(p.x, p.y + 2.6, 0);
        const e = elbow(sh, top, 11, pole);
        links[n](sh, e);
        links[n + 1](e, top);
        joints[n / 2].position.copy(e);
      });
      const e = elbow(SH, H, 6.5, POLE_P);
      upP(SH, e);
      loP(e, H);
      fist.position.copy(H);
      if (s.hold < 0.5) vial.position.set(12, 10, 0);
      else if (s.hold < 1.5) vial.position.set(T.x, T.y - 1.7, 0);
      else vial.position.set(17.5, 10.3, 0);
      feelH(s.feel, t);
      feelT(s.feel, t);
    };
  }

  /* ---------- 6. Claw machine: how hard it grips is a setting ---------- */

  function clawMachine(root) {
    ground(root, 0.18);
    const M = mat('#c92e85'), K = mat('#16151a'), D = mat('#2b333b'), Y = mat('#fed920'), A = mat('#01adc4'), W = mat('#eceded'), STEEL = mat('#c4cbd0', { metalness: 0.5, roughness: 0.3 });
    const RED = mat('#d8232f'), GREEN = mat('#57b552'), ORANGE = mat('#ff8a00'), PINK = mat('#f6b4d0');
    const CLEAR = mat('#dff4fa', { transparent: true, opacity: 0.14, roughness: 0.05, depthWrite: false, side: THREE.DoubleSide });
    const CHUTE = mat('#01adc4', { transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide });
    const k = kit(root);
    // Cabinet: base, corner posts, roof, glass.
    k.box(20, 13, 16, M, 0, 6.5, 0).box(21, 3, 17, M, 0, 34.5, 0).box(16, 2.2, 0.6, Y, 0, 34.5, 8.6);
    [[-9.7, -7.7], [9.7, -7.7], [-9.7, 7.7], [9.7, 7.7]].forEach(([x, z]) => k.box(0.6, 20, 0.6, K, x, 23, z));
    k.geo(new THREE.PlaneGeometry(19.4, 20), CLEAR, 0, 23, 7.7).geo(new THREE.PlaneGeometry(15.4, 20), CLEAR, -9.7, 23, 0, 0, PI / 2).geo(new THREE.PlaneGeometry(15.4, 20), CLEAR, 9.7, 23, 0, 0, PI / 2);
    // Console with the joystick and the button.
    k.box(20, 1.6, 4, D, 0, 12.2, 9.4).cyl(0.22, 2.4, K, -4, 14, 9.4).geo(new THREE.SphereGeometry(0.75, 14, 10), RED, -4, 15.4, 9.4).cyl(1, 0.6, Y, 3, 13.2, 9.4);
    // Prize chute in the front left corner, the door below where the prize comes out.
    k.geo(new THREE.PlaneGeometry(5.3, 5), CHUTE, -3.6, 15.5, 5.05, 0, PI / 2).geo(new THREE.PlaneGeometry(6.1, 5), CHUTE, -6.65, 15.5, 2.4).bar(6, 0.05, 5.2, K, -6.65, 13.03, 5.05);
    k.box(6, 4.6, 0.5, K, -6.4, 4, 8.1).box(6, 0.6, 2.4, D, -6.4, 1.9, 9.1);
    // Gantry rails.
    k.box(19, 0.6, 0.6, STEEL, 0, 32.3, 7).box(19, 0.6, 0.6, STEEL, 0, 32.3, -7);
    // Plush bears. Offsets turn with the toy, so a whole pile still merges into a few meshes.
    const bear = (kt, x, y, z, ry, body) => {
      const c = Math.cos(ry), sn = Math.sin(ry), at = (ox, oy, oz) => [x + ox * c + oz * sn, y + oy, z - ox * sn + oz * c];
      return kt.geo(new THREE.SphereGeometry(1.35, 14, 10), body, ...at(0, 0, 0)).geo(new THREE.SphereGeometry(1, 14, 10), body, ...at(0, 1.6, 0.25))
        .geo(new THREE.SphereGeometry(0.4, 10, 8), body, ...at(-0.7, 2.35, 0.15)).geo(new THREE.SphereGeometry(0.4, 10, 8), body, ...at(0.7, 2.35, 0.15))
        .geo(new THREE.SphereGeometry(0.42, 10, 8), W, ...at(0, 1.45, 1.1)).geo(new THREE.SphereGeometry(0.12, 6, 4), K, ...at(0, 1.55, 1.52));
    };
    [[-1.4, 14.35, -5, 0.4, Y], [2.6, 14.35, -5.2, -0.3, PINK], [6.6, 14.35, -4.6, 0.8, W], [7.8, 14.35, 0.2, -0.6, ORANGE], [6.6, 14.35, 4.6, 0.2, GREEN],
      [2.4, 14.35, 5.3, -0.9, Y], [-1.8, 14.35, 1.4, 0.5, RED], [-2, 14.35, -2.2, 1.1, GREEN], [0.4, 16.6, -3.4, 1.2, ORANGE], [5.6, 16.6, -1.8, -0.4, Y], [6.2, 16.6, 2.8, 0.9, PINK]]
      .forEach(([x, y, z, ry, m]) => bear(k, x, y, z, ry, m));
    k.done();
    const toy = group(root);
    bear(kit(toy), 0, 0, 0, 0, A).done();

    const bridge = group(root), cart = group(root), claw = group(root);
    kit(bridge).box(0.9, 0.9, 15, STEEL, 0, 0, 0).done();
    kit(cart).box(2.2, 1.2, 2.2, D, 0, 0, 0).done();
    kit(claw).cyl(1.1, 1.6, STEEL, 0, 0.8, 0).cyl(0.5, 0.8, D, 0, 1.9, 0).done();
    // Three prongs on hinges round the hub. A coil pulls them shut: more voltage, harder grip.
    const prongs = [0, 1, 2].map((i) => {
      const arm = group(claw);
      arm.rotation.y = i * 2 * PI / 3;
      const j = group(arm, 0.85, 0.2, 0);
      kit(j).box(0.42, 2.8, 0.55, STEEL, 0, -1.4, 0).geo(new THREE.BoxGeometry(0.42, 1.3, 0.55), STEEL, -0.4, -3.2, 0, 0, 0, -0.75).done();
      return j;
    });
    const rope = limb(root, K, 0.12);
    const weak = label(root, 'қармау: әлсіз', 0, 34.5, 9.3, 15), strong = label(root, 'қармау: толық', 0, 34.5, 9.3, 15, '#ffffff', '#c92e85');
    weak.material.depthTest = strong.material.depthTest = false; // seen from the side, the roof would cut the sign in half
    const GRIP = 2.85, T0 = vec(2.6, 14.35, 1), TRAY = vec(-6.6, 3.9, 8.6), from = vec(0, 0, 0), a = vec(0, 0, 0), b = vec(0, 0, 0);
    return (s) => {
      bridge.position.set(s.cx, 32.3, 0);
      cart.position.set(s.cx, 31.5, s.cz);
      claw.position.set(s.cx, s.cy, s.cz);
      rope(a.set(s.cx, 31, s.cz), b.set(s.cx, s.cy + 2.3, s.cz));
      prongs.forEach((p) => { p.rotation.z = lerp(0.5, 0.3, s.grip); }); // shut, the tips press into the toy instead of crossing inside it
      from.set(s.cx, s.cy - GRIP - s.slip, s.cz);
      if (s.chute > 0) toy.position.set(-6.6, lerp(27 - GRIP, TRAY.y, s.chute * s.chute), lerp(5, TRAY.z, s.chute * s.chute)); // let go over the chute
      else if (s.held > 0.5) toy.position.copy(from);
      else if (s.slip > 0 && s.fall < 1) toy.position.lerpVectors(from, T0, s.fall * s.fall); // slipped out, falls back on the pile (slip, not fall: no blink onto the pile first)
      else toy.position.copy(T0);
      weak.visible = s.full < 0.5;
      strong.visible = !weak.visible;
    };
  }

  /* ---------- The six stories ---------- */

  RA.SCENES = [
    {
      id: 'recycling', title: 'Сұрыптау', tag: 'сорғыш', bg: 'linear-gradient(#f2f6ee, #d9e3d1)',
      camera: [22, 60, 90], target: [1, 7, -4], poster: 6.9,
      where: 'Қайта өңдеу үшін қоқыс сұрыпталатын зауыт.',
      does: 'Қоқыс конвейермен келеді. Робот ағыннан керекті заттарды, мысалы, бөтелкелерді іліп алып, өз бункеріне лақтырады.',
      grip: 'Вакуумды қармауыш', how: 'Сорғыш затқа түседі, насос сорғыштың ішіндегі ауаны сорып шығарады, сонда зат жабысып қалады. Сорғышта қозғалатын бөлшектер механикалық қысқашқа қарағанда аз, сондықтан ол сирегірек бұзылады.',
      sensors: 'Конвейердің үстіндегі камералар. Нейрондық желі затты түсінен, пішінінен және өлшемінен таниды.',
      level: 2, auto: 'Қай затты алып, қайда лақтыру керегін өзі шешеді. AMP Robotics компаниясы өз роботы минутына 80 затқа дейін, яғни адамнан шамамен екі есе жылдам алады деп жазады.',
      common: 'Біздің сабағымыз да қоқыс жинау туралы. Әр қармауыштың әлсіз жері бар: сорғышқа мыжылған немесе кір қаптаманы ұстап тұру қиын. 1-қармауыш пен 2-қармауышты сынағанда, біз де әлсіз жерлерін іздейміз.',
      start: { near: 0, up: 1, bin: 0, vac: 0, hold: 0, scan: 0, mark: 0 },
      phases: [
        { s: 1.6, text: 'Қоқыс конвейермен келеді' },
        { s: 1.8, text: 'Камера бөтелкені таниды', scan: 1, mark: 1 },
        { s: 1, scan: 0 },
        { s: 1.3, text: 'Сорғыш бөтелкені қуып жетеді', near: 1, mark: 0 },
        { s: 0.6, up: 0 },
        { s: 0.7, text: 'Насос ауаны сорып алды', vac: 1, hold: 1 },
        { s: 0.6, up: 1 },
        { s: 1.5, text: 'Бөтелке бункерге ұшып түседі', bin: 1 },
        { s: 0.6, vac: 0, hold: 2 },
        { s: 1.6, near: 0, bin: 0 },
      ],
      build: recycling,
    },
    {
      id: 'prosthesis', title: 'Қол протезі', tag: 'қол басы', bg: 'linear-gradient(#fbf7f1, #eadfd2)',
      camera: [10, 30, 66], target: [-4, 6, 0], poster: 6.2,
      where: 'Адамның қолында: протез қол басының орнын басады.',
      does: 'Қағаз стақанды алып, ұстап тұрады да, қайта орнына қояды. Стақан жаншылмайды.',
      grip: 'Қол басының протезі', how: 'Мотор саусақтарды бүгеді, сонда олар стақанды орап ұстайды. Кейбір протездер заттың сырғып бара жатқанын байқайды да, секундтан аз уақытта оны қаттырақ қысады.',
      sensors: 'Протездің ішіндегі электродтар терідегі бұлшықет сигналдарын қабылдайды. Бір бұлшықетті жиырсаң, қол басы қысылады. Екіншісін жиырсаң, ол ашылады. Кейбір протездерде заттың сырғанағанын байқайтын датчиктер де бар.',
      level: 1, auto: 'Қашан қысу, қашан босату керегін адам шешеді. Ал зат сырғанаса, қол басы оны өзі қаттырақ қысады: оның бағдарламасы осылай жұмыс істейді.',
      common: 'Біздің басқару құрылғымыз сияқты: адам команда береді, мотор қысады. Мұнда күш датчигінің орнына бұлшықет жұмыс істейді. Ал абайлап қысуды «Абайлап» тапсырмасында үйренеміз.',
      start: { ax: -11, ay: 1, grip: 0, sig: 0, open: 0, slip: 0, tight: 0, hold: 0 },
      phases: [
        { s: 1.7, text: 'Қол басы стақанға жақындайды', ax: 0, ay: 0 },
        { s: 0.8, text: 'Бұлшықет жиырылды: қысу', sig: 1 },
        { s: 1, grip: 1, hold: 1 },
        { s: 0.4, sig: 0 },
        { s: 1.4, text: 'Стақан бүтін күйінде көтерілді', ay: 5 },
        { s: 0.5, text: 'Сырғанап жатыр ма? Қол басы қаттырақ қысады', slip: 1 },
        { s: 0.5, tight: 1 },
        { s: 0.9 },
        { s: 1.4, text: 'Стақан қайтадан үстелде', ay: 0.6 },
        { s: 0.6, text: 'Екінші бұлшықет: ашу', open: 1 },
        { s: 0.9, grip: 0, tight: 0, hold: 2 },
        { s: 0.3, open: 0 },
        { s: 1.5, ax: -11, ay: 1, slip: 0 },
      ],
      build: prosthesis,
    },
    {
      id: 'bakery', title: 'Наубайхана', tag: 'жұмсақ саусақтар', bg: 'linear-gradient(#fff7ea, #f1dfc2)',
      camera: [22, 42, 96], target: [-6, 8, -1], poster: 6.6,
      where: 'Нан мен тоқаштар қораптарға салынатын наубайхана.',
      does: 'Тоқаштарды жаншымай, конвейерден қорапқа ауыстырып салады.',
      grip: 'Жұмсақ қармауыш', how: 'Жұмсақ резеңкеден жасалған саусақтардың іші қуыс. Оларға ауа беріледі, сонда олар иіліп, тоқашты құшақтайды. Ауаны шығарса, саусақтар ашылады.',
      sensors: 'Конвейердің үстіндегі 3D-камера әр тоқаштың қайда жатқанын көреді.',
      level: 1, auto: 'Пультсіз, бағдарлама бойынша жұмыс істейді. Қайда созылу керегін камера көрсетеді.',
      common: 'Жұмсақ саусақтар біздің 1-қармауышымызға ұқсайды: иілгіш тұзақтар жеңіл затты жаншымай құшақтайды. Ал қатты 2-қармауыш қағаз шарды күшпен қысса, жаншып тастайды.',
      start: { belt: 0, x: 6, y: 15, z: -1, grip: 0, hold: 0, scan: 0, air: 0 },
      phases: [
        { s: 2.2, text: 'Тоқаштар пештен шығып келеді', belt: 1 },
        { s: 1.4, text: '3D-камера тоқашты іздейді', scan: 1 },
        { s: 1.3, text: 'Қол тоқаштың үстінде', x: 0, y: 12.2, z: 0, scan: 0 },
        { s: 0.8, y: 7.15 },
        { s: 1, text: 'Ауа саусақтарды толтырды', grip: 1, air: 1, hold: 1 },
        { s: 0.3, air: 0 },
        { s: 0.9, text: 'Тоқаш қорапқа қарай жылжиды', y: 13 },
        { s: 1.6, x: 15.5, y: 10, z: 3.5 },
        { s: 0.8, y: 5.85 },
        { s: 0.9, text: 'Ауа шықты, саусақтар ашылды', grip: 0, air: 1, hold: 2 },
        { s: 0.3, air: 0 },
        { s: 1.4, x: 6, y: 15, z: -1 },
      ],
      build: bakery,
    },
    {
      id: 'ocean', title: 'Мұхит', tag: 'кеспе саусақтар', bg: 'linear-gradient(#3aa5d4, #0f5288 55%, #072b4f)',
      camera: [10, 10, 104], target: [-6, 17, 0], poster: 7.4,
      where: 'Теңіз. Су асты роботындағы жұмсақ қармауыштар Қызыл теңізде 170 метр тереңдікке дейін сыналған. Кеспе саусақтар аквариумдағы тірі медузаларда тексерілген.',
      does: 'Ғалымдар қарап шығуы үшін медузаны ұстап алады, сосын оны аман-есен босатады.',
      grip: 'Кеспе саусақтар', how: 'Жұмсақ резеңкеден жасалған алты жіңішке жалпақ саусақ. Оларға су айдалады, сонда олар медузаны орап алады. Олардың қысымы қабақтың көзге түсіретін қысымынан он еседен астам аз.',
      sensors: 'Роботтағы камералар мен прожекторлар. Пилот медузаны тек экраннан көреді.',
      level: 0, auto: 'Қолмен басқару. Робот кемеге кабельмен жалғанған, пилот оны бейнеойындағыдай джойстикпен жүргізеді.',
      common: 'Пилот медузаны қаншалықты қатты қысқанын сезбейді: роботта тек камера бар. Ғалымдар роботқа сипап сезу қабілетін қосқысы келеді. Біздің күш датчигіміз де басуды сезеді, бірақ ол басқару құрылғысында тұр және қысқаштағы затты емес, саусақты сезеді.',
      start: { rx: -30, ry: 26, jx: 8, jy: 8.5, grip: 0, hold: 0, scan: 0, swim: 0 },
      phases: [
        { s: 2.6, text: 'Кемедегі пилот роботты жүргізеді', rx: -9, ry: 21 },
        { s: 1.6, text: 'Камера медузаны көреді', scan: 1, jy: 9.5 },
        { s: 1.4, rx: -2.4, ry: 17.8, scan: 0, jy: 10 },
        { s: 1.5, text: 'Су кеспе саусақтарды толтырады', grip: 1, hold: 1 },
        { s: 1.6, text: 'Медуза аман-есен ұсталды', ry: 20 },
        { s: 0.8 },
        { s: 1.2, text: 'Саусақтар ашылды', grip: 0, hold: 2 },
        { s: 2.4, text: 'Медуза жүзіп кетеді', swim: 1, rx: -30, ry: 26 },
      ],
      build: ocean,
    },
    {
      id: 'hotcell', title: 'Әйнек артында', tag: 'көшірме қол', bg: 'linear-gradient(#f1f3f5, #d5dbe0)',
      camera: [8, 30, 118], target: [-2, 13, -2], poster: 5.9,
      where: 'Радиоактивті заттармен жұмыс істелетін зертхана. Қалың қабырғаның ар жағындағы бөлме ыстық камера деп аталады.',
      does: 'Адам тұтқаны сырттан қозғайды, ал іштегі қол әр қимылды қайталап, пробирканы тасиды.',
      grip: 'Көшіргіш манипулятор', how: 'Тұтқа мен қысқашты қабырға арқылы болат таспалар мен тростар байланыстырады. Сондықтан адам қысқаштың пробирканы қаншалықты қатты қысқанын қолымен сезеді.',
      sensors: 'Датчиктер жоқ, қол механикалық. Адам қалың қорғасынды әйнектен жасалған терезеден қарайды, бұл әйнек сәулеленуден қорғайды.',
      level: 0, auto: 'Тек қолмен басқару: қол адамның қимылдарын қайталайды. Алғашқы осындай қол 1948 жылы АҚШ-та жасалды.',
      common: 'Адам қысқашты қабырғаның өз жағынан басқарады, біз де басқару құрылғысынан солай басқарамыз. Тек мұнда күш кері бағытта да беріледі: адам қысқаштың қаншалықты қатты қысылғанын қолымен сезеді.',
      start: { hx: -15, hy: 17, grip: 0, hold: 0, feel: 0 },
      phases: [
        { s: 2, text: 'Адам тұтқаны қозғайды', hx: -17.5, hy: 15 },
        { s: 1.2, text: 'Әйнек артындағы қысқаш қайталайды', hy: 11.7 },
        { s: 0.9, text: 'Қысқаш пробирканы қысты', grip: 1, hold: 1, feel: 1 },
        { s: 0.9, text: 'Адам қармау күшін сезеді' },
        { s: 1, text: 'Пробирка контейнерге қарай жылжиды', hy: 17 },
        { s: 1.8, hx: -12 },
        { s: 1, hy: 14.2 },
        { s: 0.8, grip: 0, hold: 2, feel: 0 },
        { s: 1.2, text: 'Адам қауіпсіз жерде', hy: 17 },
        { s: 1.2, hx: -15 },
      ],
      build: hotcell,
    },
    {
      id: 'claw', title: 'Ойыншықтары бар автомат', tag: 'қысқаш', bg: 'linear-gradient(#fdf2f8, #f0d2e3)',
      camera: [26, 30, 92], target: [0, 18, 1], poster: 11.6,
      where: 'Сауда орталығындағы немесе ойын залындағы ойын автоматы.',
      does: 'Ойыншы қысқашты бағыттап, батырманы басады. Қысқаш төмен түсіп, қысылады да, ойыншықты науаға апарады. Немесе оны жолда түсіріп алады.',
      grip: 'Қысқаш', how: 'Қысқаш тросқа ілулі тұрады, оның саусақтарын электромагнит қысады. Электромагнит неғұрлым күшті болса, қармау соғұрлым берік болады. Электромагниттің күшін автоматтың иесі баптауларда белгілейді.',
      sensors: 'Ойыншының джойстигі мен батырмасы. Бағдарлама ойындарды санап, қысқашқа қашан толық күш беру керегін шешеді.',
      level: 1, auto: 'Ойыншы тек қысқашты бағыттайды. Батырма басылған соң бағдарлама жұмыс істейді: түсіру, қысу, көтеру, науаға апару.',
      common: 'Мұнда қармау күші — бағдарламадағы жай ғана сан. Біздің «Абайлап» тапсырмамызда да солай: A моторының қуаты «(E) қысымы, %» блогынан алынады. Қуат аз болса, алма 2-қармауыштан сырғып түседі.',
      start: { cx: -6.6, cz: 5, cy: 29, grip: 0, held: 0, slip: 0, fall: 0, chute: 0, full: 0 },
      phases: [
        { s: 2, text: 'Ойыншы қысқашты джойстикпен жүргізеді', cx: 2.6, cz: 1 },
        { s: 1.4, text: 'Батырма: қысқаш төмен түседі', cy: 17.2 },
        { s: 0.7, text: 'Әлсіз қармау: ойыншық сырғып түседі', grip: 0.9, held: 1 },
        { s: 1, cy: 23, slip: 1.6, grip: 0.5 }, // a weak claw touches the toy, then loosens on the way up
        { s: 0.05, held: 0 },
        { s: 0.6, fall: 1 },
        { s: 0.6, cy: 29, slip: 0, grip: 0 },
        { s: 0.9, text: 'Жаңа ойын: толық күш', full: 1 },
        { s: 1.4, cy: 17.2 },
        { s: 0.7, grip: 1, held: 1 },
        { s: 1, text: 'Қысқаш ойыншықты науаға апарады', cy: 27 },
        { s: 1.8, cx: -6.6, cz: 5 },
        { s: 0.5, text: 'Жүлде науада', grip: 0, held: 0, chute: 0.08 },
        { s: 0.9, chute: 1 },
        { s: 0.9, cy: 29 },
      ],
      build: clawMachine,
    },
  ];
})();
