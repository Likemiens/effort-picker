# Effort Picker — notes for coding agents

`<EffortPicker>` is a React component: how hard something should try, from 0 to 10. A thin line swells into a drop under the finger, a tooltip stands over it outside the usual range, and at the maximum the bar comes alive. It only draws and reports what the user chose. The suggestion, the range and the saving stay in the app.

## Install

`npm i @likemiens/effort-picker`, then `import { EffortPicker } from "@likemiens/effort-picker"`: JavaScript with its types, and it imports its CSS itself. Or copy `effort-picker.tsx` and `effort-picker.css` into the app, side by side, and import from `./effort-picker`. It starts with `"use client"` and needs React 18 or newer, nothing else. `example.tsx` is a complete, typed usage.

## Contract

```tsx
import { EffortPicker, type EffortPickerLabels, type EffortPickerProps } from "@likemiens/effort-picker";

<EffortPicker
  labels={labels}          // required: EffortPickerLabels, 7 strings
  suggested={4.44}         // required: 0…10, fractions allowed
  usualRange={[2.25, 4.14]} // required: in levels
  value={level}            // leave it out and the picker keeps the level itself
  pressed={held}           // leave it out and the drop follows the pointer and the keys
  onChange={(level) => {}}  // a whole level: at each one crossed, and where the thumb is let go
  onPressedChange={(pressed) => {}}
  onClear={() => {}}       // the user went back to `suggested`
/>
```

Labels: `label suggested below above max usual clear`. Colours: `--ep-surface --ep-dim --ep-hatch --ep-edge --ep-below --ep-above --ep-accent --ep-off`; the picker declares them on `.ep`, so set them with a more specific selector, such as `.effort .ep`. Keyboard on the thumb: ← → ↑ ↓ one level, Page Up and Page Down two, Home and End to the ends.

## Recipes

**Keep it in your own state.** Pass `value` and answer `onChange` and `onClear`. A new `value` sends the thumb there; while a hand holds the thumb, `value` is ignored, so answering `onChange` never fights the drag.

```tsx
const [effort, setEffort] = useState(suggested);

<EffortPicker labels={labels} suggested={suggested} usualRange={range} value={effort} onChange={setEffort} onClear={() => setEffort(suggested)} />
```

**Save once, when the hand lets go.** `onChange` fires at each level crossed. Keep the last one, and save it on `onPressedChange(false)`. Keys and a tap on the line report through `onChange` alone.

```tsx
const last = useRef(suggested);

<EffortPicker
  labels={labels}
  suggested={suggested}
  usualRange={range}
  onChange={(level) => { last.current = level; }}
  onPressedChange={(pressed) => { if (!pressed) save(last.current); }}
/>
```

**Show one state in a demo.** Pass `value` and `pressed`, for example `value={10} pressed` for the maximum under a finger. When the user presses, `onPressedChange(true)` comes: pass `undefined` from then on, so the drop follows the hand again.

## Gotchas

- **It keeps the level itself** unless you pass `value`. At rest the level is whole; only `suggested` may stay fractional.
- **The tooltip needs a move.** A press alone keeps the caption, and so does the level at `suggested`, however far out of the range that is.
- **The maximum runs for as long as the level stays at 10,** at rest too, and rests only off-screen or with "reduce motion", which leaves a steady glow.
- **`suggested` and `usualRange` are in levels,** 0…10, not pixels or percents.
- **Width:** it fills its parent up to 420 px and measures itself, so it fits a phone. Its height is fixed, about 190 px.
- **Under a zoom or a scale** the pointer still lands right: it measures on the screen and converts.
- `font-family: var(--ui-font, inherit)`: it uses the page's font unless the variable is set.
- **Next.js:** the App Router is fine; render it from a client component, because it takes functions. The Pages Router allows global CSS only in `pages/_app`: move `import "./effort-picker.css"` there.

## Don't

- Don't write words into the component: pass `labels`. Screen readers rely on `label` and on the word of the level's zone.
- Don't drive `value` every frame: it is for whole levels and the odd jump. A hand on the thumb is already followed exactly.
- Don't scale the thumb on press or change how it's held: it follows the pointer exactly, by design.
- Don't redraw the line with a rectangle and `border-radius`: the outline is one SVG path, the envelope of circles along the axis, so the sides run into both round ends without a seam.
