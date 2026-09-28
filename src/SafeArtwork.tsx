import React,{useState} from 'react';
import './v401.css';

export function SafeArtwork({src,alt='',className='',fallback='V'}:{src:string;alt?:string;className?:string;fallback?:string}){
  const [failed,setFailed]=useState(false);
  if(failed||!src){
    return <span className={`${className} safeArtworkFallback`.trim()} role="img" aria-label={alt||'VYRON'}>{fallback}</span>;
  }
  return <img className={className} src={src} alt={alt} onError={()=>setFailed(true)}/>;
}
