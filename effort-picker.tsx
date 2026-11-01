"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import "./effort-picker.css";

// How hard to try, 0 to 10, after the effort picker of Gentler Streak (Design Spells, spell 343). At rest a thin line;
// under the finger it swells into a drop, thin at the easy end, with a round head at the hard one. A caption over it
// says where the level was suggested; while the level is out of the usual range a solid tooltip takes its place, over
// the thumb, standing on a hatched block that runs from the range to the thumb. At the maximum the line comes alive: it
// glows, a charge runs along it into the head, and the stripes march. Everything that moves lives outside React, in
// Motion, on one animation frame loop.

export type EffortPickerLabels = {
  /** what it sets, for screen readers */
  label: string;
  /** the caption over the line at rest */
  suggested: string;
  /** the tooltip under the usual range */
  below: string;
  /** the tooltip over the usual range */
  above: string;
  /** the tooltip at the maximum */
  max: string;
  /** the caption under the usual range */
  usual: string;
  clear: string;
};

export type EffortPickerProps = {
  labels: EffortPickerLabels;
  /** the suggested level, 0…10, fractions allowed: it starts here, the caption stands over it, clear comes back */
  suggested: number;
  /** the user's usual range, in levels */
  usualRange: [number, number];
  /** the level, when the parent decides it; leave it out and the picker keeps it itself */
  value?: number;
  /** holds the drop swollen, as under a finger; leave it out and it follows the pointer and the keys */
  pressed?: boolean;
  /** a whole level the user went to: at each one crossed, and where the thumb is let go */
  onChange?: (level: number) => void;
  /** the user pressed the thumb or the line (true), or let go (false) */
  onPressedChange?: (pressed: boolean) => void;
  /** the user asked to go back to `suggested` */
  onClear?: () => void;
};

type Side = "below" | "above" | "max";

const TOP = 10; // the last level
const BAND = 37; // half the height of the hatched band; the axis runs through its middle
const THUMB = 15;
const GRIP = 22; // how far from its middle a press still takes the thumb: 44 px across
const LINE = 4; // half the line at rest
const TIP = 4.5; // the drop: the radius of its tip,
const HEAD = 28; // of its head at full width,
const BELLY = 0.22; // and how much its sides bow out of the straight line between them
const MARGIN = 14; // from the head to the edge of the box
const BEAT = 1.5; // the maximum's heartbeat, in seconds,
const HIT = 0.5; // and the part of it in which the charge runs along the line and reaches the head

// The colours as the reference's video shows them, in levels. RICH is the stretch between the thumb and the usual
// range, and the range itself; PALE is the rest of the line.
const RICH: [number, string][] = [
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
  [10, "#5f39c9"],
];

const PALE: [number, string][] = [
  [0, "#eef3f6"],
  [1.07, "#dbebfa"],
  [2.1, "#c5e5fe"],
  [3.2, "#fbe6b4"],
  [4.27, "#fdd0b1"],
  [5.24, "#ffc9b1"],
  [6.27, "#f6b2b3"],
  [6.66, "#f4b2b3"],
  [7.95, "#bdb0e6"],
  [10, "#beafe6"],
];

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (x: number, low: number, high: number) => Math.min(high, Math.max(low, x));
const round = (x: number) => Math.round(x * 100) / 100;
const smooth = (x: number) => {
  const t = clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
};

const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

function richAt(level: number) {
  const next = Math.max(1, RICH.findIndex(([at]) => at >= level));
  const [a, from] = RICH[next - 1];
  const [b, to] = RICH[next];
  const start = channels(from);
  const end = channels(to);
  const t = clamp((level - a) / (b - a), 0, 1);
  return `rgb(${start.map((value, i) => Math.round(lerp(value, end[i], t))).join(" ")})`;
}

/** A value that follows its target like a weight on a spring. */
class Spring {
  x: number;
  v = 0;
  to: number;
  stiffness: number;
  damping: number;

