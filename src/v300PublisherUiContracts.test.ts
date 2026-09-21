import {describe,expect,it} from 'vitest';import fs from 'node:fs';
describe('VYRON 3.0.0 Publisher UI contracts',()=>{const p=fs.readFileSync('src/PublisherOS.tsx','utf8'),bar=fs.readFileSync('src/YouTubeChannelBar.tsx','utf8');
it('has safe Select All and dual channel folders',()=>{expect(p).toContain('>Выбрать все</button>');expect(p).toContain('projectsFolderPath');expect(p).toContain('discoverChannelFolders');expect(p).toContain('disabledReason')});
it('removes Recent strip',()=>expect(bar).not.toContain('Недавние'));
});
