const DEADZONE = 0.12;

function clampStick(dx, dy, radius) {
  const len = Math.hypot(dx, dy);
  if (len < 0.0001) return { x: 0, y: 0, nx: 0, ny: 0, mag: 0 };
  const mag = Math.min(1, len / radius);
  const nx = dx / len;
  const ny = dy / len;
  return { x: nx * mag, y: ny * mag, nx, ny, mag };
}

function bindPointer(el, handlers) {
  el.addEventListener("pointerdown", handlers.down);
  el.addEventListener("pointermove", handlers.move);
  el.addEventListener("pointerup", handlers.up);
  el.addEventListener("pointercancel", handlers.up);
  el.addEventListener("lostpointercapture", handlers.up);
}

export class Controls {
  constructor({ canvas, joystick, knob, lookStick, lookKnob }) {
    this.canvas = canvas;
    this.joystick = joystick;
    this.knob = knob;
    this.lookStick = lookStick;
    this.lookKnob = lookKnob;

    this.keys = new Set();
    this.joyForward = 0;
    this.joyStrafe = 0;
    this.lookStickX = 0;
    this.lookStickY = 0;
    this.lookX = 0;
    this.lookY = 0;
    this.zoomDelta = 0;
    this.touching = false;

    this.movePointer = null;
    this.lookStickPointer = null;
    this.lookPointers = new Map();
    this.pinchDist = null;

    if (typeof window !== "undefined" && window.matchMedia("(hover: none) and (pointer: coarse)").matches) {
      this.touching = true;
      document.body.classList.add("touch-on");
    }

    this.bind();
  }

  bind() {
    window.addEventListener("keydown", (e) => {
      this.keys.add(e.key.toLowerCase());
      if (["arrowup", "arrowdown", "arrowleft", "arrowright"].includes(e.key.toLowerCase())) {
        e.preventDefault();
      }
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener("blur", () => this.resetAll());
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this.resetAll();
    });

    this.canvas.addEventListener(
      "wheel",
      (e) => {
        this.zoomDelta += e.deltaY > 0 ? 1 : -1;
        e.preventDefault();
      },
      { passive: false },
    );
    this.canvas.addEventListener("contextmenu", (e) => e.preventDefault());

    bindPointer(this.canvas, {
      down: (e) => this.onLookDown(e),
      move: (e) => this.onLookMove(e),
      up: (e) => this.onLookUp(e),
    });

    if (this.joystick && this.knob) {
      bindPointer(this.joystick, {
        down: (e) => this.onStickDown(e, "move"),
        move: (e) => this.onStickMove(e, "move"),
        up: (e) => this.onStickUp(e, "move"),
      });
    }
    if (this.lookStick && this.lookKnob) {
      bindPointer(this.lookStick, {
        down: (e) => this.onStickDown(e, "look"),
        move: (e) => this.onStickMove(e, "look"),
        up: (e) => this.onStickUp(e, "look"),
      });
    }

    window.addEventListener(
      "touchstart",
      () => {
        this.touching = true;
        document.body.classList.add("touch-on");
      },
      { passive: true },
    );
  }

  ringRadius(el) {
    const rect = el.getBoundingClientRect();
    return Math.max(28, Math.min(rect.width, rect.height) * 0.36);
  }

  setKnob(knob, x, y, radius) {
    if (!knob) return;
    const px = x * radius;
    const py = y * radius;
    knob.style.transform = `translate(${px}px, ${py}px)`;
  }

