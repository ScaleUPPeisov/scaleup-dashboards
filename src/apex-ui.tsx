import React, {forwardRef, useId, useRef} from 'react';
import {ModalPortal} from './ModalPortal';
import './apex-ui.css';

const classes=(...parts:Array<string|false|undefined>)=>parts.filter(Boolean).join(' ');
type ButtonTone='primary'|'secondary'|'danger'|'ghost';
type ButtonProps=React.ButtonHTMLAttributes<HTMLButtonElement>&{tone?:ButtonTone;busy?:boolean};

/** The label remains visible while a pending action disables the control. */
export const Button=forwardRef<HTMLButtonElement,ButtonProps>(function Button(
 {tone='secondary',busy=false,disabled,type='button',className,children,...props},ref
){
 return <button {...props} ref={ref} type={type} disabled={disabled||busy} aria-busy={busy||undefined}
  className={classes('apexUi-button',`apexUi-button--${tone}`,className)}>{children}</button>;
});

type IconButtonProps=Omit<ButtonProps,'children'|'aria-label'>&{label:string;icon:React.ReactNode};
export const IconButton=forwardRef<HTMLButtonElement,IconButtonProps>(function IconButton(
 {label,icon,className,...props},ref
){
 return <Button {...props} ref={ref} aria-label={label} className={classes('apexUi-iconButton',className)}><span aria-hidden="true">{icon}</span></Button>;
});

type FieldProps={label:string;hint?:string;error?:string};
type InputProps=Omit<React.InputHTMLAttributes<HTMLInputElement>,'size'>&FieldProps;
export const Input=forwardRef<HTMLInputElement,InputProps>(function Input(
 {id,label,hint,error,className,'aria-describedby':describedBy,...props},ref
){
 const fallback=useId(),fieldId=id||fallback,hintId=`${fieldId}-hint`,errorId=`${fieldId}-error`;
 const described=classes(describedBy,hint&&hintId,error&&errorId)||undefined;
 return <div className="apexUi-field"><label htmlFor={fieldId}>{label}</label>
  <input {...props} ref={ref} id={fieldId} aria-invalid={error?true:props['aria-invalid']} aria-describedby={described} className={classes('apexUi-control',className)}/>
  {hint&&<small id={hintId} className="apexUi-hint">{hint}</small>}{error&&<small id={errorId} className="apexUi-error" role="alert">{error}</small>}
 </div>;
});

type SelectProps=React.SelectHTMLAttributes<HTMLSelectElement>&FieldProps;
export const Select=forwardRef<HTMLSelectElement,SelectProps>(function Select(
 {id,label,hint,error,className,children,'aria-describedby':describedBy,...props},ref
){
 const fallback=useId(),fieldId=id||fallback,hintId=`${fieldId}-hint`,errorId=`${fieldId}-error`;
 const described=classes(describedBy,hint&&hintId,error&&errorId)||undefined;
 return <div className="apexUi-field"><label htmlFor={fieldId}>{label}</label>
  <select {...props} ref={ref} id={fieldId} aria-invalid={error?true:props['aria-invalid']} aria-describedby={described} className={classes('apexUi-control',className)}>{children}</select>
  {hint&&<small id={hintId} className="apexUi-hint">{hint}</small>}{error&&<small id={errorId} className="apexUi-error" role="alert">{error}</small>}
 </div>;
});

type ChoiceProps=Omit<React.InputHTMLAttributes<HTMLInputElement>,'type'>&{label:string;description?:string};
function Choice({kind,label,description,id,className,...props}:ChoiceProps&{kind:'checkbox'|'switch'}){
 const fallback=useId(),fieldId=id||fallback,descriptionId=`${fieldId}-description`;
 const described=classes(props['aria-describedby'],description&&descriptionId)||undefined;
 return <label className={classes('apexUi-choice',kind==='switch'&&'apexUi-choice--switch',className)} htmlFor={fieldId}>
  <input {...props} id={fieldId} type="checkbox" role={kind==='switch'?'switch':undefined} aria-describedby={described}/>
  <span><span className="apexUi-choiceLabel">{label}</span>{description&&<small id={descriptionId}>{description}</small>}</span>
 </label>;
}
export function Checkbox(props:ChoiceProps){return <Choice {...props} kind="checkbox"/>}
export function Switch(props:ChoiceProps){return <Choice {...props} kind="switch"/>}

type BadgeTone='neutral'|'success'|'warning'|'error'|'accent';
export function Badge({tone='neutral',children,className,...props}:React.HTMLAttributes<HTMLSpanElement>&{tone?:BadgeTone}){
 return <span {...props} className={classes('apexUi-badge',`apexUi-badge--${tone}`,className)}>{children}</span>;
}

