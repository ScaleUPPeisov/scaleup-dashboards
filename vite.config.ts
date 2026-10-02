import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(()=>{
  const profiling=process.env.VITE_YT_PAINT_DIAG==='1';
  return{
    plugins:[react()],
    clearScreen:false,
    server:{port:1421,strictPort:true},
    envPrefix:['VITE_','TAURI_'],
    resolve:profiling?{alias:{'react-dom/client':'react-dom/profiling'}}:undefined,
    build:{target:'es2022',minify:'esbuild',sourcemap:false}
  };
});
