import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {afterEach,describe,expect,it,vi} from 'vitest';
vi.mock('./ModalPortal',()=>({ModalPortal:({children,...props}:any)=><div data-modal-props={props}>{children}</div>}));
import {Badge,BatchActionBar,Button,Checkbox,Dialog,EmptyState,ErrorState,IconButton,Input,PageHeader,Pagination,ProgressBar,Select,Skeleton,Switch,Table,Tabs} from './apex-ui';

afterEach(()=>vi.unstubAllGlobals());

describe('APEX interface primitives',()=>{
 it('uses semantic controls with accessible names and prevents repeat actions while busy',()=>{
  const html=renderToStaticMarkup(<><Button busy>Сохранить</Button><IconButton label="Закрыть" icon={<svg/>}/><Checkbox label="Выбрать канал"/><Switch label="Автопилот" checked readOnly/><Badge tone="warning">Требует проверки</Badge></>);
  expect(html).toContain('type="button" disabled="" aria-busy="true"');
  expect(html).toContain('aria-label="Закрыть"');
  expect(html).toContain('aria-hidden="true"');
  expect(html).toContain('Выбрать канал');
  expect(html).toContain('role="switch"');
  expect(html).toContain('checked=""');
  expect(html).toContain('Требует проверки');
 });
 it('associates labels, hints and errors with the input and select',()=>{
  const html=renderToStaticMarkup(<><Input id="project" label="Проект" hint="Название" error="Введите название"/><Select id="channel" label="Канал" error="Выберите канал"><option value="">Не выбран</option></Select></>);
  expect(html).toContain('for="project"');expect(html).toContain('aria-describedby="project-hint project-error"');
  expect(html).toContain('aria-invalid="true"');expect(html).toContain('id="project-error"');
  expect(html).toContain('for="channel"');expect(html).toContain('aria-describedby="channel-error"');
  expect(html.match(/role="alert"/g)).toHaveLength(2);
 });
 it('exposes headings, empty and error states, progress and an accessible table caption',()=>{
  const html=renderToStaticMarkup(<><PageHeader title="Каналы" description="Обзор"/><EmptyState title="Нет данных"/><ErrorState title="Не удалось загрузить" description="Повторите попытку"/><ProgressBar label="Сборка" value={120}/><ProgressBar label="Ожидание"/><Table caption="Каналы"><thead><tr><th scope="col">Название</th></tr></thead><tbody><tr><td>Тест</td></tr></tbody></Table></>);
  expect(html).toContain('<h1>Каналы</h1>');expect(html).toContain('role="alert"');
  expect(html).toContain('aria-label="Сборка" max="100" value="100"');
  expect(html).toContain('aria-label="Ожидание" max="100"');expect(html).toContain('>Каналы</caption>');
 });
 it('moves between enabled tabs with arrow and boundary keys',async()=>{
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
  // @ts-expect-error react-test-renderer has no bundled TypeScript declarations.
  const {act,create}=await import('react-test-renderer');
  const select=vi.fn(),focus=vi.fn();let view:any;
  const items=[{id:'one',label:'Один'},{id:'disabled',label:'Недоступно',disabled:true},{id:'two',label:'Два'}];
  await act(async()=>{view=create(<Tabs label="Разделы" items={items} value="one" onValueChange={select}/>,{createNodeMock:()=>({focus})})});
  const tab=view.root.findAllByProps({role:'tab'})[0];const preventDefault=vi.fn();
  await act(async()=>{tab.props.onKeyDown({key:'ArrowRight',preventDefault})});
  expect(preventDefault).toHaveBeenCalledOnce();expect(select).toHaveBeenLastCalledWith('two');expect(focus).toHaveBeenCalled();
  await act(async()=>{tab.props.onKeyDown({key:'End',preventDefault})});expect(select).toHaveBeenLastCalledWith('two');
  expect(view.root.findAllByProps({role:'tab'})[1].props.disabled).toBe(true);
  await act(async()=>view.unmount());
 });
 it('keeps an available tab keyboard reachable if the controlled selection is stale',()=>{
  const items=[{id:'old',label:'Удалённая',disabled:true},{id:'first',label:'Доступная',tabId:'tab-first',panelId:'panel-first'}];
  const html=renderToStaticMarkup(<Tabs label="Разделы" items={items} value="old" onValueChange={()=>{}}/>);
  expect(html).toContain('id="tab-first"');expect(html).toContain('aria-controls="panel-first"');
  expect(html).toContain('aria-selected="false" aria-controls="panel-first" tabindex="0"');
  expect(html).not.toContain('aria-selected="true"');
 });
 it('keeps pagination inside bounds and exposes a labelled batch action area',async()=>{
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
  // @ts-expect-error react-test-renderer has no bundled TypeScript declarations.
  const {act,create}=await import('react-test-renderer');
  const change=vi.fn();let view:any;
  await act(async()=>{view=create(<><Pagination page={2} pages={3} onPageChange={change}/><BatchActionBar selected={4}><Button>Очистить выбор</Button></BatchActionBar><Skeleton/></>)});
  const buttons=view.root.findAllByType('button');
  await act(async()=>buttons[1].props.onClick());expect(change).toHaveBeenCalledWith(3);
  expect(view.root.findByProps({role:'region'}).props['aria-label']).toBe('Действия с выбранными');
  expect(view.root.findByProps({role:'status'}).findByProps({className:'apexUi-srOnly'}).children).toEqual(['Загрузка']);
  await act(async()=>view.update(<Pagination page={3} pages={3} onPageChange={change}/>));
  expect(view.root.findAllByType('button')[1].props.disabled).toBe(true);
  await act(async()=>view.unmount());
 });
 it('does not invent a selected count when it is unknown',()=>{
  const html=renderToStaticMarkup(<><BatchActionBar selected={Number.NaN}><Button>Действие</Button></BatchActionBar><Pagination page={1} pages={0} onPageChange={()=>{}}/></>);
  expect(html).toContain('Выбрано: <strong>—</strong>');
  expect(html).toContain('0 / 0');expect(html.match(/disabled=""/g)).toHaveLength(2);
 });
 it('labels the dialog and prevents dismissal while a task is busy',async()=>{
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
  // @ts-expect-error react-test-renderer has no bundled TypeScript declarations.
  const {act,create}=await import('react-test-renderer');
  const close=vi.fn();let view:any;
  await act(async()=>{view=create(<Dialog title="Проверка" onClose={close} busy>Подождите</Dialog>)});
  const modal=view.root.findByProps({role:'dialog'}),portal=view.root.findAll((node:any)=>node.props['data-modal-props']!==undefined)[0];
  expect(modal.props['aria-modal']).toBe('true');expect(modal.props['aria-labelledby']).toBeTruthy();
  expect(portal.props['data-modal-props'].closeOnBackdrop).toBe(false);expect(portal.props['data-modal-props'].closeOnEscape).toBe(false);
  expect(view.root.findAllByType('button').find((node:any)=>node.props['aria-label']==='Закрыть').props.disabled).toBe(true);
  await act(async()=>view.update(<Dialog title="Проверка" onClose={close}>Готово</Dialog>));
  await act(async()=>view.root.findAllByType('button').find((node:any)=>node.props['aria-label']==='Закрыть').props.onClick());
  expect(close).toHaveBeenCalledOnce();await act(async()=>view.unmount());
 });
});
