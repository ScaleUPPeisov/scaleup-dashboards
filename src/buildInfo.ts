export const VYRON_PRODUCT_NAME='VYRON YT PEISOV';
export const VYRON_PRODUCT_SUBTITLE='YouTube Production OS';
const viteEnv=(import.meta as ImportMeta & {env?:Record<string,string|undefined>}).env;
export const VYRON_BUILD_DATE=(viteEnv?.VITE_BUILD_DATE||'development').trim();
