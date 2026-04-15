export type UiTheme = "soft" | "retro" | "minimal";

const STORAGE_KEY = "pocketPet_uiTheme_v1";

export function getTheme(): UiTheme {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "soft" || v === "retro" || v === "minimal") return v;
  } catch {
    /* ignore */
  }
  return "soft";
}

export function setTheme(theme: UiTheme): void {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* ignore */
  }
  document.documentElement.dataset.theme = theme;
}

export function mountThemeBar(): void {
  const sel = document.getElementById("theme-select") as HTMLSelectElement | null;
  if (!sel) return;
  sel.value = getTheme();
  document.documentElement.dataset.theme = getTheme();
  sel.addEventListener("change", () => {
    setTheme(sel.value as UiTheme);
  });
}
