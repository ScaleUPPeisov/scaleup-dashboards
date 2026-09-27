import {describe,expect,it} from 'vitest';
import {sortChannelsAlphabetically} from './channelSort';

describe('channel dropdown A-Z sorting',()=>{
  it('sorts English names case-insensitively without mutating source order',()=>{
    const source=[
      {id:'1',name:'Quartz Harbor'},
      {id:'2',name:'Aurora Fixture'},
      {id:'3',name:'Beta Room'},
      {id:'4',name:'Zulu Studio'},
      {id:'5',name:'Echo Project'},
      {id:'6',name:'delta room'},
      {id:'7',name:'Cedar Nights'},
      {id:'8',name:'Nova Test'},
      {id:'9',name:'Lumen Club'},
      {id:'10',name:'Sigma Lounge'},
      {id:'11',name:'Rain Fixture'},
      {id:'12',name:'Fixture Channel'},
      {id:'13',name:'Metro Lab'},
    ];
    const original=source.map(x=>x.id);
    expect(sortChannelsAlphabetically(source).map(x=>x.name)).toEqual([
      'Cedar Nights','Beta Room','Echo Project','Fixture Channel','delta room','Quartz Harbor','Metro Lab','Aurora Fixture','Nova Test','Rain Fixture','Lumen Club','Sigma Lounge','Zulu Studio'
    ]);
    expect(source.map(x=>x.id)).toEqual(original);
  });
  it('uses numeric ordering inside names',()=>{
    expect(sortChannelsAlphabetically([{name:'Channel 10'},{name:'Channel 2'}]).map(x=>x.name)).toEqual(['Channel 2','Channel 10']);
  });
});
