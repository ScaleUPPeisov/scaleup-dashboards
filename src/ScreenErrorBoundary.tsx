import React from 'react';
import {redactSensitive} from './securityRedaction';

export type ScreenErrorBoundaryProps={
  page:string;
  onHome:()=>void;
  children:React.ReactNode;
};
type State={error:Error|null;copied:boolean};

function safeError(value:unknown){
  if(value instanceof Error)return value;
  return new Error(typeof value==='string'?value:'Неизвестная ошибка интерфейса');
}

export class ScreenErrorBoundary extends React.Component<ScreenErrorBoundaryProps,State>{
  state:State={error:null,copied:false};

  static getDerivedStateFromError(error:unknown):State{
    return{error:safeError(error),copied:false};
  }

  componentDidCatch(error:unknown,info:React.ErrorInfo){
    const err=safeError(error);
    const diagnostic=this.buildDiagnostic(err,info.componentStack||'');
    try{console.error('[VYRON UI ERROR]',diagnostic)}catch{}
  }

  componentDidUpdate(prevProps:ScreenErrorBoundaryProps){
    if(prevProps.page!==this.props.page&&this.state.error)this.setState({error:null,copied:false});
  }

  private buildDiagnostic(error=this.state.error,componentStack=''){
    const message=redactSensitive(error?.message||'Неизвестная ошибка интерфейса');
    const stack=redactSensitive(error?.stack||componentStack||'stack unavailable');
    return [
      'VYRON UI DIAGNOSTIC',
      `PAGE=${redactSensitive(this.props.page)}`,
      `ERROR=${message}`,
      `STACK=${stack}`
    ].join('\n');
  }

  private copyDiagnostic=async()=>{
    const text=this.buildDiagnostic();
    try{
      await navigator.clipboard.writeText(text);
      this.setState({copied:true});
      return;
    }catch{}
    try{
      const el=document.createElement('textarea');
      el.value=text;el.setAttribute('readonly','');el.style.position='fixed';el.style.opacity='0';document.body.appendChild(el);el.select();document.execCommand('copy');el.remove();this.setState({copied:true});
    }catch{}
  };

  private goHome=()=>{
    this.setState({error:null,copied:false},this.props.onHome);
  };

  render(){
    if(!this.state.error)return this.props.children;
    const message=redactSensitive(this.state.error.message||'Неизвестная ошибка интерфейса');
    return <section className="panel errorBoundaryPanel" data-testid="vyron-error-boundary">
      <div className="panelHead"><div><small>VYRON RENDERER</small><h2>Ошибка интерфейса</h2><p>Экран остановлен безопасно. Остальная часть VYRON продолжает работать.</p></div></div>
      <div className="errorBox"><b>Экран: {this.props.page}</b><span>{message}</span></div>
      <footer><button onClick={this.goHome}>Вернуться на главную</button><button className="primary" onClick={this.copyDiagnostic}>{this.state.copied?'Диагностика скопирована':'Скопировать диагностику'}</button></footer>
    </section>;
  }
}
