import React, { useMemo, useState } from "react";
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import Svg, { Circle, Defs, LinearGradient as SvgGradient, Path, Stop } from "react-native-svg";
import { VyronSyncProvider, useVyronSyncContext } from "./src/sync/useVyronSync";
import { aggregateAnalytics, channelSparkline, channelState, formatMetric, latestStats, relativeSyncTime, viewsForPeriod } from "./src/sync/selectors";

const C = {
  bg: "#080D16",
  bg2: "#0A101B",
  panel: "#111B2A",
  panel2: "#0B111D",
  text: "#F4F7FF",
  sub: "#9BA8BE",
  tertiary: "#69778E",
  blue: "#5C6CFF",
  violet: "#7B5CFF",
  green: "#39E6A0",
  amber: "#FFC83D",
  red: "#FF4E5D",
  purple: "#B05CFF",
  cyan: "#4F9CFF",
  border: "rgba(130,155,210,0.16)",
};

type Tab = "home" | "channels" | "projects" | "analytics" | "settings";
function progressWidth(value:number): `${number}%` { return `${Math.max(0,Math.min(100,value))}%`; }

function Card({ children, style }: any) {
  return (
    <LinearGradient
      colors={["rgba(21,30,46,0.96)", "rgba(10,16,27,0.98)"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.card, style]}
    >
      {children}
    </LinearGradient>
  );
}

function Header({ title }: { title: string }) {
  const sync = useVyronSyncContext();
  const offline = sync.syncStatus !== "online" && sync.syncStatus !== "syncing";
  const syncText = sync.syncStatus === "unconfigured"
    ? "Backend не настроен"
    : "Нет подключения · " + relativeSyncTime(sync.lastSuccessfulSyncAt);
  return (
    <View style={styles.header}>
      <View style={{flex:1}}>
        <Text style={styles.brand}>VYRON</Text>
        <Text style={styles.pageTitle}>{title}</Text>
        {offline ? <Text style={styles.syncMeta}>{syncText}</Text> : null}
      </View>
      <Pressable
        onPress={() => Haptics.selectionAsync()}
        style={({ pressed }) => [styles.iconButton, pressed && { transform: [{ scale: 0.96 }] }]}
      >
        <Ionicons name="notifications-outline" size={22} color={C.text} />
        <View style={styles.notificationDot} />
      </Pressable>
    </View>
  );
}

function Sparkline({ tone = C.blue, values = [] }: { tone?: string; values?: number[] }) {
  if (values.length < 2) return <View style={{width:104,height:38,alignItems:"center",justifyContent:"center"}}><Text style={styles.tiny}>—</Text></View>;
  const min=Math.min(...values),max=Math.max(...values),range=Math.max(1,max-min);
  const path=values.map((v,i)=>{
    const x=2+(100*i/Math.max(1,values.length-1));
    const y=34-30*((v-min)/range);
    return (i===0?"M":"L")+x.toFixed(1)+" "+y.toFixed(1);
  }).join(" ");
  return <Svg width="104" height="38" viewBox="0 0 104 38"><Path d={path} fill="none" stroke={tone} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></Svg>;
}

function Kpi({ value, label, delta }: { value: string; label: string; delta: string }) {
  return (
    <Card style={styles.kpi}>
      <Text style={styles.kpiValue}>{value}</Text>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={[styles.kpiDelta, { color: delta === "—" ? C.sub : delta.startsWith("↓") ? C.red : C.green }]}>{delta}</Text>
    </Card>
  );
}

function StatusBadge({ label, tone }: { label: string; tone: string }) {
  return (
    <View style={[styles.badge, { borderColor: tone + "55", backgroundColor: tone + "14" }]}>
      <View style={[styles.dot, { backgroundColor: tone }]} />
      <Text style={[styles.badgeText, { color: tone }]}>{label}</Text>
    </View>
  );
}

