import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it} from 'vitest';
import {RpmCoverageCard} from './RpmCoverageCard';
import type {Channel} from './types';

const channel=(analytics?:Channel['analytics'])=>({id:'a',name:'A',enabled:true,analytics}) as Channel;
const markup=(channels:Channel[])=>renderToStaticMarkup(<RpmCoverageCard channels={channels} profiles={[]} rpm={5} onSettings={()=>{}} onAnalytics={()=>{}}/>);

describe('dashboard revenue coverage',()=>{
 it('does not show zero revenue when no 28-day view data is available',()=>{
  const html=markup([channel()]);
  expect(html).toContain('Расчётный доход</small><b>Нет данных</b>');
  expect(html).not.toContain('≈ $0.00');
 });
 it('shows zero when a channel has confirmed zero views',()=>{
  const html=markup([channel({periodDays:28,offsetDays:0,allTime:false,updatedAt:'2026-11-24T00:00:00Z',views:0,engagedViews:0,watchMinutes:0,averageViewDuration:0,averageViewPercentage:0,subscribersGained:0,subscribersLost:0,likes:0,comments:0,shares:0,daily:[],topVideos:[],trafficSources:[],countries:[],audience:[],devices:[]})]);
  expect(html).toContain('Расчётный доход</small><b>≈ $0.00</b>');
 });
});
