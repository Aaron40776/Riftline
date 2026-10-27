// The limits of the button layout (ui/hud-layout.js), shared with the save cleaner (core/save.js) so that a saved
// value never leaves the range of its slider: the movable controls, the size of a control (times its default size),
// the opacity of the buttons and the stick size.

export const HUD_CONTROL_IDS = ["dash", "nova", "gadget", "pause"],
  HUD_LIMITS = { size: [0.6, 1.6], alpha: [0.3, 1], stick: [0.7, 1.5] };