function HomeScreen() {
  const sync=useVyronSyncContext();
  const a=aggregateAnalytics(sync,28);
  const attention=sync.channels.filter(c=>{const state=channelState(c,sync);return state.tone==="amber"||state.tone==="red"});
  const today=new Date().toDateString();
  const publishing=sync.publisherJobs.filter(x=>x.scheduled_at&&new Date(x.scheduled_at).toDateString()===today).length;
  const rendering=sync.projects.filter(x=>x.status==="RENDERING").length;
  const completed=sync.projects.filter(x=>x.status==="COMPLETED").length;
  const errors=sync.projects.filter(x=>x.status==="ERROR").length;
  const endlume=sync.endlumeJobs.find(x=>x.state==="rendering")||sync.endlumeJobs[0];
  const normal=Math.max(0,sync.channels.length-attention.length);
  const health=sync.channels.length?Math.round(normal/sync.channels.length*100):null;
  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <Header title="Главная" />
      <Card style={styles.hero}>
        <Text style={styles.eyebrow}>СЕТЬ КАНАЛОВ</Text>
        <Text style={styles.heroValue}>{sync.channels.length} каналов</Text>
        <Text style={styles.heroSub}>{normal} работают штатно · {attention.length} требуют внимания</Text>
        <View style={styles.heroStats}>
          <View><Text style={styles.heroStatValue}>{formatMetric(a.views)}</Text><Text style={styles.heroStatLabel}>просмотров / 28д</Text></View>
          <View><Text style={styles.heroStatValue}>{a.subscribers==null?"—":(a.subscribers>=0?"+":"")+formatMetric(a.subscribers)}</Text><Text style={styles.heroStatLabel}>подписчиков</Text></View>
          <View><Text style={styles.heroStatValue}>{health==null?"—":String(health)+"%"}</Text><Text style={styles.heroStatLabel}>в норме</Text></View>
        </View>
      </Card>
      <View style={styles.sectionHead}><Text style={styles.sectionTitle}>Сейчас</Text><Text style={styles.sectionAction}>{sync.syncStatus==="online"?"Live":"Cache"}</Text></View>
      <View style={styles.grid2}>
        <Card style={styles.compact}><Ionicons name="cloud-upload-outline" size={20} color={C.cyan} /><Text style={styles.compactValue}>{publishing}</Text><Text style={styles.compactLabel}>публикации сегодня</Text></Card>
        <Card style={styles.compact}><Ionicons name="flash-outline" size={20} color={C.purple} /><Text style={styles.compactValue}>{rendering}</Text><Text style={styles.compactLabel}>рендерятся</Text></Card>
        <Card style={styles.compact}><Ionicons name="checkmark-circle-outline" size={20} color={C.green} /><Text style={styles.compactValue}>{completed}</Text><Text style={styles.compactLabel}>завершено</Text></Card>
        <Card style={styles.compact}><Ionicons name="warning-outline" size={20} color={C.red} /><Text style={styles.compactValue}>{errors}</Text><Text style={styles.compactLabel}>ошибки</Text></Card>
      </View>
      <View style={styles.sectionHead}><Text style={styles.sectionTitle}>Требует внимания</Text><Text style={styles.sectionAction}>{attention.length}</Text></View>
      {attention.length?attention.slice(0,4).map(c=>{
        const state=channelState(c,sync),tone=state.tone==="red"?C.red:C.amber;
        const inv=sync.inventory.find(x=>x.channel_id===c.id);
        return <Card key={c.id}><View style={styles.rowBetween}><View style={{flex:1}}><Text style={styles.cardTitle}>{c.name}</Text><Text style={styles.muted}>{inv?.stale?"Последний подтверждённый локальный snapshot":"Контент / публикация требует внимания"}</Text></View><StatusBadge label={state.label} tone={tone}/></View></Card>
      }):<Card><Text style={styles.muted}>Нет активных предупреждений</Text></Card>}
      <View style={styles.sectionHead}><Text style={styles.sectionTitle}>ENDLUME</Text><Text style={[styles.sectionAction,{color:endlume?.state==="rendering"||endlume?.state==="connected"?C.green:C.sub}]}>{endlume?"● "+endlume.state:"Нет данных"}</Text></View>
      <Card>
        <View style={styles.rowBetween}><View><Text style={styles.cardTitle}>{endlume?.machine_name||"ENDLUME"}</Text><Text style={styles.muted}>{endlume?.current_project||"Нет активного проекта"}</Text></View><Text style={[styles.kpiDelta,{color:C.purple}]}>{endlume?.progress==null?"—":String(Math.round(endlume.progress))+"%"}</Text></View>
        {endlume?.progress!=null?<View style={styles.progressTrack}><LinearGradient colors={[C.blue,C.purple]} style={[styles.progressFill,{width:progressWidth(endlume.progress)}]} /></View>:null}
      </Card>
    </ScrollView>
  );
}

