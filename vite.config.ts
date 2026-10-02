import {defineConfig,loadEnv} from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({mode})=>{
  const env=loadEnv(mode,'.','VITE_');
  const config:any={
    plugins:[react()],
    clearScreen:false,
    server:{port:1421,strictPort:true},
    envPrefix:['VITE_','TAURI_'],
    build:{target:'es2022',minify:'esbuild',sourcemap:false}
  };
  if(env.VITE_YT_PAINT_DIAG==='1')config.resolve={alias:{'react-dom/client':'react-dom/profiling'}};
  return config;
});
