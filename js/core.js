// Shared runtime: views, storage, toasts and the three.js stage helper.
(function () {
  const RA = (window.RA = {});
  const VIEWS = ['start', 'lesson', 'examples', 'program'];
  const hooks = {};
  const inited = {};

  RA.$ = (sel, root) => (root || document).querySelector(sel);
  RA.$$ = (sel, root) => [...(root || document).querySelectorAll(sel)];
  RA.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  RA.current = null;

  const mem = {};          // storage can be refused, the session still remembers
  RA.store = {
    get(key, fallback) {
      if (key in mem) return mem[key];
      try {
        const raw = localStorage.getItem('zahvaty.' + key);
        return raw === null ? fallback : JSON.parse(raw);
      } catch (e) { return fallback; }
    },
    set(key, value) {
      mem[key] = value;
      try { localStorage.setItem('zahvaty.' + key, JSON.stringify(value)); } catch (e) { /* private mode */ }
    },
    remove(keys) {
      keys.forEach((key) => {
        delete mem[key];
        try { localStorage.removeItem('zahvaty.' + key); } catch (e) { /* private mode */ }
      });
    },
  };

  RA.progress = {
    mark(name) {
      const done = RA.store.get('done', {});
      done[name] = true;
      RA.store.set('done', done);
      paintNav();
    },
    has: (name) => !!RA.store.get('done', {})[name],
  };

  function paintNav() {
    RA.$$('.beam__stop').forEach((a) => {
      a.classList.toggle('is-current', a.dataset.view === RA.current);
      a.classList.toggle('is-done', RA.progress.has(a.dataset.view));
      if (a.dataset.view === RA.current) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
  }

  RA.view = (name, h) => { hooks[name] = h; };

  RA.go = (name) => {
    if (!VIEWS.includes(name)) name = 'start';
    if (name === RA.current) return;
    const prev = RA.current;
    if (prev && hooks[prev] && hooks[prev].leave) hooks[prev].leave(RA.$('#view-' + prev));
    VIEWS.forEach((v) => { RA.$('#view-' + v).hidden = v !== name; });
    document.body.dataset.view = name;
    RA.current = name;
    if (location.hash.slice(1) !== name) history.replaceState(null, '', '#' + name);
    window.scrollTo(0, 0);
    paintNav();
    const root = RA.$('#view-' + name);
    const h = hooks[name];
    if (h) {
      if (!inited[name]) { inited[name] = true; if (h.init) h.init(root); }
      if (h.enter) h.enter(root);
    }
  };

  RA.boot = () => {
    addEventListener('hashchange', () => RA.go(location.hash.slice(1)));
    RA.go(location.hash.slice(1) || 'start');
  };

  RA.toast = (text, kind) => {
    const box = RA.$('#toasts');
    const el = document.createElement('div');
    el.className = 'toast toast--' + (kind || 'info');
    el.textContent = text;
    box.append(el);
    while (box.children.length > 3) box.firstChild.remove();
    setTimeout(() => el.remove(), kind === 'warn' ? 7000 : 4000);
  };

  RA.webgl = (() => {
    try { return !!document.createElement('canvas').getContext('webgl2'); } catch (e) { return false; }
  })();

  // One WebGL view. Runs only between start() and stop(), so hidden views cost nothing.
  RA.stage = (container, o) => {
    o = Object.assign({ fov: 28, near: 1, far: 900, camera: [40, 34, 70], target: [0, 4, 0], controls: true,
      shadows: true, background: null, envIntensity: 0.75, shadowBox: 45, maxDpr: 2 }, o);
    const scene = new THREE.Scene();
    if (o.background !== null) scene.background = new THREE.Color(o.background);
    const camera = new THREE.PerspectiveCamera(o.fov, 1, o.near, o.far);
    camera.position.set(...o.camera);
    const target = new THREE.Vector3(...o.target);
    camera.lookAt(target);
    const stage = { scene, camera, renderer: null, controls: null, target, size: { w: 1, h: 1 },
      frame() {}, start() {}, stop() {}, resize() {}, pick() { return null; } };
    if (!RA.webgl) {
      container.insertAdjacentHTML('beforeend', '<p class="no-webgl">Этот браузер не показывает 3D. Откройте урок в свежей версии Chrome, Edge или Firefox.</p>');
      return stage;
    }

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, o.maxDpr));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = o.shadows;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.append(renderer.domElement);
    renderer.domElement.style.display = 'block';
    stage.renderer = renderer;

    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new THREE.RoomEnvironment(renderer), 0.04).texture;
    pmrem.dispose();

    const key = new THREE.DirectionalLight(0xffffff, 1.5);
    key.position.set(-30, 70, 45);
    key.castShadow = o.shadows;
    key.shadow.mapSize.set(2048, 2048);
    const box = o.shadowBox;
    Object.assign(key.shadow.camera, { left: -box, right: box, top: box, bottom: -box, near: 1, far: 220 });
    key.shadow.bias = -0.0004;
    key.shadow.radius = 5;
    key.target.position.copy(target);
    scene.add(key, key.target, new THREE.HemisphereLight(0xffffff, 0xcfd8dc, 0.55));
    stage.key = key;

    if (o.controls) {
      const c = new THREE.OrbitControls(camera, renderer.domElement);
      c.target.copy(target);
      c.enableDamping = true;
      c.dampingFactor = 0.08;
      c.enablePan = false;
      c.maxPolarAngle = Math.PI * 0.49;
      c.update();
      stage.controls = c;
    }

    const fns = [];
    let raf = 0, last = 0, t = 0;
    const tick = (now) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      t += dt;
      fns.forEach((fn) => fn(dt, t));
      if (stage.controls) stage.controls.update();
      renderer.render(scene, camera);
    };
    stage.frame = (fn) => fns.push(fn);
    stage.start = () => {
      if (raf) return;
      stage.resize();
      last = performance.now();
      raf = requestAnimationFrame(tick);
    };
    stage.stop = () => { cancelAnimationFrame(raf); raf = 0; };
    stage.resize = () => {
      const w = container.clientWidth || 1, h = container.clientHeight || 1;
      if (w === stage.size.w && h === stage.size.h) return;
      stage.size = { w, h };
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = w + 'px';
      renderer.domElement.style.height = h + 'px';
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    new ResizeObserver(stage.resize).observe(container);

    // Returns the nearest intersection for a pointer event, or null.
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    stage.pick = (ev, objects) => {
      const r = renderer.domElement.getBoundingClientRect();
      ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      return ray.intersectObjects(objects, true)[0] || null;
    };
    stage.resize();
    return stage;
  };
})();