function ChannelsScreen() {
  const sync=useVyronSyncContext();
  const [filter, setFilter] = useState("Все");
  const [q, setQ] = useState("");
  const stats28=latestStats(sync.stats,28);
  const filtered = sync.channels.filter(c => {
    const state=channelState(c,sync);
    const matchesFilter=filter==="Все"||(filter==="Активные"&&state.tone!=="red")||(filter==="Нужен контент"&&state.tone==="amber")||(filter==="Ошибки"&&state.tone==="red");
    return c.name.toLowerCase().includes(q.toLowerCase())&&matchesFilter;
  });
  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <Header title="Каналы" />
      <Pressable style={({pressed})=>[styles.primaryButton,pressed&&{transform:[{scale:.98}]}]} onPress={()=>{Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);Alert.alert("Добавление канала","Добавь канал в Desktop VYRON. После сохранения он автоматически появится здесь через Realtime.")}}>
        <Ionicons name="add" size={20} color="#fff" /><Text style={styles.primaryButtonText}>Добавить канал</Text>
      </Pressable>
      <View style={styles.search}><Ionicons name="search" size={18} color={C.tertiary}/><TextInput value={q} onChangeText={setQ} placeholder="Поиск каналов…" placeholderTextColor={C.tertiary} style={styles.searchInput}/></View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
        {["Все","Активные","Нужен контент","Ошибки"].map(x=><Pressable key={x} onPress={()=>{setFilter(x);Haptics.selectionAsync()}} style={[styles.filter,filter===x&&styles.filterActive]}><Text style={[styles.filterText,filter===x&&styles.filterTextActive]}>{x}</Text></Pressable>)}
      </ScrollView>
      {!filtered.length?<Card><Text style={styles.muted}>{sync.dataLoading?"Синхронизация…":"Каналы пока не синхронизированы"}</Text></Card>:null}
      {filtered.map((c,i)=>{
        const stat=stats28.get(c.id),inv=sync.inventory.find(x=>x.channel_id===c.id),state=channelState(c,sync);
        const tone=state.tone==="green"?C.green:state.tone==="amber"?C.amber:state.tone==="red"?C.red:C.cyan;
        const delta=stat?.subscriber_delta_today;
        return <Pressable key={c.id} style={({pressed})=>pressed&&{transform:[{scale:.98}]}}>
          <Card>
            <View style={styles.channelTop}>
              <LinearGradient colors={[C.blue,C.violet]} style={styles.avatar}>{c.avatar_url?<Image source={{uri:c.avatar_url}} style={styles.avatarImage}/>:<Text style={styles.avatarText}>{c.name.slice(0,2).toUpperCase()||String(i+1).padStart(2,"0")}</Text>}</LinearGradient>
              <View style={{flex:1}}><Text style={styles.cardTitle}>{c.name}</Text><Text style={styles.muted}>{formatMetric(stat?.subscriber_count)} подписчиков <Text style={{color:delta==null?C.sub:delta<0?C.red:C.green}}>{delta==null?"—":(delta>=0?"+":"")+formatMetric(delta)}</Text></Text></View>
              <Sparkline tone={tone} values={channelSparkline(sync.stats,c.id,28)}/>
            </View>
            <View style={styles.metricsRow}>
              <View><Text style={styles.metricValue}>{formatMetric(stat?.views_today)}</Text><Text style={styles.metricLabel}>сегодня</Text><Text style={[styles.metricDelta,{color:C.sub}]}>—</Text></View>
              <View><Text style={styles.metricValue}>{formatMetric(viewsForPeriod(stat,28))}</Text><Text style={styles.metricLabel}>за 28 дней</Text><Text style={[styles.metricDelta,{color:C.sub}]}>—</Text></View>
            </View>
            <View style={styles.rule}/>
            <View style={styles.rowBetween}><Text style={styles.muted}>{inv?inv.ready_video_count:"—"} видео готово</Text><Text style={styles.muted}>Запас: <Text style={{color:tone,fontWeight:"700"}}>{inv?.remaining_content_days==null?"—":formatMetric(inv.remaining_content_days)+" дней"}</Text></Text></View>
            <View style={{marginTop:12}}><StatusBadge label={state.label} tone={tone}/></View>
          </Card>
        </Pressable>
      })}
    </ScrollView>
  );
}

