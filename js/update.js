/*
 * Update check for an installed PWA.
 *
 * Asking the browser for a new service worker is the only reliable way to learn
 * whether a newer version exists; there is no background updater on iOS. The
 * check is manual (a button in More → Settings) and reports one of:
 *   'unsupported' — no service worker in this browser
 *   'none'        — the app is running from cache with no registration
 *   'error'       — the update request failed (usually offline)
 *   'ready'       — a new version is downloaded and waiting
 *   'current'     — nothing newer on the server
 */

export async function checkForUpdates() {
  if (!('serviceWorker' in navigator)) return { status: 'unsupported' };
  let registration = null;
  try {
    registration = await navigator.serviceWorker.getRegistration();
  } catch (err) {
    return { status: 'error' };
  }
  if (!registration) return { status: 'none' };

  try {
    await registration.update();
  } catch (err) {
    return { status: 'error' };
  }

  let serverVersion = '';
  try {
    const response = await fetch(`./sw.js?ts=${Date.now()}`, { cache: 'no-store' });
    if (response.ok) {
      const text = await response.text();
      const match = text.match(/CACHE_VERSION\s*=\s*'([^']+)'/);
      if (match) serverVersion = match[1];
    }
  } catch (err) {
    /* the version string is a nicety; the waiting-worker check is the real test */
  }

  const ready = Boolean(registration.installing || registration.waiting);
  return { status: ready ? 'ready' : 'current', serverVersion };
}

/* Ask the waiting worker to take over, then reload into the new version. */
export async function applyUpdate() {
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    if (registration) {
      if (registration.waiting) registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      await registration.update();
    }
  } catch (err) {
    /* reload anyway: it may still pick up the new files */
  }
  setTimeout(() => {
    window.location.reload();
  }, 500);
}
