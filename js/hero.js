// Start screen: «Захваты» as a product reveal, laid out as in LEGO's picture. It sits dead centre, the page behind it is plain CSS.
(function () {
  const RA = window.RA;
  const Q = Math.PI / 2;
  const AZIMUTH = 0.42, ELEVATION = 0.5;      // from the front, a little from the stand's side, as LEGO's picture
  const INTRO = 1.8, SWEEP = 0.8, TURN = 0.1, BEAT = 7, SQUEEZE = 3;    // seconds, radians, rad/s
  const REST = 0.7;                           // grip between presses: both claws about parallel, as in LEGO's picture; wide open they splay
  const FILL_W = 0.9, FILL_H = 0.84;          // share of the screen the model may take
  const ease = (t) => 1 - (1 - t) ** 3;
  const hold = (p, edge) => Math.min(1, p / edge, (1 - p) / edge);        // ramps in, holds, ramps out as p runs 0..1

  let stage;

  RA.view('start', {
    init(root) {
      const g = RA.createGrabber();
      g.setLayout('spread');
      g.setGrip(REST);
      // The model keeps +X towards the claw for the other views, which makes it LEGO's mirror image; mirrored back, the claw is on the left.
      g.group.scale.x = -1;
      g.group.updateMatrixWorld();
      // The model's middle and the corners of each part's box, measured at rest, the widest the claws open here: enough to frame it from any side.
      const outline = [];
      Object.values(g.parts).forEach((p) => {
        const b = new THREE.Box3().setFromObject(p, true);
        if (!b.isEmpty()) for (let i = 0; i < 8; i++) outline.push([i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z]);
      });
      const aim = new THREE.Box3().setFromObject(g.group, true).getCenter(new THREE.Vector3());
      const AIM = aim.toArray();

      const az = AZIMUTH - (RA.reducedMotion ? 0 : SWEEP);
      const dir = [Math.sin(az) * Math.cos(ELEVATION), Math.sin(ELEVATION), Math.cos(az) * Math.cos(ELEVATION)];
      stage = RA.stage(RA.$('.hero__stage', root), { fov: 18, target: AIM, camera: dir.map((v, i) => AIM[i] + v * 120) });
      stage.scene.add(g.group);
      if (!stage.renderer) return;

      // A table that only shows the model's shadow.
      const ground = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), new THREE.ShadowMaterial({ opacity: 0.16 }));
      ground.rotation.x = -Q;
      ground.position.set(aim.x, -0.02, aim.z);
      ground.receiveShadow = true;
      // The stage's key light leaves the far side dim, and the turntable shows it.
      const fill = new THREE.DirectionalLight(0xffffff, 1.1);
      fill.position.set(10, 20, -60);
      stage.scene.add(ground, fill);

      const c = stage.controls, foot = RA.$('.hero__foot', root);
      c.enableZoom = false;
      c.autoRotate = !RA.reducedMotion;
      const tan = Math.tan((stage.camera.fov * Math.PI) / 360);
      let intro = RA.reducedMotion ? 0 : 1;
      // The distance at which the model just fills the screen from the side it shows now, so it stays the biggest thing as it turns.
      const distance = () => {
        const a = c.getAzimuthalAngle(), el = Q - c.getPolarAngle();
        let u = 0, v = 0;
        outline.forEach(([x, y, z]) => {
          x -= AIM[0]; y -= AIM[1]; z -= AIM[2];
          u = Math.max(u, Math.abs(x * Math.cos(a) - z * Math.sin(a)));
          v = Math.max(v, Math.abs(y * Math.cos(el) - (x * Math.sin(a) + z * Math.cos(a)) * Math.sin(el)));
        });
        // On a phone the foot runs edge to edge, so the model must stay clear of it; on wider screens it passes between the corners.
        const fillH = stage.size.w > 640 ? FILL_H : 1 - (2 * (foot.offsetHeight + 44)) / stage.size.h;
        return Math.max(v / fillH, u / (FILL_W * stage.camera.aspect)) / tan;
      };
      stage.frame((dt, t) => {
        const push = 1 + 0.3 * (1 - ease(1 - intro));
        stage.camera.position.sub(c.target).setLength(distance() * push).add(c.target);
        if (RA.reducedMotion) return;
        // OrbitControls turns per frame; this keeps the speed the same on any screen. Negative: the sweep runs from the claw's side.
        c.autoRotateSpeed = -((TURN + (3 * SWEEP / INTRO) * intro * intro) * dt * 3600) / (2 * Math.PI);
        if (intro > 0) {
          intro = Math.max(0, intro - dt / INTRO);
          g.setGrip(1 - (1 - REST) * ease(1 - intro));      // the claws open as the model arrives
          return;
        }
        // Now and then a finger presses the wheel cap, the claws close, then both let go.
        // The beat counts from the intro's end, so the first press ramps in instead of snapping shut.
        const p = ((t - INTRO) % BEAT) / SQUEEZE, q = (p - 0.1) / 0.9;
        g.setForce(p < 1 ? 100 * hold(p, 0.2) : 0);
        g.setGrip(REST + (1 - REST) * (q > 0 && q < 1 ? Math.sin(hold(q, 0.3) * Q) ** 2 : 0));
      });
    },
    enter() { stage.start(); },
    leave() { stage.stop(); },
  });
})();
