/** Serialises render scans and keeps background polling below the render-fact TTL. */
export const VISIBLE_RENDER_SCAN_MS=7_000;
export const HIDDEN_RENDER_SCAN_MS=12_000;

type RenderScanSchedulerOptions={
  scan:()=>Promise<void>;
  isVisible:()=>boolean;
  onError?:(error:unknown)=>void;
};

export function createRenderScanScheduler({scan,isVisible,onError}:RenderScanSchedulerOptions){
  let stopped=false,enabled=false,running=false,pending=false,timer:ReturnType<typeof setTimeout>|undefined;
  const clear=()=>{if(timer!==undefined){clearTimeout(timer);timer=undefined}};
  const arm=()=>{
    clear();
    if(stopped||!enabled)return;
    timer=setTimeout(()=>{timer=undefined;request()},isVisible()?VISIBLE_RENDER_SCAN_MS:HIDDEN_RENDER_SCAN_MS);
  };
  const run=async()=>{
    if(stopped||!enabled)return;
    if(running){pending=true;return}
    running=true;
    try{await scan()}catch(error){onError?.(error)}finally{
      running=false;
      if(stopped||!enabled)return;
      if(pending){pending=false;void run()}else arm();
    }
  };
  const request=()=>{if(stopped)return;enabled=true;clear();void run()};
  const visibilityChanged=()=>{
    if(stopped||!enabled)return;
    if(isVisible())request();
    else if(!running)arm();
  };
  const pause=()=>{enabled=false;pending=false;clear()};
  const stop=()=>{stopped=true;pause()};
  return{request,visibilityChanged,pause,stop};
}
