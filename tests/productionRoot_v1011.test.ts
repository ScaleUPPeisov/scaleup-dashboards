import {describe,expect,it} from 'vitest';
import {resolveProductionRootFromPrefs,type ProductionPrefs} from '../src/productionPrefs';

const base:ProductionPrefs={version:2,tab:'queue',byChannel:{},selectedJobIds:[]};
describe('VYRON 1.0.11 production project root',()=>{
  it('uses fallback when no Production root is configured',()=>expect(resolveProductionRootFromPrefs(base,'c1','/internal')).toBe('/internal'));
  it('uses global Production root',()=>expect(resolveProductionRootFromPrefs({...base,productionRoot:'/Volumes/PROJECTS'},'c1','/internal')).toBe('/Volumes/PROJECTS'));
  it('channel override wins over global',()=>expect(resolveProductionRootFromPrefs({...base,productionRoot:'/Volumes/ALL',byChannel:{c1:{projectCount:30,tracksPerProject:15,mode:'even',allowImageReuse:false,selectedProjectIds:[],productionRoot:'/Volumes/NEON'}}},'c1','/internal')).toBe('/Volumes/NEON'));
});
