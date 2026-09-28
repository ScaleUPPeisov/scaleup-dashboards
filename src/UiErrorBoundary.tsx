import React from 'react';
import {useApp} from './store';

type Props={
  children:React.ReactNode;
  scope:string;
  onRetry?:()=>void;
  onHome?:()=>void;
};

type State={error?:Error};

function safeMessage(value:unknown){
  const text=value instanceof Error?value.message:String(value||'UNKNOWN_UI_ERROR');
  return text.replace(/(refresh_token|access_token|client_secret|authorization)\s*[:=]\s*[^\s,;]+/gi,'$1=[REDACTED]');
}

export class UiErrorBoundary extends React.Component<Props,State>{
  state:State={};

  static getDerivedStateFromError(error:Error):State{return{error}}

  componentDidCatch(error:Error,info:React.ErrorInfo){
    try{
      useApp.getState().log(
        `UI_ERROR • ${this.props.scope} • ${safeMessage(error)} • ${String(info.componentStack||'').slice(0,1200)}`,
        'error'
      );
    }catch{}
  }

  private retry=()=>{
    this.setState({error:undefined});
    try{this.props.onRetry?.()}catch{}
  };

  render(){
    if(!this.state.error)return this.props.children;
    return <section className="panel errorBox uiErrorBoundary" role="alert">
      <small>VYRON UI RECOVERY</small>
      <h3>Не удалось открыть {this.props.scope}</h3>
      <p>Экран остановлен локально. Каналы, OAuth, Google credentials, расписание и сохранённое состояние не сбрасываются.</p>
      <details>
        <summary>Технические сведения</summary>
        <pre>{safeMessage(this.state.error)}</pre>
      </details>
      <div className="headerActions">
        <button className="primary" onClick={this.retry}>Повторить</button>
        {this.props.onHome&&<button onClick={this.props.onHome}>На главную</button>}
      </div>
    </section>
  }
}
