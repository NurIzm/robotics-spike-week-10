# «Захваты» — lesson platform, build spec (week 10)

This is the brief written before the build. Where it and the code disagree, the code is right.

The site is for a school robotics lesson for ages ~10-14 with a LEGO SPIKE Prime set. All on-screen text is Russian.
The teacher projects it in class and students use it on school PCs. It is the second lesson of the unit «Манипуляторы и автономия».
The teacher's table says: урок «Робот-рука (модель 2). Усовершенствование конструкции.», содержание «Сборка робот-руки 2.
Использование датчика касания и силы, программирование по нажатию.», 1 час, неделя 10, вид деятельности «Сборка и разборка».

Last week's site («Роборука», week 9, `../Week 9`, live at https://nurizm.github.io/robotics-spike-week-9/) is the base:
this repository started as a copy of it. Same platform, same look, same four views: start, lesson, examples, program.
Change the content, not the platform. Read `../Week 9/src/SPEC.md` once: its hard constraints (§1), shared runtime (§3),
blocks (§6) and visual identity (§10) still hold, except where this file says otherwise.

## 0. Paths and process

- The site is the repository root. View fragments: `src/views/{start,lesson,examples,program}.html`. Run `node src/build.js` after
  changing a fragment: it stitches them into `index.html`. Do not edit `index.html` by hand.
- `ref/` holds LEGO's pictures of the model (git-ignored, never published): `app_models_zahvaty.png` (the SPIKE app page),
  `main.png` (the model enlarged), `control.png`, `grip1.png`, `grip2.png` (the three builds), `force_sensor.png` (the sensor).
  `ref/bi/`: every step of the three builds from the SPIKE app (`controller-NN.jpg`, `grabber1-NN.jpg`, `grabber2-NN.jpg`) and
  `NOTES.md`, which describes the mechanism. The model was rebuilt from them on 2026-11-09; read NOTES.md before changing it.
- Do not touch files you do not own (§2). `js/core.js`, `css/style.css`, `src/index.template.html`, `src/build.js` are shared and read-only.

## 1. Facts (true, sourced; do not invent others — when unsure, leave it out)

- The model in the SPIKE app: «Модели → Захваты», 66 steps in three builds: «Устройство управления» (15 шагов), «Захват 1» (23 шага),
  «Захват 2» (28 шагов). It is LEGO's model from the lesson «Super Cleanup» (unit «Invention Squad»): a hand controller with a Force
  Sensor and two grabbers that students test against each other.
- Устройство управления (hand controller): the hub, an upright stand on one end of it, the Force Sensor on top of the stand with a
  small wheel on its plunger as a button cap (black treaded tyre, light grey rim, red axle). You press the wheel.
- Захват 1: its own medium motor and a flexible claw, two loops of grey ribbed hose held by yellow connectors. LEGO: flexible claw,
  made for light and flexible objects; bad with big, heavy or smooth objects.
- Захват 2: its own medium motor and a split claw of black bent beams, one jaw forked. LEGO: made for large, heavy objects;
  almost impossible to use with small objects.
