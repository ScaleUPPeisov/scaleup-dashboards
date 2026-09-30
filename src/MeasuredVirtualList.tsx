import React,{useCallback,useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';

type Range={start:number;end:number};

type Props<T>={
  items:T[];
  getKey:(item:T)=>string;
  estimateSize?:number;
  overscan?:number;
  className?:string;
  renderItem:(item:T,index:number)=>React.ReactNode;
};

export function MeasuredVirtualList<T>({items,getKey,estimateSize=112,overscan=7,className='',renderItem}:Props<T>){
  const viewportRef=useRef<HTMLDivElement|null>(null);
  const sizeByKey=useRef(new Map<string,number>());
  const frameRef=useRef(0);
  const [measureRevision,setMeasureRevision]=useState(0);
  const [range,setRange]=useState<Range>({start:0,end:Math.min(items.length,24)});

  const layout=useMemo(()=>{
    const offsets=new Array<number>(items.length+1);
    offsets[0]=0;
    for(let i=0;i<items.length;i++){
      const key=getKey(items[i]);
      offsets[i+1]=offsets[i]+(sizeByKey.current.get(key)||estimateSize);
    }
    return {offsets,total:offsets[items.length]||0};
  },[items,getKey,estimateSize,measureRevision]);

  const indexAt=useCallback((offset:number)=>{
    const a=layout.offsets;
    let lo=0,hi=Math.max(0,items.length-1),ans=0;
    while(lo<=hi){
      const mid=(lo+hi)>>1;
      if(a[mid]<=offset){ans=mid;lo=mid+1}else hi=mid-1;
    }
    return Math.min(Math.max(0,ans),Math.max(0,items.length-1));
  },[layout.offsets,items.length]);

  const updateRange=useCallback(()=>{
    const el=viewportRef.current;
    if(!el||!items.length){
      setRange(r=>r.start===0&&r.end===0?r:{start:0,end:0});
      return;
    }
    const first=indexAt(el.scrollTop);
    const last=indexAt(el.scrollTop+el.clientHeight);
    const next={start:Math.max(0,first-overscan),end:Math.min(items.length,last+overscan+1)};
    setRange(prev=>prev.start===next.start&&prev.end===next.end?prev:next);
  },[indexAt,items.length,overscan]);

  useLayoutEffect(()=>{updateRange()},[updateRange,layout.total]);

  useEffect(()=>{
    const el=viewportRef.current;if(!el)return;
    const onScroll=()=>{
      if(frameRef.current)return;
      frameRef.current=requestAnimationFrame(()=>{frameRef.current=0;updateRange()});
    };
    el.addEventListener('scroll',onScroll,{passive:true});
    const ro=new ResizeObserver(()=>updateRange());
    ro.observe(el);
    return()=>{el.removeEventListener('scroll',onScroll);ro.disconnect();if(frameRef.current)cancelAnimationFrame(frameRef.current)};
  },[updateRange]);

  const measure=useCallback((key:string,height:number)=>{
    const rounded=Math.max(1,Math.ceil(height));
    const prev=sizeByKey.current.get(key);
    if(prev===rounded)return;
    sizeByKey.current.set(key,rounded);
    setMeasureRevision(x=>x+1);
  },[]);

  return <div ref={viewportRef} className={`virtualScrollViewport ${className}`} data-virtualized-list="true" data-mounted-rows={Math.max(0,range.end-range.start)} data-total-rows={items.length}>
    <div className="virtualScrollCanvas" style={{height:layout.total}}>
      {items.slice(range.start,range.end).map((item,localIndex)=>{
        const index=range.start+localIndex;
        const key=getKey(item);
        return <MeasuredVirtualRow key={key} rowKey={key} top={layout.offsets[index]} onMeasure={measure}>
          {renderItem(item,index)}
        </MeasuredVirtualRow>;
      })}
    </div>
  </div>;
}

function MeasuredVirtualRow({rowKey,top,onMeasure,children}:{rowKey:string;top:number;onMeasure:(key:string,height:number)=>void;children:React.ReactNode}){
  const ref=useRef<HTMLDivElement|null>(null);
  useLayoutEffect(()=>{
    const el=ref.current;if(!el)return;
    const report=()=>onMeasure(rowKey,el.getBoundingClientRect().height);
    report();
    const ro=new ResizeObserver(report);ro.observe(el);
    return()=>ro.disconnect();
  },[rowKey,onMeasure]);
  return <div ref={ref} className="virtualMeasuredRow" data-virtual-row={rowKey} style={{transform:`translateY(${top}px)`}}>{children}</div>;
}
