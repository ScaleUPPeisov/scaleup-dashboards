import {describe,expect,it} from 'vitest';
import {sortChannelsAlphabetically} from './channelSort';

describe('channel dropdown A-Z sorting',()=>{
  it('sorts English names case-insensitively without mutating source order',()=>{
    const source=[
      {id:'1',name:'Lost Highway FM'},
      {id:'2',name:'Midnight in Paris'},
      {id:'3',name:'ELARA'},
      {id:'4',name:'Silent Black Room'},
      {id:'5',name:'Electric Maestro'},
      {id:'6',name:'i lost her'},
      {id:'7',name:'Dolce Vita Nights'},
      {id:'8',name:'Neon Drive FM'},
      {id:'9',name:'Riviera Sax Club'},
      {id:'10',name:'Shadow Note Lounge'},
      {id:'11',name:'Rainy Cat Jazz'},
      {id:'12',name:'Glass City Lovers'},
      {id:'13',name:'Mafia 1947 Lounge'},
    ];
    const original=source.map(x=>x.id);
    expect(sortChannelsAlphabetically(source).map(x=>x.name)).toEqual([
      'Dolce Vita Nights','ELARA','Electric Maestro','Glass City Lovers','i lost her','Lost Highway FM','Mafia 1947 Lounge','Midnight in Paris','Neon Drive FM','Rainy Cat Jazz','Riviera Sax Club','Shadow Note Lounge','Silent Black Room'
    ]);
    expect(source.map(x=>x.id)).toEqual(original);
  });
  it('uses numeric ordering inside names',()=>{
    expect(sortChannelsAlphabetically([{name:'Channel 10'},{name:'Channel 2'}]).map(x=>x.name)).toEqual(['Channel 2','Channel 10']);
  });
});
