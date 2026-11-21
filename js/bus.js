/*
 * Tiny event bus so views can register handlers without importing the app shell
 * (which would be a circular import).
 */

export const actions = new Map();
export const formHandlers = new Map();

let renderer = null;

export function onAction(name, handler) {
  actions.set(name, handler);
}

export function onForm(name, handler) {
  formHandlers.set(name, handler);
}

export function setRenderer(fn) {
  renderer = fn;
}

export function rerender() {
  if (renderer) renderer();
}

/* Navigate to a hash route; re-render if we are already there. */
export function go(hash) {
  const target = hash.startsWith('#') ? hash : `#${hash}`;
  if (location.hash === target) {
    rerender();
    return;
  }
  location.hash = target;
}

export function dispatchAction(name, element) {
  const handler = actions.get(name);
  if (!handler) return false;
  handler(element);
  return true;
}