function ProjectsScreen() {
  const sync=useVyronSyncContext();
  const counts=(status:string)=>sync.projects.filter(x=>x.status===status).length;
  const fmtDuration=(seconds:number|null)=>seconds==null?"—":Math.floor(seconds/60)+":"+String(Math.round(seconds%60)).padStart(2,"0");
  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <Header title="Проекты" />
      <Text style={styles.subtitle}>Управляйте своими видеопроектами</Text>
      <View style={styles.grid2}>
        <Kpi value={String(counts("READY_RENDER"))} label="готовы" delta="—"/>
        <Kpi value={String(counts("RENDERING"))} label="рендерятся" delta="—"/>
        <Kpi value={String(counts("COMPLETED"))} label="завершено" delta="—"/>
        <Kpi value={String(counts("ERROR"))} label="ошибки" delta="—"/>
      </View>
      <View style={styles.search}><Ionicons name="search" size={18} color={C.tertiary}/><TextInput placeholder="Поиск проектов…" placeholderTextColor={C.tertiary} style={styles.searchInput}/></View>
      {!sync.projects.length?<Card><Text style={styles.muted}>{sync.dataLoading?"Синхронизация…":"Проекты пока не синхронизированы"}</Text></Card>:null}
      {sync.projects.map(p=>{
        const channel=sync.channels.find(c=>c.id===p.channel_id);
        const tone=p.status==="READY_RENDER"?C.cyan:p.status==="RENDERING"?C.purple:p.status==="COMPLETED"?C.green:p.status==="ERROR"?C.red:C.tertiary;
        return <Card key={p.id}>
          <View style={styles.rowBetween}><View style={{flex:1}}><Text style={styles.cardTitle}>{p.project_name}{channel?" — "+channel.name:""}</Text><Text style={styles.muted}>{fmtDuration(p.duration_seconds)} · {p.track_count==null?"—":p.track_count} треков</Text></View><StatusBadge label={p.status} tone={tone}/></View>
          <View style={styles.projectMeta}><Text style={styles.tiny}>{p.source_updated_at?new Date(p.source_updated_at).toLocaleString("ru-RU"):"—"}</Text><Text style={styles.tiny}>{p.machine||"—"}</Text></View>
          {p.status==="RENDERING"?<>{p.progress!=null?<View style={styles.progressTrack}><LinearGradient colors={[C.blue,C.purple]} style={[styles.progressFill,{width:progressWidth(p.progress)}]} /></View>:<View style={styles.progressTrack}/>}<Text style={[styles.tiny,{color:p.progress==null?C.sub:C.purple,marginTop:7}]}>{p.progress==null?"Прогресс ожидается":String(Math.round(p.progress))+"%"}</Text></>:null}
          {p.status==="ERROR" ? <Pressable onPress={()=>{Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);Alert.alert("Повтор рендера","Запусти Retry в Desktop VYRON / ENDLUME. Mobile автоматически покажет новый статус и прогресс.")}} style={styles.retry}><Ionicons name="refresh" size={16} color={C.text}/><Text style={styles.retryText}>Повторить</Text></Pressable> : null}
        </Card>
      })}
    </ScrollView>
  );
}

function BigChart({values,total}:{values:number[];total:string}) {
  let path="";
  if(values.length>=2){
    const min=Math.min(...values),max=Math.max(...values),range=Math.max(1,max-min);
    path=values.map((v,i)=>{
      const x=340*i/Math.max(1,values.length-1),y=148-124*((v-min)/range);
      return (i?"L":"M")+x.toFixed(1)+" "+y.toFixed(1);
    }).join(" ");
  }
  return (
    <Card style={{paddingBottom:14}}>
      <View style={styles.rowBetween}><View><Text style={styles.eyebrow}>РОСТ ПРОСМОТРОВ</Text><Text style={styles.heroValue}>{total}</Text></View></View>
      {path?<Svg width="100%" height="170" viewBox="0 0 340 170">
        <Defs><SvgGradient id="g" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor={C.blue} stopOpacity=".30"/><Stop offset="1" stopColor={C.blue} stopOpacity="0"/></SvgGradient></Defs>
        <Path d={path+" L340 170 L0 170 Z"} fill="url(#g)"/>
        <Path d={path} fill="none" stroke={C.blue} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
      </Svg>:<View style={{height:170,alignItems:"center",justifyContent:"center"}}><Text style={styles.muted}>Нет данных за выбранный период</Text></View>}
    </Card>
  );
}

