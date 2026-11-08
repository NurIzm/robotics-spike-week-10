// «Захваты»: a procedural LEGO SPIKE Prime model. A hand controller (hub, stand, Force Sensor) and two grabbers, one fixed on its front.
// 1 unit = 1 LEGO module (8 mm). +X runs from the hub towards the claw, +Y is up, +Z faces the viewer; Y=0 is the table, X=0 the hub's front end.
// Geometry and materials are built once; each createGrabber() only adds meshes and its own state.
(function () {
  const RA = window.RA;
  const T = THREE;
  const { mergeGeometries, toCreasedNormals } = T.BufferGeometryUtils;
  const Q = Math.PI / 2, TAU = Math.PI * 2, DEG = Math.PI / 180;
  const clamp = T.MathUtils.clamp;
  const smooth = (t) => t * t * (3 - 2 * t);
  const polar = (a, r = 1) => [Math.cos(a) * r, Math.sin(a) * r];

  const PARTS = [
    { id: 'hub', name: 'Хаб', role: 'Мозг: хранит программу, читает датчик и управляет мотором' },
    { id: 'stand', name: 'Стойка', role: 'Держит датчик силы над хабом' },
    { id: 'sensor', name: 'Датчик силы', role: 'Кнопка, которая чувствует, как сильно её нажали. Порт E' },
    { id: 'grabber1', name: 'Захват 1', role: 'Гибкий: свой мотор и две петли из ребристого шланга' },
    { id: 'grabber2', name: 'Захват 2', role: 'Раздвоенный: свой мотор и жёсткая клешня из чёрных гнутых балок' },
    { id: 'cables', name: 'Кабели', role: 'Нервы: датчик в порту E, мотор в порту A' },
  ];
  // The claw's box when attached; gaps are the clear distance between the contact surfaces.
  const GRABBERS = {
    1: { name: 'Захват 1', kind: 'гибкий', openGap: 7, closedGap: 0, reach: [9, 19], height: [5, 10] },
    2: { name: 'Захват 2', kind: 'раздвоенный', openGap: 12, closedGap: 3, reach: [9, 21], height: [6, 9.5] },
  };
  const STAGES = [
    { id: 'base', build: 'Устройство управления', title: 'Хаб и стойка', steps: '1–15', parts: 'Хаб, длинные чёрные балки, голубая балка, пурпурные балки',
      text: 'На торце хаба, со стороны центральной кнопки, собери стойку из чёрных, голубой и пурпурных балок.' },
    { id: 'sensor', build: 'Устройство управления', title: 'Датчик силы', steps: '1–15', parts: 'Датчик силы, маленькое чёрное колесо',
      text: 'Закрепи датчик силы на верху стойки кнопкой вперёд и надень на кнопку маленькое колесо: на него удобно нажимать пальцем. Кабель датчика вставь в порт E.' },
    { id: 'g1frame', build: 'Захват 1', title: 'Мотор и рамка захвата 1', steps: '1–23', parts: 'Мотор, голубые, пурпурные и серые детали',
      text: 'У захвата свой мотор. Вокруг него собери рамку, а сзади крепление к устройству управления.' },
    { id: 'g1loops', build: 'Захват 1', title: 'Гибкие петли', steps: '1–23', parts: 'Серые ребристые шланги, жёлтые соединители',
      text: 'Согни шланг петлёй и вставь концы в верхний и нижний жёлтые соединители. Петли две, по одной с каждой стороны. Они мягкие и обхватывают лёгкие предметы.' },
    { id: 'g2frame', build: 'Захват 2', title: 'Мотор и рамка захвата 2', steps: '1–28', parts: 'Мотор, голубые, жёлтые и серые детали',
      text: 'У второго захвата тоже свой мотор, рамка и крепление к устройству управления.' },
    { id: 'g2claw', build: 'Захват 2', title: 'Раздвоенная клешня', steps: '1–28', parts: 'Чёрные гнутые балки, пурпурные детали, чёрные штифты',
      text: 'Собери две жёсткие челюсти из чёрных гнутых балок. Их концы загнуты внутрь, одна челюсть раздваивается. Такая клешня держит большие и тяжёлые предметы.' },
    { id: 'final', build: 'Вместе', title: 'Захват на устройство управления', steps: '', parts: 'Собранный захват, кабель мотора',
      text: 'Закрепи захват спереди на хабе, а кабель его мотора вставь в порт A. Второй захват ставится на то же место.' },
  ];

  // The mechanism. Grabber 1's loops slide along Z; grabber 2's jaws turn on upright pins.
  const GRIP = { 1: [16, 7.5, 0], 2: [17, 7.75, 0] };          // where a held object sits, per grabber
  const HOSE_R = 0.32, RIB = 0.05;    // the hose's ribs stand out this far: they are what touches
  const PIVOT = [9.5, 1.5], TIP = [9.4, -1.1], JAW_R = 0.49;   // grabber 2: pin of the near jaw; centre of its hooked end in the jaw's frame (x forward, z outwards)
  const TIP_L = Math.hypot(TIP[0], TIP[1]), TIP_A = Math.atan2(TIP[1], TIP[0]);
  const gapAt = (n, t) => GRABBERS[n].openGap + (GRABBERS[n].closedGap - GRABBERS[n].openGap) * t;
  const jawTurn = (gap) => Math.asin((gap / 2 - PIVOT[1] + JAW_R) / TIP_L) - TIP_A;   // how far grabber 2's near jaw stands open, radians
  const MOTOR_TURN = 40;              // degrees from open to closed: LEGO's program turns motor A from 25 to 345
  const ROTOR = [7, 6, 0];            // the motor's output, facing down
  const SENSOR_Y = 15.5, CAP_X = -4.6, TRAVEL = 1;              // the plunger travels 8 mm
  const SPARE = [1, 13];              // x, z of the grabber lying upside down in front, as in LEGO's picture
  const DETACH = 7;                   // while it is built, the chosen grabber waits this far in front of the hub
  const EXPLODE = { hub: [0, 0, 0], stand: [-6, 3, 0], sensor: [-3, 9, 0], grabber1: [8, 1, 0], grabber2: [8, 1, 0], cables: [0, 3, 5] };
  const PALE = new T.Color('#cddae2');     // deep enough that a white part, like a cable, still stands out when focused
  const RING_OFF = '#ece3bd';
  const LED_X = -6.25, LED_PITCH = 0.84;
  const HUB_M = new T.Matrix4().makeRotationZ(Math.PI).setPosition(-11, 7, 0);        // week 9's hub turned end for end: centre button at the stand
  const MOTOR_M = new T.Matrix4().makeRotationX(Math.PI).setPosition(-10.5, 11, 0);   // week 9's motor upside down in front of the hub
  const ROTOR_M = new T.Matrix4().makeRotationX(Math.PI).multiply(new T.Matrix4().makeTranslation(0, -5, 0));

  // Everything merges as plain non-indexed triangles with normals.
  const solid = (g) => { const n = g.index ? g.toNonIndexed() : g; n.deleteAttribute('uv'); return n; };
  const box = (w, h, d, r = 0.05, seg = 1) => solid(new T.RoundedBoxGeometry(w, h, d, seg, r));
  const brick = (w, h, d) => solid(new T.BoxGeometry(w, h, d));
  const cyl = (r, h, seg = 12) => solid(new T.CylinderGeometry(r, r, h, seg));
  const lathe = (pts, seg = 24) => solid(new T.LatheGeometry(pts.map(([r, y]) => new T.Vector2(r, y)), seg));
  const flat = (shape) => solid(new T.ShapeGeometry(shape, 4));
  const disc = (r, seg = 14) => solid(new T.CircleGeometry(r, seg));
  const ring = (a, b, seg = 14) => solid(new T.RingGeometry(a, b, seg));

  // Extruded along +Z from 0 to depth; the bevel stays inside the nominal outline.
  const extrude = (shape, depth, bevel = 0.04, curveSegments = 6) => {
    const g = new T.ExtrudeGeometry(shape, { depth: depth - bevel * 2, curveSegments, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel, bevelSegments: 1 });
    g.translate(0, 0, bevel);
    g.deleteAttribute('uv');
    return toCreasedNormals(g, 0.6);
  };
  // Same, from a plan drawn in the X-Z plane, standing on y0.
  const plan = (shape, y0, h, bevel, curveSegments) => extrude(shape, h, bevel, curveSegments).rotateX(Q).translate(0, y0 + h, 0);

  const rrect = (x0, y0, x1, y1, r) => {
    const s = new T.Shape();
    s.absarc(x1 - r, y0 + r, r, -Q, 0);
    s.absarc(x1 - r, y1 - r, r, 0, Q);
    s.absarc(x0 + r, y1 - r, r, Q, 2 * Q);
    s.absarc(x0 + r, y0 + r, r, 2 * Q, 3 * Q);
    s.closePath();
    return s;
  };
  // Liftarm outline around a centre line that bends one way: round outside, mitred inside.
  const polyBeam = (pts, r = 0.49) => {
    const cross = (i) => (pts[i][0] - pts[i - 1][0]) * (pts[i + 1][1] - pts[i][1]) - (pts[i][1] - pts[i - 1][1]) * (pts[i + 1][0] - pts[i][0]);
    if (pts.length > 2 && cross(1) < 0) pts = pts.slice().reverse();     // walk it so that every bend turns left
    const a = pts.slice(1).map((p, i) => Math.atan2(p[1] - pts[i][1], p[0] - pts[i][0]));
    for (let i = 1; i < a.length; i++) while (a[i] < a[i - 1] - Math.PI) a[i] += TAU;
    const n = pts.length - 1, s = new T.Shape();
    s.absarc(pts[0][0], pts[0][1], r, a[0] + Q, a[0] + 3 * Q);
    for (let i = 1; i < n; i++) s.absarc(pts[i][0], pts[i][1], r, a[i - 1] - Q, a[i] - Q);
    s.absarc(pts[n][0], pts[n][1], r, a[n - 1] - Q, a[n - 1] + Q);
    for (let i = n - 1; i > 0; i--) {
      const [mx, my] = polar((a[i - 1] + a[i]) / 2 + Q, r / Math.cos((a[i] - a[i - 1]) / 2));
      s.lineTo(pts[i][0] + mx, pts[i][1] + my);
    }
    s.closePath();
    return s;
  };
  // Hole centres about one module apart along a centre line.
  const along = (pts, step = 1.1) => {
    const out = [];
    pts.slice(1).forEach((b, i) => {
      const a = pts[i], k = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
      for (let j = 0; j < k; j++) out.push([a[0] + ((b[0] - a[0]) * j) / k, a[1] + ((b[1] - a[1]) * j) / k]);
    });
    out.push(pts[pts.length - 1]);
    return out;
  };
  const addHole = (shape, x, y, r = 0.38) => { const p = new T.Path(); p.absarc(x, y, r, 0, TAU, true); shape.holes.push(p); };
  const crossShape = (r, w) => {
    const s = new T.Shape();
    [[w, -w], [r, -w], [r, w], [w, w], [w, r], [-w, r], [-w, w], [-r, w], [-r, -w], [-w, -w], [-w, -r], [w, -r]].forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
    s.closePath();
    return s;
  };
  const cog = (r, root, teeth, skew) => {
    const s = new T.Shape(), step = TAU / teeth;
    for (let i = 0; i < teeth; i++) {
      const a = i * step + skew * step;
      [[root, -0.5], [root, -0.32], [r, -0.26], [r, 0.26], [root, 0.32], [root, 0.5]].forEach(([q, k]) => {
        const [x, y] = polar(a + k * step * 0.5, q);
        if (i || k > -0.5) s.lineTo(x, y); else s.moveTo(x, y);
      });
    }
    s.closePath();
    return s;
  };
  // Flat white cable along a smooth path; `across` is the direction its width prefers.
  const ribbon = (pts, across = [0, 0, 1], W = 0.43, H = 0.045) => {
    const curve = new T.CatmullRomCurve3(pts.map((p) => new T.Vector3(...p)), false, 'centripetal');
    const N = Math.ceil(curve.getLength() * 6), pos = [], idx = [];
    const t = new T.Vector3(), w = new T.Vector3(), n = new T.Vector3(), p = new T.Vector3(), a = new T.Vector3(...across);
    for (let i = 0; i <= N; i++) {
      curve.getPointAt(i / N, p);
      curve.getTangentAt(i / N, t);
      w.copy(a).addScaledVector(t, -t.dot(a)).normalize();
      n.crossVectors(t, w);
      for (const [u, v] of [[1, 1], [1, -1], [-1, -1], [-1, 1]]) pos.push(p.x + w.x * W * u + n.x * H * v, p.y + w.y * W * u + n.y * H * v, p.z + w.z * W * u + n.z * H * v);
      if (i < N) for (let k = 0; k < 4; k++) {
        const c0 = i * 4 + k, c1 = i * 4 + ((k + 1) % 4);
        idx.push(c0, c1, c1 + 4, c0, c1 + 4, c0 + 4);
      }
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    return toCreasedNormals(g, 0.7);
  };
  // Grey ribbed hose in the X-Y plane: a tube whose rings alternate in radius.
  const ribbedTube = (pts, r = HOSE_R) => {
    const curve = new T.CatmullRomCurve3(pts.map(([x, y]) => new T.Vector3(x, y, 0)), false, 'centripetal');
    const R = 8, g = new T.TubeGeometry(curve, Math.round(curve.getLength() / 0.11), r, R, false);
    const pos = g.attributes.position, nor = g.attributes.normal;
    for (let i = 0; i < pos.count; i++) {
      const k = Math.floor(i / (R + 1)) % 2 ? RIB : -0.03;
      pos.setXYZ(i, pos.getX(i) + nor.getX(i) * k, pos.getY(i) + nor.getY(i) * k, pos.getZ(i) + nor.getZ(i) * k);
    }
    g.computeVertexNormals();
    return solid(g);
  };

  const FACES = { '+x': [1, 0, 0, 0, Q, 0], '-x': [-1, 0, 0, 0, -Q, 0], '+y': [0, 1, 0, -Q, 0, 0], '-y': [0, -1, 0, Q, 0, 0], '+z': [0, 0, 1, 0, 0, 0], '-z': [0, 0, -1, 0, Math.PI, 0] };
  const ONE = new T.Vector3(1, 1, 1);
  const compose = (x, y, z, rx, ry, rz) => new T.Matrix4().compose(new T.Vector3(x, y, z), new T.Quaternion().setFromEuler(new T.Euler(rx, ry, rz)), ONE);

  function buildKit() {
    const plastic = (color, roughness = 0.35) => new T.MeshStandardMaterial({ color, roughness, envMapIntensity: 0.35 });
    // Holes carry a darker tone of their part so they read as depth without ambient occlusion.
    const M = {
      azure: plastic('#01adc4'), magenta: plastic('#c92e85'), yellow: plastic('#fed920'), white: plastic('#eceded'),
      black: plastic('#16151a'), grey: plastic('#a9b0b5'), rubber: plastic('#17171b', 0.75),
      dark: plastic('#2a2d33', 0.6), plate: plastic('#d9dcde', 0.5),
      azureRim: plastic('#018da1', 0.5), azureHole: plastic('#02505e', 0.7),
      magentaRim: plastic('#8f1c5d', 0.5), magentaHole: plastic('#4d0a33', 0.7),
      yellowRim: plastic('#e8bb12', 0.5), yellowHole: plastic('#a87d05', 0.7),
      whiteRim: plastic('#d5d8da', 0.5), whiteHole: plastic('#7f868b', 0.7),
      greyRim: plastic('#7c848a', 0.5), greyHole: plastic('#3d4347', 0.7),
      blackHole: plastic('#050506', 0.8), battery: plastic('#f4ce14'), plug: plastic('#e6e2d6', 0.5),
      hose: new T.MeshStandardMaterial({ color: '#9aa2a8', roughness: 0.4, metalness: 0.35, envMapIntensity: 0.7 }),
      led: new T.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false }),
      ledWindow: new T.MeshBasicMaterial({ color: '#3b4a54' }),
    };

    const RIM = ring(0.27, 0.38), CORE = disc(0.27);
    const dimple = (add, rim, core, x, y, z, face) => {
      const [nx, ny, nz, ...rot] = FACES[face], o = 0.006;
      add(rim, RIM, x + nx * o, y + ny * o, z + nz * o, ...rot);
      add(core, CORE, x + nx * o, y + ny * o, z + nz * o, ...rot);
    };
    const BORE = lathe([[0.38, -0.42], [0.285, -0.42], [0.285, 0.42], [0.38, 0.42]], 14);     // thickness 1, along Y

    const piece = (name, stage, from, fill) => {
      const lists = new Map();
      fill((mat, g, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
        if (!lists.has(mat)) lists.set(mat, []);
        lists.get(mat).push(g.clone().applyMatrix4(compose(x, y, z, rx, ry, rz)));
      });
      return { name, stage, from, meshes: [...lists].map(([mat, list]) => ({ mat, geo: mergeGeometries(list) })) };
    };
    // Everything added through it is moved by m afterwards.
    const under = (add, m) => (mat, g, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => add(mat, g.clone().applyMatrix4(compose(x, y, z, rx, ry, rz)).applyMatrix4(m));

    // A liftarm 1 thick with holes along Z, its centre line drawn in the X-Y plane.
    const arm = (pts, holes = pts) => {
      const s = polyBeam(pts);
      holes.forEach(([x, y]) => addHole(s, x, y));
      return { body: extrude(s, 1, 0.04, 7).translate(0, 0, -0.5), bores: mergeGeometries(holes.map(([x, y]) => BORE.clone().rotateX(Q).translate(x, y, 0))) };
    };
    const straight = (n) => arm([[0, 0], [n - 1, 0]], Array.from({ length: n }, (_, i) => [i, 0]));
    // Rotations used below: none, holes along Z; (0,0,Q) upright; (Q,0,0) flat along X; (Q,0,Q) flat along Z; (0,-Q,0) on edge along Z.
    const addArm = (add, colour, a, x, y, z, rx = 0, ry = 0, rz = 0) => {
      add(M[colour], a.body, x, y, z, rx, ry, rz);
      add(M[colour + 'Hole'], a.bores, x, y, z, rx, ry, rz);
    };
    const BEAM3 = straight(3), BEAM5 = straight(5), BEAM7 = straight(7), BEAM9 = straight(9), BEAM15 = straight(15);

    /* ---------- Hub: week 9's, turned end for end ---------- */
    const hub = piece('hub', 0, [0, 8, 0], (add0) => {
      const add = under(add0, HUB_M);
      add(M.yellow, box(11, 7, 3.15, 0.28, 2), -5.5, 3.5, -0.425);
      add(M.white, extrude(rrect(-11, 0, 0, 7, 0.62), 1, 0.1, 4), 0, 0, 1);
      add(M.battery, box(9.4, 5.4, 0.1, 0.04), -5.5, 3.5, -2.03);
      for (const x of [-10.35, -0.65]) for (const y of [0.65, 6.35]) {
        add(M.grey, cyl(0.42, 0.08, 16), x, y, 2.01, Q);
        add(M.greyRim, disc(0.2, 10), x, y, 2.056);
      }
      add(M.plate, flat(rrect(-2.45, 0.8, -0.95, 6.2, 0.74)), 0, 0, 2.004);
      add(M.plate, disc(1.34, 32), -1.7, 3.5, 2.006);
      add(M.grey, ring(0.52, 0.62, 24), -9.6, 5.5, 2.006);
      add(M.white, lathe([[0.52, 0], [0.5, 0.05], [0, 0.05]], 20), -9.6, 5.5, 2, Q);
      add(M.plate, flat(rrect(-10.15, 1.35, -9.05, 2.45, 0.08)), 0, 0, 2.004);
      // Ports: three sockets on each long side. Turned, A and E are on top: A at the claw end, E at the stand end.
      for (const x of [-7.6, -5.4, -3.2]) for (const [y, ny] of [[7, 1], [0, -1]]) {
        add(M.dark, brick(1.5, 0.1, 0.5), x, y + ny * 0.02, 1.04);
        add(M.greyHole, brick(1.2, 0.1, 0.18), x, y + ny * 0.05, 1.04);
      }
      for (const [y, face] of [[7, '+y'], [0, '-y']]) {
        for (const x of [-1, -10]) for (const z of [0.5, -0.5, -1.5]) dimple(add, M.yellowRim, M.yellowHole, x, y, z, face);
        for (const x of [-3, -8]) dimple(add, M.yellowRim, M.yellowHole, x, y, -1.5, face);
        add(M.yellowRim, brick(2.8, 0.03, 0.9), -5.5, y, -1.5);
        for (let i = 0; i < 5; i++) add(M.yellowHole, brick(0.16, 0.05, 0.56), -6.1 + i * 0.3, y, -1.5);
      }
      for (const [x, face] of [[0, '+x'], [-11, '-x']]) {
        add(M.dark, disc(0.92, 24), x + (face === '+x' ? 0.006 : -0.006), 3.5, -0.3, 0, face === '+x' ? Q : -Q);
        for (const y of [1.5, 5.5]) for (const z of [1, 0, -1]) dimple(add, M.yellowRim, M.yellowHole, x, y, z, face);
      }
    });

    /* ---------- Stand: a handle at the hub's back end ---------- */
    const stand = piece('stand', 0, [-5, 6, 0], (add) => {
      for (const z of [1, -1]) addArm(add, 'black', BEAM15, -11.5, 2.5, z, 0, 0, Q);
      addArm(add, 'azure', BEAM7, -9.5, 7.5, 1, 0, 0, Q);
      for (const y of [8, 13]) addArm(add, 'magenta', BEAM3, -11.5, y, 0);
    });

    /* ---------- Force Sensor: white body, black back, plunger towards +X ---------- */
    const sensor = piece('sensor', 1, [0, 7, 0], (add) => {
      add(M.black, box(2.4, 3, 3, 0.16, 2), -9.8, SENSOR_Y, 0);
      add(M.white, box(2.4, 3, 3, 0.16, 2), -7.4, SENSOR_Y, 0);
      for (const y of [-1, 1]) for (const z of [-1, 1]) dimple(add, M.whiteRim, M.whiteHole, -6.2, SENSOR_Y + y, z, '+x');
      for (const [z, face] of [[1.5, '+z'], [-1.5, '-z']]) for (const y of [-0.8, 0.8]) dimple(add, M.dark, M.blackHole, -10.2, SENSOR_Y + y, z, face);
      add(M.dark, ring(0.46, 0.66, 20), -6.19, SENSOR_Y, 0, 0, Q, 0);
    });
    // The wheel cap and plunger move as one; built here, meshed per instance.
    const tyre = mergeGeometries([0, 0.5].map((skew, i) => {
      const s = cog(1.2, 1.04, 22, skew);
      addHole(s, 0, 0, 0.62);
      return extrude(s, 0.4, 0, 8).translate(0, 0, i * 0.4 - 0.4);
    })).rotateY(Q).translate(CAP_X, SENSOR_Y, 0);
    const capHub = lathe([[0, -0.36], [0.64, -0.36], [0.64, 0.36], [0, 0.36]], 20).rotateZ(-Q).translate(CAP_X, SENSOR_Y, 0);
    const capCross = flat(crossShape(0.27, 0.09)).rotateY(Q).translate(CAP_X + 0.365, SENSOR_Y, 0);
    const plunger = cyl(0.4, 1.3, 14).rotateZ(Q).translate(-5.6, SENSOR_Y, 0);

    /* ---------- Medium motor (week 9's), upside down, output facing down ---------- */
    const nose = (y0, h) => {
      const s = new T.Shape();
      s.moveTo(15.2, -1.5);
      s.lineTo(18.4, -1.5);
      s.absarc(18.4, -0.9, 0.6, -Q, 0);
      s.absarc(18.4, 0.9, 0.6, 0, Q);
      s.lineTo(15.2, 1.5);
      s.closePath();
      return plan(s, y0, h, 0.045, 3);
    };
    const motor = (add0) => {
      const add = under(add0, MOTOR_M);
      add(M.azure, box(4.3, 3, 3, 0.1, 2), 13.15, 3.5, 0);
      add(M.white, nose(2, 1.05));
      add(M.white, nose(3.05, 1.95));
      for (const [z, face] of [[1.5, '+z'], [-1.5, '-z']]) {
        for (const x of [16.5, 18.2]) {
          for (const y of [2.55, 4.45]) dimple(add, M.whiteRim, M.whiteHole, x, y, z, face);
          add(M.whiteRim, brick(0.42, 0.16, 0.01), x, 3.6, z);
        }
        for (const y of [2.5, 4.5]) dimple(add, M.azureRim, M.azureHole, 11.75, y, z, face);
        add(M.azureRim, brick(0.42, 1.1, 0.01), 11.75, 3.5, z);
      }
      dimple(add, M.azureRim, M.azureHole, 11.75, 5, -0.9, '+y');
      add(M.dark, disc(0.28, 12), 11, 3.5, 0, 0, -Q, 0);
    };
    const rotor = piece('rotor', 0, [0, 0, 0], (add0) => {
      const add = under(add0, ROTOR_M);
      add(M.azureRim, lathe([[1.46, 0], [1.46, 0.06]], 40), 0, 5, 0);
      add(M.azure, lathe([[1.5, 0.06], [1.5, 0.36], [1.42, 0.46], [0, 0.46]], 40), 0, 5, 0);
      for (let i = 0; i < 4; i++) {
        const [x, z] = polar(12 * DEG + i * Q, 0.82);
        add(M.azureHole, disc(0.25, 12), x, 5.465, z, -Q);
      }
      add(M.azureHole, flat(crossShape(0.27, 0.09)), 0, 5.465, 0, -Q);
    });
    // Both grabbers fix onto the hub the same way: azure L-beams on its top, a yellow beam across.
    const L = arm([[-3.75, 0], [1.25, 0], [1.25, 2]], [[-3.75, 0], [-2.75, 0], [-1.75, 0], [-0.75, 0], [0.25, 0], [1.25, 0], [1.25, 1], [1.25, 2]]);
    const mount = (add) => {
      for (const z of [2, -2]) addArm(add, 'azure', L, 0, 7.5, z);
      addArm(add, 'yellow', BEAM3, -1.5, 7.5, -1, Q, 0, Q);
      for (const z of [1.5, -1.5]) addArm(add, 'grey', BEAM3, 6, 9.5, z, Q);        // grey H on the motor's head
      add(M.grey, box(0.9, 0.8, 2.1, 0.08), 7, 9.5, 0);
    };

    /* ---------- Grabber 1: two loops of ribbed hose on sliding uprights ---------- */
    const body1 = piece('body1', 2, [6, 0, 0], (add) => {
      motor(add);
      mount(add);
      addArm(add, 'magenta', BEAM9, 9, 7.5, -4, 0, -Q, 0);       // the cross rail the loops ride on
      addArm(add, 'white', BEAM5, 9, 9.5, -2, Q, 0, Q);
    });
    // Its frame: the hose's centre line at z=0, connectors and upright outside it.
    const LOOP = [[11.4, 9.5], [13.6, 9.62], [16.4, 9.3], [18.3, 8.45], [18.68, 7.5], [18.3, 6.55], [16.4, 5.7], [13.6, 5.38], [11.4, 5.5]];
    const jaw1 = piece('jaw1', 3, [5, 0, 0], (add) => {
      add(M.hose, ribbedTube(LOOP));
      addArm(add, 'azure', BEAM5, 10.1, 5.5, 0.9, 0, 0, Q);
      for (const y of [9.5, 5.5]) {
        add(M.yellow, box(1, 1, 1, 0.1), 10.95, y, 0.45);
        add(M.yellow, cyl(0.37, 0.7, 14), 11.3, y, 0, 0, 0, Q);
        add(M.yellowHole, disc(0.33, 14), 11.66, y, 0, 0, Q, 0);
      }
    });

    /* ---------- Grabber 2: a split claw of black bent liftarms ---------- */
    const body2 = piece('body2', 4, [6, 0, 0], (add) => {
      motor(add);
      mount(add);
    });
    const C = [[0, 0], [6.5, 1.3], [8.6, 1.3], [9.8, 0.1], TIP];
    const jawArm = arm(C, along(C));
    const post = arm([[0, 0], [2.5, 0]], [[0, 0], [1.25, 0], [2.5, 0]]);
    const jaw2 = piece('jaw2', 5, [5, 0, 0], (add) => {
      for (const y of [6.5, 9]) addArm(add, 'black', jawArm, 0, y, 0, Q);
      add(M.black, cyl(0.25, 4.6, 10), 0, 7.75, 0);
      for (const x of [1.1, 5.4]) addArm(add, 'magenta', post, x, 6.5, x * 0.2, 0, 0, Q);
    });
    // The near jaw forks, and two black pins with yellow ends stand in it.
    const FORK = [[6.5, 1.3], [9.2, 2.3], [11.6, 2.1]];
    const forkArm = arm(FORK, along(FORK));
    const fork = piece('fork', 5, [5, 0, 0], (add) => {
      addArm(add, 'black', forkArm, 0, 6.5, 0, Q);
      for (const x of [3.25, 4.33]) {
        add(M.black, cyl(0.3, 2.2, 12), x, 9.6, x * 0.2);
        add(M.yellow, cyl(0.34, 0.4, 12), x, 10.9, x * 0.2);
      }
    });

    /* ---------- Cables ---------- */
    const sensorCable = piece('sensorCable', 1, [0, 4, 4], (add) => {
      add(M.white, ribbon([[-9.8, 15.2, -1.52], [-9.9, 14.2, -2.1], [-10.5, 12.4, -2.7], [-10.6, 10.4, -2.95], [-9.9, 8.9, -2.9], [-8.8, 8.15, -2.3], [-7.9, 7.95, -1.1], [-7.8, 7.85, 0.2], [-7.8, 7.7, 0.62]], [1, 0, 0]));
      add(M.plug, box(1.9, 0.8, 1.2, 0.14, 2), -7.8, 7.36, 0.86);
    });
    const motorCable = piece('motorCable', 6, [0, 4, 3], (add) => {
      add(M.white, ribbon([[0.45, 7.5, 0], [-0.2, 7.75, 0.05], [-0.9, 8.55, 0.2], [-1.7, 8.8, 0.45], [-2.6, 8.55, 0.7], [-3.3, 8.0, 0.85], [-3.4, 7.65, 0.88]]));
      add(M.plug, box(1.9, 0.8, 1.2, 0.14, 2), -3.4, 7.36, 0.86);
    });

    /* ---------- Per-instance hub parts share these ---------- */
    const quads = [], order = [];
    for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) {
      const x = LED_X + (r - 2) * LED_PITCH, y = 3.5 + (c - 2) * LED_PITCH, s = LED_PITCH * 0.33, i = quads.length / 3;
      quads.push(x - s, y - s, 2.012, x + s, y - s, 2.012, x + s, y + s, 2.012, x - s, y + s, 2.012);
      order.push(i, i + 1, i + 2, i, i + 2, i + 3);
    }
    const ledPos = new T.Float32BufferAttribute(quads, 3).applyMatrix4(HUB_M);
    const pill = (y0, y1) => extrude(rrect(-2.32, y0, -1.08, y1, 0.6), 0.12, 0.03, 4).translate(0, 0, 2).applyMatrix4(HUB_M);
    const arrow = (y, s) => { const a = new T.Shape(); a.moveTo(-1.95, y); a.lineTo(-1.45, y); a.lineTo(-1.7, y + s * 0.32); a.closePath(); return flat(a); };
    return {
      M, hub, stand, sensor, sensorCable, motorCable, rotor, fork,
      body: { 1: body1, 2: body2 }, jaw: { 1: jaw1, 2: jaw2 },
      tyre, capHub, capCross, plunger,
      ledPos, ledIndex: order,
      ledWindow: flat(rrect(LED_X - 2.3, 1.2, LED_X + 2.3, 5.8, 0.25)).translate(0, 0, 2.008).applyMatrix4(HUB_M),
      left: pill(0.9, 3.6), right: pill(3.4, 6.1),
      arrows: mergeGeometries([arrow(1.55, -1), arrow(5.45, 1)].map((g) => g.translate(0, 0, 2.123))).applyMatrix4(HUB_M),
      center: lathe([[1, 0], [0.99, 0.2], [0.86, 0.3], [0, 0.32]], 32).rotateX(Q).translate(-1.7, 3.5, 2).applyMatrix4(HUB_M),
      lightRing: ring(1.04, 1.22, 48).translate(-1.7, 3.5, 2.012).applyMatrix4(HUB_M),
    };
  }

  let KIT = null;

  RA.createGrabber = () => {
    const K = KIT || (KIT = buildKit());
    const group = new T.Group();
    const parts = {}, fade = {}, clones = {}, pieces = [];
    PARTS.forEach(({ id }) => { group.add((parts[id] = new T.Group())); fade[id] = 0; clones[id] = new Map(); });

    const mesh = (geo, mat, into) => {
      const m = new T.Mesh(geo, mat);
      m.castShadow = m.receiveShadow = true;
      m.userData.base = mat;
      into.add(m);
      return m;
    };
    const put = (p, into) => {
      const g = new T.Group();
      p.meshes.forEach(({ geo, mat }) => mesh(geo, mat, g));
      into.add(g);
      pieces.push({ stage: p.stage, from: new T.Vector3(...p.from), group: g });
      return g;
    };

    const hubGroup = put(K.hub, parts.hub);
    put(K.stand, parts.stand);
    const sensorCap = mesh(K.tyre, K.M.rubber, put(K.sensor, parts.sensor));
    mesh(K.capHub, K.M.dark, sensorCap);
    mesh(K.capCross, K.M.blackHole, sensorCap);
    mesh(K.plunger, K.M.black, sensorCap);
    put(K.sensorCable, parts.cables);
    put(K.motorCable, parts.cables);
    parts.cables.traverse((o) => { o.receiveShadow = false; });     // a ribbon this thin only collects shadow acne

    // Each grabber: body with its rotor, and a jaw on each side (the far one mirrored).
    const rigs = {};
    [1, 2].forEach((n) => {
      const part = parts['grabber' + n];
      const rotor = new T.Group();
      rotor.position.fromArray(ROTOR);
      K.rotor.meshes.forEach(({ geo, mat }) => mesh(geo, mat, rotor));
      put(K.body[n], part).add(rotor);
      const jaws = [1, -1].map((s) => {
        const pivot = new T.Group();
        pivot.scale.z = s;
        part.add(pivot);
        put(K.jaw[n], pivot);
        if (n === 2 && s === 1) put(K.fork, pivot);
        return { pivot, s };
      });
      rigs[n] = { part, rotor, jaws, lift: new T.Box3().setFromObject(part).max.y };   // lying upside down, this is its height
    });

    // The hub's buttons, ring and LEDs belong to this instance.
    const hubButtons = { left: mesh(K.left, K.M.white, hubGroup), right: mesh(K.right, K.M.white, hubGroup), center: mesh(K.center, K.M.white, hubGroup) };
    mesh(K.arrows, K.M.greyRim, hubGroup);
    const lightMat = new T.MeshBasicMaterial({ color: RING_OFF });
    hubGroup.add(new T.Mesh(K.lightRing, lightMat));
    const ledGeo = new T.BufferGeometry();
    ledGeo.setAttribute('position', K.ledPos);
    ledGeo.setIndex(K.ledIndex);
    ledGeo.setAttribute('color', new T.BufferAttribute(new Float32Array(25 * 4 * 4), 4));
    const led = new T.Mesh(ledGeo, K.M.led);
    led.visible = false;
    led.renderOrder = 1;
    const ledWindow = new T.Mesh(K.ledWindow, K.M.ledWindow);
    ledWindow.visible = false;
    hubGroup.add(ledWindow, led);
    const setMatrix = (arr) => {
      const c = ledGeo.attributes.color;
      let any = false;
      for (let i = 0; i < 25; i++) {
        const a = arr ? clamp(arr[i] || 0, 0, 100) / 100 : 0;
        any = any || a > 0;
        for (let k = 0; k < 4; k++) c.setXYZW(i * 4 + k, 1, 1, 1, a);
      }
      c.needsUpdate = true;
      led.visible = ledWindow.visible = any;
    };

    const gripPoint = new T.Object3D();
    group.add(gripPoint);

    let grabber = 2, mode = 'tool', grip = 0, force = 0, exploded = 0, buildN = STAGES.length - 1, buildT = 1, focus = null;

    const pose = () => {
      const final = buildN === STAGES.length - 1, attach = final ? smooth(buildT) : 0;
      PARTS.forEach(({ id }) => parts[id].position.fromArray(EXPLODE[id]).multiplyScalar(exploded));
      [1, 2].forEach((n) => {
        const r = rigs[n], p = r.part, on = n === grabber, gap = gapAt(n, grip);
        p.visible = on || mode === 'spread' || !final;
        if (on) {
          p.rotation.x = 0;
          p.position.x += DETACH * (1 - attach);
        } else {
          p.rotation.x = Math.PI;
          p.position.x += SPARE[0];
          p.position.y += r.lift;
          p.position.z += SPARE[1];
        }
        r.jaws.forEach(({ pivot, s }) => {
          if (n === 1) pivot.position.set(2 * exploded, 0, s * (gap / 2 + HOSE_R + RIB + 3 * exploded));
          else {
            pivot.position.set(PIVOT[0] + 2 * exploded, 0, s * (PIVOT[1] + 3 * exploded));
            pivot.rotation.y = -s * jawTurn(gap);
          }
        });
        r.rotor.rotation.y = grip * MOTOR_TURN * DEG;
      });
      sensorCap.position.x = -force * TRAVEL + 1.5 * exploded;
      gripPoint.position.fromArray(GRIP[grabber]);
      pieces.forEach((pc) => {
        pc.group.visible = pc.stage <= buildN;
        pc.group.position.copy(pc.from).multiplyScalar(pc.stage === buildN ? 1 - smooth(buildT) : 0);
      });
    };

    const paint = (id) => {
      const f = fade[id];
      parts[id].traverse((m) => {
        const base = m.userData.base;
        if (!base) return;
        if (!f) { m.material = base; return; }
        if (!clones[id].has(base)) clones[id].set(base, base.clone());      // private to this instance, so two models never fade each other
        m.material = clones[id].get(base);
        m.material.color.copy(base.color).lerp(PALE, f * 0.9);
      });
    };

    pose();
    return {
      group, parts, PARTS, GRABBERS, STAGES, gripPoint, sensorCap, hubButtons, setMatrix,
      get grabber() { return grabber; },
      setGrabber(n) { grabber = +n === 1 ? 1 : 2; pose(); },
      setLayout(name) { mode = name === 'spread' ? 'spread' : 'tool'; pose(); },
      setGrip(t) { grip = clamp(+t || 0, 0, 1); pose(); },
      tipGap: () => gapAt(grabber, grip),
      tForGap(w) {
        const G = GRABBERS[grabber];
        return w <= G.closedGap ? 1 : clamp((G.openGap - w) / (G.openGap - G.closedGap), 0, 1);
      },
      setForce(pct) { force = clamp(+pct || 0, 0, 100) / 100; pose(); },
      setCenterLight(css) { lightMat.color.set(css || RING_OFF); },
      highlight(id) { focus = id || null; },
      setExplode(t) { exploded = clamp(+t || 0, 0, 1); pose(); },
      setBuildStage(n, t) { buildN = Math.floor(clamp(+n || 0, 0, STAGES.length - 1)); buildT = clamp(t === undefined ? 1 : +t || 0, 0, 1); pose(); },
      update(dt) {
        PARTS.forEach(({ id }) => {
          const goal = focus && focus !== id ? 1 : 0;
          if (fade[id] === goal) return;
          const step = RA.reducedMotion ? 1 : (dt || 0) * 5;
          fade[id] = goal > fade[id] ? Math.min(goal, fade[id] + step) : Math.max(goal, fade[id] - step);
          paint(id);
        });
      },
    };
  };
})();
