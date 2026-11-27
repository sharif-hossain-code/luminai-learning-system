export type Theme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'luminai-theme';

/**
 * Runs before first paint so a saved dark preference doesn't flash light.
 * Light is the product default; only an explicit saved choice switches to dark.
 */
export const THEME_INIT_SCRIPT = `try{if(localStorage.getItem('${THEME_STORAGE_KEY}')==='dark'){document.documentElement.dataset.theme='dark'}}catch(e){}`;