export function PageHeader({eyebrow,title,description,actions}:{eyebrow?:string;title:string;description?:string;actions?:React.ReactNode}){
 return <header className="apexUi-pageHeader"><div>{eyebrow&&<span className="apexUi-eyebrow">{eyebrow}</span>}<h1>{title}</h1>{description&&<p>{description}</p>}</div>{actions&&<div className="apexUi-actions">{actions}</div>}</header>;
}
export function EmptyState({title,description,action}:{title:string;description?:string;action?:React.ReactNode}){
 return <div className="apexUi-state"><strong>{title}</strong>{description&&<p>{description}</p>}{action&&<div>{action}</div>}</div>;
}
export function ErrorState({title,description,action}:{title:string;description?:string;action?:React.ReactNode}){
 return <div className="apexUi-state apexUi-state--error" role="alert"><strong>{title}</strong>{description&&<p>{description}</p>}{action&&<div>{action}</div>}</div>;
}

type TabItem={id:string;label:string;disabled?:boolean;tabId?:string;panelId?:string};
type TabsProps={label:string;items:readonly TabItem[];value:string;onValueChange:(value:string)=>void;className?:string};
/** Arrow keys move focus and select the next enabled tab. */
export function Tabs({label,items,value,onValueChange,className}:TabsProps){
 const refs=useRef(new Map<string,HTMLButtonElement>());
 // A removed or newly disabled selection must not make the entire tablist
 // unreachable by keyboard while the caller reconciles its controlled value.
 const focusId=items.find(item=>item.id===value&&!item.disabled)?.id||items.find(item=>!item.disabled)?.id;
 function keydown(event:React.KeyboardEvent<HTMLButtonElement>,index:number){
  const enabled=items.map((item,i)=>!item.disabled?i:-1).filter(i=>i>=0);
  if(!enabled.length||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
  event.preventDefault();
  const position=enabled.indexOf(index);
  const target=event.key==='Home'?enabled[0]:event.key==='End'?enabled[enabled.length-1]:enabled[(position+(event.key==='ArrowRight'?1:-1)+enabled.length)%enabled.length];
  const item=items[target];onValueChange(item.id);refs.current.get(item.id)?.focus();
 }
 return <div className={classes('apexUi-tabs',className)} role="tablist" aria-label={label}>{items.map((item,index)=><button key={item.id} id={item.tabId} ref={node=>{if(node)refs.current.set(item.id,node);else refs.current.delete(item.id)}} type="button" role="tab" aria-selected={value===item.id&&!item.disabled} aria-controls={item.panelId} tabIndex={focusId===item.id?0:-1} disabled={item.disabled} onClick={()=>onValueChange(item.id)} onKeyDown={event=>keydown(event,index)}>{item.label}</button>)}</div>;
}

export function ProgressBar({label,value,max=100}:{label:string;value?:number;max?:number}){
 const safeMax=Number.isFinite(max)&&max>0?max:100;
 const safeValue=value==null||!Number.isFinite(value)?undefined:Math.max(0,Math.min(safeMax,value));
 return <progress className="apexUi-progress" aria-label={label} max={safeMax} value={safeValue}/>;
}
export function Table({caption,children,className}:{caption:string;children:React.ReactNode;className?:string}){
 return <div className="apexUi-tableWrap"><table className={classes('apexUi-table',className)}><caption className="apexUi-srOnly">{caption}</caption>{children}</table></div>;
}

export function Pagination({page,pages,onPageChange}:{page:number;pages:number;onPageChange:(page:number)=>void}){
 const total=Number.isFinite(pages)?Math.max(0,Math.floor(pages)):0;
 const current=total?Math.max(1,Math.min(total,Number.isFinite(page)?Math.floor(page):1)):0;
 return <nav className="apexUi-pagination" aria-label="Страницы"><Button disabled={current<=1} onClick={()=>onPageChange(current-1)}>Назад</Button><span aria-live="polite">{current} / {total}</span><Button disabled={current===0||current>=total} onClick={()=>onPageChange(current+1)}>Далее</Button></nav>;
}
export function BatchActionBar({selected,children}:{selected:number;children:React.ReactNode}){
 return <div className="apexUi-batchBar" role="region" aria-label="Действия с выбранными"><span>Выбрано: <strong>{Number.isFinite(selected)?Math.max(0,Math.floor(selected)):'—'}</strong></span><div className="apexUi-actions">{children}</div></div>;
}
export function Skeleton({label='Загрузка'}:{label?:string}){
 return <div className="apexUi-skeleton" role="status"><span className="apexUi-srOnly">{label}</span><span aria-hidden="true"/></div>;
}

/** Reuse the existing portal's focus trap, Escape and focus restoration. */
export function Dialog({title,children,footer,onClose,busy=false}:{title:string;children:React.ReactNode;footer?:React.ReactNode;onClose:()=>void;busy?:boolean}){
 const titleId=useId();
 return <ModalPortal onClose={onClose} closeOnBackdrop={!busy} closeOnEscape={!busy}><section className="apexUi-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} onMouseDown={event=>event.stopPropagation()}>
  <header><h2 id={titleId}>{title}</h2><IconButton tone="ghost" disabled={busy} label="Закрыть" icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 6l12 12M18 6 6 18"/></svg>} onClick={onClose}/></header>
  <div className="apexUi-dialogBody">{children}</div>{footer&&<footer>{footer}</footer>}
 </section></ModalPortal>;
}
