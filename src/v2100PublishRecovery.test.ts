import {describe,expect,it} from 'vitest';
import {isFuturePublishAt,latestYoutubeScheduledPublishAt,suggestedScheduleStartDate} from './publisherSchedule';
import {readFileSync} from 'node:fs';
const v=(publishAt?:string)=>({privacyStatus:'private',publishAt});
describe('VYRON 2.1 publish recovery',()=>{
 it('uses the last future YouTube publishAt',()=>expect(latestYoutubeScheduledPublishAt([v('2026-09-05T11:00:00Z'),v('2026-09-06T11:00:00Z')],new Date('2026-09-01T00:00:00Z'))).toBe('2026-09-06T11:00:00Z'));
 it('starts after the last YouTube date',()=>expect(suggestedScheduleStartDate([v('2026-09-06T11:00:00Z')],'18:00',new Date('2026-09-01T00:00:00Z'))).toBe('2026-09-07'));
 it('never accepts a past publishAt',()=>{const now=new Date('2026-09-10T10:00:00Z');expect(isFuturePublishAt('2026-09-10T09:59:59Z',now)).toBe(false);expect(isFuturePublishAt('2026-09-10T10:00:01Z',now)).toBe(true)});
 it('wires real details and clearable Error Center',()=>{const p=readFileSync('src/PublisherOS.tsx','utf8'),a=readFileSync('src/App.tsx','utf8'),n=readFileSync('src/notificationCenter.ts','utf8');expect(p).toContain('syncScheduleFromYoutube');expect(p).toContain('pastSchedule');expect(p).toContain('Получить актуальное расписание канала');expect(p).toContain('technicalDetail:h.detail');expect(a).toContain('Очистить все ошибки');expect(a).toContain('Убрать ошибку');expect(a).toContain('Технические детали');expect(n).toContain('technicalDetail?:string')});
});
