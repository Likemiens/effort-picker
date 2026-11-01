import "./effort-picker.css";
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
/** How hard to try, from 0 to 10, with a tooltip over the thumb outside the usual range, and alive at the maximum. */
export declare function EffortPicker({ labels, suggested, usualRange, value, pressed, onChange, onPressedChange, onClear }: EffortPickerProps): import("react/jsx-runtime").JSX.Element;