  onStickDown(e, kind) {
    if (e.button != null && e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    this.touching = true;
    document.body.classList.add("touch-on");
    const el = kind === "move" ? this.joystick : this.lookStick;
    el.setPointerCapture(e.pointerId);
    if (kind === "move") this.movePointer = e.pointerId;
    else this.lookStickPointer = e.pointerId;
    this.onStickMove(e, kind);
  }

  onStickMove(e, kind) {
    const id = kind === "move" ? this.movePointer : this.lookStickPointer;
    if (id !== e.pointerId) return;
    const el = kind === "move" ? this.joystick : this.lookStick;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const radius = this.ringRadius(el);
    const stick = clampStick(e.clientX - cx, e.clientY - cy, radius);
    const analogX = stick.mag < DEADZONE ? 0 : stick.x;
    const analogY = stick.mag < DEADZONE ? 0 : stick.y;
    if (kind === "move") {
      this.joyStrafe = analogX;
      this.joyForward = -analogY;
      this.setKnob(this.knob, stick.x, stick.y, radius);
    } else {
      this.lookStickX = analogX;
      this.lookStickY = analogY;
      this.setKnob(this.lookKnob, stick.x, stick.y, radius);
    }
  }

  onStickUp(e, kind) {
    const id = kind === "move" ? this.movePointer : this.lookStickPointer;
    if (id != null && e.pointerId !== id) return;
    if (kind === "move") {
      this.movePointer = null;
      this.joyForward = 0;
      this.joyStrafe = 0;
      this.setKnob(this.knob, 0, 0, 1);
    } else {
      this.lookStickPointer = null;
      this.lookStickX = 0;
      this.lookStickY = 0;
      this.setKnob(this.lookKnob, 0, 0, 1);
    }
  }

  onLookDown(e) {
    if (e.target.closest?.("#touch-ui")) return;
    if (e.pointerType === "mouse" && e.button !== 0 && e.button !== 2) return;
    e.preventDefault();
    this.canvas.setPointerCapture(e.pointerId);
    this.lookPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this.canvas.classList.add("looking");
  }

  onLookMove(e) {
    const prev = this.lookPointers.get(e.pointerId);
    if (!prev) return;
    const dx = e.clientX - prev.x;
    const dy = e.clientY - prev.y;
    prev.x = e.clientX;
    prev.y = e.clientY;

    if (this.lookPointers.size >= 2) {
      const pts = [...this.lookPointers.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if (this.pinchDist != null && this.pinchDist > 8) {
        this.zoomDelta += (this.pinchDist - dist) * 0.04;
      }
      this.pinchDist = dist;
      return;
    }

    this.pinchDist = null;
    const mx = e.pointerType === "mouse" && e.movementX != null ? e.movementX : dx;
    const my = e.pointerType === "mouse" && e.movementY != null ? e.movementY : dy;
    this.lookX += mx;
    this.lookY += my;
  }

  onLookUp(e) {
    if (!this.lookPointers.has(e.pointerId)) return;
    this.lookPointers.delete(e.pointerId);
    if (this.lookPointers.size < 2) this.pinchDist = null;
    if (this.lookPointers.size === 0) this.canvas.classList.remove("looking");
  }

  resetAll() {
    this.keys.clear();
    this.joyForward = 0;
    this.joyStrafe = 0;
    this.lookStickX = 0;
    this.lookStickY = 0;
    this.lookX = 0;
    this.lookY = 0;
    this.movePointer = null;
    this.lookStickPointer = null;
    this.lookPointers.clear();
    this.pinchDist = null;
    this.setKnob(this.knob, 0, 0, 1);
    this.setKnob(this.lookKnob, 0, 0, 1);
    this.canvas.classList.remove("looking");
  }

  getMove() {
    let forward = this.joyForward;
    let strafe = this.joyStrafe;
    if (this.keys.has("w") || this.keys.has("arrowup")) forward += 1;
    if (this.keys.has("s") || this.keys.has("arrowdown")) forward -= 1;
    if (this.keys.has("d") || this.keys.has("arrowright")) strafe += 1;
    if (this.keys.has("a") || this.keys.has("arrowleft")) strafe -= 1;
    const len = Math.hypot(forward, strafe);
    if (len > 1) {
      forward /= len;
      strafe /= len;
    }
    return { forward, strafe };
  }

  consumeLook() {
    const x = this.lookX;
    const y = this.lookY;
    this.lookX = 0;
    this.lookY = 0;
    return { x, y };
  }

  consumeZoom() {
    const z = this.zoomDelta;
    this.zoomDelta = 0;
    return z;
  }

  isTouch() {
    return this.touching || document.body.classList.contains("touch-on");
  }
}
