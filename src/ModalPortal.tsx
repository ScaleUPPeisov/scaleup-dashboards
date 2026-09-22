import React,{useEffect,useRef} from 'react';
import {createPortal} from 'react-dom';

export function ModalPortal({children,onClose,closeOnBackdrop=true,closeOnEscape=true,className='modalBackdrop'}:{children:React.ReactNode;onClose?:()=>void;closeOnBackdrop?:boolean;closeOnEscape?:boolean;className?:string}){
 const previousFocus=useRef<HTMLElement|null>(null);
 const rootRef=useRef<HTMLDivElement|null>(null);
 useEffect(()=>{
  previousFocus.current=document.activeElement instanceof HTMLElement?document.activeElement:null;
  const scrollX=window.scrollX,scrollY=window.scrollY;
  const onKey=(e:KeyboardEvent)=>{
   if(e.key==='Escape'&&closeOnEscape&&onClose){e.preventDefault();onClose();return}
   if(e.key!=='Tab')return;
   const root=rootRef.current;if(!root)return;
   const focusable=Array.from(root.querySelectorAll<HTMLElement>('button:not([disabled]),[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')).filter(x=>x.offsetParent!==null);
   if(!focusable.length){e.preventDefault();root.focus();return}
   const first=focusable[0],last=focusable[focusable.length-1],active=document.activeElement;
   if(e.shiftKey&&active===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&active===last){e.preventDefault();first.focus()}
  };
  document.addEventListener('keydown',onKey);
  requestAnimationFrame(()=>{const target=rootRef.current?.querySelector<HTMLElement>('[autofocus],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])');target?.focus({preventScroll:true});window.scrollTo(scrollX,scrollY)});
  return()=>{document.removeEventListener('keydown',onKey);previousFocus.current?.focus({preventScroll:true});window.scrollTo(scrollX,scrollY)}
 },[onClose,closeOnEscape]);
 return createPortal(<div ref={rootRef} className={className} role="presentation" tabIndex={-1} onMouseDown={e=>{if(e.target===e.currentTarget&&closeOnBackdrop&&onClose)onClose()}}>{children}</div>,document.body)
}
