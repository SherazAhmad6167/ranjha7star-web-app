/**
 * Which WhatsApp app customer messages go out from, chosen in Settings.
 * Stored per device: it depends on which apps that phone/PC has installed.
 */
export type WhatsappApp = 'whatsapp' | 'business';

const STORAGE_KEY = 'whatsappApp';

const ANDROID_PACKAGES: Record<WhatsappApp, string> = {
  whatsapp: 'com.whatsapp',
  business: 'com.whatsapp.w4b',
};

/** null until the user picks one in Settings. */
export function getWhatsappApp(): WhatsappApp | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'whatsapp' || value === 'business' ? value : null;
  } catch {
    return null;
  }
}

export function setWhatsappApp(app: WhatsappApp) {
  try {
    localStorage.setItem(STORAGE_KEY, app);
  } catch {}
}

/**
 * Opens `phone`'s chat (international digits, e.g. 923001234567) with `text`
 * typed in. On an Android browser the chosen app is targeted through an
 * intent link; elsewhere it's the usual wa.me link, since WhatsApp Web /
 * Desktop just uses whichever account is linked to it.
 */
export function openWhatsApp(phone: string, text: string) {
  const webUrl = `https://wa.me/${phone || ''}?text=${encodeURIComponent(text || '')}`;
  const app = getWhatsappApp();

  if (app && /Android/i.test(navigator.userAgent)) {
    const params = [
      phone ? `phone=${encodeURIComponent(phone)}` : '',
      text ? `text=${encodeURIComponent(text)}` : '',
    ].filter(Boolean).join('&');
    // Falls back to wa.me when the chosen app isn't installed.
    window.location.href =
      `intent://send/?${params}#Intent;scheme=whatsapp;` +
      `package=${ANDROID_PACKAGES[app]};` +
      `S.browser_fallback_url=${encodeURIComponent(webUrl)};end`;
    return;
  }

  window.open(webUrl, '_blank');
}
