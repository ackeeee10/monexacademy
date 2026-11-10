import { THEME_CHANGE_EVENT, THEME_STORAGE_KEY, type ResolvedTheme, type ThemePreference } from "./constants";

const MEDIA_QUERY = "(prefers-color-scheme: dark)";

function readPreference(): ThemePreference {
  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY);
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return "system";
  }
}

export function getResolvedTheme(): ResolvedTheme {
  const preference = readPreference();
  if (preference !== "system") return preference;
  return window.matchMedia(MEDIA_QUERY).matches ? "dark" : "light";
}

function apply(theme: ResolvedTheme): void {
  document.documentElement.setAttribute("data-theme", theme);
}

export function setThemePreference(preference: ThemePreference): void {
  try {
    if (preference === "system") window.localStorage.removeItem(THEME_STORAGE_KEY);
    else window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Storage can be unavailable (private mode); the theme still applies for this visit.
  }
  apply(preference === "system" ? getResolvedTheme() : preference);
  window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
}

/** Subscribe for useSyncExternalStore: user toggles, other tabs and OS changes. */
export function subscribeToTheme(onChange: () => void): () => void {
  const media = window.matchMedia(MEDIA_QUERY);
  const onSystemChange = () => {
    if (readPreference() === "system") apply(getResolvedTheme());
    onChange();
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key !== THEME_STORAGE_KEY) return;
    apply(getResolvedTheme());
    onChange();
  };

  window.addEventListener(THEME_CHANGE_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  media.addEventListener("change", onSystemChange);
  return () => {
    window.removeEventListener(THEME_CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
    media.removeEventListener("change", onSystemChange);
  };
}