function AnalyticsScreen() {
  const sync=useVyronSyncContext();
  const [period,setPeriod]=useState<7|28|90>(28);
  const a=aggregateAnalytics(sync,period);
  const trafficTotal=a.traffic.reduce((n,x)=>n+x[1],0);
  const firstShare=trafficTotal&&a.traffic[0]?a.traffic[0][1]/trafficTotal:0;
  const circumference=276.46,dash=(circumference*firstShare).toFixed(1);
  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <Header title="Аналитика" />
      <View style={styles.grid2}>
        <Kpi value={formatMetric(a.views)} label="Просмотры" delta="—"/>
        <Kpi value={a.subscribers==null?"—":(a.subscribers>=0?"+":"")+formatMetric(a.subscribers)} label="Подписчики" delta="—"/>
        <Kpi value={a.watchTime==null?"—":formatMetric(a.watchTime/60)+" ч"} label="Watch time" delta="—"/>
        <Kpi value={a.ctr==null?"—":formatMetric(a.ctr)+"%"} label="CTR" delta="—"/>
      </View>
      <View style={styles.segment}>{([7,28,90] as const).map(x=><Pressable key={x} onPress={()=>{setPeriod(x);Haptics.selectionAsync()}} style={[styles.segmentItem,period===x&&styles.segmentActive]}><Text style={[styles.segmentText,period===x&&styles.segmentTextActive]}>{x} дней</Text></Pressable>)}</View>
      <BigChart values={a.daily.map(x=>x.value)} total={formatMetric(a.views)}/>
      <View style={styles.sectionHead}><Text style={styles.sectionTitle}>Топ каналов</Text><Text style={styles.sectionAction}>{period} дней</Text></View>
      {a.topChannels.length?a.topChannels.slice(0,5).map((x,i)=><Card key={x.channel.id} style={styles.rankCard}><Text style={styles.rank}>{i+1}</Text><View style={{flex:1}}><Text style={styles.cardTitle}>{x.channel.name}</Text><Text style={styles.muted}>{formatMetric(x.views)} просмотров</Text></View><Sparkline tone={i===0?C.green:C.blue} values={channelSparkline(sync.stats,x.channel.id,period)}/></Card>):<Card><Text style={styles.muted}>Нет данных за выбранный период</Text></Card>}
      <Card>
        <Text style={styles.sectionTitle}>Источники трафика</Text>
        <View style={styles.trafficWrap}>
          <Svg width="120" height="120" viewBox="0 0 120 120">
            <Circle cx="60" cy="60" r="44" stroke="#192335" strokeWidth="14" fill="none"/>
            {trafficTotal?<Circle cx="60" cy="60" r="44" stroke={C.blue} strokeWidth="14" fill="none" strokeDasharray={dash+" "+String(circumference)} strokeLinecap="round" transform="rotate(-90 60 60)"/>:null}
          </Svg>
          <View style={{gap:10}}>{a.traffic.length?a.traffic.slice(0,4).map(([key,value])=><Text key={key} style={styles.muted}>● {key} {trafficTotal?Math.round(value/trafficTotal*100):0}%</Text>):<Text style={styles.muted}>Нет данных</Text>}</View>
        </View>
      </Card>
    </ScrollView>
  );
}

function SettingsRow({icon,label,value,tone=C.cyan,onPress}:{icon:any;label:string;value?:string;tone?:string;onPress?:()=>void}) {
  return <Pressable onPress={()=>{Haptics.selectionAsync();onPress?.()}} style={({pressed})=>[styles.settingsRow,pressed&&{opacity:.72}]}><View style={[styles.settingsIcon,{backgroundColor:tone+"18"}]}><Ionicons name={icon} size={20} color={tone}/></View><Text style={styles.settingsLabel}>{label}</Text>{value?<Text style={styles.settingsValue}>{value}</Text>:null}<Ionicons name="chevron-forward" size={18} color={C.tertiary}/></Pressable>;
}

