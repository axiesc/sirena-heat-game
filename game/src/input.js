// input.js — keyboard and mouse state, turned each frame into one plain control object the
// world steps from. The staged screenshot scenes build the same object by hand, so the game
// cannot tell a scripted driver from a person at the keys.

export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.pressedEdges = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.mouseDown = false;
    this.mouseRightDown = false;
    this.locked = false;
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressedEdges.add(e.code);
      if (['ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.mouseDown = false; this.mouseRightDown = false; });
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) this.mouseDown = true;
      if (e.button === 2) this.mouseRightDown = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseDown = false;
      if (e.button === 2) this.mouseRightDown = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX || 0;
      this.mouseDY += e.movementY || 0;
    });
  }

  requestLock(canvas) {
    if (!this.locked && canvas.requestPointerLock) canvas.requestPointerLock();
  }

  releaseLock() {
    if (this.locked && document.exitPointerLock) document.exitPointerLock();
  }

  /** True once per physical press; edges are cleared by endFrame(). */
  pressed(code) { return this.pressedEdges.has(code); }

  down(code) { return this.keys.has(code); }

  /**
   * The control object for one step. fwd/strafe are -1..1 in camera space; the world turns
   * them into movement for a walker or throttle/steering for a driver.
   */
  control() {
    const k = this.keys;
    const fwd = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    const strafe = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    return {
      fwd,
      strafe,
      sprint: k.has('ShiftLeft') || k.has('ShiftRight'),
      handbrake: k.has('Space'),
      fire: this.mouseDown,
      aim: this.mouseRightDown,
      interact: this.pressedEdges.has('KeyE'),
      enter: this.pressedEdges.has('KeyF'),
      pause: this.pressedEdges.has('Escape') || this.pressedEdges.has('KeyP'),
      radio: this.pressedEdges.has('KeyR'),
      weaponNext: this.pressedEdges.has('KeyQ') || this.pressedEdges.has('Tab'),
      mouseDX: this.mouseDX,
      mouseDY: this.mouseDY,
    };
  }

  endFrame() {
    this.pressedEdges.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
  }
}

/** A neutral control object (nothing pressed) — the base the shot scenes script from. */
export function idleControl() {
  return {
    fwd: 0, strafe: 0, sprint: false, handbrake: false, fire: false, aim: false,
    interact: false, enter: false, pause: false, radio: false, weaponNext: false,
    mouseDX: 0, mouseDY: 0,
  };
}