  constructor(value: number, stiffness: number, damping: number) {
    this.x = value;
    this.to = value;
    this.stiffness = stiffness;
    this.damping = damping;
  }

  /** One frame; tells whether it still moves. */
  step(dt: number, snap: boolean) {
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
    if (Math.abs(this.to - this.x) < 0.001 && Math.abs(this.v) < 0.01) {
      this.x = this.to;
      this.v = 0;
    }
    return true;
  }
}

/**
 * The drop, or at `swell` 0 the thin line: the envelope of circles along the axis, from the tip's to the head's, so
 * its sides run into both round ends without a seam. A circle stays centred on its level, so the thumb on the last
 * level sits in the very middle of the head.
 */
function radiusAt(u: number, head: number, swell: number) {
  return LINE + swell * (TIP - LINE + (head - TIP) * (u + BELLY * u * (1 - u)));
}

function outline(ax: number, bx: number, head: number, swell: number) {
  const length = bx - ax;
  const upper: string[] = [];
  const lower: string[] = [];
  for (let i = 0; i <= 32; i += 1) {
    const u = i / 32;
    const r = radiusAt(u, head, swell);
    const slope = (swell * (head - TIP) * (1 + BELLY * (1 - 2 * u))) / length;
    const x = round(ax + u * length - r * slope);
    const y = r * Math.sqrt(1 - slope * slope);
    upper.push(`${x} ${round(BAND - y)}`);
    lower.unshift(`${x} ${round(BAND + y)}`);
  }
  const start = round(radiusAt(0, head, swell));
  const end = round(radiusAt(1, head, swell));
  return `M${upper.join("L")}A${end} ${end} 0 1 1 ${lower.join("L")}A${start} ${start} 0 0 1 ${upper[0]}Z`;
}

/** Everything that moves, outside React. */
class Motion {
  root: HTMLElement;
  on: {
    level: (level: number, byHand: boolean) => void;
    pill: (on: boolean, side: Side) => void;
    moved: (moved: boolean) => void;
    pressed: (pressed: boolean) => void;
    ready: () => void;
  };
  from: number;
  to: number;
  suggested: number;
  held: boolean | undefined;

  width = 0;
  ax = 0;
  bx = 0;
  head = HEAD;
  hatchFrom = 0;
  hatchTo = 0;
  pillWidth = 0;

  target: number; // where the thumb is going
  slack = 0; // how far it still is from there, running out by itself
  grab = 0; // a press on the thumb keeps its offset from the pointer
  level: number;
  pointer = false;
  dragged = false;
  waiting: number | null = null; // a finger on the line, until it is clear what it wants
  holder = 0; // the pointer that pressed
  keysUntil = 0;
  byHand = false;
  pillOn = false;
  pillSide: Side = "above";
  letGoAt = 0;

  swell: Spring;
  charge: Spring; // the maximum: 0 is the line as it is, 1 is alive
  phase = 0; // where in the heartbeat it is
  flare = 0; // what is left of the last hit on the head
  march = 0; // how far the stripes have gone

  raf = 0;
  last = 0;
  dirty = true;
  reduced: MediaQueryList;
  observers: { disconnect(): void }[] = [];
  parts: Record<string, HTMLElement & SVGElement>;
  ticks: NodeListOf<Element>;

