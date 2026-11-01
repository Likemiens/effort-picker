"use client";
import { jsx, jsxs } from "react/jsx-runtime";
import { useEffect, useId, useRef, useState } from "react";
import "./effort-picker.css";
const TOP = 10;
const BAND = 37;
const THUMB = 15;
const GRIP = 22;
const LINE = 4;
const TIP = 4.5;
const HEAD = 28;
const BELLY = 0.22;
const MARGIN = 14;
const BEAT = 1.5;
const HIT = 0.5;
const RICH = [
  [0, "#b7d7e2"],
  [1.1, "#a6cdea"],
  [1.6, "#7ac2fd"],
  [2.2, "#6abdff"],
  [3.3, "#f8b938"],
  [3.55, "#ffb72a"],
  [3.8, "#ffa52a"],
  [4.25, "#fe8532"],
  [4.6, "#fb7337"],
  [5.3, "#f76a35"],
  [6.1, "#e03d40"],
  [6.85, "#e43c3c"],
  [7.8, "#643ac0"],
  [10, "#5f39c9"]
];
const PALE = [
  [0, "#eef3f6"],
  [1.07, "#dbebfa"],
  [2.1, "#c5e5fe"],
  [3.2, "#fbe6b4"],
  [4.27, "#fdd0b1"],
  [5.24, "#ffc9b1"],
  [6.27, "#f6b2b3"],
  [6.66, "#f4b2b3"],
  [7.95, "#bdb0e6"],
  [10, "#beafe6"]
];
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (x, low, high) => Math.min(high, Math.max(low, x));
const round = (x) => Math.round(x * 100) / 100;
const smooth = (x) => {
  const t = clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
};
const channels = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
function richAt(level) {
  const next = Math.max(1, RICH.findIndex(([at]) => at >= level));
  const [a, from] = RICH[next - 1];
  const [b, to] = RICH[next];
  const start = channels(from);
  const end = channels(to);
  const t = clamp((level - a) / (b - a), 0, 1);
  return `rgb(${start.map((value, i) => Math.round(lerp(value, end[i], t))).join(" ")})`;
}
class Spring {
  x;
  v = 0;
  to;
  stiffness;
  damping;
  constructor(value, stiffness, damping) {
    this.x = value;
    this.to = value;
    this.stiffness = stiffness;
    this.damping = damping;
  }
  /** One frame; tells whether it still moves. */
  step(dt, snap) {
    if (snap) {
      this.x = this.to;
      this.v = 0;
      return false;
    }
    if (this.x === this.to && this.v === 0) return false;
    for (let left = dt; left > 0; left -= 1 / 240) {
      const d = Math.min(left, 1 / 240);
      this.v += (this.stiffness * (this.to - this.x) - this.damping * this.v) * d;
      this.x += this.v * d;
    }
    if (Math.abs(this.to - this.x) < 1e-3 && Math.abs(this.v) < 0.01) {
      this.x = this.to;
      this.v = 0;
    }
    return true;
  }
}
function radiusAt(u, head, swell) {
  return LINE + swell * (TIP - LINE + (head - TIP) * (u + BELLY * u * (1 - u)));
}
function outline(ax, bx, head, swell) {
  const length = bx - ax;
  const upper = [];
  const lower = [];
  for (let i = 0; i <= 32; i += 1) {
    const u = i / 32;
    const r = radiusAt(u, head, swell);
    const slope = swell * (head - TIP) * (1 + BELLY * (1 - 2 * u)) / length;
    const x = round(ax + u * length - r * slope);
    const y = r * Math.sqrt(1 - slope * slope);
    upper.push(`${x} ${round(BAND - y)}`);
    lower.unshift(`${x} ${round(BAND + y)}`);
  }
  const start = round(radiusAt(0, head, swell));
  const end = round(radiusAt(1, head, swell));
  return `M${upper.join("L")}A${end} ${end} 0 1 1 ${lower.join("L")}A${start} ${start} 0 0 1 ${upper[0]}Z`;
}
class Motion {
  root;
  on;
  from;
  to;
  suggested;
  held;
  width = 0;
  ax = 0;
  bx = 0;
  head = HEAD;
  hatchFrom = 0;
  hatchTo = 0;
  pillWidth = 0;
  target;
  // where the thumb is going
  slack = 0;
  // how far it still is from there, running out by itself
  grab = 0;
  // a press on the thumb keeps its offset from the pointer
  level;
  pointer = false;
  dragged = false;
  waiting = null;
  // a finger on the line, until it is clear what it wants
  holder = 0;
  // the pointer that pressed
  keysUntil = 0;
  byHand = false;
  pillOn = false;
  pillSide = "above";
  letGoAt = 0;
  swell;
  charge;
  // the maximum: 0 is the line as it is, 1 is alive
  phase = 0;
  // where in the heartbeat it is
  flare = 0;
  // what is left of the last hit on the head
  march = 0;
  // how far the stripes have gone
  raf = 0;
  last = 0;
  dirty = true;
  reduced;
  observers = [];
  parts;
  ticks;
  constructor(root, props, on) {
    this.root = root;
    this.on = on;
    this.from = props.from;
    this.to = props.to;
    this.suggested = props.suggested;
    this.held = props.held;
    this.target = props.value;
    this.level = Math.round(props.value);
    this.swell = new Spring(props.held ? 1 : 0, 420, 32);
    this.charge = new Spring(this.level === TOP ? 1 : 0, 90, 16);
    this.reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    this.parts = {};
    root.querySelectorAll("[data-ep]").forEach((element) => {
      this.parts[element.dataset.ep] = element;
    });
    this.ticks = root.querySelectorAll("[data-tick]");
    const resize = new ResizeObserver(() => this.layout());
    for (const name of ["picker", "pill", "caption", "usual"]) resize.observe(this.parts[name]);
    const seen = new IntersectionObserver(([entry]) => {
      cancelAnimationFrame(this.raf);
      if (entry.isIntersecting) this.start();
    });
    seen.observe(root);
    this.observers = [resize, seen];
    this.layout();
    this.start();
  }
  destroy() {
    cancelAnimationFrame(this.raf);
    for (const observer of this.observers) observer.disconnect();
    this.unfollow();
  }
  start() {
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }
  x(level) {
    return this.ax + level / TOP * (this.bx - this.ax);
  }
  /** What depends on the size of the box and on the usual range. */
  layout() {
    const { picker, pill, caption, usual } = this.parts;
    this.width = picker.clientWidth;
    this.pillWidth = pill.offsetWidth;
    this.head = clamp(this.width * 0.0667, 22, HEAD);
    this.ax = MARGIN + this.head;
    this.bx = this.width - this.ax;
    for (const name of ["rich", "pale"]) {
      this.parts[`${name}-ramp`].setAttribute("x1", String(this.ax));
      this.parts[`${name}-ramp`].setAttribute("x2", String(this.bx));
    }
    this.hatchFrom = this.x(this.suggested - 3.94);
    this.hatchTo = this.x(this.suggested + 3.76);
    this.parts["fade-ramp"].setAttribute("x1", String(this.hatchFrom));
    this.parts["fade-ramp"].setAttribute("x2", String(this.hatchTo));
    this.parts["edge-low"].setAttribute("x", String(this.x(this.from) - 0.5));
    this.parts["edge-high"].setAttribute("x", String(this.x(this.to) - 0.5));
    this.parts.data.setAttribute("x", String(this.x(this.suggested) - 0.5));
    caption.style.translate = `${round(this.along(this.x(this.suggested), caption.offsetWidth))}px 0`;
    usual.style.translate = `${round(this.along(this.x((this.from + this.to) / 2), usual.offsetWidth))}px 0`;
    this.dirty = true;
  }
  /** A rectangle of the band, from x to x. */
  place(rect, x0, x1) {
    rect.setAttribute("x", String(round(x0)));
    rect.setAttribute("width", String(round(Math.max(0, x1 - x0))));
  }
  /** Where a thing this wide starts when its middle is at x, kept inside the box. */
  along(x, width) {
    return clamp(x - width / 2, 6, Math.max(6, this.width - width - 6));
  }
  /** A point of the screen along the box, in the box's own pixels: it may stand under a zoom or a scale. */
  along0(clientX) {
    const box = this.parts.picker.getBoundingClientRect();
    return (clientX - box.left) * this.width / box.width;
  }
  levelAt(clientX) {
    return (this.along0(clientX) - this.ax) / (this.bx - this.ax) * TOP;
  }
  go(target, byHand) {
    this.slack += this.target - target;
    this.target = target;
    this.byHand = byHand;
    this.on.moved(target !== this.suggested);
    this.dirty = true;
  }
  /**
   * A press on the thumb takes it where it is, with no jump; a press on the line sends it there. A finger on the line
   * waits to see whether it means to drag or to scroll the page: a scroll must not change the level. The hand is
   * followed on the window as well as through the pointer capture, so nothing slips out of it.
   */
  press(clientX, finger, pointer) {
    this.holder = pointer;
    window.addEventListener("pointermove", this.follow);
    window.addEventListener("pointerup", this.letGo);
    window.addEventListener("pointercancel", this.letGo);
    const shown = this.target + this.slack;
    if (Math.abs(this.along0(clientX) - this.x(shown)) <= GRIP) {
      this.grab = shown - this.levelAt(clientX);
      this.target = shown;
      this.slack = 0;
      this.dragged = false;
      this.pointer = true;
      this.on.pressed(true);
    } else if (finger) {
      this.waiting = clientX;
    } else {
      this.jump(clientX);
    }
  }
  follow = (event) => {
    if (event.pointerId === this.holder) this.drag(event.clientX);
  };
  letGo = (event) => {
    if (event.pointerId === this.holder) this.release(event.type === "pointercancel");
  };
  unfollow() {
    window.removeEventListener("pointermove", this.follow);
    window.removeEventListener("pointerup", this.letGo);
    window.removeEventListener("pointercancel", this.letGo);
  }
  jump(clientX) {
    this.grab = 0;
    this.dragged = true;
    this.pointer = true;
    this.on.pressed(true);
    this.go(clamp(this.levelAt(clientX), 0, TOP), true);
  }
  drag(clientX) {
    if (this.waiting !== null && Math.abs(clientX - this.waiting) > 4) {
      this.waiting = null;
      this.jump(clientX);
    }
    if (!this.pointer) return;
    const next = clamp(this.levelAt(clientX) + this.grab, 0, TOP);
    if (Math.abs(next - this.target) > 0.02) this.dragged = true;
    if (!this.dragged) return;
    this.target = next;
    this.byHand = true;
    this.on.moved(true);
    this.dirty = true;
  }
  /** Let go: the thumb settles on its whole level. A press that moved nothing leaves it where it was. */
  release(cancelled) {
    this.unfollow();
    if (this.waiting !== null && !cancelled) {
      this.jump(this.waiting);
      this.keysUntil = performance.now() + 350;
    }
    this.waiting = null;
    if (!this.pointer) return;
    this.pointer = false;
    this.on.pressed(false);
    this.letGoAt = performance.now();
    if (this.dragged) this.go(Math.round(this.target), true);
    this.grab = 0;
  }
  step(by) {
    this.go(clamp(Math.round(this.target) + by, 0, TOP), true);
    this.keysUntil = performance.now() + 900;
  }
  isDown(now) {
    return this.held ?? (this.pointer || now < this.keysUntil);
  }
  frame = (now) => {
    this.raf = requestAnimationFrame(this.frame);
    const dt = clamp((now - this.last) / 1e3, 0, 1 / 20);
    this.last = now;
    const snap = this.reduced.matches;
    const running = this.slack !== 0;
    this.slack = snap ? 0 : this.slack * Math.exp(-dt * 15);
    if (Math.abs(this.slack) < 3e-3) this.slack = 0;
    const level = Math.round(this.target);
    if (level !== this.level) {
      this.level = level;
      this.on.level(level, this.byHand);
    }
    this.charge.to = level === TOP ? 1 : 0;
    const charging = this.charge.step(dt, snap);
    const alive = this.charge.x > 0;
    if (alive && !snap) this.beat(dt);
    const down = this.isDown(now);
    this.swell.to = down ? 1 : 0;
    const swelling = this.swell.step(dt, snap);
    this.tooltip(down, now);
    if (this.dirty || running || swelling || charging || alive) this.draw(this.target + this.slack);
    this.dirty = false;
    if (!this.root.dataset.ready) this.on.ready();
  };
  /** The maximum's heartbeat: a charge runs along the line and hits the head, which thumps, and the glow flares. */
  beat(dt) {
    const before = this.phase;
    this.phase = (this.phase + dt / BEAT) % 1;
    if (before < HIT && this.phase >= HIT) {
      this.flare = 1;
      this.swell.v += 1.5;
    }
    this.flare *= Math.exp(-dt * 3.2);
    this.march += dt * 22;
  }
  tooltip(down, now) {
    const side = this.target === this.suggested ? null : this.level === TOP ? "max" : this.target < this.from ? "below" : this.target > this.to ? "above" : null;
    const on = side !== null && (down || this.pillOn && now - this.letGoAt < 500);
    if (on !== this.pillOn || side && side !== this.pillSide) {
      this.pillOn = on;
      if (side) this.pillSide = side;
      this.on.pill(on, this.pillSide);
    }
  }
  draw(shown) {
    const { ax, bx, head, parts } = this;
    const swell = clamp(this.swell.x, 0, 1.12);
    const solid = Math.min(swell, 1);
    const at = (level) => this.x(level);
    const thumb = at(shown);
    const low = at(this.from);
    const high = at(this.to);
    const full = smooth((shown - 9.3) / 0.7);
    const empty = smooth((0.7 - shown) / 0.7);
    const edge = thumb + full * (head + 1);
    const d = outline(ax, bx, head, swell);
    for (const name of ["glow", "pale", "rich", "sheen"]) parts[name].setAttribute("d", d);
    this.place(parts.window, at(Math.min(shown, this.from)), Math.max(thumb, high));
    parts.spread.setAttribute("cx", String(round(thumb)));
    parts.spread.setAttribute("r", String(round(full * (bx - thumb + head + 2))));
    const above = shown > this.to;
    const below = shown < this.from;
    const start = thumb - empty * 20;
    if (above) this.place(parts.block, high, edge);
    else if (below) this.place(parts.block, start, low);
    else this.place(parts.block, 0, 0);
    parts["end-ramp"].setAttribute("x1", String(round(below ? start + Math.max(0.5, empty * 24) : edge - Math.max(0.5, full * (head + 8)))));
    parts["end-ramp"].setAttribute("x2", String(round(below ? start : edge)));
    parts.block.setAttribute("opacity", String(round(lerp(0.42, 1, solid))));
    this.place(parts["hatch-low"], this.hatchFrom, below ? Math.min(low, start) : low);
    this.place(parts["hatch-high"], above ? Math.max(high, edge) : high, this.hatchTo);
    parts["edge-low"].setAttribute("fill", below ? richAt(this.from) : "var(--ep-edge)");
    parts["edge-high"].setAttribute("fill", above ? richAt(this.to) : "var(--ep-edge)");
    parts.data.setAttribute("opacity", String(round(1 - solid)));
    const r = radiusAt(shown / TOP, head, swell);
    parts.divider.setAttribute("x", String(round(thumb - 1)));
    parts.divider.setAttribute("y", String(round(BAND - r)));
    parts.divider.setAttribute("height", String(round(r * 2)));
    parts.divider.setAttribute("opacity", String(round(solid * (1 - full))));
    const size = head / HEAD;
    this.ticks.forEach((tick, i) => {
      const height = lerp(2.5, (2 + 17 * i / 8) * size, swell);
      const width = lerp(2.5, 2, solid);
      tick.setAttribute("x", String(round(at(i + 1) - width / 2)));
      tick.setAttribute("y", String(round(BAND - height / 2)));
      tick.setAttribute("width", String(round(width)));
      tick.setAttribute("height", String(round(height)));
      tick.setAttribute("rx", String(round(width / 2)));
    });
    this.drawCharge();
    parts.thumb.style.translate = `${round(thumb - THUMB)}px 0`;
    parts.dot.style.background = richAt(shown);
    parts.dot.style.scale = String(round(lerp(0.62, 1, solid) * (1 + 0.16 * this.flare * clamp(this.charge.x, 0, 1))));
    parts.pill.style.translate = `${round(this.along(thumb, this.pillWidth))}px 0`;
  }
  /** The maximum, on the line: the glow behind it, the light running along it, the stripes. */
  drawCharge() {
    const { ax, bx, head, parts } = this;
    const alive = clamp(this.charge.x, 0, 1);
    parts["glow-box"].style.opacity = String(round(alive * (0.5 + 0.1 * Math.sin(this.phase * Math.PI * 2) + 0.4 * this.flare)));
    parts.run.setAttribute("patternTransform", `rotate(45) translate(${round(this.march)} 0)`);
    const running = this.phase < HIT && alive > 0 && !this.reduced.matches;
    parts.sheen.setAttribute("opacity", running ? String(round(alive)) : "0");
    if (running) {
      const front = lerp(ax - 20, bx + head + 90, (this.phase / HIT) ** 1.7);
      parts["sheen-ramp"].setAttribute("x1", String(round(front - 120)));
      parts["sheen-ramp"].setAttribute("x2", String(round(front)));
    }
  }
}
const stops = (ramp) => ramp.map(([at, colour]) => /* @__PURE__ */ jsx("stop", { offset: at / TOP, stopColor: colour }, at));
function EffortPicker({ labels, suggested, usualRange, value, pressed, onChange, onPressedChange, onClear }) {
  const [from, to] = usualRange;
  const start = value ?? suggested;
  const [level, setLevel] = useState(() => Math.round(start));
  const [pill, setPill] = useState({ on: false, side: "above" });
  const [moved, setMoved] = useState(start !== suggested);
  const [ready, setReady] = useState(false);
  const root = useRef(null);
  const motion = useRef(null);
  const report = useRef({ onChange, onPressedChange });
  const id = useId().replace(/\W/g, "");
  const name = (part) => `ep-${id}-${part}`;
  const url = (part) => `url(#${name(part)})`;
  useEffect(() => {
    report.current = { onChange, onPressedChange };
  });
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const running = new Motion(
      element,
      { value: start, from, to, suggested, held: pressed },
      {
        level: (next, byHand) => {
          setLevel(next);
          if (byHand) report.current.onChange?.(next);
        },
        pill: (on, side) => setPill({ on, side }),
        moved: setMoved,
        pressed: (on) => report.current.onPressedChange?.(on),
        ready: () => setReady(true)
      }
    );
    motion.current = running;
    return () => running.destroy();
  }, []);
  useEffect(() => {
    const running = motion.current;
    if (!running) return;
    running.from = from;
    running.to = to;
    running.suggested = suggested;
    running.layout();
  }, [from, to, suggested]);
  useEffect(() => {
    if (motion.current) motion.current.held = pressed;
  }, [pressed]);
  useEffect(() => {
    const running = motion.current;
    if (value === void 0 || !running || running.pointer || value === Math.round(running.target) || value === running.target) return;
    running.go(value, false);
  }, [value]);
  const press = (event) => {
    if (event.button !== 0 || !motion.current) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    motion.current.press(event.clientX, event.pointerType === "touch", event.pointerId);
  };
  const keys = (event) => {
    const by = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1, PageDown: -2, PageUp: 2, Home: -TOP, End: TOP }[event.key];
    if (!by || !motion.current) return;
    event.preventDefault();
    motion.current.step(by);
  };
  const clear = () => {
    motion.current?.go(suggested, false);
    motion.current?.parts.thumb.focus({ preventScroll: true });
    onClear?.();
  };
  const zone = level === TOP ? labels.max : level < from ? labels.below : level > to ? labels.above : labels.usual;
  return /* @__PURE__ */ jsxs("div", { className: "ep", ref: root, "data-ready": ready || void 0, children: [
    /* @__PURE__ */ jsxs("div", { className: "ep-picker", "data-ep": "picker", onPointerDown: press, children: [
      /* @__PURE__ */ jsx("span", { className: "ep-caption", "data-ep": "caption", "data-hidden": pill.on || void 0, "aria-hidden": pill.on, children: labels.suggested }),
      /* @__PURE__ */ jsx("span", { className: "ep-pill", "data-ep": "pill", "data-side": pill.side, "data-on": pill.on || void 0, "aria-hidden": !pill.on, children: labels[pill.side] }),
      /* @__PURE__ */ jsx("svg", { className: "ep-glow", "data-ep": "glow-box", "aria-hidden": "true", children: /* @__PURE__ */ jsx("g", { transform: "translate(40 40)", children: /* @__PURE__ */ jsx("path", { "data-ep": "glow", fill: url("rich"), stroke: url("rich"), strokeWidth: "9" }) }) }),
      /* @__PURE__ */ jsxs("svg", { className: "ep-shape", "aria-hidden": "true", children: [
        /* @__PURE__ */ jsxs("defs", { children: [
          /* @__PURE__ */ jsx("linearGradient", { id: name("rich"), "data-ep": "rich-ramp", gradientUnits: "userSpaceOnUse", y1: "0", y2: "0", children: stops(RICH) }),
          /* @__PURE__ */ jsx("linearGradient", { id: name("pale"), "data-ep": "pale-ramp", gradientUnits: "userSpaceOnUse", y1: "0", y2: "0", children: stops(PALE) }),
          /* @__PURE__ */ jsxs("linearGradient", { id: name("fade"), "data-ep": "fade-ramp", gradientUnits: "userSpaceOnUse", y1: "0", y2: "0", children: [
            /* @__PURE__ */ jsx("stop", { offset: "0", stopColor: "#000" }),
            /* @__PURE__ */ jsx("stop", { offset: "0.18", stopColor: "#fff" }),
            /* @__PURE__ */ jsx("stop", { offset: "0.6", stopColor: "#fff" }),
            /* @__PURE__ */ jsx("stop", { offset: "1", stopColor: "#000" })
          ] }),
          /* @__PURE__ */ jsxs("linearGradient", { id: name("end"), "data-ep": "end-ramp", gradientUnits: "userSpaceOnUse", y1: "0", y2: "0", children: [
            /* @__PURE__ */ jsx("stop", { offset: "0", stopColor: "#fff" }),
            /* @__PURE__ */ jsx("stop", { offset: "1", stopColor: "#000" })
          ] }),
          /* @__PURE__ */ jsxs("linearGradient", { id: name("sheen"), "data-ep": "sheen-ramp", gradientUnits: "userSpaceOnUse", y1: "0", y2: "0", children: [
            /* @__PURE__ */ jsx("stop", { offset: "0", stopColor: "#fff", stopOpacity: "0" }),
            /* @__PURE__ */ jsx("stop", { offset: "0.82", stopColor: "#fff", stopOpacity: "0.95" }),
            /* @__PURE__ */ jsx("stop", { offset: "1", stopColor: "#fff", stopOpacity: "0" })
          ] }),
          /* @__PURE__ */ jsx("pattern", { id: name("stripes"), width: "9.4", height: "9.4", patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)", children: /* @__PURE__ */ jsx("rect", { width: "2.8", height: "9.4", fill: "#fff" }) }),
          /* @__PURE__ */ jsx("pattern", { id: name("run"), "data-ep": "run", width: "9.4", height: "9.4", patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)", children: /* @__PURE__ */ jsx("rect", { width: "2.8", height: "9.4", fill: "#fff" }) }),
          /* @__PURE__ */ jsx("mask", { id: name("hatch"), maskUnits: "userSpaceOnUse", x: "0", y: "0", width: "100%", height: "100%", children: /* @__PURE__ */ jsx("rect", { width: "100%", height: "100%", fill: url("stripes") }) }),
          /* @__PURE__ */ jsx("mask", { id: name("marching"), maskUnits: "userSpaceOnUse", x: "0", y: "0", width: "100%", height: "100%", children: /* @__PURE__ */ jsx("rect", { width: "100%", height: "100%", fill: url("run") }) }),
          /* @__PURE__ */ jsx("mask", { id: name("faded"), maskUnits: "userSpaceOnUse", x: "0", y: "0", width: "100%", height: "100%", children: /* @__PURE__ */ jsx("rect", { width: "100%", height: "100%", fill: url("fade") }) }),
          /* @__PURE__ */ jsx("mask", { id: name("ending"), maskUnits: "userSpaceOnUse", x: "0", y: "0", width: "100%", height: "100%", children: /* @__PURE__ */ jsx("rect", { width: "100%", height: "100%", fill: url("end") }) }),
          /* @__PURE__ */ jsxs("clipPath", { id: name("window"), children: [
            /* @__PURE__ */ jsx("rect", { "data-ep": "window", y: "0", height: BAND * 2 }),
            /* @__PURE__ */ jsx("circle", { "data-ep": "spread", cy: BAND })
          ] })
        ] }),
        /* @__PURE__ */ jsx("g", { mask: url("faded"), children: /* @__PURE__ */ jsxs("g", { mask: url("hatch"), fill: "var(--ep-hatch)", children: [
          /* @__PURE__ */ jsx("rect", { "data-ep": "hatch-low", y: "0", height: BAND * 2 }),
          /* @__PURE__ */ jsx("rect", { "data-ep": "hatch-high", y: "0", height: BAND * 2 })
        ] }) }),
        /* @__PURE__ */ jsx("g", { mask: url("ending"), children: /* @__PURE__ */ jsx("g", { mask: url("marching"), children: /* @__PURE__ */ jsx("rect", { "data-ep": "block", y: "0", height: BAND * 2, fill: url("rich") }) }) }),
        /* @__PURE__ */ jsx("rect", { "data-ep": "edge-low", y: "0", width: "1", height: BAND * 2 }),
        /* @__PURE__ */ jsx("rect", { "data-ep": "edge-high", y: "0", width: "1", height: BAND * 2 }),
        /* @__PURE__ */ jsx("rect", { "data-ep": "data", y: "0", width: "1", height: BAND * 2, fill: "var(--ep-edge)" }),
        /* @__PURE__ */ jsx("path", { "data-ep": "pale", fill: url("pale") }),
        /* @__PURE__ */ jsx("path", { "data-ep": "rich", fill: url("rich"), clipPath: url("window") }),
        /* @__PURE__ */ jsx("path", { className: "ep-sheen", "data-ep": "sheen", fill: url("sheen"), opacity: "0" }),
        /* @__PURE__ */ jsx("rect", { "data-ep": "divider", width: "2", fill: "#fff" }),
        Array.from({ length: TOP - 1 }, (_, i) => /* @__PURE__ */ jsx("rect", { "data-tick": "", fill: "#fff" }, i))
      ] }),
      /* @__PURE__ */ jsx(
        "div",
        {
          className: "ep-thumb",
          "data-ep": "thumb",
          role: "slider",
          tabIndex: 0,
          "aria-label": labels.label,
          "aria-valuemin": 0,
          "aria-valuemax": TOP,
          "aria-valuenow": level,
          "aria-valuetext": `${level}, ${zone}`,
          onKeyDown: keys,
          children: /* @__PURE__ */ jsx("i", { "data-ep": "dot" })
        }
      ),
      /* @__PURE__ */ jsx("span", { className: "ep-usual", "data-ep": "usual", children: labels.usual })
    ] }),
    /* @__PURE__ */ jsx("button", { className: "ep-clear", type: "button", disabled: !moved, onClick: clear, children: labels.clear })
  ] });
}
export {
  EffortPicker
};