function SettingsScreen() {
  const sync=useVyronSyncContext();
  const name=String(sync.session?.user.user_metadata?.full_name||sync.session?.user.email||"VYRON");
  const statusText=sync.syncStatus==="online"?"● Онлайн":sync.syncStatus==="syncing"?"Синхронизация…":sync.syncStatus==="error"?"Ошибка синхронизации":sync.syncStatus==="unconfigured"?"Не настроено":"Нет подключения";
  const statusTone=sync.syncStatus==="online"?C.green:sync.syncStatus==="syncing"?C.cyan:sync.syncStatus==="error"?C.red:C.amber;
  const now=Date.now();
  const endlumeConnected=sync.endlumeJobs.some(x=>x.state!=="disconnected"&&x.last_activity&&now-Date.parse(x.last_activity)<60000);
  const initials=name.split(/\s+/).slice(0,2).map(x=>x[0]).join("").toUpperCase().slice(0,2);
  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <Header title="Настройки" />
      <Card style={styles.profileCard}>
        <LinearGradient colors={[C.blue,C.violet]} style={styles.profileAvatar}><Text style={styles.profileAvatarText}>{initials}</Text></LinearGradient>
        <View><Text style={styles.profileName}>{name}</Text><Text style={styles.muted}>{sync.channels.length} каналов под управлением</Text></View>
      </Card>
      <Card style={{paddingVertical:4}}>
        <SettingsRow icon="sync-outline" label="Синхронизация" value={statusText} tone={statusTone}/>
        <SettingsRow icon="notifications-outline" label="Уведомления" value={String(sync.notifications.filter(x=>!x.read_at).length)+" событий"}/>
        <SettingsRow icon="moon-outline" label="Тёмная тема" value="Всегда"/>
        <SettingsRow icon="phone-portrait-outline" label="Подключённые устройства" value={String(sync.devices.length)} onPress={()=>{void (async()=>{
          const r=await sync.createPairingCode();
          if(!r.ok||!r.code){Alert.alert("Сопряжение VYRON",r.error||"Не удалось создать код");return}
          Alert.alert("Код для Desktop",r.code+"\n\nДействует 10 минут и сгорает после первого подключения.")
        })()}}/>
        <SettingsRow icon="logo-youtube" label="YouTube аккаунты" value={String(sync.channels.filter(x=>x.youtube_channel_id).length)} tone={C.red}/>
        <SettingsRow icon="flash-outline" label="ENDLUME" value={endlumeConnected?"● Подключено":"Нет связи"} tone={endlumeConnected?C.purple:C.sub}/>
        <SettingsRow icon="server-outline" label="Хранилище" value="—"/>
        <SettingsRow icon="shield-checkmark-outline" label="Безопасность"/>
      </Card>
      <Text style={styles.tiny}>{relativeSyncTime(sync.lastSuccessfulSyncAt)}</Text>
      <Text style={styles.sectionTitle}>Устройства</Text>
      {sync.devices.length?sync.devices.map(d=>{
        const online=now-Date.parse(d.last_seen_at)<45000;
        return <Card key={d.id}><View style={styles.rowBetween}><View><Text style={styles.cardTitle}>{d.name}</Text><Text style={[styles.muted,{color:online?C.green:C.sub}]}>{online?"● Сейчас в сети":"Последняя связь: "+new Date(d.last_seen_at).toLocaleString("ru-RU")}</Text></View><Ionicons name={d.device_kind==="desktop"?"laptop-outline":"phone-portrait-outline"} size={24} color={C.cyan}/></View></Card>
      }):<Card><Text style={styles.muted}>Устройства пока не синхронизированы</Text></Card>}
      <Pressable onPress={()=>void sync.signOut()} style={styles.logout}><Ionicons name="log-out-outline" size={19} color={C.red}/><Text style={styles.logoutText}>Выйти</Text></Pressable>
      <Text style={styles.version}>VYRON Mobile 0.1.0</Text>
    </ScrollView>
  );
}

const nav = [
  ["home","grid-outline","Главная"],
  ["channels","albums-outline","Каналы"],
  ["projects","layers-outline","Проекты"],
  ["analytics","stats-chart-outline","Аналитика"],
  ["settings","settings-outline","Настройки"],
] as const;

function AppShell() {
  const [tab,setTab]=useState<Tab>("home");
  const screen=useMemo(()=>({
    home:<HomeScreen/>,
    channels:<ChannelsScreen/>,
    projects:<ProjectsScreen/>,
    analytics:<AnalyticsScreen/>,
    settings:<SettingsScreen/>,
  })[tab],[tab]);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <StatusBar barStyle="light-content"/>
      <View style={styles.screen}>{screen}</View>
      <View style={styles.nav}>
        {nav.map(([id,icon,label])=>{
          const active=tab===id;
          return <Pressable key={id} onPress={()=>{setTab(id);Haptics.selectionAsync()}} style={({pressed})=>[styles.navItem,pressed&&{transform:[{scale:.96}]}]}>
            <View style={active?styles.navGlow:undefined}><Ionicons name={icon} size={22} color={active?C.blue:C.tertiary}/></View>
            <Text numberOfLines={1} style={[styles.navLabel,active&&styles.navLabelActive]}>{label}</Text>
          </Pressable>
        })}
      </View>
    </SafeAreaView>
  );
}

function AuthGate(){
  const sync=useVyronSyncContext();
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  if(sync.authLoading)return <SafeAreaView style={styles.safe}><View style={styles.authWrap}><Text style={styles.brand}>VYRON</Text><Text style={styles.muted}>Авторизация…</Text></View></SafeAreaView>;
  if(sync.session)return <AppShell/>;
  return <SafeAreaView style={styles.safe}><View style={styles.authWrap}><Text style={styles.brand}>VYRON</Text><Text style={styles.pageTitle}>Вход</Text><Card><Text style={styles.muted}>Аккаунт VYRON Mobile</Text><TextInput autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} placeholder="Email" placeholderTextColor={C.tertiary} style={[styles.searchInput,styles.authInput]}/><TextInput secureTextEntry value={password} onChangeText={setPassword} placeholder="Пароль" placeholderTextColor={C.tertiary} style={[styles.searchInput,styles.authInput]}/>{error?<Text style={[styles.muted,{color:C.red}]}>{error}</Text>:null}<Pressable disabled={busy} onPress={async()=>{setBusy(true);setError("");const r=await sync.signIn(email,password);if(!r.ok)setError(r.error||"Ошибка входа");setBusy(false)}} style={({pressed})=>[styles.primaryButton,pressed&&{transform:[{scale:.98}]},busy&&{opacity:.6}]}><Text style={styles.primaryButtonText}>{busy?"Вход…":"Войти"}</Text></Pressable></Card></View></SafeAreaView>;
}