  constructor(root: HTMLElement, props: { value: number; from: number; to: number; suggested: number; held: boolean | undefined }, on: Motion["on"]) {
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
    root.querySelectorAll<HTMLElement & SVGElement>("[data-ep]").forEach((element) => {
      this.parts[element.dataset.ep as string] = element;
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

  x(level: number) {
    return this.ax + (level / TOP) * (this.bx - this.ax);
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
    // the grey hatch is centred on the suggestion and fades away from it; the usual range stays clean
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
  place(rect: Element, x0: number, x1: number) {
    rect.setAttribute("x", String(round(x0)));
    rect.setAttribute("width", String(round(Math.max(0, x1 - x0))));
  }

  /** Where a thing this wide starts when its middle is at x, kept inside the box. */
  along(x: number, width: number) {
    return clamp(x - width / 2, 6, Math.max(6, this.width - width - 6));
  }

  /** A point of the screen along the box, in the box's own pixels: it may stand under a zoom or a scale. */
  along0(clientX: number) {
    const box = this.parts.picker.getBoundingClientRect();
    return ((clientX - box.left) * this.width) / box.width;
  }

  levelAt(clientX: number) {
    return ((this.along0(clientX) - this.ax) / (this.bx - this.ax)) * TOP;
  }

  go(target: number, byHand: boolean) {
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
  press(clientX: number, finger: boolean, pointer: number) {
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

  follow = (event: globalThis.PointerEvent) => {
    if (event.pointerId === this.holder) this.drag(event.clientX);
  };

  letGo = (event: globalThis.PointerEvent) => {
    if (event.pointerId === this.holder) this.release(event.type === "pointercancel");
  };

  unfollow() {
    window.removeEventListener("pointermove", this.follow);
    window.removeEventListener("pointerup", this.letGo);
    window.removeEventListener("pointercancel", this.letGo);
  }

  jump(clientX: number) {
    this.grab = 0;
    this.dragged = true;
    this.pointer = true;
    this.on.pressed(true);
    this.go(clamp(this.levelAt(clientX), 0, TOP), true);
  }

  drag(clientX: number) {
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
  release(cancelled: boolean) {
    this.unfollow();
    if (this.waiting !== null && !cancelled) {
      // a tap on the line: there and back, with a moment of the drop to show it
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

  step(by: number) {
    this.go(clamp(Math.round(this.target) + by, 0, TOP), true);
    this.keysUntil = performance.now() + 900;
  }

  isDown(now: number) {
    return this.held ?? (this.pointer || now < this.keysUntil);
  }

  frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    const dt = clamp((now - this.last) / 1000, 0, 1 / 20); // a frame's time may be a little before `start`'s
    this.last = now;
    const snap = this.reduced.matches;

    const running = this.slack !== 0;
    this.slack = snap ? 0 : this.slack * Math.exp(-dt * 15);
    if (Math.abs(this.slack) < 0.003) this.slack = 0;

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
  beat(dt: number) {
    const before = this.phase;
    this.phase = (this.phase + dt / BEAT) % 1;
    if (before < HIT && this.phase >= HIT) {
      this.flare = 1;
      this.swell.v += 1.5;
    }
    this.flare *= Math.exp(-dt * 3.2);
    this.march += dt * 22;
  }

  tooltip(down: boolean, now: number) {
    // the suggestion needs no tooltip, however far out it is: only what the user moved it to
    const side: Side | null = this.target === this.suggested ? null : this.level === TOP ? "max" : this.target < this.from ? "below" : this.target > this.to ? "above" : null;
    // after the finger lifts, the tooltip stays a moment before the caption comes back
    const on = side !== null && (down || (this.pillOn && now - this.letGoAt < 500));
    if (on !== this.pillOn || (side && side !== this.pillSide)) {
      this.pillOn = on;
      if (side) this.pillSide = side;
      this.on.pill(on, this.pillSide);
    }
  }

  draw(shown: number) {
    const { ax, bx, head, parts } = this;
    const swell = clamp(this.swell.x, 0, 1.12);
    const solid = Math.min(swell, 1);
    const at = (level: number) => this.x(level);
    const thumb = at(shown);
    const low = at(this.from);
    const high = at(this.to);

    // near the top the colour spreads from the thumb in a circle, until it fills the head
    const full = smooth((shown - 9.3) / 0.7);
    const empty = smooth((0.7 - shown) / 0.7);
    const edge = thumb + full * (head + 1);

    const d = outline(ax, bx, head, swell);
    for (const name of ["glow", "pale", "rich", "sheen"]) parts[name].setAttribute("d", d);
    this.place(parts.window, at(Math.min(shown, this.from)), Math.max(thumb, high));
    parts.spread.setAttribute("cx", String(round(thumb)));
    parts.spread.setAttribute("r", String(round(full * (bx - thumb + head + 2))));

    // The block from the range to the thumb, in the line's colours; the grey hatch starts where it ends. Its far edge
    // is sharp along the line, as in the reference; around the head and the tip, where a cut would look crooked, the
    // stripes dissolve as the grey ones do.
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

    // the ticks: dots at rest, growing towards the head when swollen
    const size = head / HEAD;
    this.ticks.forEach((tick, i) => {
      const height = lerp(2.5, (2 + (17 * i) / 8) * size, swell);
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

const stops = (ramp: [number, string][]) => ramp.map(([at, colour]) => <stop key={at} offset={at / TOP} stopColor={colour} />);

/** How hard to try, from 0 to 10, with a tooltip over the thumb outside the usual range, and alive at the maximum. */
export function EffortPicker({ labels, suggested, usualRange, value, pressed, onChange, onPressedChange, onClear }: EffortPickerProps) {
  const [from, to] = usualRange;
  const start = value ?? suggested;
  const [level, setLevel] = useState(() => Math.round(start));
  const [pill, setPill] = useState<{ on: boolean; side: Side }>({ on: false, side: "above" });
  const [moved, setMoved] = useState(start !== suggested);
  const [ready, setReady] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const motion = useRef<Motion | null>(null);
  const report = useRef({ onChange, onPressedChange });
  const id = useId().replace(/\W/g, "");
  const name = (part: string) => `ep-${id}-${part}`;
  const url = (part: string) => `url(#${name(part)})`;

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
        ready: () => setReady(true),
      },
    );
    motion.current = running;
    return () => running.destroy();
    // the props below reach the running Motion through the effects after this one
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    if (value === undefined || !running || running.pointer || value === Math.round(running.target) || value === running.target) return;
    running.go(value, false);
  }, [value]);

  const press = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !motion.current) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    motion.current.press(event.clientX, event.pointerType === "touch", event.pointerId);
  };

  const keys = (event: KeyboardEvent) => {
    const by = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1, PageDown: -2, PageUp: 2, Home: -TOP, End: TOP }[event.key];
    if (!by || !motion.current) return;
    event.preventDefault();
    motion.current.step(by);
  };

  const clear = () => {
    motion.current?.go(suggested, false);
    // the button turns off under the keyboard's focus: it goes on to the thumb, or its place would be lost
    motion.current?.parts.thumb.focus({ preventScroll: true });
    onClear?.();
  };

  const zone = level === TOP ? labels.max : level < from ? labels.below : level > to ? labels.above : labels.usual;

  return (
    <div className="ep" ref={root} data-ready={ready || undefined}>
      <div className="ep-picker" data-ep="picker" onPointerDown={press}>
        <span className="ep-caption" data-ep="caption" data-hidden={pill.on || undefined} aria-hidden={pill.on}>
          {labels.suggested}
        </span>
        <span className="ep-pill" data-ep="pill" data-side={pill.side} data-on={pill.on || undefined} aria-hidden={!pill.on}>
          {labels[pill.side]}
        </span>

        {/* larger than the band, so the blur has room in every browser */}
        <svg className="ep-glow" data-ep="glow-box" aria-hidden="true">
          <g transform="translate(40 40)">
            <path data-ep="glow" fill={url("rich")} stroke={url("rich")} strokeWidth="9" />
          </g>
        </svg>

        <svg className="ep-shape" aria-hidden="true">
          <defs>
            <linearGradient id={name("rich")} data-ep="rich-ramp" gradientUnits="userSpaceOnUse" y1="0" y2="0">
              {stops(RICH)}
            </linearGradient>
            <linearGradient id={name("pale")} data-ep="pale-ramp" gradientUnits="userSpaceOnUse" y1="0" y2="0">
              {stops(PALE)}
            </linearGradient>
            <linearGradient id={name("fade")} data-ep="fade-ramp" gradientUnits="userSpaceOnUse" y1="0" y2="0">
              <stop offset="0" stopColor="#000" />
              <stop offset="0.18" stopColor="#fff" />
              <stop offset="0.6" stopColor="#fff" />
              <stop offset="1" stopColor="#000" />
            </linearGradient>
            <linearGradient id={name("end")} data-ep="end-ramp" gradientUnits="userSpaceOnUse" y1="0" y2="0">
              <stop offset="0" stopColor="#fff" />
              <stop offset="1" stopColor="#000" />
            </linearGradient>
            {/* the light that runs along the line at the maximum */}
            <linearGradient id={name("sheen")} data-ep="sheen-ramp" gradientUnits="userSpaceOnUse" y1="0" y2="0">
              <stop offset="0" stopColor="#fff" stopOpacity="0" />
              <stop offset="0.82" stopColor="#fff" stopOpacity="0.95" />
              <stop offset="1" stopColor="#fff" stopOpacity="0" />
            </linearGradient>
            <pattern id={name("stripes")} width="9.4" height="9.4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="2.8" height="9.4" fill="#fff" />
            </pattern>
            {/* the block's own: its stripes march at the maximum */}
            <pattern id={name("run")} data-ep="run" width="9.4" height="9.4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="2.8" height="9.4" fill="#fff" />
            </pattern>
            <mask id={name("hatch")} maskUnits="userSpaceOnUse" x="0" y="0" width="100%" height="100%">
              <rect width="100%" height="100%" fill={url("stripes")} />
            </mask>
            <mask id={name("marching")} maskUnits="userSpaceOnUse" x="0" y="0" width="100%" height="100%">
              <rect width="100%" height="100%" fill={url("run")} />
            </mask>
            <mask id={name("faded")} maskUnits="userSpaceOnUse" x="0" y="0" width="100%" height="100%">
              <rect width="100%" height="100%" fill={url("fade")} />
            </mask>
            <mask id={name("ending")} maskUnits="userSpaceOnUse" x="0" y="0" width="100%" height="100%">
              <rect width="100%" height="100%" fill={url("end")} />
            </mask>
            <clipPath id={name("window")}>
              <rect data-ep="window" y="0" height={BAND * 2} />
              <circle data-ep="spread" cy={BAND} />
            </clipPath>
          </defs>

          <g mask={url("faded")}>
            <g mask={url("hatch")} fill="var(--ep-hatch)">
              <rect data-ep="hatch-low" y="0" height={BAND * 2} />
              <rect data-ep="hatch-high" y="0" height={BAND * 2} />
            </g>
          </g>
          <g mask={url("ending")}>
            <g mask={url("marching")}>
              <rect data-ep="block" y="0" height={BAND * 2} fill={url("rich")} />
            </g>
          </g>
          <rect data-ep="edge-low" y="0" width="1" height={BAND * 2} />
          <rect data-ep="edge-high" y="0" width="1" height={BAND * 2} />
          <rect data-ep="data" y="0" width="1" height={BAND * 2} fill="var(--ep-edge)" />

          <path data-ep="pale" fill={url("pale")} />
          <path data-ep="rich" fill={url("rich")} clipPath={url("window")} />
          <path className="ep-sheen" data-ep="sheen" fill={url("sheen")} opacity="0" />
          <rect data-ep="divider" width="2" fill="#fff" />
          {Array.from({ length: TOP - 1 }, (_, i) => (
            <rect key={i} data-tick="" fill="#fff" />
          ))}
        </svg>

        <div
          className="ep-thumb"
          data-ep="thumb"
          role="slider"
          tabIndex={0}
          aria-label={labels.label}
          aria-valuemin={0}
          aria-valuemax={TOP}
          aria-valuenow={level}
          aria-valuetext={`${level}, ${zone}`}
          onKeyDown={keys}
        >
          <i data-ep="dot" />
        </div>

        <span className="ep-usual" data-ep="usual">
          {labels.usual}
        </span>
      </div>

      <button className="ep-clear" type="button" disabled={!moved} onClick={clear}>
        {labels.clear}
      </button>
    </div>
  );
}
