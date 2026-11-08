// Interpreter: walks the live blocks, no code generation. Each hat runs as one async thread.
// Names it hands to hw: force in newtons from hw.sensors.force(); buttons 'left'|'right' and 'pressed'|'released'; gestures 'shake'|'tap'|'doubletap'|'fall';
// tilt 'forward'|'backward'|'left'|'right'; sides 'front'|'back'|'top'|'bottom'|'leftside'|'rightside';
// orientation 'upright'|'left'|'right'|'upsidedown'; effects 'pitch'|'pan'. Pixel x, y are the block's 1..5.
(function () {
  const RA = window.RA;
  const STOP = {};                  // thrown to unwind a cancelled thread
  // A loop without a wait gets at most this share of the page, so the 3D view keeps its frames.
  // ponytail: setTimeout slices crawl in a hidden tab but never freeze it; use MessageChannel if a background run must stay fast.
  const SLICE_MS = 3, REST_MS = 5;
  const POLL_MS = 40;
  const MAX_CALL_DEPTH = 200;       // a my-block calling itself would eat the tab's memory within seconds
  const TOUCH = 0.6;                // Н: from here the force sensor counts as pressed
  // ponytail: «сильно нажата» from 7 Н is our choice, LEGO publishes no number; tune it here if the class finds it too hard.
  const HARD = 7;

  const num = (v) => Number(v) || 0;
  const clamp = (v) => Math.min(100, Math.max(0, v));
  const compare = (a, b) => {
    const x = Number(a), y = Number(b);
    if (a !== '' && b !== '' && !isNaN(x) && !isNaN(y)) return x - y;
    const s = String(a).toLowerCase(), u = String(b).toLowerCase();
    return s < u ? -1 : s > u ? 1 : 0;
  };
  const DEG = Math.PI / 180;
  // Degrees like everywhere else in the app; rounded so that sin 180 reads 0.
  const trig = (fn) => (x) => Math.round(fn(x * DEG) * 1e10) / 1e10;
  const MATH = { abs: Math.abs, floor: Math.floor, ceiling: Math.ceil, sqrt: Math.sqrt, sin: trig(Math.sin), cos: trig(Math.cos),
    tan: trig(Math.tan), asin: (x) => Math.asin(x) / DEG, acos: (x) => Math.acos(x) / DEG, atan: (x) => Math.atan(x) / DEG,
    ln: Math.log, log: Math.log10, 'e ^': Math.exp, '10 ^': (x) => 10 ** x };

  RA.createVM = (ws, hw, o) => {
    const threads = new Set();
    const glowing = { glowBlock: new Set(), glowStack: new Set() };
    let running = false, vars = {}, lists = {}, warned = {}, edges = {}, felt = {};
    let timerStart = 0, poller = 0, sliceEnd = 0, rest = null;

    const setRunning = (on) => {
      if (on === running) return;
      running = on;
      if (o && o.onState) o.onState(on);
    };
    const warn = (text) => {
      if (warned[text]) return;
      warned[text] = true;
      RA.toast(text, 'warn');
    };
    const timer = () => (performance.now() - timerStart) / 1000;

    // Inputs. Shadows carry their value in their one field.
    const field = (b, name) => b.getFieldValue(name);
    const value = (b) => {
      if (VALUES[b.type]) return VALUES[b.type](b);
      const f = b.inputList[0] && b.inputList[0].fieldRow[0];
      return f ? f.getValue() : '';
    };
    const input = (b, name) => {
      const c = b.getInputTargetBlock(name);
      return c ? value(c) : '';
    };
    const n = (b, name) => num(input(b, name));
    const list = (b) => { const id = field(b, 'LIST'); return lists[id] || (lists[id] = []); };
    const index = (b, l) => { const i = Math.floor(n(b, 'INDEX')) - 1; return i >= 0 && i < l.length ? i : -1; };

    // Devices: the motor in A, the force sensor in E. A wrong port warns once per run and the program goes on.
    const port = (b) => String(input(b, 'PORT')).toUpperCase();
    const motor = (b) => {
      const p = port(b);
      if (hw.ports[p] === 'motor') return hw.motor;
      warn(hw.ports[p] ? `В порту ${p} датчик силы, а не мотор. Мотор захвата подключён к порту A.` : `В порту ${p} ничего нет. Мотор захвата подключён к порту A.`);
      return null;
    };
    // Newtons, or null on a port without the sensor.
    const force = (b) => {
      const p = port(b);
      if (hw.ports[p] === 'force') return hw.sensors.force();
      warn(`В порту ${p} нет датчика силы. Датчик силы подключён к порту E.`);
      return null;
    };
    // «давление изменилось» remembers the last reading per block.
    const forceIs = (b, option) => {
      const f = force(b);
      if (f === null) return false;
      if (option === 'changed') { const was = felt[b.id]; felt[b.id] = f; return was !== undefined && was !== f; }
      return option === 'released' ? f < TOUCH : f >= (option === 'hardpressed' ? HARD : TOUCH);
    };
    const noSensor = () => { warn('У этой модели нет такого датчика.'); return 0; };
    const noWheels = () => warn('У этой модели нет ходовых моторов: блок пропущен.');
    const image = (b) => Array.from({ length: 25 }, (_, i) => (String(input(b, 'MATRIX'))[i] === '1' ? 100 : 0));

    // Cancellation points: a killed thread unwinds from here, also out of a long motor move.
    const wait = (t, promise) => new Promise((res, rej) => {
      t.cancel = () => rej(STOP);
      Promise.resolve(promise).then(res, rej);
    });
    const sleep = (t, ms) => wait(t, new Promise((res) => setTimeout(res, ms)));
    const breathe = async (t) => {
      if (performance.now() > sliceEnd) {
        rest = rest || new Promise((res) => setTimeout(() => {
          rest = null;
          sliceEnd = performance.now() + SLICE_MS;
          res();
        }, REST_MS));
        await rest;
      }
      if (t.dead) throw STOP;
    };

    const runStack = async (b, t) => {
      for (; b; b = b.getNextBlock()) {
        await breathe(t);
        t.current = b.id;
        if (OPS[b.type]) await OPS[b.type](b, t);
      }
    };
    const sub = (b, name) => b.getInputTargetBlock(name || 'SUBSTACK');
    // b.workspace goes null when the student deletes the running loop.
    const loop = async (b, t, more) => {
      while (b.workspace && more()) {
        await runStack(sub(b), t);
        await breathe(t);
      }
    };

    const kill = (t) => {
      t.dead = true;
      if (t.cancel) t.cancel();
      threads.delete(t);
    };
    const spawn = (hat) => {
      // A re-triggered hat restarts its stack.
      threads.forEach((t) => { if (t.hat === hat.id) kill(t); });
      const t = { hat: hat.id, current: null, dead: false, cancel: null, depth: 0 };
      threads.add(t);
      t.done = runStack(hat.getNextBlock(), t)
        .catch((e) => { if (e !== STOP) console.error(e); })
        .then(() => { threads.delete(t); if (!threads.size) idle(); });
      return t;
    };
    const hats = (type) => ws.getTopBlocks(false).filter((b) => b.type === type);
    const broadcast = (name) => hats('event_whenbroadcastreceived')
      .filter((h) => h.getField('BROADCAST_OPTION').getText() === name).map(spawn);

    const halt = () => {
      threads.forEach(kill);
      clearInterval(poller);
      paint();
      hw.motor.stop();
      hw.sound.stop();
    };
    // With nothing left that could still wake a stack the program is over. The last picture stays on the hub.
    const idle = () => {
      const listening = ws.getTopBlocks(false).some((b) => POLLED[b.type] || b.type === 'flipperevents_whenButton');
      if (!running || listening) return;
      halt();
      setRunning(false);
    };

    const OPS = {
      flippermotor_motorTurnForDirection: async (b, t) => {
        const m = motor(b);
        if (!m) return;
        const dir = field(b, 'DIRECTION') === 'clockwise' ? 1 : -1;
        const v = n(b, 'VALUE');
        if (field(b, 'UNIT') === 'seconds') await wait(t, m.runForSeconds(Math.abs(v), m.defaultSpeed, v < 0 ? -dir : dir));
        else await wait(t, m.runFor(dir * v * (field(b, 'UNIT') === 'rotations' ? 360 : 1), m.defaultSpeed));
      },
      flippermotor_motorGoDirectionToPosition: async (b, t) => {
        const m = motor(b);
        if (m) await wait(t, m.goTo(n(b, 'POSITION'), field(b, 'DIRECTION'), m.defaultSpeed));
      },
      flippermotor_motorStartDirection: (b) => {
        const m = motor(b);
        if (m) m.run(m.defaultSpeed, field(b, 'DIRECTION') === 'clockwise' ? 1 : -1);
      },
      flippermotor_motorStop: (b) => { const m = motor(b); if (m) m.stop(); },
      flippermotor_motorSetSpeed: (b) => { const m = motor(b); if (m) m.defaultSpeed = n(b, 'SPEED'); },
      flippermoremotor_motorStartPower: (b) => { const m = motor(b); if (m) m.runPower(n(b, 'POWER')); },
      flippermoremotor_motorSetDegreeCounted: (b) => { const m = motor(b); if (m) m.relative = n(b, 'VALUE'); },

      flipperlight_lightDisplayImageOnForTime: async (b, t) => {
        hw.display.setImage(image(b));
        await sleep(t, n(b, 'VALUE') * 1000);
        hw.display.clear();
      },
      flipperlight_lightDisplayImageOn: (b) => hw.display.setImage(image(b)),
      flipperlight_lightDisplayText: (b, t) => wait(t, hw.display.scroll(String(input(b, 'TEXT')))),
      flipperlight_lightDisplayOff: () => hw.display.clear(),
      flipperlight_lightDisplaySetBrightness: (b) => hw.display.setBrightness(n(b, 'BRIGHTNESS')),
      flipperlight_lightDisplaySetPixel: (b) => hw.display.setPixel(n(b, 'X'), n(b, 'Y'), n(b, 'BRIGHTNESS')),
      flipperlight_lightDisplayRotate: (b) => hw.display.rotate(field(b, 'DIRECTION') === 'clockwise' ? 1 : -1),
      flipperlight_lightDisplaySetOrientation: (b) => hw.display.setOrientation(input(b, 'ORIENTATION')),
      flipperlight_centerButtonLight: (b) => hw.centerLight(input(b, 'COLOR')),
      flipperlight_ultrasonicLightUp: noSensor,

      flippersound_playSoundUntilDone: (b, t) => wait(t, hw.sound.play(input(b, 'SOUND'), true)),
      flippersound_playSound: (b) => { hw.sound.play(input(b, 'SOUND'), false); },
      flippersound_beepForTime: (b, t) => wait(t, hw.sound.beep(n(b, 'NOTE'), n(b, 'DURATION'))),
      flippersound_beep: (b) => hw.sound.beepStart(n(b, 'NOTE')),
      flippersound_stopSound: () => hw.sound.stop(),
      sound_changeeffectby: (b) => hw.sound.changeEffect(field(b, 'EFFECT').toLowerCase(), n(b, 'VALUE')),
      sound_seteffectto: (b) => hw.sound.setEffect(field(b, 'EFFECT').toLowerCase(), n(b, 'VALUE')),
      sound_cleareffects: () => hw.sound.clearEffects(),
      sound_changevolumeby: (b) => { hw.sound.volume = clamp(hw.sound.volume + n(b, 'VOLUME')); },
      sound_setvolumeto: (b) => { hw.sound.volume = clamp(n(b, 'VOLUME')); },

      event_broadcast: (b) => { broadcast(input(b, 'BROADCAST_INPUT')); },
      event_broadcastandwait: (b, t) => wait(t, Promise.all(broadcast(input(b, 'BROADCAST_INPUT')).map((x) => x.done))),

      control_wait: (b, t) => sleep(t, n(b, 'DURATION') * 1000),
      control_repeat: (b, t) => { let i = Math.round(n(b, 'TIMES')); return loop(b, t, () => i-- > 0); },
      control_forever: (b, t) => loop(b, t, () => true),
      control_repeat_until: (b, t) => loop(b, t, () => !input(b, 'CONDITION')),
      control_if: (b, t) => (input(b, 'CONDITION') ? runStack(sub(b), t) : null),
      control_if_else: (b, t) => runStack(sub(b, input(b, 'CONDITION') ? 'SUBSTACK' : 'SUBSTACK2'), t),
      control_wait_until: async (b, t) => { while (!input(b, 'CONDITION')) await sleep(t, POLL_MS); },
      flippercontrol_stopOtherStacks: (b, t) => { threads.forEach((x) => { if (x !== t) kill(x); }); },
      flippercontrol_stop: (b, t) => {
        const what = field(b, 'STOP_OPTION');
        if (what === 'exit') vm.stop();
        else if (what === 'all') { threads.forEach(kill); hw.motor.stop(); hw.sound.stop(); }
        throw STOP;
      },

      flippersensors_resetYaw: () => hw.sensors.resetYaw(),
      flippersensors_resetTimer: () => { timerStart = performance.now(); },

      data_setvariableto: (b) => { vars[field(b, 'VARIABLE')] = input(b, 'VALUE'); },
      data_changevariableby: (b) => { const id = field(b, 'VARIABLE'); vars[id] = num(vars[id]) + n(b, 'VALUE'); },
      data_addtolist: (b) => { list(b).push(input(b, 'ITEM')); },
      data_deleteoflist: (b) => { const l = list(b), i = index(b, l); if (i >= 0) l.splice(i, 1); },
      data_deletealloflist: (b) => { list(b).length = 0; },
      data_insertatlist: (b) => { const l = list(b); l.splice(Math.max(0, n(b, 'INDEX') - 1), 0, input(b, 'ITEM')); },
      data_replaceitemoflist: (b) => { const l = list(b), i = index(b, l); if (i >= 0) l[i] = input(b, 'ITEM'); },

      procedures_call: async (b, t) => {
        const def = Blockly.Procedures.getDefineBlock(b.getProcCode(), ws);
        if (!def) return;
        if (t.depth >= MAX_CALL_DEPTH) {
          warn('Мой блок вызывает сам себя слишком много раз: подпрограмма остановлена.');
          throw STOP;
        }
        t.depth++;
        await runStack(def.getNextBlock(), t);
        t.depth--;
      },
    };
    ['move', 'startMove', 'steer', 'startSteer', 'stopMove', 'movementSpeed', 'setMovementPair', 'setDistance']
      .forEach((k) => { OPS['flippermove_' + k] = noWheels; });

    const VALUES = {
      operator_add: (b) => n(b, 'NUM1') + n(b, 'NUM2'),
      operator_subtract: (b) => n(b, 'NUM1') - n(b, 'NUM2'),
      operator_multiply: (b) => n(b, 'NUM1') * n(b, 'NUM2'),
      operator_divide: (b) => n(b, 'NUM1') / n(b, 'NUM2'),
      operator_mod: (b) => { const a = n(b, 'NUM1'), m = n(b, 'NUM2'); return ((a % m) + m) % m; },
      operator_round: (b) => Math.round(n(b, 'NUM')),
      operator_mathop: (b) => MATH[field(b, 'OPERATOR')](n(b, 'NUM')),
      operator_random: (b) => {
        const lo = Math.min(n(b, 'FROM'), n(b, 'TO')), hi = Math.max(n(b, 'FROM'), n(b, 'TO'));
        const whole = Number.isInteger(lo) && Number.isInteger(hi);
        return whole ? lo + Math.floor(Math.random() * (hi - lo + 1)) : lo + Math.random() * (hi - lo);
      },
      operator_lt: (b) => compare(input(b, 'OPERAND1'), input(b, 'OPERAND2')) < 0,
      operator_equals: (b) => compare(input(b, 'OPERAND1'), input(b, 'OPERAND2')) === 0,
      operator_gt: (b) => compare(input(b, 'OPERAND1'), input(b, 'OPERAND2')) > 0,
      operator_and: (b) => !!input(b, 'OPERAND1') && !!input(b, 'OPERAND2'),
      operator_or: (b) => !!input(b, 'OPERAND1') || !!input(b, 'OPERAND2'),
      operator_not: (b) => !input(b, 'OPERAND'),
      flipperoperator_isInBetween: (b) => n(b, 'VALUE') >= n(b, 'LOW') && n(b, 'VALUE') <= n(b, 'HIGH'),
      operator_join: (b) => String(input(b, 'STRING1')) + input(b, 'STRING2'),
      operator_letter_of: (b) => String(input(b, 'STRING')).charAt(n(b, 'LETTER') - 1),
      operator_length: (b) => String(input(b, 'STRING')).length,
      operator_contains: (b) => String(input(b, 'STRING1')).toLowerCase().includes(String(input(b, 'STRING2')).toLowerCase()),

      data_variable: (b) => { const v = vars[field(b, 'VARIABLE')]; return v === undefined ? 0 : v; },
      data_listcontents: (b) => list(b).join(' '),
      data_itemoflist: (b) => { const l = list(b), i = index(b, l); return i < 0 ? '' : l[i]; },
      data_itemnumoflist: (b) => list(b).findIndex((x) => compare(x, input(b, 'ITEM')) === 0) + 1,
      data_lengthoflist: (b) => list(b).length,
      data_listcontainsitem: (b) => list(b).some((x) => compare(x, input(b, 'ITEM')) === 0),

      sound_volume: () => hw.sound.volume,
      event_broadcast_menu: (b) => b.getField('BROADCAST_OPTION').getText(),

      flippermotor_absolutePosition: (b) => { const m = motor(b); return m ? m.position : 0; },
      flippermotor_speed: (b) => { const m = motor(b); return m ? m.speedPct : 0; },
      flippermoremotor_power: (b) => { const m = motor(b); return m ? m.powerPct : 0; },
      flippermoremotor_position: (b) => { const m = motor(b); return m ? m.relative : 0; },

      flippersensors_isTilted: (b) => !!hw.sensors.tilted(input(b, 'VALUE')),
      flippersensors_isorientation: (b) => !!hw.sensors.orientationUp(field(b, 'VALUE')),
      flippersensors_ismotion: (b) => !!hw.sensors.gesture(field(b, 'EVENT')),
      flippersensors_orientationAxis: (b) => hw.sensors.angle(field(b, 'AXIS')),
      flippersensors_buttonIsPressed: (b) => hw.sensors.button(field(b, 'BUTTON')) === (field(b, 'EVENT') === 'pressed'),
      flippersensors_timer: timer,
    };
    VALUES.flippersensors_force = (b) => {
      const f = force(b);
      return f === null ? 0 : field(b, 'UNIT') === 'percent' ? Math.round(f * 10) : Math.round(f * 10) / 10;
    };
    VALUES.flippersensors_isPressed = (b) => forceIs(b, field(b, 'OPTION'));
    ['color', 'reflectivity', 'distance'].forEach((k) => { VALUES['flippersensors_' + k] = noSensor; });
    ['isColor', 'isReflectivity', 'isDistance'].forEach((k) => { VALUES['flippersensors_' + k] = (b) => !!noSensor(b); });

    // Hats nothing announces: they fire on the rising edge of these tests.
    const POLLED = {
      flipperevents_whenTimer: (h) => timer() > n(h, 'VALUE'),
      flipperevents_whenCondition: (h) => !!input(h, 'CONDITION'),
      flipperevents_whenTilted: (h) => hw.sensors.tilted(input(h, 'VALUE')),
      flipperevents_whenOrientation: (h) => hw.sensors.orientationUp(field(h, 'VALUE')),
      flipperevents_whenGesture: (h) => hw.sensors.gesture(field(h, 'EVENT')),
      flipperevents_whenColor: noSensor,
      flipperevents_whenPressed: (h) => forceIs(h, field(h, 'OPTION')),
      flipperevents_whenDistance: noSensor,
    };

    // Glow follows the threads at a calm pace; a tight loop would otherwise repaint the blocks all the time.
    const sync = (fn, want) => {
      const now = glowing[fn];
      now.forEach((id) => {
        if (want.has(id)) return;
        now.delete(id);
        if (ws.getBlockById(id)) ws[fn](id, false);
      });
      want.forEach((id) => {
        if (now.has(id) || !ws.getBlockById(id)) return;
        now.add(id);
        ws[fn](id, true);
      });
    };
    const paint = () => {
      const blocks = new Set(), stacks = new Set();
      threads.forEach((t) => {
        const b = t.current && ws.getBlockById(t.current);
        stacks.add(b ? b.getRootBlock().id : t.hat);
        if (b) blocks.add(b.id);
      });
      sync('glowBlock', blocks);
      sync('glowStack', stacks);
    };
    // «давление изменилось» fires on every change, but lets its stack finish first.
    const busy = (h) => [...threads].some((t) => t.hat === h.id);
    const again = (h) => h.type === 'flipperevents_whenPressed' && field(h, 'OPTION') === 'changed' && !busy(h);
    const poll = () => {
      ws.getTopBlocks(false).forEach((h) => {
        if (!POLLED[h.type]) return;
        const on = !!POLLED[h.type](h);
        if (on && (!edges[h.id] || again(h))) spawn(h);
        edges[h.id] = on;
      });
      paint();
    };

    const vm = {
      get running() { return running; },
      start() {
        vm.stop();
        vars = {}; lists = {}; warned = {}; edges = {}; felt = {};
        timerStart = performance.now();
        hw.motor.defaultSpeed = 75;
        // Force hats wait for a change: «отпущена» must not fire just because nobody presses at the start.
        hats('flipperevents_whenPressed').forEach((h) => { edges[h.id] = !!POLLED.flipperevents_whenPressed(h); });
        setRunning(true);
        hats('flipperevents_whenProgramStarts').forEach(spawn);
        poller = setInterval(poll, POLL_MS);
        poll();
        if (!threads.size) idle();
        if (!running) RA.toast('Нет блока «когда запускается подпрограмма»: программе не с чего начать.');
      },
      stop() {
        halt();
        hw.reset();
        setRunning(false);
      },
      dispatch(e) {
        if (!running) return;
        if (e.type === 'button') {
          hats('flipperevents_whenButton').filter((h) => field(h, 'BUTTON') === e.side && field(h, 'EVENT') === e.state).forEach(spawn);
        } else if (e.type === 'gesture') {
          // Remember the edge: the poll may still see this gesture afterwards.
          hats('flipperevents_whenGesture').filter((h) => field(h, 'EVENT') === e.name).forEach((h) => { edges[h.id] = true; spawn(h); });
        }
      },
    };
    return vm;
  };
})();
