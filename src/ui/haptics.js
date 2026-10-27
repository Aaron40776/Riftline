// 3.45.4: haptics for phones where navigator.vibrate does not exist (iOS Safari). Safari 17.4
// ships the switch checkbox (<input type="checkbox" switch>) and iOS 18+ plays a short Taptic
// tick when one is toggled, so an invisible one toggled by code buzzes the phone on most iOS
// versions. Apple's 26.5 patch silenced the code path (a physical tap on a real switch still
// ticks; iOS 27 restored it), so this is best effort by design: it either ticks or stays
// silent, and nothing from inside the page can tell which. Toggling an invisible checkbox is
// harmless everywhere else, so the shim simply ships for every coarse pointer without
// navigator.vibrate (Firefox Android dropped that API and gets a silent checkbox out of it).

let rlSwitch = null, // the hidden switch input, created once
  rlSwitchOn = false, // alternating state: a tick is a change, not a value
  rlLastTick = 0; // performance.now() of the last toggle, so rapid hits do not stack

function coarsePointer() {
  return typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
}

/* what this device can do, for the settings note: "native" (navigator.vibrate), "tick" (the
   iOS switch, which may or may not sound) or "none" (a connected controller still rumbles) */
export function hapticMode() {
  if (typeof navigator !== "undefined" && navigator.vibrate && coarsePointer()) return "native";
  if (coarsePointer() && rlEnsureSwitch()) return "tick";
  return "none";
}

/* one short tick; true when the tick path ran (the native call stays with the caller) */
export function hapticTick() {
  if (!coarsePointer()) return false;
  const el = rlEnsureSwitch();
  if (!el) return false;
  const now = performance.now();
  if (now - rlLastTick < 60) return true; // a tick is already playing; do not stack them
  rlLastTick = now;
  rlSwitchOn = !rlSwitchOn;
  el.checked = rlSwitchOn; // the change of state is the tick
  return true;
}

function rlEnsureSwitch() {
  if (rlSwitch) return rlSwitch;
  if (typeof document === "undefined" || !document.body) return null;
  try {
    rlSwitch = document.createElement("input");
    rlSwitch.type = "checkbox";
    rlSwitch.setAttribute("switch", ""); // Safari 17.4+: renders (and ticks) as a switch
    rlSwitch.setAttribute("aria-hidden", "true");
    rlSwitch.tabIndex = -1;
    // rendered but invisible: display:none would leave it out of the layout entirely
    rlSwitch.style.cssText =
      "position:fixed;left:0;top:0;width:28px;height:28px;margin:0;border:0;padding:0;opacity:0;pointer-events:none;z-index:-1";
    document.body.appendChild(rlSwitch);
    rlSwitch.checked = false;
    rlSwitchOn = false;
  } catch {
    rlSwitch = null;
  }
  return rlSwitch;
}
