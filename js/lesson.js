// The lesson: a Force Sensor to press, the two grabbers in 3D, a results table, the build stepper, a quiz.
// Two 3D stages at most, each built on first sight and running only while it is on screen.
(function () {
  const RA = window.RA, T = THREE, { $, $$ } = RA;
  const live = !RA.reducedMotion;
  const DEG = Math.PI / 180;
  const comma = (v) => v.toFixed(1).replace('.', ',');

  /* ---------- Force Sensor (facts: SPEC §1) ---------- */
  const TRAVEL = 8, TOUCH = 1, ZONE = 2, MM = 10;   // mm of travel, trigger point, end of the touch zone; svg px per mm
  // ponytail: «сильно нажата» from 7 N is this site's choice, the same as the program view's simulator.
  const HARD = 7;
  // 2.5 N at 2 mm to 10 N at 8 mm, in steps of 0.1 N. Above the force zone the sensor only says pressed or not.
  const newtons = (d) => Math.round((2.5 + ((d - ZONE) * 7.5) / (TRAVEL - ZONE)) * 10) / 10;

  function initPress(root) {
    const box = $('#les-press', root), svg = $('svg', box), cap = $('#les-press-cap', box), mark = $('#les-press-mark', box);
    const read = $('.les-read', root), depthOut = $('#les-depth', root), zoneOut = $('#les-zone', root), forceOut = $('#les-force', root);
    const answers = $$('[data-ans]', root);
    let depth = 0, raf = 0, held = false;

    const set = (d) => {
      depth = Math.min(TRAVEL, Math.max(0, d));
      const free = depth < 0.05, force = depth >= ZONE, f = force ? newtons(depth) : 0, pressed = depth >= TOUCH;
      cap.setAttribute('transform', `translate(0 ${depth * MM})`);
      mark.setAttribute('transform', `translate(0 ${depth * MM})`);
      depthOut.textContent = comma(depth);
      zoneOut.textContent = free ? 'кнопка свободна' : force ? 'сила' : 'касание';
      forceOut.textContent = free ? '0 Н · 0 %' : force ? `${comma(f)} Н · ${Math.round(f * 10)} %` : 'только «да» или «нет»';
      read.classList.toggle('is-touch', !free && !force);
      read.classList.toggle('is-force', force);
      const now = { pressed, hard: f >= HARD, released: !pressed };
      answers.forEach((li) => {
        li.classList.toggle('is-on', now[li.dataset.ans]);
        li.lastElementChild.textContent = now[li.dataset.ans] ? 'да' : 'нет';
      });
      box.setAttribute('aria-valuenow', depth.toFixed(1));
      box.setAttribute('aria-valuetext', `${comma(depth)} мм, ${forceOut.textContent}`);
    };
    // The plunger has a spring: let go and it comes back out.
    const release = () => {
      held = false;
      cancelAnimationFrame(raf);
      if (!live) { set(0); return; }
      let last = performance.now();
      const back = (now) => {
        set(depth - ((now - last) / 1000) * 60);
        last = now;
        if (depth > 0) raf = requestAnimationFrame(back);
      };
      raf = requestAnimationFrame(back);
    };
    // The top of the wheel follows the pointer: press near its top for a touch, lower for more force.
    const follow = (e) => {
      const r = svg.getBoundingClientRect();
      set(((e.clientY - r.top) / r.height * 390 - 40) / MM);
    };
    box.addEventListener('pointerdown', (e) => {
      held = true;
      cancelAnimationFrame(raf);
      box.setPointerCapture(e.pointerId);
      follow(e);
      e.preventDefault();
      box.focus({ preventScroll: true });
    });
    box.addEventListener('pointermove', (e) => { if (held) follow(e); });
    box.addEventListener('pointerup', release);
    box.addEventListener('pointercancel', release);
    box.addEventListener('blur', () => { if (depth > 0) release(); });
    const KEYS = { ArrowDown: 0.5, ArrowRight: 0.5, ArrowUp: -0.5, ArrowLeft: -0.5, PageDown: 2, PageUp: -2, Home: -TRAVEL, End: TRAVEL };
    box.addEventListener('keydown', (e) => {
      if (!(e.key in KEYS)) return;
      e.preventDefault();
      cancelAnimationFrame(raf);
      set(depth + KEYS[e.key]);
    });
    set(0);
  }

  /* ---------- 3D helpers ---------- */
  const CAM = [47, 66, 69];   // from the front, right and above: the jaws close along Z, so we look down at the gap

  function shadowCatcher() {
    const m = new T.Mesh(new T.PlaneGeometry(240, 240), new T.ShadowMaterial({ opacity: 0.16 }));
    m.rotation.x = -Math.PI / 2;
    m.position.y = -0.02;
    m.receiveShadow = true;
    return m;
  }

  function noZoom(stage) {
    if (!stage.controls) return;
    stage.controls.enableZoom = false;      // the wheel must keep scrolling the page
    stage.renderer.domElement.style.touchAction = 'pan-y';
  }

  // Keeps what is shown in view whatever the model looks like: the target glides to its centre, the camera keeps its direction.
  function fitter(stage, obj) {
    const box = new T.Box3(), one = new T.Box3(), mid = new T.Vector3(), d = new T.Vector3();
    const ax = [new T.Vector3(), new T.Vector3(), new T.Vector3()], corners = Array.from({ length: 8 }, () => new T.Vector3());
    const tan = Math.tan((stage.camera.fov * DEG) / 2);
    let snap = true;
    return {
      measure() {
        box.makeEmpty();
        obj.updateMatrixWorld(true);
        obj.traverseVisible((o) => { if (o.isMesh) box.union(one.setFromObject(o)); });
        if (box.isEmpty()) return;
        box.getCenter(mid);
        corners.forEach((c, i) => c.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).sub(mid));
      },
      step(dt) {
        const c = stage.controls, cam = stage.camera;
        if (!c) return;
        const k = snap || !live ? 1 : 1 - Math.exp(-dt * 3);
        snap = false;
        d.copy(mid).sub(c.target).multiplyScalar(k);
        c.target.add(d);
        cam.position.add(d);
        // Every corner of the box must fit across and up the view; the corners nearer the camera need more room.
        cam.updateMatrixWorld();
        ax.forEach((a, i) => a.setFromMatrixColumn(cam.matrixWorld, i));
        let want = 0;
        corners.forEach((p) => {
          want = Math.max(want, Math.max(Math.abs(p.dot(ax[0])) / (tan * cam.aspect), Math.abs(p.dot(ax[1])) / tan) + p.dot(ax[2]));
        });
        const now = cam.position.distanceTo(c.target);
        cam.position.sub(c.target).setLength(now + (want * 1.08 - now) * k).add(c.target);
      },
    };
  }

  /* ---------- Two grabbers ---------- */
  function initGrab(root) {
    const st = { n: 2, grip: 0, touched: false };
    const range = $('#les-grip', root), pos = $('#les-grip-pos', root), btns = $$('[data-grabber]', root), cards = $$('[data-card]', root);
    // Open at 25, closed at 345 counterclockwise: about 40° (SPEC §1).
    st.show = (t) => { st.grip = t; pos.textContent = (Math.round(25 - 40 * t) + 360) % 360; };
    range.addEventListener('input', () => { st.touched = true; st.show(range.value / 100); });
    btns.forEach((b) => b.addEventListener('click', () => {
      st.n = +b.dataset.grabber;
      btns.forEach((x) => x.setAttribute('aria-pressed', x === b));
      cards.forEach((c) => { c.hidden = c.dataset.card !== b.dataset.grabber; });
    }));
    return st;
  }

  function makeGrab(root, st) {
    const stage = RA.stage($('#les-grab-stage', root), { fov: 20, maxDpr: 1.5, camera: CAM, target: [5, 8, 0] });
    const g = RA.createGrabber(), range = $('#les-grip', root), fit = fitter(stage, g.group);
    g.setLayout('tool');
    stage.scene.add(g.group, shadowCatcher());
    noZoom(stage);
    let n = 0, grip = 0;
    stage.frame((dt, t) => {
      if (n !== st.n) { n = st.n; g.setGrabber(n); g.setGrip(0); fit.measure(); }
      // The slider moves by itself until someone takes it, so the class sees what it does.
      if (live && !st.touched) { range.value = 50 - 50 * Math.cos(t * 0.8); st.show(range.value / 100); }
      grip = live ? grip + (st.grip - grip) * Math.min(1, dt * 10) : st.grip;
      g.setGrip(grip);
      fit.step(dt);
      g.update(dt);
    });
    return stage;
  }

  /* ---------- Fair test (LEGO's lesson, SPEC §1) ---------- */
  const TESTS = [
    { title: 'Испытание 1. Разный размер', note: 'Вес похожий, меняется только размер.', what: 'разного размера',
      items: [['Кубик LEGO', 'маленький'], ['Бумажный шарик', 'средний'], ['Пустая пластиковая бутылка', 'большая']] },
    { title: 'Испытание 2. Разный вес', note: 'Размер похожий, меняется только вес.', what: 'разного веса',
      items: [['Бумажный шарик', 'лёгкий'], ['Стопка колёс LEGO', 'средняя'], ['Яблоко', 'тяжёлое']] },
  ];
  const MARK = { '': ['', 'пусто'], yes: ['✓', 'держит'], no: ['✗', 'не держит'] }, NEXT = { '': 'yes', yes: 'no', no: '' };

  function initTests(root) {
    const box = $('#les-trials', root), clear = $('#les-test-clear', root);
    let res = RA.store.get('lessonTests', {}), sure = 0;
    box.innerHTML = TESTS.map((t, ti) => `<div class="les-trial"><h3>${t.title}</h3><p>${t.note}</p>
      <table class="les-tab"><thead><tr><th scope="col">Предмет</th><th scope="col">Захват 1</th><th scope="col">Захват 2</th></tr></thead>
      <tbody>${t.items.map(([name, tag], i) => `<tr><th scope="row">${name}<small>${tag}</small></th>${[1, 2].map((g) =>
        `<td><button type="button" class="les-cell" data-cell="${ti}-${i}-${g}"></button></td>`).join('')}</tr>`).join('')}</tbody></table>
      <p class="les-trial__sum" data-sum="${ti}"></p></div>`).join('');

    const paint = () => {
      $$('[data-cell]', box).forEach((b) => {
        const v = res[b.dataset.cell] || '', [ti, i, g] = b.dataset.cell.split('-');
        b.className = 'les-cell' + (v ? ' is-' + v : '');
        b.innerHTML = v ? `<span><b>${MARK[v][0]}</b><small>${MARK[v][1]}</small></span>` : '';
        b.setAttribute('aria-label', `${TESTS[ti].items[i][0]}, захват ${g}: ${MARK[v][1]}`);
      });
      TESTS.forEach((t, ti) => {
        const sum = $(`[data-sum="${ti}"]`, box), cell = (i, g) => res[`${ti}-${i}-${g}`];
        if (t.items.some((_, i) => !cell(i, 1) || !cell(i, 2))) { sum.textContent = 'Заполните все клетки, и здесь появится вывод.'; return; }
        const [a, b] = [1, 2].map((g) => t.items.filter((_, i) => cell(i, g) === 'yes').length);
        sum.innerHTML = `<b>Вывод.</b> Захват 1 удержал ${a} из ${t.items.length}, захват 2 удержал ${b} из ${t.items.length}. `
          + (a === b ? 'Захваты сработали одинаково.' : `Для предметов ${t.what} лучше захват ${a > b ? 1 : 2}.`);
      });
    };
    box.addEventListener('click', (e) => {
      const b = e.target.closest('[data-cell]');
      if (!b) return;
      const v = NEXT[res[b.dataset.cell] || ''];
      if (v) res[b.dataset.cell] = v;
      else delete res[b.dataset.cell];
      RA.store.set('lessonTests', res);
      paint();
    });
    // No native confirm in the published page: the button asks again in its own label.
    clear.addEventListener('click', () => {
      clearTimeout(sure);
      if (clear.dataset.sure) {
        res = {};
        RA.store.set('lessonTests', res);
        paint();
      } else {
        clear.dataset.sure = '1';
        clear.textContent = 'Точно очистить?';
        sure = setTimeout(() => { delete clear.dataset.sure; clear.textContent = 'Очистить таблицу'; }, 3000);
        return;
      }
      delete clear.dataset.sure;
      clear.textContent = 'Очистить таблицу';
    });
    paint();
  }

  /* ---------- Build stepper ---------- */
  function makeBuild(root) {
    const stage = RA.stage($('#les-build-stage', root), { fov: 20, maxDpr: 1.5, camera: CAM, target: [4, 6, 0] });
    const g = RA.createGrabber(), fit = fitter(stage, g.group);
    g.setLayout('spread');      // all three builds on the table, as in the app's picture
    stage.scene.add(g.group, shadowCatcher());
    noZoom(stage);
    const S = g.STAGES, last = S.length - 1, plays = live && !!stage.renderer;
    const rail = $('#les-rail', root), prev = $('#les-stage-prev', root), next = $('#les-stage-next', root), explode = $('#les-explode', root);
    // One beam per build in the app, one hole per stage.
    const builds = [];
    S.forEach((s, i) => {
      const b = builds[builds.length - 1];
      if (b && b.name === s.build) b.idx.push(i);
      else builds.push({ name: s.build, steps: s.steps, idx: [i] });
    });
    rail.innerHTML = builds.map((b) => `<li style="flex-grow:${b.idx.length}"><div class="les-rail__beam">${b.idx.map((i) =>
      `<button type="button" data-stage="${i}" aria-label="Этап ${i + 1}: ${S[i].title}"><i></i></button>`).join('')}</div>
      <span>${b.name}${b.steps ? ', шаги ' + b.steps : ''}</span></li>`).join('');
    const holes = $$('[data-stage]', rail);
    let n = 0, tween = 1;

    const show = (i, animate) => {
      n = i;
      g.setBuildStage(n, 1);
      fit.measure();
      tween = animate && plays ? 0 : 1;
      g.setBuildStage(n, tween);
      const s = S[n];
      $('#les-stage-n', root).textContent = `Этап ${n + 1} из ${last + 1}.`;
      $('#les-stage-steps', root).textContent = s.steps ? `${s.build}, шаги ${s.steps} в приложении` : s.build;
      $('#les-stage-title', root).textContent = s.title;
      $('#les-stage-text', root).textContent = s.text;
      $('#les-stage-parts', root).textContent = s.parts;
      holes.forEach((h, k) => {
        h.classList.toggle('is-done', k < n);
        h.classList.toggle('is-now', k === n);
        if (k === n) h.setAttribute('aria-current', 'step');
        else h.removeAttribute('aria-current');
      });
      prev.disabled = n === 0;
      next.disabled = n === last;
    };
    const go = (i) => { explode.value = 0; g.setExplode(0); show(i, true); };

    rail.addEventListener('click', (e) => { const b = e.target.closest('[data-stage]'); if (b) go(+b.dataset.stage); });
    prev.addEventListener('click', () => go(n - 1));
    next.addEventListener('click', () => go(n + 1));
    // Taking a model apart starts from the whole model.
    explode.addEventListener('input', () => {
      if (n !== last) show(last, false);
      g.setExplode(explode.value / 100);
      fit.measure();
    });
    show(0, false);

    stage.frame((dt) => {
      if (tween < 1) {
        tween = Math.min(1, tween + dt / 0.9);
        g.setBuildStage(n, tween);
      }
      fit.step(dt);
      g.update(dt);
    });
    return stage;
  }

  /* ---------- Quiz ---------- */
  const QUIZ = [
    { q: 'Ты едва нажал кнопку датчика силы, на 1\u00a0мм. Что он может сообщить?', a: ['Силу нажатия в ньютонах', 'Только «нажата» или «не нажата»', 'Вес предмета'], ok: 1,
      why: 'Первые 2\u00a0мм хода — зона касания. Здесь датчик отвечает только «да» или «нет». Силу он меряет глубже, от 2 до 8\u00a0мм.' },
    { q: 'Какой блок нужен, чтобы сила нажатия управляла мощностью мотора?', a: ['(E) когда нажата', 'ждать до (E) нажата?', '(E) давление в %'], ok: 2,
      why: 'Этот блок выдаёт число от 0 до 100. Два других знают только, нажата кнопка или нет.' },
    { q: 'Какой захват почти невозможно использовать с маленькими предметами?', a: ['Захват 1, гибкий', 'Захват 2, раздвоенный', 'Оба легко берут маленькое'], ok: 1,
      why: 'Раздвоенный захват сделан для больших и тяжёлых предметов. Маленький предмет ему почти не взять.' },
    { q: 'Как испытать захваты честно?', a: ['Менять только одно, остальное оставить как было', 'Поменять всё сразу, так быстрее', 'Испытать только захват, который больше нравится'], ok: 0,
      why: 'Если меняется только одно, видно, от чего зависит результат. В испытании 1 меняется только размер, в испытании 2 — только вес.' },
    { q: 'Что сделает наши захваты автономнее?', a: ['Нажимать на датчик сильнее', 'Датчик на самой клешне', 'Второй мотор'], ok: 1,
      why: 'Сейчас, когда сжать, решает человек. С датчиком на клешне машина сама почувствует предмет и сама его сожмёт.' },
  ];
  const VERDICT = ['Вернись к уроку и попробуй ещё раз.', 'Вернись к уроку и попробуй ещё раз.', 'Неплохо. Вернись к разделам, где были ошибки, и попробуй ещё раз.', 'Хорошо. Осталось чуть-чуть.', 'Отлично, почти всё верно.', 'Отлично, всё верно.'];

  function initQuiz(root) {
    const box = $('#les-quiz-box', root), pins = $('#les-quiz-pins', root), lastLine = $('#les-quiz-last', root);
    let i = 0, marks = [];
    const paintPins = () => {
      pins.innerHTML = QUIZ.map((q, k) => `<i class="${k in marks ? (marks[k] ? 'is-right' : 'is-wrong') : k === i ? 'is-now' : ''}"></i>`).join('');
      pins.setAttribute('aria-label', `Верных ответов: ${marks.filter(Boolean).length} из ${QUIZ.length}`);
    };
    const paintLast = () => {
      const past = RA.store.get('lessonQuiz', null);
      lastLine.textContent = past ? `Прошлый результат: ${past.score} из ${past.total}` : '';
    };
    const ask = () => {
      const q = QUIZ[i];
      box.innerHTML = `<div class="les-quiz__ask"><p class="les-quiz__q">${q.q}</p><p class="les-quiz__why" aria-live="polite"></p><div class="les-quiz__foot"></div></div>
        <div class="les-opts">${q.a.map((a, k) => `<button type="button" class="les-opt" data-a="${k}">${a}</button>`).join('')}</div>`;
      paintLast();
      paintPins();
    };
    const answer = (k) => {
      const q = QUIZ[i], right = k === q.ok;
      marks[i] = right;
      $$('.les-opt', box).forEach((b, n) => {
        b.disabled = true;
        if (n === q.ok) b.classList.add('is-right');
        else if (n === k) b.classList.add('is-wrong');
      });
      $('.les-quiz__why', box).innerHTML = `<b>${right ? 'Верно.' : 'Не совсем.'}</b> ${q.why}`;
      $('.les-quiz__foot', box).innerHTML = `<button type="button" class="btn" data-next>${i < QUIZ.length - 1 ? 'Следующий вопрос' : 'Узнать результат'}</button>`;
      $('[data-next]', box).focus({ preventScroll: true });
      paintPins();
    };
    const finish = () => {
      const score = marks.filter(Boolean).length;
      RA.store.set('lessonQuiz', { score, total: QUIZ.length });
      RA.progress.mark('lesson');
      lastLine.textContent = '';
      box.innerHTML = `<div class="les-quiz__end"><p class="les-quiz__score">${score} из ${QUIZ.length}</p><p class="les-quiz__q">${VERDICT[score]}</p>
        <div class="les-quiz__foot"><a class="btn" href="#examples">Дальше: в жизни</a><button type="button" class="btn" data-again>Пройти ещё раз</button></div></div>`;
      paintPins();
    };
    box.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.a) answer(+b.dataset.a);
      else if ('next' in b.dataset) { i += 1; if (i < QUIZ.length) ask(); else finish(); }
      else if ('again' in b.dataset) { i = 0; marks = []; ask(); }
    });
    ask();
  }

  /* ---------- View ---------- */
  let active = false;
  const syncs = [];

  // Builds its 3D on first sight, then runs only while it is both on screen and in the current view.
  function watch(el, make) {
    let stage = null, seen = false;
    const sync = () => {
      if (seen && active && !stage) stage = make();
      if (!stage) return;
      if (seen && active) stage.start();
      else stage.stop();
    };
    // The top bar covers the first 64px, and a box that merely touches the edge still counts: hence 65.
    new IntersectionObserver((list) => { seen = list[list.length - 1].isIntersecting; sync(); }, { rootMargin: '-65px 0px 0px' }).observe(el);
    syncs.push(sync);
  }

  RA.view('lesson', {
    init(root) {
      initPress(root);
      initTests(root);
      initQuiz(root);
      const grab = initGrab(root);
      watch($('#les-grab-stage', root), () => makeGrab(root, grab));
      watch($('#les-build-stage', root), () => makeBuild(root));
      root.addEventListener('click', (e) => {
        const b = e.target.closest('[data-to]');
        if (b) $('#' + b.dataset.to).scrollIntoView({ behavior: live ? 'smooth' : 'auto' });
      });
    },
    enter() { active = true; syncs.forEach((s) => s()); },
    leave() { active = false; syncs.forEach((s) => s()); },
  });
})();
