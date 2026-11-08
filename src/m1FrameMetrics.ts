export type FrameMetrics={fps:number;p50:number;p95:number;p99:number;worst:number;dropped:number;long50:number;long100:number};

/** Full-round intervals, never the FPS overlay's rolling 360-frame window.
 * Keep stalls >= 1 second; discarding them would reward a frozen UI.
 * dropped is the percentage of observed intervals >20ms, not inferred GPU frames.
 * long50/100 count rAF intervals, independently of the optional Long Tasks API. */
export function summarizeFrameIntervals(intervals:readonly number[]):FrameMetrics|null{
 if(!intervals.length||intervals.some(ms=>!Number.isFinite(ms)||ms<=0))return null;
 const sorted=[...intervals].sort((a,b)=>a-b);
 const percentile=(p:number)=>sorted[Math.min(sorted.length-1,Math.floor((sorted.length-1)*p))];
 const duration=intervals.reduce((sum,ms)=>sum+ms,0);
 return{fps:1000*intervals.length/duration,p50:percentile(.5),p95:percentile(.95),p99:percentile(.99),
  worst:sorted[sorted.length-1],dropped:intervals.filter(ms=>ms>20).length/intervals.length*100,
  long50:intervals.filter(ms=>ms>50).length,long100:intervals.filter(ms=>ms>100).length};
}

export function meetsM1FrameTarget(metrics:FrameMetrics|null):boolean{
 return metrics!==null&&metrics.fps>=59&&metrics.p50<=17.5&&metrics.p95<=20.5&&
  metrics.p99<=33.5&&metrics.dropped<1&&metrics.long50===0;
}
