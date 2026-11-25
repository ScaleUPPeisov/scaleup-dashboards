import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it,vi} from 'vitest';

const fixture=vi.hoisted(()=>({state:{settings:{workspace:'/fixture',interfaceDensity:'compact',autopilotMode:'off',reduceMotion:true},channels:[],jobs:[],logs:[],patchSettings:()=>{},setPage:()=>{}}}));
vi.mock('./store',()=>{const useApp=Object.assign((select:(state:typeof fixture.state)=>unknown)=>select(fixture.state),{getState:()=>fixture.state,subscribe:()=>()=>{}});return {useApp}});
import {SettingsOS} from './SettingsOS';

describe('APEX settings navigation',()=>{
 it('keeps all settings sections reachable and exposes selected and switch state',()=>{
  const html=renderToStaticMarkup(<SettingsOS license={{valid:true,type:'development'} as never}/>);
  for(const label of ['Общие','YouTube','ENDLUME','Резервные копии','Подключения OAuth','Диагностика','Обновления','Лицензия','О программе'])expect(html).toContain(label);
  expect(html).toContain('aria-current="page"');
  expect(html).toContain('role="switch" aria-checked="true"');
  expect(html).toContain('Рабочая папка');
  expect(html).toContain('/fixture');
 });
});
