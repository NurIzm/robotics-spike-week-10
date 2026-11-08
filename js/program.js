// The program view: blocks on the left, the working model on the right, the four tasks on top.
(function () {
  const RA = window.RA;
  const { $, $$ } = RA;

  const TASKS = [
    { title: 'Нажми и держи', xml: () => RA.SOLUTION_XML, ready: 'Нажми запуск. Потом нажми и подержи датчик силы: колесо под моделью или пробел.',
      goal: 'Нажали датчик силы: захват закрывается. Отпустили: он должен открыться, но в программе не хватает блока. Добавь его.',
      hint: 'В конец цикла, после «ждать до (E) отпущена?», поставь блок из «Моторов»: A перейти самым коротким путём в положение 25.' },
    { title: 'Испытай захваты', xml: () => RA.SOLUTION_XML, ready: 'Запусти программу из первого задания и неси предметы в корзину.',
      goal: 'Отнеси каждый предмет в корзину каждым захватом. Таблица заполнится сама: держит, выскальзывает, смят или не взял.',
      hint: 'Наведи кольцо на предмет, опусти захват клавишей E, нажми датчик, подними клавишей Q. Над корзиной отпусти датчик. Сменить захват можно переключателем под моделью.' },
    { title: 'Бережно', xml: () => RA.GENTLE_XML, grabber: 2, ready: 'Стоит захват 2. Запусти программу и возьми шарик.',
      goal: 'Захват 2 с программой первого задания мнёт бумажный шарик. Сделай так, чтобы захват сжимал так же сильно, как ты жмёшь на датчик. Отнеси в корзину целый шарик и яблоко.',
      hint: 'В цикле: если (E) нажата?, то A запустить мотор с мощностью ((E) давление в %) × -1, иначе A перейти в положение 25. Шарик держи слабо (пробел, 4 Н), яблоко сильно (Shift и пробел, 9 Н).' },
    { title: 'Захват помнит', xml: () => RA.TOGGLE_XML, ready: 'Запусти программу. Нажми и отпусти датчик, подожди, потом нажми ещё раз.',
      goal: 'Одно нажатие закрывает захват, и он остаётся закрытым, даже когда датчик отпустили. Следующее нажатие открывает.',
      hint: 'Начни с программы первого задания. На каждое нажатие нужны два ожидания: «ждать до (E) нажата?» и «ждать до (E) отпущена?». Порядок в цикле: ждать нажатия, закрыть, ждать отпускания, ждать нажатия, открыть, ждать отпускания.' },
  ];
  const KINDS = [['cube', 'Кубик'], ['ball', 'Шарик'], ['bottle', 'Бутылка'], ['apple', 'Яблоко']];
  const MARK = { 'держит': 'ok', 'выскальзывает': 'slip', 'смят': 'bad', 'не взял': 'miss' };
  const TOGGLE_STEPS = ['Нажал: закрылся', 'Отпустил: закрыт 1,5 с', 'Нажал снова: открылся'];
  const CLOSED = 15, OPENED = 22, WATCH = 1.2, KEEP = 1.5, TOUCH = 0.6, HARD = 7;   // ° of motor A, seconds, newtons

  const MOVES = { ArrowLeft: '-x', KeyA: '-x', ArrowRight: '+x', KeyD: '+x', ArrowUp: '-z', KeyW: '-z', ArrowDown: '+z', KeyS: '+z', KeyQ: '+y', PageUp: '+y', KeyE: '-y', PageDown: '-y' };

  let root, sim, bl, vm, split;
  let task = 0;
  const press = { on: false, t0: 0, low: 0, end: 0, at: 0 };   // task 1 watches one press and release
  let toggle = null;                                        // task 4 watches one run
  let results = {};                                         // task 2: {1: {cube: 'держит', …}, 2: {…}}
  let spaceHeld = false, wheelHeld = false, lastForce = 0, nudged = -1e9;
  const held = new Set();

  const say = (text, kind) => {
    const s = $('#task-status');
    s.textContent = text;
    s.dataset.kind = kind || '';
  };

  const solved = (i, text) => {
    say(text, 'ok');
    RA.toast(text, 'ok');
    const done = RA.store.get('program.tasks', {});
    if (done[i]) return;
    done[i] = true;
    RA.store.set('program.tasks', done);
    paintTabs();
    if (TASKS.every((t, n) => done[n])) RA.progress.mark('program');
  };

  const paintTabs = () => {
    const done = RA.store.get('program.tasks', {});
    $$('.tasks__tab').forEach((b, i) => {
      b.setAttribute('aria-pressed', i === task);
      b.classList.toggle('is-done', !!done[i]);
    });
  };

  const paintSteps = () => {
    $$('#task-steps li').forEach((li, i) => li.classList.toggle('is-on', !!toggle && i < Math.floor(toggle.step)));
  };

  const paintTable = () => {
    $('#task-table').innerHTML = `<tr><th></th>${KINDS.map(([, name]) => `<th>${name}</th>`).join('')}</tr>`
      + [1, 2].map((g) => `<tr><th>Захват ${g}</th>${KINDS.map(([id]) => {
        const r = (results[g] || {})[id];
        return `<td data-mark="${r ? MARK[r] : ''}">${r || '…'}</td>`;
      }).join('')}</tr>`).join('');
  };

  const record = (g, id, what) => {
    if (task !== 1) return;
    results[g] = results[g] || {};
    if (results[g][id] === what) return;
    results[g][id] = what;
    RA.store.set('program.results', results);
    paintTable();
    if ([1, 2].every((n) => KINDS.every(([k]) => (results[n] || {})[k]))) {
      solved(1, 'Таблица готова! Маленькое и мягкое лучше берёт захват 1, большое и тяжёлое — захват 2.');
    }
  };

  const paintGrabber = () => {
    $$('.swap [data-grabber]').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.grabber === sim.grabber)));
  };
  // Another claw is another build: the program stops and what the old claw held falls.
  const setGrabber = (n) => {
    if (n === sim.grabber) return;
    vm.stop();
    sim.setGrabber(n);
    RA.store.set('program.grabber', n);
    paintGrabber();
  };

  const newRound = () => {
    Object.assign(press, { on: false, t0: 0, low: 0, at: 0 });
    toggle = null;
    paintSteps();
    say(TASKS[task].ready);
  };

  const select = (i) => {
    task = i;
    RA.store.set('program.task', i);
    const t = TASKS[i];
    $('#task-goal').textContent = t.goal;
    $('#task-hint').textContent = t.hint;
    $('#task-hint').hidden = true;
    $('#task-hint-btn').setAttribute('aria-expanded', 'false');
    $('#task-steps').hidden = i !== 3;
    $('#task-table').hidden = i !== 1;
    paintTabs();
    vm.stop();
    if (t.grabber) setGrabber(t.grabber);
    sim.resetTable();
    newRound();
  };

  // Task 1: after a held press, the claw has to open again by itself.
  const watchPress = () => {
    // A claw on an object is as closed as it gets, and it is not open until it lets go.
    const pos = sim.held ? CLOSED : sim.motor.pos, on = sim.force >= TOUCH && vm.running;
    if (on && !press.on) Object.assign(press, { on: true, t0: sim.time, low: pos, at: 0 });
    if (press.on) press.low = Math.min(press.low, pos);
    if (on) press.end = pos;                      // the claw has to be still closed when the sensor is let go
    if (!on && press.on) {
      press.on = false;
      if (sim.time - press.t0 < 0.3) return say('Датчик надо подержать: нажми, подожди секунду и отпусти.', 'warn');
      press.at = sim.time;
    }
    if (!press.at) return;
    if (press.end <= CLOSED && pos >= OPENED) {
      press.at = 0;
      solved(0, 'Получилось: отпустили датчик, и захват открылся.');
    } else if (sim.time - press.at > WATCH) {
      press.at = 0;
      const text = press.end <= CLOSED ? 'Захват остался закрытым. Добавь в конец цикла блок «A перейти самым коротким путём в положение 25».'
        : press.low <= CLOSED ? 'Захват открылся, пока датчик был нажат. Блок «A перейти самым коротким путём в положение 25» поставь после «ждать до (E) отпущена?».'
        : 'Захват не закрылся. Проверь блок «A перейти против часовой в положение 345».';
      say(text, 'warn');
      RA.toast(text, 'warn');
    }
  };

  // Task 3: a whole paper ball and the apple, both carried into the bin by claw 2.
  const watchGentle = () => {
    const ball = sim.byId('ball'), apple = sim.byId('apple');
    const done = (o) => o.inBin && o.state === 'rest' && o.by === 2;
    if (done(ball) && !ball.squashed && done(apple) && !RA.store.get('program.tasks', {})[2]) {
      solved(2, 'Шарик целый, яблоко в корзине: захват сжимает так, как ты жмёшь. Это и есть управление силой.');
    }
  };

  // Task 4: press closes, the claw stays closed after release, the next press opens it. All in one run.
  const watchToggle = () => {
    if (!toggle || !vm.running) return;
    const a = toggle, pos = sim.held ? CLOSED : sim.motor.pos, on = sim.force >= TOUCH;   // a claw on an object counts as closed
    if (a.step === 0 && on && pos <= CLOSED) a.step = 1;
    if (a.step === 1 && !on) { a.step = 1.5; a.at = sim.time; }
    if (a.step === 1.5) {
      if (on) {
        toggle = { step: 0 };
        say('Подожди полторы секунды, потом нажми снова.', 'warn');
      } else if (pos >= OPENED) {
        toggle = { step: 0 };
        say('Захват открылся, как только отпустили датчик. Он должен ждать следующего нажатия.', 'warn');
      } else if (sim.time - a.at >= KEEP) a.step = 2;
    }
    if (a.step === 2 && pos >= OPENED) {
      toggle = { step: 0 };
      say('Захват открылся сам, без нажатия. Он должен ждать следующего нажатия.', 'warn');
    } else if (a.step === 2 && on) a.step = 2.5;
    // The motor has to start opening while the sensor is pressed: a quick tap still counts, opening on the release does not.
    if (a.step === 2.5 && on && sim.motor.want > 0) a.opens = true;
    if (a.step === 2.5 && pos >= OPENED && !a.opens) {
      toggle = { step: 0 };
      say('Захват открылся, когда отпустили датчик, а не когда нажали. Пусть он открывается от нажатия.', 'warn');
    } else if (a.step === 2.5 && pos >= OPENED) {
      a.step = 3;
      solved(3, 'Захват помнит: одно нажатие закрывает, следующее открывает. Держать датчик больше не нужно.');
    }
    paintSteps();
  };

  const show = (sel, v) => {
    const el = $(sel), text = String(v).replace('-', '−');
    if (el.textContent !== text) el.textContent = text;
  };
  const tick = () => {
    const m = sim.hw.motor;
    show('#read-angle', m.position);
    show('#read-speed', m.speedPct);
    show('#read-power', m.powerPct);
    if (task === 0) watchPress();
    if (task === 2) watchGentle();
    if (task === 3) watchToggle();
  };

  const paintForce = (n) => {
    show('#force-n', n.toFixed(1).replace('.', ','));
    show('#force-pct', Math.round(n * 10));
    show('#force-state', n >= HARD ? 'сильно нажата' : n >= TOUCH ? 'нажата' : 'отпущена');
    root.style.setProperty('--press', n / 10);
  };

  const play = () => {
    sim.hw.sound.unlock();
    vm.start();
  };
  const startStop = () => { if (vm.running) vm.stop(); else play(); };

  const onRun = (running) => {
    root.classList.toggle('is-running', running);
    if (task !== 3) return;
    toggle = running ? { step: 0 } : null;
    paintSteps();
    if (running) say('Смотрю на захват: нажми и отпусти датчик, подожди, нажми ещё раз.');
  };

  // Pressing while nothing runs: say so once, not on every press.
  const nudge = () => {
    if (performance.now() - nudged < 6000) return;
    nudged = performance.now();
    RA.toast('Программа не запущена. Нажми круглую кнопку запуска.');
  };

  const leds = [];
  const onHw = (e) => {
    vm.dispatch(e);
    if (e.type === 'center') startStop();
    if (e.type === 'display') e.px.forEach((v, i) => { leds[i].style.opacity = v / 100; });
    if (e.type === 'light') $('#hub-center').style.setProperty('--light', e.css);
    if (e.type === 'force') {
      if (e.n >= TOUCH && lastForce < TOUCH && !vm.running) nudge();
      lastForce = e.n;
      paintForce(e.n);
    }
    if (e.type === 'button') {
      $('#hub-' + e.side).classList.toggle('is-pressed', e.state === 'pressed');
      if (!vm.running && e.state === 'pressed') nudge();
    }
    const g = e.grabber;
    if (e.type === 'slip' || e.type === 'miss' || e.type === 'squash') {
      say(e.text, 'warn');
      RA.toast(e.text, 'warn');
      if (e.type === 'slip' && !e.loose) record(g, e.obj.id, 'выскальзывает');
      if (e.type === 'miss') record(g, e.obj.id, 'не взял');
      if (e.type === 'squash') {
        record(g, e.obj.id, 'смят');
        if (task === 2) say('Шарик смят. Нажми «Сбросить стол» и сожми слабее: мощность мотора должна идти от датчика.', 'warn');
      }
    }
    if (e.type === 'land' && e.obj.inBin && !e.obj.slipped && e.obj.by) {
      if (task === 1 || task === 2) say(`${KINDS.find(([id]) => id === e.obj.id)[1]} в корзине.`, 'ok');
      record(e.obj.by, e.obj.id, e.obj.squashed ? 'смят' : 'держит');
    }
  };

  // Text fields, menus and dialogs own the keyboard while they are open.
  const typing = () => {
    const a = document.activeElement;
    return (a && (/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) || a.isContentEditable)) || Blockly.WidgetDiv.isVisible()
      || !!Blockly.DropDownDiv.owner_ || !!$('dialog[open]');
  };
  const steer = () => {
    ['x', 'y', 'z'].forEach((k) => { sim.input[k] = held.has('+' + k) - held.has('-' + k); });
  };
  const letGo = () => {
    spaceHeld = wheelHeld = false;
    held.clear();
    steer();
    sim.setForce(0);
    sim.press('left', false);
    sim.press('right', false);
  };
  const onKey = (e) => {
    const down = e.type === 'keydown';
    if (e.code === 'Space') {
      if (!down) {
        if (spaceHeld) { e.preventDefault(); spaceHeld = false; sim.setForce(0); }
        return;
      }
      if (spaceHeld) return e.preventDefault();
      // A control focused from the keyboard keeps its own Space. Pointer clicks blur, see wire().
      const a = document.activeElement;
      if (typing() || (a !== document.body && a.matches('a, button, [tabindex]') && a.id !== 'force-btn')) return;
      e.preventDefault();
      spaceHeld = true;
      sim.setForce(e.shiftKey ? 9 : 4);
      return;
    }
    const move = MOVES[e.code];
    if (!move) return;
    if (down && (typing() || e.ctrlKey || e.metaKey || e.altKey || document.activeElement === split)) return;
    e.preventDefault();
    if (down) held.add(move); else held.delete(move);
    steer();
  };

  const setSplit = (pct) => {
    // The left panel keeps room beside the palette for the tools and the run buttons.
    const w = root.clientWidth, min = ((bl.workspace.getMetrics().absoluteLeft + 345) / w) * 100, max = 100 - (320 / w) * 100;
    pct = Math.min(max, Math.max(min, pct));
    root.style.setProperty('--split', pct + '%');
    return pct;
  };

  const build = () => {
    const tabs = $('#task-tabs');
    TASKS.forEach((t, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tasks__tab';
      b.innerHTML = '<span class="tasks__pin" aria-hidden="true"></span><span class="tasks__name"></span>';
      b.lastChild.textContent = t.title;
      b.onclick = () => { if (i !== task) select(i); };
      tabs.append(b);
    });
    $('#task-steps').innerHTML = TOGGLE_STEPS.map((s) => `<li>${s}</li>`).join('');
    const box = $('#hub-leds');
    for (let i = 0; i < 25; i++) leds.push(box.appendChild(document.createElement('i')));
  };

  const wire = () => {
    $('#task-hint-btn').onclick = (e) => {
      const hint = $('#task-hint');
      hint.hidden = !hint.hidden;
      e.currentTarget.setAttribute('aria-expanded', !hint.hidden);
    };
    $('#task-solution').onclick = () => {
      Blockly.confirm('Заменить твою программу готовым решением? Твои блоки пропадут.', (ok) => {
        if (!ok) return;
        vm.stop();
        bl.load(TASKS[task].xml());
        say('Решение загружено. Нажми запуск и проверь.');
      });
    };
    $('#task-reset').onclick = () => {
      vm.stop();
      sim.resetTable();
      newRound();
    };
    $('#task-restart').onclick = () => {
      Blockly.confirm('Начать заново? Вернётся стартовая программа, отметки заданий, таблица испытаний и результат теста сотрутся.', (ok) => {
        if (!ok) return;
        RA.store.remove(['done', 'program.tasks', 'program.xml', 'program.task', 'program.results', 'program.grabber', 'lessonQuiz', 'lessonTests', 'examples.seen']);
        location.reload();
      });
    };
    $('#prog-play').onclick = play;
    $('#prog-stop').onclick = () => vm.stop();
    $('#hub-center').onclick = startStop;
    $$('.swap [data-grabber]').forEach((b) => { b.onclick = () => setGrabber(+b.dataset.grabber); });

    $('#prog-tools').onclick = (e) => {
      const b = e.target.closest('[data-tool]'), ws = bl.workspace;
      if (!b) return;
      ({ fit: () => { ws.zoomToFit(); ws.setScale(ws.scale * 0.75); ws.scrollCenter(); }, out: () => ws.zoomCenter(-1), in: () => ws.zoomCenter(1), undo: () => ws.undo(false), redo: () => ws.undo(true) })[b.dataset.tool]();
    };

    ['left', 'right'].forEach((side) => {
      const b = $('#hub-' + side);
      b.addEventListener('pointerdown', (e) => { b.setPointerCapture(e.pointerId); sim.press(side, true); });
      ['pointerup', 'pointercancel'].forEach((n) => b.addEventListener(n, () => sim.press(side, false)));
    });
    // The force wheel: where the pointer presses sets the force, 2,5 Н at the top edge (less is touch only, as the lesson says), 10 Н at the bottom.
    const wheel = $('#force-btn');
    const at = (e) => { const r = wheel.getBoundingClientRect(); return 2.5 + 7.5 * Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)); };
    wheel.addEventListener('pointerdown', (e) => { wheel.setPointerCapture(e.pointerId); wheelHeld = true; sim.setForce(at(e)); });
    wheel.addEventListener('pointermove', (e) => { if (wheelHeld) sim.setForce(at(e)); });
    ['pointerup', 'pointercancel'].forEach((n) => wheel.addEventListener(n, () => { if (!wheelHeld) return; wheelHeld = false; sim.setForce(0); }));
    $$('#prog-pad [data-move]').forEach((b) => {
      const off = () => { held.delete(b.dataset.move); steer(); };
      b.addEventListener('pointerdown', (e) => { b.setPointerCapture(e.pointerId); held.add(b.dataset.move); steer(); });
      b.addEventListener('pointerup', off);
      b.addEventListener('pointercancel', off);
    });

    // A click leaves focus on the control, and then Space would press it instead of the force sensor.
    root.addEventListener('click', (e) => {
      const a = document.activeElement;
      if (e.detail && a && a !== document.body && !typing()) a.blur();
    });

    split = $('#prog-split');
    split.addEventListener('pointerdown', (e) => {
      split.setPointerCapture(e.pointerId);
      split.classList.add('is-moving');
    });
    split.addEventListener('pointermove', (e) => {
      if (!split.classList.contains('is-moving')) return;
      const r = root.getBoundingClientRect();
      RA.store.set('program.split', setSplit(((e.clientX - r.left) / r.width) * 100));
    });
    ['pointerup', 'pointercancel'].forEach((n) => split.addEventListener(n, () => split.classList.remove('is-moving')));
    split.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      const now = parseFloat(root.style.getPropertyValue('--split')) || 58;
      RA.store.set('program.split', setSplit(now + (e.key === 'ArrowLeft' ? -2 : 2)));
    });
  };

  RA.view('program', {
    init(el) {
      root = $('#prog', el);
      build();
      sim = RA.createSim($('#prog-stage'));
      sim.setGrabber(RA.store.get('program.grabber', 2) === 1 ? 1 : 2);
      results = RA.store.get('program.results', {});
      paintTable();
      const saved = RA.store.get('program.split', 0);
      if (saved) root.style.setProperty('--split', saved + '%');
      const host = $('#prog-blockly');
      bl = RA.createBlocks(host, { onChange: () => RA.store.set('program.xml', bl.save()) });
      const stored = RA.store.get('program.xml', null);
      try { bl.load(stored || RA.STARTER_XML); } catch (e) { bl.load(RA.STARTER_XML); }
      root.style.setProperty('--palette', bl.workspace.getMetrics().absoluteLeft + 'px');
      new ResizeObserver(() => { if (RA.current === 'program') Blockly.svgResize(bl.workspace); }).observe(host);

      vm = RA.createVM(bl.workspace, sim.hw, { onState: onRun });
      sim.hw.onEvent(onHw);
      sim.onTick = tick;
      wire();
      paintGrabber();
      paintForce(0);
      select(Math.min(RA.store.get('program.task', 0), TASKS.length - 1));
      // Only now the task text is in and the panel has its size: a short panel gets smaller blocks, and the widest stack
      // fits beside the palette with its numbers (25, 345). A phone cannot fit it at a readable size, it scrolls.
      const ws = bl.workspace;
      Blockly.svgResize(ws);                     // Blockly still has the size from before the task text
      const m = ws.getMetrics(), box = ws.getBlocksBoundingBox();
      ws.setScale(Math.max(0.5, Math.min(m.viewHeight < 680 ? 0.65 : 0.8, (m.viewWidth - 30) / (box.x + box.width + 30))));
      const at = ws.getMetrics();
      ws.scrollbar.set(-at.contentLeft, -at.contentTop);       // a new scale moves the blocks: put the origin back in the corner, as load() does
      RA.program = { sim, bl, vm, select, setGrabber, get results() { return results; }, get task() { return task; } };   // QA and the console reach the live objects here
    },
    enter() {
      Blockly.svgResize(bl.workspace);
      sim.start();
      addEventListener('keydown', onKey);
      addEventListener('keyup', onKey);
      addEventListener('blur', letGo);
    },
    leave() {
      vm.stop();
      sim.stop();
      letGo();
      removeEventListener('keydown', onKey);
      removeEventListener('keyup', onKey);
      removeEventListener('blur', letGo);
      Blockly.hideChaff();
      Blockly.DropDownDiv.hideWithoutAnimation();
      // Delete on another view must not eat the block that was last selected here.
      if (Blockly.selected) Blockly.selected.unselect();
    },
  });
})();
