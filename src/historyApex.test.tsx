import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {beforeEach,describe,expect,it,vi} from 'vitest';

const fixture=vi.hoisted(()=>({state:{} as Record<string,unknown>}));
vi.mock('./store',()=>({useApp:(select:(state:Record<string,unknown>)=>unknown)=>select(fixture.state)}));
import {HistoryPage} from './HistoryPage';

describe('APEX history workspace',()=>{
 beforeEach(()=>{fixture.state={channels:[{id:'channel',name:'Тестовый канал'}],activityJournal:[
  {eventId:'1',eventType:'PRODUCTION_BUILD_COMPLETED',status:'SUCCESS',timestamp:'2026-01-01T10:00:00Z',channelId:'channel',batchId:'batch-1',jobId:'job-1',operationId:'operation-1'},
  {eventId:'2',eventType:'UPLOAD_FAILED',status:'FAILED',timestamp:'2026-01-02T10:00:00Z',channelName:'Другой канал',errorCode:'TEST_ERROR'}
 ]}});
 it('renders translated event labels, statuses, channel and identifiers in newest-first order',()=>{
  const html=renderToStaticMarkup(<HistoryPage/>);
  expect(html.indexOf('Ошибка загрузки')).toBeLessThan(html.indexOf('Сборка проектов завершена'));
  for(const value of ['Успешно','Ошибка','Тестовый канал','Другой канал','Пакет: batch-1','Задача: job-1','Код ошибки: TEST_ERROR','Код события: PRODUCTION_BUILD_COMPLETED','Операция: operation-1'])expect(html).toContain(value);
  for(const value of ['Поиск','Все статусы','Все каналы','Сначала новые','Найдено 2','показано 2'])expect(html).toContain(value);
 });
 it('shows an empty state without inventing historical events',()=>{
  fixture.state.activityJournal=[];
  const html=renderToStaticMarkup(<HistoryPage/>);
  expect(html).toContain('Событий не найдено');
  expect(html).toContain('Записи появятся после операций в VYRON.');
  expect(html).toContain('Найдено 0');
 });
 it('limits initial rendering to 100 events and offers the rest',()=>{
  fixture.state.activityJournal=Array.from({length:101},(_,i)=>({eventId:String(i),eventType:'UPLOAD_ACCEPTED',status:'SUCCESS',timestamp:'2026-01-01T10:00:00Z'}));
  const html=renderToStaticMarkup(<HistoryPage/>);
  expect(html).toContain('Найдено 101');expect(html).toContain('показано 100');expect(html).toContain('Показать ещё 100');
  expect((html.match(/class="historyApexEvent historyApexEvent-success"/g)||[]).length).toBe(100);
 });
});
