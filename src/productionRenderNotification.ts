import type {RenderObservation} from './productionRenderTransitions';

/** A cleanup prompt represents both transitions only when that prompt is enabled. */
export function renderCompletionsToNotify(rendered:RenderObservation[],cleanupPolicy:string|undefined){
 return rendered.filter(row=>row.phase!=='SAFE_TO_CLEAN'||cleanupPolicy!=='prompt');
}