- A grabber fixes onto the front of the hand controller; its motor cable goes into the hub.
- Ports (LEGO's Python program for this model): motor → **A**, Force Sensor → **E**. Closing: motor A goes to position 345
  counterclockwise. Opening: to position 25 by the shortest path. So the claw moves through about 40°.
- LEGO's lesson: pairs, about 45 minutes. Student A builds Grabber 1, student B builds the hand controller and Grabber 2.
  Test 1, different sizes and similar weight: LEGO brick (small), crumpled paper ball (medium), empty plastic bottle (large).
  Test 2, similar size and different weights: paper ball (light), stack of LEGO wheels (medium), apple (heavy).
  A fair test changes one thing at a time. Questions: why do people use grabbers to pick up litter? How can you find out which grabber is best?
- Force Sensor (LEGO's technical sheet): it detects touch and measures force. The plunger travels 8 mm (one LEGO module).
  Touch: the first 0–2 mm, it triggers at about 1 mm with 0.5–1 N, the answer is only «нажата / не нажата». Force: 2–8 mm,
  2.5–10 N, in steps of 0.1 N, 10 N at most, accurate to ±0.65 N. It reads 100 times a second. Its 25 cm cable is fixed to it.
  In the SPIKE app the force reads in newtons (0–10) or percent (0–100).
- 1 newton is about the weight of a 100 g apple (a 100 g mass weighs 0.98 N).
- Week 9 recap (what students did last time): «Роборука», one motor in port F closed two fingers with rubber tyres; the left
  button of the hub was the control: pressed — close, released — open.

## 2. File ownership (edit only your own files)

| Owner | Files |
|---|---|
| model | `js/robot.js`, `js/hero.js`, `css/start.css`, `src/views/start.html` |
| lesson | `js/lesson.js`, `css/lesson.css`, `src/views/lesson.html` |
| examples | `js/scenes.js`, `js/examples.js`, `css/examples.css`, `src/views/examples.html` |
| program | `js/sim.js`, `js/program.js`, `css/program.css`, `src/views/program.html`, `js/vm.js`, `js/blocks.js`, `css/blocks.css`, `tests/vm-check.html` |

Everyone builds on last week's file of the same name: keep what fits, change what this model needs. Shared runtime: §3 of week 9.
The storage prefix is now `zahvaty.`, so last week's progress does not leak in.

## 3. The model (`js/robot.js`, owner: model)

`js/robot.js` starts as a rough stub with the full API below, so the lesson and program owners can work at once. The model owner
replaces it with the real model and keeps the API exactly. Never leave `js/robot.js` broken: write the new version to a temp file,
`node --check` it, test it, then move it over `js/robot.js`.

Build `RA.createGrabber()` procedurally from `ref/`. Reuse week 9's kit (`../Week 9/js/robot.js`: rounded boxes, Technic beams with
real holes, the hub with its LED matrix and buttons, the medium motor, materials and colours) instead of starting over.
Units: 1 scene unit = 1 LEGO module = 8 mm. Axes: +X along the tool from the hub towards the claw, +Y up, +Z towards the viewer.
Y=0 is the bottom of the hub as the model rests on a table. X=0 is the front end of the hub (the claw side).

- **Hub**: X∈[-11,0], Y∈[0,7], Z∈[-2,2], standing on its long edge, face plate towards +Z, as in week 9. In this model the centre
  button is at the stand end (-X), see `main.png`.
- **Stand**: at the hub's -X end, rising to about Y=17: two black 15L beams, two azure 7L beams, two magenta 3×3 blocks.
- **Force Sensor** on top of the stand: white body with a black back, plunger towards +X carrying the wheel cap (§1).
  About X∈[-10,-5], Y∈[14,18]. Its cable goes down to the hub, port E.
- **Shared motor base**: the motor's output points down; both jaws turn on vertical pins on the motor head, mirror-wise, joined
  by a grey H link, so the tips swing level on arcs.
- **Grabber 2**: a tall fork (two hooked black bent liftarms, two magenta blocks between them) and a single hooked jaw at mid
  height; the hooks face each other. Open gap 12, closed gap 3 (a 2-wide brick is never touched). Box X∈[10,22], Y∈[5,14];
  grip point (13.5, 8, 0.9), inside the C behind the hooks, so held objects never cut into them.
- **Grabber 1**: two arms, each a black axle with yellow 90° connectors 5 modules apart and a grey ribbed hose looping between
  them. Open gap 7, closed gap 0. Box about X∈[11,18.7], Y∈[6.1,12]; grip point about (16.8, 9.05, 0).
- With +X to the claw and the face plate to +Z, the model is LEGO's mirror image; `hero.js` mirrors it back with
  `scale.x = -1`. Cables run over the hub to A and E (LEGO's hang under it). Cables: flat white ribbons.

Plastic look and colours as in week 9: azure `#01adc4`, magenta `#c92e85`, yellow `#fed920`, white `#eceded`, black `#16151a`,
grey `#a9b0b5`. Ribbed hose: grey with visible rings. Whole scene under ~80k triangles, static meshes merged per material.
Quality bar: at first glance a student recognises `main.png`.

API (other owners depend on it exactly):

```js
const g = RA.createGrabber();   // new instance every call; geometries and materials shared between instances
scene.add(g.group);
g.parts                 // {hub, stand, sensor, grabber1, grabber2, cables}: THREE.Group each
g.PARTS                 // [{id, name, role}] in that order, Russian, e.g. {id:'sensor', name:'Датчик силы', role:'Кнопка, которая чувствует, как сильно её нажали. Порт E'}
g.GRABBERS              // {1: {name:'Захват 1', kind:'гибкий', openGap:7, closedGap:0, reach:[x0,x1], height:[y0,y1]}, 2: {...}}: the claw's box when attached
g.grabber               // 1 or 2: the one on the hand controller
g.setGrabber(n)         // fixes grabber n onto the controller; the other one is hidden (layout 'tool') or lies in front (layout 'spread')
g.setLayout(name)       // 'tool' (default): controller + attached grabber; 'spread': as in main.png, grabber 2 attached and grabber 1 lying in front on the table
g.setGrip(t)            // 0 open .. 1 closed; moves the attached grabber (and the spare one too, so both move in the hero)
g.tipGap()              // clear distance between the jaws' contact surfaces of the attached grabber now, in modules
g.tForGap(w)            // grip t at which the attached jaws just touch an object w modules wide; 1 if w <= closedGap
g.gripPoint             // THREE.Object3D between the attached jaws at their mid height (child of g.group); read its world position
g.setForce(pct)         // 0..100: pushes the sensor's wheel cap in by up to 1 module (the 8 mm travel)
g.sensorCap             // the wheel cap mesh, for raycasting
g.setMatrix(arr|null)   // as week 9: 25 brightness values 0..100, row by row with the hub read upright
g.setCenterLight(css|null)
g.hubButtons            // {left, right, center}: meshes for raycasting
g.highlight(id|null)    // fades everything except that part (ids of g.parts); null restores. Animated by update()
g.setExplode(t)         // 0..1: exploded view of what is shown
g.STAGES                // [{id, build, title, steps, parts, text}]: the build stages, see below
g.setBuildStage(n, t)   // shows stages up to n; stage n flies into place as t goes 0..1
g.update(dt)            // call every frame
```

Stages (step numbers only per build): 1 «Хаб и стойка», 2 «Датчик силы» (the wheel on the plunger, cable to E) — build
«Устройство управления», steps 1–15; 3 «Мотор захвата 1», 4 «Гибкие петли» — «Захват 1», steps 1–23; 5 «Мотор захвата 2»,
6 «Раздвоенная клешня», 7 «Захват на устройство управления» (cable to A) — «Захват 2», steps 1–28: attaching a grabber is the
last step of each grabber build.
Write `parts` only as plain descriptions you can see in the pictures, no counts you cannot verify.

## 4. Start view (`js/hero.js`, `css/start.css`, `src/views/start.html`, owner: model)

As week 9, new model and words. The model in layout 'spread' dead centre, largest thing on the screen, slow turntable; now and
then the sensor cap presses in and the claw closes, then both release. Display title «ЗАХВАТЫ», kicker «Робот-рука, модель 2».
Spec strip: Шагов сборки: 66 · Мотор: порт A · Датчик силы: порт E · Время: 1 час. Button «Начать урок» → lesson.

## 5. Lesson view (`js/lesson.js`, `css/lesson.css`, `src/views/lesson.html`, owner: lesson)

One scrolling page, big type for a projector, same visual language as week 9 (reuse its CSS and components). `Далее` → examples.
1. Header: kicker «Урок: робот-рука, модель 2. Усовершенствование конструкции», h1 «Манипуляторы и автономия», цель (the teacher's
   words above), facts: 1 час, сборка и разборка, неделя 10; «Что узнаем».
2. Было — стало: last week's Роборука (button on the hub, one claw) vs today's model (a separate Force Sensor in a hand controller,
   two swappable grabbers). What «усовершенствование конструкции» means: engineers build, test, compare and improve.
3. Датчик силы: touch vs force, with the facts of §1. Interactive sensor: press it with the mouse or finger (deeper = harder), see the
   plunger depth in mm, the zone (касание / сила), the reading in Н and %, and which SPIKE answers are true now («нажата»,
   «сильно нажата», «отпущена»). What a newton is.
4. Программирование по нажатию: four ways to use the sensor in a program, each as a small picture of SPIKE-looking blocks
   (HTML/CSS, SPIKE colours from week 9 §6): событие «(E) когда нажата», ожидание «ждать до (E) нажата?», условие «если (E) нажата?
   то … иначе …», значение «(E) давление в %» feeding motor power. One line each on when to use it.
5. Два захвата: the 3D model (layout 'tool') with a switch Захват 1 / Захват 2 (`setGrabber`) and a grip slider; per grabber: how it
   holds, what it is good for, what it is bad at (§1). Link to last week's types (пальцевый, мягкий).
6. Честное испытание: how to test fairly, Test 1 and Test 2 of §1, and a results table the class fills in on the projector
   (click a cell: ✓ держит / ✗ не держит / пусто), saved with `RA.store`, with a conclusion line per test.
7. Сборка и разборка: the 3D model with the stage stepper (`STAGES`, `setBuildStage`) and an explode slider; pairs as in LEGO's lesson;
   ports A and E; the instructions are in the SPIKE app: «Модели → Захваты». Tidy disassembly: parts back into their trays.
8. Манипуляторы и автономия: the ladder ручное → программа → автономия. Today the person decides when to grip, the program turns a
   press into motion. Next step to autonomy: a sensor on the claw itself, so the machine feels the object and grips on its own.
9. Мини-тест: 5 questions with instant explanation, stored with `RA.store` (`lessonQuiz`), `RA.progress.mark('lesson')` at the end.
Footer with the trademark note of week 9.

## 6. Examples view (`js/scenes.js`, `js/examples.js`, `css/examples.css`, `src/views/examples.html`, owner: examples)

Same machinery as week 9 (one shared stage, a phase table per scene, caption timeline, list beside the canvas, the autonomy
level). Six new stories where grippers and touch or force sensing matter, each answering: где, что делает, тип захвата, какие
датчики, насколько автономно, и «Что общего с нашими захватами». Low-poly, clean, same plastic look, readable on a projector.
1. Сортировка мусора: robots with suction grippers and cameras pick recyclables off a conveyor (the clean-up theme of this model).
2. Протез руки: a bionic hand holds a paper cup without crushing it; the person's muscle signals open and close it.
3. Пекарня или яйца: soft grippers move delicate food without damaging it.
4. Океан: soft «noodle» fingers catch a jellyfish without hurting it, the operator steers from the ship.
5. За стеклом: a master-slave manipulator in a hot cell, the person moves the handle on one side, the arm repeats it on the other.
6. Автомат с игрушками: the claw's grip strength is a setting, so a weak claw drops the toy.
Every claim and number must be checked with WebSearch (load it with ToolSearch `select:WebSearch`) or left out.

## 7. Program view (`js/sim.js`, `js/program.js`, `js/vm.js`, `js/blocks.js`, css, view; owner: program)

Same layout and controls as week 9 (blocks left, 3D right, splitter, round Play/Stop, tools, task bar with 4 tasks, 2D hub panel).

Hardware now: motor in port **A**, Force Sensor in port **E**, nothing else. `hw.ports = {A:'motor', B:null, C:null, D:null, E:'force', F:null}`.
Wrong port, friendly toasts, once per run: «В порту F ничего нет. Мотор захвата подключён к порту A.», «В порту A нет датчика
силы. Датчик силы подключён к порту E.» Other sensors: «У этой модели нет такого датчика.» Movement blocks: «У этой модели нет
ходовых моторов: блок пропущен.» Implement the force blocks for real: `flippersensors_force` (Н or %), `flippersensors_isPressed`
and the hat `flipperevents_whenPressed` with нажата / сильно нажата / отпущена / давление изменилось (edge-triggered).
Touch threshold 0.6 N; «сильно нажата» from 7 N (our choice, mark it with a `ponytail:` comment).

Simulator: a table, a zone with the test objects and a bin («корзина»). The tool is held in the hand as last week (arrows/WASD,
Q/E, on-screen pad, drag), tilted claw-down about 30–35° like a litter grabber so the claw reaches the table while the hub stays
in the air. Motor A as last week's motor (ramp, stall), positions: open stop 30°, closed stop -15° (= 345°), start at 5°;
grip t = (30 - pos) / 45. Grip force = |motor power| while the jaws press an object (a regulated move that stalls pushes with 100 %).
Objects and what holds them (this is the lesson's point, keep it):

| Object | Size | Захват 1 (гибкий) | Захват 2 (раздвоенный) |
|---|---|---|---|
| Кубик LEGO 2×4 | 2 wide | holds | jaws never touch it: «Слишком маленький: проскальзывает между зубцами» |
| Бумажный шарик | Ø5, soft | holds | holds; grip above 50 % squashes it («смят», it stays squashed) |
| Пустая бутылка | lying, Ø6, long | slips out when lifted: «Большая и гладкая: петли не удерживают» | holds |
| Яблоко | Ø7, heavy | slips out: «Тяжёлое и гладкое: выскальзывает» | holds with grip ≥ 60 %, slips with less |

Force Sensor control under the 3D view: a black wheel button you press with the pointer; where you press it sets the force
(near the top edge a light touch, near the bottom 10 N), drag while holding to change it, release springs back to 0.
Readout in Н and %. Keyboard: Space presses at 4 N, Shift+Space at 9 N. Clicking the wheel cap in 3D presses at 4 N.
A switch «Захват 1 | Захват 2» swaps the grabber (stops the program, drops what is held). Port A readout (угол, скорость, мощность).
Last week's hub panel stays (LEDs, hub buttons, centre button = start/stop).

Tasks (progress with `RA.store`, solved → tick, all four → `RA.progress.mark('program')`); each with goal, «Подсказка»,
«Показать решение» (in-page confirm), «Сбросить стол»:
1. «Нажми и держи». Starter: `когда запускается подпрограмма` → A to 25 shortest → `повторять всегда` { `ждать до (E) нажата?` →
   A to 345 counterclockwise → `ждать до (E) отпущена?` → (missing) }. The student adds «A перейти самым коротким путём в положение 25».
   Passes when after holding and releasing the sensor the claw re-opens by program.
2. «Испытай захваты». Carry each object into the bin with each grabber. A results table 2 × 4 fills itself: держит / выскользнул /
   смят / не взял. Passes when all 8 cells have a result. Then one line: which grabber suits small, large, heavy, soft things.
3. «Бережно». Захват 2 with the task 1 program squashes the paper ball. Change the program so the grip is as strong as the press:
   `повторять всегда` { если `(E) нажата?` то `A запустить мотор с мощностью ((E) давление в %) × -1` иначе A to 25 }.
   Passes when the paper ball (not squashed) and the apple both lie in the bin.
4. «Захват помнит». One press closes the claw and it stays closed after release; the next press opens it. Solution: the loop of
   task 1 with two waits per press. Passes when in one run: press → closes, release → still closed after 1.5 s, press → opens.
Autosave the workspace with `RA.store`. `RA.createSim(container)` → `{hw, stage, arm, ...}`; expose `RA.program` for QA as week 9 did.

## 8. Visual identity

As week 9 §10. Title of the page: «Захваты». Top bar: «Неделя 10» · «Манипуляторы и автономия».
