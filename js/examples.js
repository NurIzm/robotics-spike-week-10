// "В жизни": one shared stage, six stories from RA.SCENES swapped inside it, a caption timeline read from the same phase table.
(function () {
  const RA = window.RA, $ = RA.$;
  const FADE = 0.35; // ponytail: a dip to the background hides the reset at the loop point, no continuity tricks per scene
  const LEVELS = ['Ручное', 'Программа', 'Автономия'];
  const ease = (x) => x * x * x * (x * (6 * x - 15) + 10);
  const at = (list, t) => { // last entry that has started by time t
    let i = list.length - 1;
    while (i && t < list[i].t0) i--;
    return i;
  };
  const pose = {};
  let stage, box, ui, cur = null, time = 0, playing = false, step = -1;
  // Ids of stories that no longer exist are dropped, so they cannot count towards the three seen.
  const seen = new Set([].concat(RA.store.get('examples.seen', [])).filter((id) => RA.SCENES.some((s) => s.id === id)));

  // Turns a scene's table into running times, whole poses and caption steps.
  function prepare(sc) {
    sc.poses = [sc.start];
    sc.total = 0;
    sc.steps = [];
    sc.phases.forEach((row, i) => {
      const { s, text, linear, ...to } = row;
      sc.poses.push(Object.assign({}, sc.poses[i], to));
      if (text) sc.steps.push({ text, t0: sc.total, s: 0 });
      sc.steps[sc.steps.length - 1].s += s;
      row.t0 = sc.total;
      sc.total += s;
    });
  }

  function sample(sc, t) {
    const i = at(sc.phases, t), r = sc.phases[i], raw = Math.min(1, (t - r.t0) / r.s), k = r.linear ? raw : ease(raw), a = sc.poses[i], b = sc.poses[i + 1];
    for (const key in b) pose[key] = a[key] + (b[key] - a[key]) * k;
  }

  function paintStep(t) {
    const i = at(cur.steps, t);
    if (i !== step) {
      step = i;
      ui.now.textContent = cur.steps[i].text;
      ui.steps.forEach((el, n) => {
        el.classList.toggle('is-now', n === i);
        el.classList.toggle('is-past', n < i);
        if (n === i) el.setAttribute('aria-current', 'step');
        else el.removeAttribute('aria-current');
      });
    }
    ui.steps[i].style.setProperty('--p', Math.min(1, (t - cur.steps[i].t0) / cur.steps[i].s));
  }

  function draw() {
    const t = time % cur.total;
    sample(cur, t);
    cur.apply(pose, time, t / cur.total);
    paintStep(t);
    if (stage.renderer) stage.renderer.domElement.style.opacity = playing ? Math.min(1, t / FADE, (cur.total - t) / FADE) : 1;
  }

  function paintToggle() {
    ui.toggle.setAttribute('aria-label', playing ? 'Пауза' : 'Смотреть');
    ui.toggle.dataset.state = playing ? 'playing' : 'paused';
    ui.toggle.classList.toggle('is-waiting', !playing && RA.reducedMotion);
  }

  function frameCamera() {
    if (!cur) return;
    // Pull back on narrow canvases so the whole story stays in the frame.
    const fit = Math.max(1, 1.42 / (stage.size.w / stage.size.h));
    const eye = new THREE.Vector3(...cur.camera), target = new THREE.Vector3(...cur.target);
    stage.camera.position.copy(target).addScaledVector(eye.sub(target), fit);
    stage.target.copy(target);
    if (stage.controls) {
      stage.controls.target.copy(target);
      stage.controls.update();
    }
  }

  function fill(sc) {
    ui.grip.textContent = sc.grip;
    $('#ex-where').textContent = sc.where;
    $('#ex-does').textContent = sc.does;
    $('#ex-how').textContent = sc.how;
    $('#ex-sensors').textContent = sc.sensors;
    $('#ex-auto').textContent = sc.auto;
    $('#ex-common').textContent = sc.common;
    $('#ex-gripname').textContent = sc.grip;
    RA.$$('#ex-levels span').forEach((el, i) => el.classList.toggle('is-on', i === sc.level));
    ui.stepList.replaceChildren(...sc.steps.map((st) => {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ex__step';
      b.innerHTML = '<i class="ex__hole"></i><span></span>';
      b.lastChild.textContent = st.text;
      b.addEventListener('click', () => seek(st.t0));
      li.append(b);
      return li;
    }));
    ui.steps = RA.$$('.ex__step', ui.stepList);
    step = -1;
    RA.$$('.ex__item').forEach((el) => {
      const on = el.dataset.id === sc.id;
      el.classList.toggle('is-current', on);
      el.classList.toggle('is-seen', seen.has(el.dataset.id));
      if (on) el.setAttribute('aria-current', 'true');
      else el.removeAttribute('aria-current');
    });
  }

  function show(id) {
    const sc = RA.SCENES.find((s) => s.id === id) || RA.SCENES[0];
    if (sc === cur) return;
    if (cur && cur.root) cur.root.visible = false;
    if (RA.webgl && !sc.root) {
      sc.root = new THREE.Group();
      stage.scene.add(sc.root);
      sc.apply = sc.build(sc.root, stage);
    }
    if (!sc.apply) sc.apply = () => {};
    if (sc.root) sc.root.visible = true;
    cur = sc;
    box.style.background = sc.bg;
    if (stage.renderer) stage.renderer.domElement.setAttribute('aria-label', sc.title + '. ' + sc.does);
    seen.add(sc.id);
    RA.store.set('examples.seen', [...seen]);
    if (seen.size >= 3) RA.progress.mark('examples');
    fill(sc);
    frameCamera();
    playing = !RA.reducedMotion;
    time = playing ? FADE : sc.poster; // a reduced-motion viewer gets a telling still and waits for the button
    paintToggle();
    draw();
  }

  function seek(t) {
    time = t;
    draw();
  }

  function init(view) {
    box = $('#ex-stage', view);
    ui = { now: $('#ex-now', view), stepList: $('#ex-steps', view), toggle: $('#ex-toggle', view), grip: $('#ex-grip', view), steps: [] };
    RA.SCENES.forEach(prepare);
    $('#ex-levels', view).innerHTML = LEVELS.map((l) => '<span>' + l + '</span>').join('');
    $('#ex-list', view).innerHTML = RA.SCENES.map((s) => '<li><button type="button" class="ex__item" data-id="' + s.id + '"><i class="ex__hole"></i>' +
      '<b>' + s.title + '</b><em>' + s.tag + '</em></button></li>').join('');
    $('#ex-list', view).addEventListener('click', (e) => {
      const b = e.target.closest('.ex__item');
      if (b) show(b.dataset.id);
    });
    ui.toggle.addEventListener('click', () => {
      playing = !playing;
      paintToggle();
    });
    stage = RA.stage(box, { fov: 24, near: 4, far: 1400, shadowBox: 76, maxDpr: 1.5, camera: [0, 30, 100], target: [0, 8, 0] });
    if (stage.renderer) {
      stage.key.position.set(-34, 90, 60);
      stage.key.intensity = 1.25; // the scenes bring saturated toy colours, the stage defaults would burn them out
      stage.key.shadow.camera.far = 260;
      stage.key.shadow.camera.updateProjectionMatrix();
      stage.controls.minDistance = 50;
      stage.controls.maxDistance = 240;
      stage.renderer.domElement.style.touchAction = 'pan-y'; // a phone can still scroll the page across the canvas
      stage.renderer.domElement.setAttribute('role', 'img');
    }
    stage.frame((dt) => {
      if (!cur) return;
      if (playing) time += dt;
      draw();
    });
    new ResizeObserver(frameCamera).observe(box);
    show(RA.SCENES[0].id);
  }

  RA.view('examples', {
    init,
    enter() { stage.start(); },
    leave() { stage.stop(); },
  });

  RA.examples = { show, seek, get stage() { return stage; } }; // the QA script drives the stills through this
})();
