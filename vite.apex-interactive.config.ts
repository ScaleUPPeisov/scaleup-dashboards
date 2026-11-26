import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
 plugins:[react()],base:'./',publicDir:false,envPrefix:'APEX_FIXTURE_PUBLIC_',
 build:{target:'es2022',sourcemap:false,rollupOptions:{input:'apex-interactive.html'}}
});