export default function App() {
  return <SafeAreaProvider><VyronSyncProvider><AuthGate/></VyronSyncProvider></SafeAreaProvider>;
}

const styles=StyleSheet.create({
  safe:{flex:1,backgroundColor:C.bg},
  screen:{flex:1,backgroundColor:C.bg},
  content:{paddingHorizontal:16,paddingBottom:110,gap:12},
  header:{paddingTop:8,paddingBottom:8,flexDirection:"row",alignItems:"flex-start",justifyContent:"space-between"},
  brand:{color:C.text,fontSize:28,fontWeight:"900",letterSpacing:3.2},
  pageTitle:{color:C.text,fontSize:32,fontWeight:"800",marginTop:12,letterSpacing:-.6},
  syncMeta:{color:C.amber,fontSize:10,fontWeight:"700",marginTop:5},
  iconButton:{width:44,height:44,borderRadius:16,borderWidth:1,borderColor:C.border,backgroundColor:"#0E1624",alignItems:"center",justifyContent:"center"},
  notificationDot:{position:"absolute",right:10,top:9,width:7,height:7,borderRadius:4,backgroundColor:C.red},
  card:{borderRadius:22,borderWidth:1,borderColor:C.border,padding:16,overflow:"hidden"},
  hero:{padding:18},
  eyebrow:{color:C.sub,fontSize:11,fontWeight:"800",letterSpacing:1.4},
  heroValue:{color:C.text,fontSize:31,fontWeight:"900",letterSpacing:-.8,marginTop:7},
  heroSub:{color:C.sub,fontSize:13,marginTop:4},
  heroStats:{flexDirection:"row",justifyContent:"space-between",marginTop:20},
  heroStatValue:{color:C.text,fontSize:18,fontWeight:"800"},
  heroStatLabel:{color:C.tertiary,fontSize:10,marginTop:3},
  sectionHead:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",marginTop:5},
  sectionTitle:{color:C.text,fontSize:17,fontWeight:"800"},
  sectionAction:{color:C.blue,fontSize:12,fontWeight:"700"},
  grid2:{flexDirection:"row",flexWrap:"wrap",gap:10},
  compact:{width:"48.5%",minHeight:116},
  compactValue:{color:C.text,fontSize:27,fontWeight:"900",marginTop:11},
  compactLabel:{color:C.sub,fontSize:11,marginTop:3},
  rowBetween:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:10},
  cardTitle:{color:C.text,fontSize:15,fontWeight:"800"},
  muted:{color:C.sub,fontSize:12,marginTop:3},
  badge:{alignSelf:"flex-start",minHeight:30,borderRadius:12,borderWidth:1,paddingHorizontal:10,flexDirection:"row",alignItems:"center",gap:7},
  badgeText:{fontSize:10,fontWeight:"800"},
  dot:{width:6,height:6,borderRadius:3},
  progressTrack:{height:6,borderRadius:6,backgroundColor:"#1A2435",overflow:"hidden",marginTop:14},
  progressFill:{height:"100%",borderRadius:6},
  primaryButton:{minHeight:48,borderRadius:16,backgroundColor:C.blue,flexDirection:"row",gap:7,alignItems:"center",justifyContent:"center"},
  primaryButtonText:{color:"#fff",fontSize:14,fontWeight:"800"},
  search:{height:48,borderRadius:16,borderWidth:1,borderColor:C.border,backgroundColor:"#0D1522",paddingHorizontal:14,flexDirection:"row",alignItems:"center",gap:10},
  searchInput:{flex:1,color:C.text,fontSize:14},
  filters:{gap:8,paddingRight:16},
  filter:{height:36,paddingHorizontal:14,borderRadius:13,borderWidth:1,borderColor:C.border,justifyContent:"center",backgroundColor:"#0D1522"},
  filterActive:{borderColor:C.blue+"77",backgroundColor:C.blue+"18"},
  filterText:{color:C.sub,fontSize:12,fontWeight:"700"},
  filterTextActive:{color:C.text},
  channelTop:{flexDirection:"row",alignItems:"center",gap:11},
  avatar:{width:44,height:44,borderRadius:15,alignItems:"center",justifyContent:"center"},
  avatarText:{color:"#fff",fontWeight:"900",fontSize:12},
  avatarImage:{width:"100%",height:"100%",borderRadius:15},
  metricsRow:{flexDirection:"row",justifyContent:"space-between",marginTop:17,paddingRight:40},
  metricValue:{color:C.text,fontSize:21,fontWeight:"900"},
  metricLabel:{color:C.tertiary,fontSize:10,marginTop:2},
  metricDelta:{fontSize:10,fontWeight:"800",marginTop:3},
  rule:{height:1,backgroundColor:C.border,marginVertical:14},
  subtitle:{color:C.sub,fontSize:13,marginTop:-7,marginBottom:2},
  kpi:{width:"48.5%",minHeight:110},
  kpiValue:{color:C.text,fontSize:24,fontWeight:"900",letterSpacing:-.5},
  kpiLabel:{color:C.sub,fontSize:11,marginTop:4},
  kpiDelta:{fontSize:11,fontWeight:"800",marginTop:8},
  projectMeta:{flexDirection:"row",justifyContent:"space-between",marginTop:14},
  tiny:{color:C.tertiary,fontSize:10},
  retry:{alignSelf:"flex-start",marginTop:14,minHeight:38,borderRadius:12,borderWidth:1,borderColor:C.red+"55",paddingHorizontal:13,flexDirection:"row",alignItems:"center",gap:7,backgroundColor:C.red+"12"},
  retryText:{color:C.text,fontSize:11,fontWeight:"800"},
  segment:{height:42,padding:4,borderRadius:14,borderWidth:1,borderColor:C.border,backgroundColor:"#0D1522",flexDirection:"row"},
  segmentItem:{flex:1,alignItems:"center",justifyContent:"center",borderRadius:10},
  segmentActive:{backgroundColor:C.blue+"22",borderWidth:1,borderColor:C.blue+"44"},
  segmentText:{color:C.tertiary,fontSize:11,fontWeight:"700"},
  segmentTextActive:{color:C.text},
  rankCard:{flexDirection:"row",alignItems:"center",gap:12},
  rank:{color:C.tertiary,fontSize:16,fontWeight:"900",width:18},
  trafficWrap:{flexDirection:"row",alignItems:"center",gap:25,marginTop:8},
  profileCard:{flexDirection:"row",alignItems:"center",gap:13},
  profileAvatar:{width:54,height:54,borderRadius:18,alignItems:"center",justifyContent:"center"},
  profileAvatarText:{color:"#fff",fontSize:17,fontWeight:"900"},
  profileName:{color:C.text,fontSize:18,fontWeight:"900"},
  settingsRow:{minHeight:56,flexDirection:"row",alignItems:"center",gap:10,borderBottomWidth:1,borderBottomColor:C.border},
  settingsIcon:{width:34,height:34,borderRadius:11,alignItems:"center",justifyContent:"center"},
  settingsLabel:{color:C.text,fontSize:13,fontWeight:"700",flex:1},
  settingsValue:{color:C.sub,fontSize:10},
  logout:{minHeight:48,borderRadius:16,borderWidth:1,borderColor:C.red+"55",backgroundColor:C.red+"0E",flexDirection:"row",alignItems:"center",justifyContent:"center",gap:8},
  logoutText:{color:C.red,fontWeight:"800",fontSize:13},
  version:{textAlign:"center",color:C.tertiary,fontSize:10,marginTop:1},
  authWrap:{flex:1,justifyContent:"center",paddingHorizontal:20,gap:14},
  authInput:{height:48,marginTop:12,borderRadius:14,borderWidth:1,borderColor:C.border,backgroundColor:"#0D1522",paddingHorizontal:14},
  nav:{position:"absolute",left:0,right:0,bottom:0,minHeight:82,paddingTop:10,paddingBottom:18,paddingHorizontal:8,flexDirection:"row",backgroundColor:"rgba(8,13,22,0.96)",borderTopWidth:1,borderTopColor:C.border},
  navItem:{flex:1,minHeight:50,alignItems:"center",justifyContent:"center",gap:5},
  navGlow:{shadowColor:C.blue,shadowOpacity:.75,shadowRadius:12,shadowOffset:{width:0,height:0}},
  navLabel:{color:C.tertiary,fontSize:8.5,fontWeight:"700"},
  navLabelActive:{color:C.blue},
});
