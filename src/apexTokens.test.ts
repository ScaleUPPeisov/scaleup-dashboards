import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

const css=readFileSync('src/apex-tokens.css','utf8');
const color=(name:string)=>{
 const match=css.match(new RegExp('--apex-'+name+':\\s*#([0-9a-f]{6})','i'));
 if(!match)throw new Error('Missing APEX color: '+name);
 return [0,2,4].map(i=>parseInt(match[1].slice(i,i+2),16)/255).map(v=>v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4);
};
const luminance=(name:string)=>{const [r,g,b]=color(name);return .2126*r+.7152*g+.0722*b};
const contrast=(a:string,b:string)=>{const values=[luminance(a),luminance(b)].sort((x,y)=>x-y);return (values[1]+.05)/(values[0]+.05)};
describe('APEX design tokens',()=>{
 it('uses the approved palette',()=>{
  const approved={background:'101114',surface:'181a1f','surface-raised':'202228',border:'2c2e35',accent:'a78bfa',success:'46d598',warning:'efb85a',danger:'f07685'};
  for(const [name,value] of Object.entries(approved))expect(css.toLowerCase()).toContain(`--apex-${name}:#${value}`);
 });
 it('keeps primary, muted and accent text readable on both dark surfaces',()=>{
  for(const text of ['text','text-muted','accent'])for(const surface of ['surface','surface-raised'])expect(contrast(text,surface)).toBeGreaterThanOrEqual(4.5);
 });
});
