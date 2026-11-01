"use client";

import { useState } from "react";
import { EffortPicker, type EffortPickerLabels } from "@likemiens/effort-picker";

const labels: EffortPickerLabels = {
  label: "How hard to think",
  suggested: "Source: trust me bro",
  below: "LGTM, ship it",
  above: "Burning tokens",
  max: "Ultrathink",
  usual: "Comfort zone",
  clear: "Reset",
};

const SUGGESTED = 4.44;

export function AgentEffort() {
  const [effort, setEffort] = useState(SUGGESTED);

  return (
    <>
      <EffortPicker
        labels={labels}
        suggested={SUGGESTED} // it starts here, the caption stands over it, reset comes back to it
        usualRange={[2.25, 4.14]}
        onChange={setEffort} // a whole level: at each one crossed, and where the thumb is let go
        onClear={() => setEffort(SUGGESTED)}
      />
      <p>The agent will think at {Math.round(effort)} of 10.</p>
    </>
  );
}
