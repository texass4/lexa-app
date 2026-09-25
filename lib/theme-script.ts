export const THEME_STORAGE_KEY = "lexa:theme"

/** Executado antes da hidratação para evitar flash de tema incorreto. */
export const themeInitScript = `try{if(localStorage.getItem('${THEME_STORAGE_KEY}')==='dark'){document.documentElement.classList.add('dark');document.documentElement.style.colorScheme='dark'}}catch(e){}`
