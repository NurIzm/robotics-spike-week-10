// «Захваты»: a procedural LEGO SPIKE Prime model. A hand controller (hub, stand, Force Sensor) and two grabbers, one fixed on its front.
// 1 unit = 1 LEGO module (8 mm). +X runs from the hub towards the claw, +Y is up, +Z faces the viewer; Y=0 is the table, X=0 the hub's front end.
// Built from LEGO's building instructions. LEGO draws the claw on the left of the face plate; with +X to the claw and the face plate
// to +Z, this model is its mirror image, and the hub keeps its real ports: A, C, E on top, so it can stand on the table.
// Geometry and materials are built once; each createGrabber() only adds meshes and its own state.
(function () {
  const RA = window.RA;
  const T = THREE;
  const { mergeGeometries, toCreasedNormals } = T.BufferGeometryUtils;
  const Q = Math.PI / 2, TAU = Math.PI * 2;
  const clamp = T.MathUtils.clamp;
  const smooth = (t) => t * t * (3 - 2 * t);
  const polar = (a, r = 1) => [Math.cos(a) * r, Math.sin(a) * r];
  const round1 = (v) => Math.round(v * 10) / 10;

  const PARTS = [
    { id: 'hub', name: 'Хаб', role: 'Мозг: хранит программу, читает датчик и управляет мотором' },
    { id: 'stand', name: 'Стойка', role: 'Держит датчик силы над хабом' },
    { id: 'sensor', name: 'Датчик силы', role: 'Кнопка, которая чувствует, как сильно её нажали. Порт E' },
    { id: 'grabber1', name: 'Захват 1', role: 'Гибкий: свой мотор и две петли из ребристого шланга' },
    { id: 'grabber2', name: 'Захват 2', role: 'Раздвоенный: свой мотор и жёсткая клешня из чёрных гнутых балок' },
    { id: 'cables', name: 'Кабели', role: 'Нервы: датчик в порту E, мотор в порту A' },
  ];

  // The mechanism, as LEGO's instructions draw it. The motor's output points down; on its head lies a magenta beam across, with pins
  // at z = ±2, and each jaw turns on one of them. A grey H link rides on a pin behind the far jaw's pin and one in front of the near
  // jaw's, so the jaws swing as mirror images; a crank on the output turns with them. The instructions show one pose only, with the
  // jaws parallel; how far they open is ours.
  const XR = 7.5, PY = 9.5, PZ = 2;          // the output's x; the height of the jaws' beams; their pins' z
  const HOSE_R = 0.32, RIB = 0.05;           // the hose's ribs stand out this far: they are what touches
  const GAP_R = HOSE_R + RIB;
  // Grabber 1's hose, in its arm's plane, from the upper to the lower yellow connector: two long legs 5 modules apart and a round end.
  // x from the arm's pin, y from PY.
  const LOOP = [[4.5, 2], [6.4, 1.97], [8.2, 1.9], [9.6, 1.6], [10.5, 0.7], [10.8, -0.5], [10.5, -1.7], [9.6, -2.6], [8.2, -2.92], [6.4, -3], [4.5, -3]];
  const LOOP_BOX = new T.Box3().setFromPoints(new T.CatmullRomCurve3(LOOP.map(([x, y]) => new T.Vector3(x, y, 0)), false, 'centripetal').getPoints(200));
  const GAP_X2 = 18;                         // grabber 2's gap is taken between its long arms here
  const H1 = [round1(PY + LOOP_BOX.min.y - GAP_R), PY + 2.5];      // up to the upper connectors' top

  // The claw's box when attached; gaps are the clear distance between the contact surfaces: grabber 1's loops at their tips,
  // grabber 2's fork and single jaw at GAP_X2. Parallel, grabber 1's loops are 3.3 apart and grabber 2's jaws 4.
  const GRABBERS = {
    1: { name: 'Захват 1', kind: 'гибкий', openGap: 7, closedGap: 0, reach: [11, round1(XR + LOOP_BOX.max.x + GAP_R)], height: H1 },
    2: { name: 'Захват 2', kind: 'раздвоенный', openGap: 12, closedGap: 3, reach: [10, 22], height: [PY - 4.5, PY + 4.5] },
  };
  // Where the hand holds the tool and a held object sits. Grabber 2's hooks turn in across the middle at its front, so it holds things
  // inside its C: tilted claw-down, the tool puts an object under this point behind the hooks. z is nearer the single jaw, which
  // reaches only the tops of things.
  const GRIP = { 1: [round1(XR + LOOP_BOX.max.x - 1.5), (H1[0] + H1[1]) / 2, 0], 2: [13.5, 8, 0.9] };
  const gapAt = (n, t) => GRABBERS[n].openGap + (GRABBERS[n].closedGap - GRABBERS[n].openGap) * t;
  // How far each jaw stands open from parallel, radians. Grabber 2's single jaw lies one module outside its pin's line.
  const jawTurn = (n, gap) => (n === 1 ? Math.asin((gap / 2 + GAP_R - PZ) / LOOP_BOX.max.x) : Math.atan((gap - 4) / (2 * (GAP_X2 - XR))));
  const CRANK = 1.8;                         // the crank turns this much more than a jaw
  const LINK_A = Math.atan2(4, 2);           // the H link's pins sit at its opposite corners, (-1, -2) and (1, 2)

  const STAGES = [
    { id: 'base', build: 'Устройство управления', title: 'Хаб и стойка', steps: '1–15', parts: 'Хаб, две длинные чёрные балки, две голубые балки, две пурпурные детали',
      text: 'На торце хаба, со стороны центральной кнопки, собери стойку: сзади две длинные чёрные балки, впереди две голубые, между ними пурпурные детали.' },
    { id: 'sensor', build: 'Устройство управления', title: 'Датчик силы', steps: '1–15', parts: 'Датчик силы, колесо: чёрная шина на светлом диске, красная ось',
      text: 'Закрепи датчик силы на верху стойки, кнопкой к захвату. Надень на кнопку колесо: на него удобно нажимать пальцем. Кабель датчика вставь в порт E.' },
    { id: 'g1frame', build: 'Захват 1', title: 'Мотор захвата 1', steps: '1–23', parts: 'Мотор, голубые угловые балки, серые и пурпурные детали, голубой рычаг',
      text: 'У захвата свой мотор, его вал смотрит вниз. Сзади голубые угловые балки: ими захват встанет на хаб. На голову мотора поперёк ложится пурпурная балка, на вал — голубой рычаг.' },
    { id: 'g1loops', build: 'Захват 1', title: 'Гибкие петли', steps: '1–23', parts: 'Серые ребристые шланги, жёлтые угловые соединители, пурпурные балки, серая H-деталь',
      text: 'Каждый шланг согни петлёй между верхним и нижним жёлтыми соединителями. Поставь обе петли на голову мотора и свяжи их серой H-деталью: мотор сводит петли навстречу друг другу.' },
    { id: 'g2frame', build: 'Захват 2', title: 'Мотор захвата 2', steps: '1–28', parts: 'Мотор, голубые угловые балки, серые и пурпурные детали, голубой рычаг',
      text: 'Основание с мотором такое же, как у первого захвата.' },
    { id: 'g2claw', build: 'Захват 2', title: 'Раздвоенная клешня', steps: '1–28', parts: 'Три чёрные гнутые балки, две чёрные балки 9, пурпурные детали, серая H-деталь',
      text: 'Высокая вилка: две гнутые балки, между ними пурпурные детали. Вторая челюсть — одна гнутая балка. Их крюки смотрят друг на друга, а одиночный крюк входит между зубцами вилки. Такая клешня держит большие и тяжёлые предметы.' },
    { id: 'final', build: 'Захват 2', title: 'Захват на устройство управления', steps: '1–28', parts: 'Собранный захват, кабель мотора',
      text: 'Последний шаг каждого захвата: закрепи его спереди на хабе, а кабель мотора вставь в порт A. Второй захват ставится на то же место.' },
  ];

  const SENSOR_Y = 15.5, CAP_X = -4.55, TRAVEL = 1;              // the plunger travels 8 mm
  const SZ = -0.5;                    // the stand stands on the hub's top holes, which lie half a module towards the back
  const SPARE = [4, 12];              // x, z of the grabber lying upside down in front, as in LEGO's picture
  const DETACH = 7;                   // while it is built, the chosen grabber waits on the table this far in front of the hub
  const EXPLODE = { hub: [0, 0, 0], stand: [-6, 3, 0], sensor: [-3, 9, 0], grabber1: [8, 1, 0], grabber2: [8, 1, 0], cables: [0, 3, 5] };
  const PALE = new T.Color('#cddae2');     // deep enough that a white part, like a cable, still stands out when focused
  const RING_OFF = '#ece3bd';
  const LED_X = -6.25, LED_PITCH = 0.84;
  const HUB_M = new T.Matrix4().makeRotationZ(Math.PI).setPosition(-11, 7, 0);        // week 9's hub turned end for end: centre button at the stand
  const MOTOR_M = new T.Matrix4().makeRotationX(Math.PI).setPosition(-10, 10, 0);    // week 9's motor upside down: output down at x = XR
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
  const addHole = (shape, x, y, r = 0.38) => { const p = new T.Path(); p.absarc(x, y, r, 0, TAU, true); shape.holes.push(p); };
  const addSlot = (shape, x0, y0, x1, y1, r = 0.28) => {
    const a = Math.atan2(y1 - y0, x1 - x0), p = new T.Path();
    p.absarc(x1, y1, r, a + Q, a - Q, true);
    p.absarc(x0, y0, r, a - Q, a - 3 * Q, true);
    p.closePath();
    shape.holes.push(p);
  };
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
  // Flat white cable along a smooth path; its width prefers `across`, or across(u) along the path (u 0..1).
  const ribbon = (pts, across = [0, 0, 1], W = 0.43, H = 0.045) => {
    const curve = new T.CatmullRomCurve3(pts.map((p) => new T.Vector3(...p)), false, 'centripetal');
    const N = Math.ceil(curve.getLength() * 6), pos = [], idx = [];
    const t = new T.Vector3(), w = new T.Vector3(), n = new T.Vector3(), p = new T.Vector3(), a = new T.Vector3();
    for (let i = 0; i <= N; i++) {
      curve.getPointAt(i / N, p);
      curve.getTangentAt(i / N, t);
      a.fromArray(typeof across === 'function' ? across(i / N) : across);
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
      dark: plastic('#2a2d33', 0.6), plate: plastic('#d9dcde', 0.5), rim: plastic('#e2e4e5', 0.45),
      red: plastic('#c8281f'), tan: plastic('#d8bf8a', 0.45),
      azureRim: plastic('#018da1', 0.5), azureHole: plastic('#02505e', 0.7),
      magentaRim: plastic('#8f1c5d', 0.5), magentaHole: plastic('#4d0a33', 0.7),
      yellowRim: plastic('#e8bb12', 0.5), yellowHole: plastic('#a87d05', 0.7),
      whiteRim: plastic('#d5d8da', 0.5), whiteHole: plastic('#7f868b', 0.7),
      greyRim: plastic('#7c848a', 0.5), greyHole: plastic('#3d4347', 0.7),
      blackHole: plastic('#050506', 0.8), battery: plastic('#f4ce14'), plug: plastic('#e6e2d6', 0.5),
      hose: new T.MeshStandardMaterial({ color: '#6c7379', roughness: 0.5, metalness: 0.2, envMapIntensity: 0.5 }),
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
    const AXLE_END = flat(crossShape(0.27, 0.09));

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

    // A liftarm 1 thick with holes along Z, its centre line drawn in the X-Y plane; slots are [x0, y0, x1, y1].
    const arm = (pts, holes = pts, slots = []) => {
      const s = polyBeam(pts);
      holes.forEach(([x, y]) => addHole(s, x, y));
      slots.forEach((sl) => addSlot(s, ...sl));
      return { body: extrude(s, 1, 0.04, 7).translate(0, 0, -0.5), bores: mergeGeometries(holes.map(([x, y]) => BORE.clone().rotateX(Q).translate(x, y, 0))) };
    };
    const straight = (n) => arm([[0, 0], [n - 1, 0]], Array.from({ length: n }, (_, i) => [i, 0]));
    // Rotations used below: none, holes along Z; (Q,0,0) flat along X; (Q,0,Q) flat along Z; (0,Q,Q) upright with holes along X.
    const addArm = (add, colour, a, x, y, z, rx = 0, ry = 0, rz = 0) => {
      add(M[colour], a.body, x, y, z, rx, ry, rz);
      add(M[colour + 'Hole'], a.bores, x, y, z, rx, ry, rz);
    };
    const BEAM2 = straight(2), BEAM3 = straight(3), BEAM5 = straight(5), BEAM7 = straight(7), BEAM9 = straight(9), BEAM15 = straight(15);
    // Black liftarm bent twice by 45°: six holes straight, a slot, then a hooked end at right angles. Lying flat, the hook turns to +Z, or -Z.
    const hook = (s) => arm([[0, 0], [6, 0], [8, 2 * s], [8, 4 * s]], [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [6, 0], [8, 2 * s], [8, 3 * s], [8, 4 * s]], [[6.7, 0.7 * s, 7.3, 1.3 * s]]);
    const HOOK_IN = hook(1), HOOK_OUT = hook(-1);
    // Magenta 3×3 block: five holes in a cross through its face, pin holes round its edge.
    const BLOCK = (() => {
      const s = rrect(-1.5, -1.5, 1.5, 1.5, 0.45), holes = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]];
      holes.forEach(([x, y]) => addHole(s, x, y));
      return { body: extrude(s, 1, 0.05, 6).translate(0, 0, -0.5), bores: mergeGeometries(holes.map(([x, y]) => BORE.clone().rotateX(Q).translate(x, y, 0))) };
    })();
    const blockAt = (add0, x, y, z, rx = 0, ry = 0, rz = 0) => {
      const add = under(add0, compose(x, y, z, rx, ry, rz));
      addArm(add, 'magenta', BLOCK, 0, 0, 0);
      for (const k of [-1, 0, 1]) for (const s of [-1, 1]) {
        dimple(add, M.magentaRim, M.magentaHole, s * 1.5, k, 0, s > 0 ? '+x' : '-x');
        dimple(add, M.magentaRim, M.magentaHole, k, s * 1.5, 0, s > 0 ? '+y' : '-y');
      }
    };
    // A Technic pin standing up from y, len long, its hollow end on top.
    const pinUp = (add, mat, x, y, z, len) => {
      add(mat, cyl(0.24, len, 10), x, y + len / 2, z);
      add(M.dark, disc(0.13, 8), x, y + len + 0.005, z, -Q);
    };

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
      add(M.dark, disc(0.92, 24), 0.006, 3.5, -0.3, 0, Q);          // the speaker, at the stand end
      for (const [x, face] of [[0, '+x'], [-11, '-x']]) {
        for (const y of [1.5, 5.5]) for (const z of [1, 0, -1]) dimple(add, M.yellowRim, M.yellowHole, x, y, z, face);
      }
    });

    /* ---------- Stand: two black 15L beams on the hub's end, two azure 7L beams over its top, magenta blocks between ---------- */
    const stand = piece('stand', 0, [-5, 6, 0], (add) => {
      for (const z of [SZ - 1, SZ + 1]) {
        addArm(add, 'black', BEAM15, -11.5, 0.5, z, 0, Q, Q);
        addArm(add, 'azure', BEAM7, -7.5, 7.5, z, 0, Q, Q);
      }
      for (const y of [7.5, 13.5]) blockAt(add, -9.5, y, SZ, Q);
    });

    /* ---------- Force Sensor: white body, black back, plunger towards +X ---------- */
    const sensor = piece('sensor', 1, [0, 7, 0], (add) => {
      add(M.black, box(2.4, 3, 3, 0.16, 2), -9.8, SENSOR_Y, SZ);
      add(M.white, box(2.4, 3, 3, 0.16, 2), -7.4, SENSOR_Y, SZ);
      for (const y of [-1, 1]) for (const z of [-1, 1]) dimple(add, M.whiteRim, M.whiteHole, -6.2, SENSOR_Y + y, SZ + z, '+x');
      for (const [z, face] of [[SZ + 1.5, '+z'], [SZ - 1.5, '-z']]) for (const y of [-0.8, 0.8]) {
        dimple(add, M.dark, M.blackHole, -10.2, SENSOR_Y + y, z, face);
        dimple(add, M.whiteRim, M.whiteHole, -7.4, SENSOR_Y + y, z, face);
      }
      add(M.dark, ring(0.4, 0.62, 20), -6.19, SENSOR_Y, SZ, 0, Q, 0);
    });
    // The button cap is a small wheel: black knobby tyre, light grey rim, a red axle into the plunger. Built along Y, turned to face +X.
    const capAt = (g) => g.rotateZ(-Q).translate(CAP_X, SENSOR_Y, SZ);
    const tyre = mergeGeometries([0, 0.5].map((skew, i) => {
      const s = cog(1.45, 1.31, 18, skew);
      addHole(s, 0, 0, 0.95);
      return extrude(s, 0.62, 0, 8).translate(0, 0, i * 0.62 - 0.62);
    })).rotateY(Q).translate(CAP_X, SENSOR_Y, SZ);
    const capRim = capAt(lathe([[0.95, -0.6], [0.95, 0.6], [0.8, 0.66], [0.42, 0.66], [0.42, 0.6], [0, 0.6]], 24));
    const capAxle = capAt(extrude(crossShape(0.27, 0.09), 0.3, 0.02).rotateX(-Q).translate(0, 0.45, 0));
    const plunger = cyl(0.36, 1.1, 14).rotateZ(Q).translate(-5.7, SENSOR_Y, SZ);

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
      add(M.dark, brick(0.9, 0.02, 0.45), 13.6, 2, 0.4);         // the badge, on top once turned
    };
    // The output and what turns with it: the rotor under the head, and on top a yellow axle, an azure 1×2 crank, a tan axle-pin
    // and a white connector at the crank's end. Its own frame sits at (XR, 5, 0).
    const rotor = piece('rotor', 0, [0, 0, 0], (add0) => {
      const add = under(add0, ROTOR_M);
      add(M.azureRim, lathe([[1.46, 0], [1.46, 0.06]], 40), 0, 5, 0);
      add(M.azure, lathe([[1.5, 0.06], [1.5, 0.36], [1.42, 0.46], [0, 0.46]], 40), 0, 5, 0);
      for (let i = 0; i < 4; i++) {
        const [x, z] = polar(0.2 + i * Q, 0.82);
        add(M.azureHole, disc(0.25, 12), x, 5.465, z, -Q);
      }
      add(M.azureHole, AXLE_END, 0, 5.465, 0, -Q);
      addArm(add0, 'azure', BEAM2, 0, 4.5, 0, Q);
      add0(M.yellow, AXLE_END, 0, 5.006, 0, -Q);
      add0(M.tan, cyl(0.3, 0.14, 12), 1, 5.06, 0);
      add0(M.white, box(0.75, 0.9, 0.8, 0.1), 1, 3.55, 0);
    });
    // Both grabbers stand on the same base: azure L-beams beside the motor's back, their long arms on the hub's top; grey connectors
    // with pins up between them, a yellow 1×3 across, a magenta block against the hub's end, a magenta 5L across the head.
    const LBEAM = arm([[-4, 0], [0, 0], [0, -2]], [[-4, 0], [-3, 0], [-2, 0], [-1, 0], [0, 0], [0, -1], [0, -2]]);
    const base = (add) => {
      motor(add);
      for (const z of [2, -2]) addArm(add, 'azure', LBEAM, 1.75, 7.5, z);
      for (const x of [0.25, -1.25]) {
        add(M.grey, box(1, 1, 3, 0.12), x, 7.5, 0);
        for (const z of [-1, 1]) pinUp(add, M.grey, x, 8, z, 1.1);
      }
      addArm(add, 'yellow', BEAM3, 1.75, 8.5, -1, Q, 0, Q);
      blockAt(add, 0.5, 6, 0, 0, Q);
      addArm(add, 'magenta', BEAM5, XR, 8.5, -PZ, Q, 0, Q);
    };

    /* ---------- Grabber 1: two hose loops on arms that turn on the head ---------- */
    // A yellow 90° connector on the axle's end (up 1: top, -1: bottom): one leg holds the axle, the corner beyond it has a pin hole
    // across, the other leg points to +X and takes the hose. y is the middle of the axle's leg.
    const connector = (add, x, y, up) => {
      add(M.yellow, cyl(0.43, 1, 14), x, y, 0);
      add(M.yellow, cyl(0.5, 1, 16), x, y + up, 0, Q);
      for (const s of [1, -1]) add(M.yellowHole, disc(0.3, 12), x, y + up, s * 0.505, 0, s > 0 ? 0 : Math.PI, 0);
      add(M.yellow, cyl(0.4, 1.1, 14), x + 0.95, y + up, 0, 0, 0, Q);
    };
    // An arm in its pin's frame: a magenta 5L on the head (its 4th hole on the pin), a black 4L axle upright at its front end, yellow
    // connectors at the axle's top and bottom and an azure 1×2 under the beam; the hose loops from the upper connector to the lower.
    const loopArm = (pin) => piece('arm', 3, [3, 5, 0], (add) => {
      addArm(add, 'magenta', BEAM5, -1, 0, 0, Q);
      addArm(add, 'azure', BEAM2, 2, -1, 0, Q);
      add(M.black, cyl(0.22, 4, 8), 3, -0.5, 0);
      connector(add, 3, 1, 1);
      connector(add, 3, -2, -1);
      add(M.hose, ribbedTube(LOOP));
      pinUp(add, M.black, pin[0], pin[1], 0, pin[2]);
    });

    /* ---------- Grabber 2: a tall fork and a single hooked jaw ---------- */
    // The fork in its pin's frame: a 9L beam on the head (its 2nd hole on the pin), two magenta blocks stacked on it, bent liftarms
    // above and below whose hooks turn to the single jaw.
    const fork = piece('fork', 5, [3, 6, -4], (add) => {
      addArm(add, 'black', BEAM9, -1, 0, 0, Q);
      pinUp(add, M.black, -1, 0.5, 0, 1);
      for (const y of [2, -2]) blockAt(add, 6, y, 0);
      for (const y of [4, -4]) {
        addArm(add, 'black', HOOK_IN, 5, y, 0, Q);
        add(M.tan, AXLE_END, 5, y + Math.sign(y) * 0.506, 0, -Math.sign(y) * Q);
      }
    });
    // The single jaw: a 9L beam on the head (its end hole on the pin), a bent liftarm beside its front end, joined by black 1×2 blocks on
    // yellow axles above and below; a black 3L pin in its 2nd hole carries the H link.
    const single = piece('single', 5, [3, 6, 4], (add) => {
      addArm(add, 'black', BEAM9, 0, 0, 0, Q);
      pinUp(add, M.black, 1, -1.5, 0, 3);
      addArm(add, 'black', HOOK_OUT, 6, 0, 1, Q);
      for (const x of [6, 8]) for (const y of [1, -1]) {
        addArm(add, 'black', BEAM2, x, y, 0, Q, 0, Q);
        for (const z of [0, 1]) add(M.yellow, AXLE_END, x, y * 1.506, z, -y * Q);
      }
    });
    // The grey H link: two 3-hole bars joined in the middle.
    const link = piece('link', 3, [0, 4, 0], (add) => {
      for (const z of [-2, 2]) addArm(add, 'grey', BEAM3, -1, 0, z, Q);
      add(M.grey, box(0.9, 0.75, 3.1, 0.12), 0, 0, 0);
      add(M.greyRim, brick(0.5, 0.01, 2.6), 0, 0.38, 0);
    });

    /* ---------- Cables ---------- */
    // The sensor's cable leaves its back over the black beams, runs down behind them, then along the front of the hub's top to E.
    const sensorCable = piece('sensorCable', 1, [0, 4, 4], (add) => {
      add(M.white, ribbon([[-10.95, 16.35, SZ], [-11.9, 16.45, SZ], [-12.6, 15.6, SZ], [-12.62, 12.5, SZ], [-12.6, 9.5, SZ + 0.2], [-12.5, 8.3, 0.9], [-11.9, 7.4, 1.5],
        [-11, 7.11, 1.55], [-9.6, 7.1, 1.55], [-8.85, 7.18, 1.5], [-8.42, 7.42, 1.42]]));
      add(M.plug, box(1.3, 0.75, 0.62, 0.12, 2), -7.8, 7.38, 1.4);
    });
    // The motor's cable leaves its top and crosses the base to A.
    const motorCable = piece('motorCable', 6, [0, 4, 3], (add) => {
      add(M.white, ribbon([[4.6, 8.06, -0.7], [3.4, 8.6, -0.3], [1.9, 9.25, 0], [0.2, 9.5, 0], [-1.4, 9.35, 0.3], [-2.6, 8.7, 0.9], [-3.15, 7.95, 1.12]]));
      add(M.plug, box(1.25, 0.75, 0.62, 0.12, 2), -3.4, 7.38, 1.12);
    });

    // Off the controller a grabber keeps its motor cable: it leaves the motor's top and lies on the table, at y0 in the grabber's frame.
    // Standing, it runs back over the base and down behind it; upside down, it drops from the motor to the table.
    const loose = (pts, y0, up) => piece('looseCable', 0, [0, 0, 0], (add) => {
      add(M.white, ribbon([[4.6, 8.06, -0.7], ...pts]));
      add(M.plug, box(1.25, 0.75, 0.62, 0.12, 2), pts[pts.length - 1][0] - 0.75, y0 + up * 0.375, pts[pts.length - 1][2]);
    });
    const looseUp = (y0) => loose([[3.4, 8.6, -0.3], [1.9, 9.3, 0], [0.2, 9.55, 0.2], [-1.8, 9.2, 0.5], [-3, 8, 0.8], [-3.4, 6.2, 1],
      [-3.6, y0 + 0.35, 1.2], [-4.2, y0 + 0.1, 1.6], [-5, y0 + 0.08, 1.8]], y0, 1);
    const looseDown = (y0) => loose([[4.4, 9.2, -0.8], [3.9, y0 - 1.2, -1.1], [3.1, y0 - 0.2, -1.5], [1.8, y0 - 0.1, -2.1],
      [-0.5, y0 - 0.1, -2.6], [-3, y0 - 0.1, -2.4]], y0, -1);

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
    const base1 = piece('base1', 2, [6, 0, 0], base), jaws = { 1: [loopArm([-1, 0.5, 1]), loopArm([1, -1.5, 3])], 2: [fork, single] };
    // How far each grabber reaches above and below its own frame: upside down it lies on its top, standing on its bottom.
    const ys = (p, dy) => p.meshes.flatMap(({ geo }) => { const b = new T.Box3().setFromBufferAttribute(geo.attributes.position); return [b.min.y + dy, b.max.y + dy]; });
    const top = (n) => Math.max(...ys(base1, 0), ...jaws[n].flatMap((j) => ys(j, PY)), ...ys(link, PY + 1));
    const low = Math.min(...ys(base1, 0));
    return {
      M, hub, stand, sensor, sensorCable, motorCable, rotor,
      base: { 1: base1, 2: { ...base1, name: 'base2', stage: 4 } },
      jaws,
      link: { 1: link, 2: { ...link, stage: 5 } },
      low, top: { 1: top(1), 2: top(2) },
      loose: { 1: [looseUp(low), looseDown(top(1))], 2: [looseUp(low), looseDown(top(2))] },
      tyre, capRim, capAxle, plunger,
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
    mesh(K.capRim, K.M.rim, sensorCap);
    mesh(K.capAxle, K.M.red, sensorCap);
    mesh(K.plunger, K.M.black, sensorCap);
    put(K.sensorCable, parts.cables);
    put(K.motorCable, parts.cables);
    parts.cables.traverse((o) => { o.receiveShadow = false; });     // a ribbon this thin only collects shadow acne

    // Each grabber: its base with the turning output, a jaw on each pin of the head (far one first) and the H link between them.
    const rigs = {};
    [1, 2].forEach((n) => {
      const part = parts['grabber' + n];
      const rotor = new T.Group();
      rotor.position.set(XR, 5, 0);
      K.rotor.meshes.forEach(({ geo, mat }) => mesh(geo, mat, rotor));
      put(K.base[n], part).add(rotor);
      const jaws = [-1, 1].map((s, i) => {
        const pivot = new T.Group();
        pivot.position.set(XR, PY, s * PZ);
        part.add(pivot);
        put(K.jaws[n][i], pivot);
        return { pivot, s };
      });
      const link = new T.Group();
      link.position.set(XR, PY + 1, 0);
      part.add(link);
      put(K.link[n], link);
      // Its loose cable comes and goes with its base; the holders pick the one for how it lies.
      const loose = K.loose[n].map((c) => {
        const holder = new T.Group();
        part.add(holder);
        put({ ...c, stage: K.base[n].stage, from: K.base[n].from }, holder).traverse((o) => { o.receiveShadow = false; });
        return holder;
      });
      rigs[n] = { part, rotor, jaws, link, loose, last: K.jaws[n][0].stage };
    });
    // Where a pin u modules along a jaw's beam stands now, in its grabber's frame.
    const pinAt = ({ pivot }, u) => [pivot.position.x + u * Math.cos(pivot.rotation.y), pivot.position.z - u * Math.sin(pivot.rotation.y)];

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
        const r = rigs[n], p = r.part, on = n === grabber, turn = jawTurn(n, gapAt(n, grip));
        // A grabber stands on its motor while it is built; put aside, it lies upside down in front, as in LEGO's picture.
        const upright = on || (!final && buildN <= r.last);
        p.visible = on || mode === 'spread' || !final;
        p.rotation.x = upright ? 0 : Math.PI;
        if (on) {
          p.position.x += DETACH * (1 - attach);
          p.position.y -= K.low * (1 - attach);
        } else {
          p.position.x += SPARE[0];
          p.position.y += upright ? -K.low : K.top[n];
          p.position.z += SPARE[1];
        }
        r.loose[0].visible = upright && !(on && final);
        r.loose[1].visible = !upright;
        r.jaws.forEach(({ pivot, s }) => {
          pivot.position.set(XR + 2 * exploded, PY, s * (PZ + 3 * exploded));
          pivot.rotation.y = -s * turn;
        });
        // The link lies on the far jaw's pin behind its pivot and the near jaw's pin in front of its own.
        // Taken apart it lifts off, but not on a grabber lying upside down: that would be into the table.
        const [ax, az] = pinAt(r.jaws[0], -1), [bx, bz] = pinAt(r.jaws[1], 1);
        r.link.position.set((ax + bx) / 2, PY + 1 + (upright ? 2.5 * exploded : 0), (az + bz) / 2);
        r.link.rotation.y = LINK_A - Math.atan2(bz - az, bx - ax);
        r.rotor.rotation.y = turn * CRANK;
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
