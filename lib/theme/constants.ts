export const THEME_STORAGE_KEY = "monex-theme";
export const THEME_CHANGE_EVENT = "monex-theme-change";

/** "system" means: follow the operating system setting. */
export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

/**
 * Runs before first paint (inlined in <head>) so the correct theme is applied
 * without a flash. Keep it tiny, dependency-free and wrapped in try/catch.
 */
export const themeInitScript = `(function(){try{var p=localStorage.getItem("${THEME_STORAGE_KEY}");var d=p==="dark"||((!p||p==="system")&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.setAttribute("data-theme",d?"dark":"light");}catch(e){}})();`;
