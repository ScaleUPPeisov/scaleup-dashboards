import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';

describe('VYRON fleet runway evidence-aware visual contract',()=>{
  const source=()=>readFileSync('src/ChannelRunway.tsx','utf8');
  const css=()=>readFileSync('src/styles.css','utf8');

  it('orders historical and confirmed visible numeric days, without adding local files',()=>{
    const s=source();
    expect(s).toContain('historicalScheduledDays:row.record.status');
    expect(s).toContain('compareYoutubeOnlyRunwayPriority(rank(a),rank(b))');
    expect(s).toContain('row.record.dataState===\'PARTIAL_DATA\'');
    expect(s).not.toContain('localReadyVideos:row.content.readyVideoCount');
  });

  it('shows red amber yellow green for confirmed and marked historical risk',()=>{
    const s=source(),c=css();
    for(const tone of ['ended','urgent','prepare','plan','large']){
      expect(c).toContain('.channelRunway .runwayRow-'+tone);
    }
    expect(c).toContain('.channelRunway .runwayRow-partial');
    expect(c).toContain('.channelRunway .runwayStatus.partial');
    expect(c).toContain('.channelRunway .runwayDays.historical');
    expect(s).toContain("ТРЕБУЕТ СВЕРКИ YOUTUBE");
    expect(s).toContain("record.status==='no-data'?'historical':''");
  });

  it('reports every channel with true progress, separately from confirmed inventory',()=>{
    const s=source();
    const full=readFileSync('src/fullChannelRefresh.ts','utf8');
    expect(s).toContain('Анализ каналов: {fleetAudit.done}/{fleetAudit.total}');
    expect(s).toContain('Неполные данные {fleetAudit.partial}');
    expect(s).toContain('Не все каналы проверены!');
    expect(full).toContain('knownByChannel');
    expect(full).toContain('refreshOwnerInventoriesAuthoritative(requested,true,undefined,knownByChannel,onProgress)');
  });
});
