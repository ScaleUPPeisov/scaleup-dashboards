import React from 'react';
import {redactSensitive} from './securityRedaction';

type Props={page:string;onHome:()=>void;children:React.ReactNode};
type State={error?:Error};

function typeOf(value:unknown){return Array.isArray(value)?`array(${value.length})`:value===null?'null':typeof value}
function persistedShape(){
  const out:Record<string,unknown>={};
  try{
    const runway=JSON.parse(localStorage.getItem('vyron:channel-runway:v1')||'null');
    out.channelRunway={type:typeOf(runway),channels:typeOf(runway?.channels),channelCount:runway?.channels&&typeof runway.channels==='object'?Object.keys(runway.channels).length:0};
  }catch{out.channelRunway={type:'invalid-json'}}
  try{
    const prefs=JSON.parse(localStorage.getItem('vyron:production-manager:v2')||'null');
    out.productionPrefs={type:typeOf(prefs),byChannel:typeOf(prefs?.byChannel),selectedJobIds:typeOf(prefs?.selectedJobIds)};
  }catch{out.productionPrefs={type:'invalid-json'}}
  try{
    const keys=Object.keys(localStorage).filter(k=>k.startsWith('vyron:existing-cache:v1:'));
    out.existingCaches=keys.slice(0,100).map(key=>{try{const x=JSON.parse(localStorage.getItem(key)||'null');return{key:key.replace(/^vyron:existing-cache:v1:/,'channel:'),type:typeOf(x),videos:typeOf(x?.videos),baseline:typeOf(x?.baseline),lastUndo:typeOf(x?.lastUndo)}}catch{return{key:key.replace(/^vyron:existing-cache:v1:/,'channel:'),type:'invalid-json'}}});
  }catch{out.existingCaches='unavailable'}
  return out;
}

export class ScreenErrorBoundary extends React.Component<Props,State>{
  state:State={};
  static getDerivedStateFromError(error:unknown):State{return{error:error instanceof Error?error:new Error(String(error))}}
  componentDidUpdate(prev:Props){if(prev.page!==this.props.page&&this.state.error)this.setState({error:undefined})}
  private diagnostic(){
    const error=this.state.error;
    return redactSensitive(JSON.stringify({page:this.props.page,error:error?.message||'Unknown renderer error',stack:error?.stack||'',persistedShape:persistedShape()},null,2));
  }
  private copy=()=>{const text=this.diagnostic();void navigator.clipboard?.writeText(text).catch(()=>{});};
  private home=()=>{this.setState({error:undefined});this.props.onHome()};
  render(){
    if(!this.state.error)return this.props.children;
    const message=redactSensitive(this.state.error.message||String(this.state.error));
    return <section className="panel interfaceErrorPanel" role="alert"><small>VYRON RENDERER</small><h2>Ошибка интерфейса</h2><p>Экран: <b>{this.props.page}</b></p><pre>{message}</pre><div className="interfaceErrorActions"><button className="primary" onClick={this.home}>Вернуться на главную</button><button onClick={this.copy}>Скопировать диагностику</button></div></section>;
  }
}
