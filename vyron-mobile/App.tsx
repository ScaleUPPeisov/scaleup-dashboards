import React, { useMemo, useState } from "react";
import {
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

const channels = [
  { name: "Neon Drive", subs: "1 847", delta: "+21", today: "18 430", period: "126 000", growth: "↑16%", days: 23, videos: 23, status: "Всё нормально", tone: C.green },
  { name: "Midnight Cruise", subs: "3 204", delta: "+37", today: "26 910", period: "188 400", growth: "↑24%", days: 6, videos: 6, status: "Нужно добавить видео", tone: C.amber },
  { name: "Velvet Nights", subs: "986", delta: "+8", today: "7 430", period: "54 200", growth: "↑9%", days: 15, videos: 15, status: "Публикация сегодня", tone: C.cyan },
  { name: "After 2AM", subs: "2 418", delta: "-4", today: "11 070", period: "99 100", growth: "↓3%", days: 0, videos: 0, status: "Ошибка загрузки", tone: C.red },
];

const projects = [
  { id: "VIDEO_241", channel: "Neon Drive", status: "READY_RENDER", tone: C.cyan, meta: "2:34 · 12 треков", device: "Mac mini", time: "Сегодня, 14:32" },
  { id: "VIDEO_242", channel: "Midnight Cruise", status: "RENDERING", tone: C.purple, meta: "2:12 · 10 треков", device: "MacBook Air M1", time: "Сейчас", progress: 68 },
  { id: "VIDEO_239", channel: "Velvet Nights", status: "COMPLETED", tone: C.green, meta: "2:06 · 10 треков", device: "Mac mini", time: "Сегодня, 12:14" },
  { id: "VIDEO_238", channel: "After 2AM", status: "ERROR", tone: C.red, meta: "1:58 · 10 треков", device: "MacBook Air M1", time: "Сегодня, 11:42" },
];

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
  return (
    <View style={styles.header}>
      <View>
        <Text style={styles.brand}>VYRON</Text>
        <Text style={styles.pageTitle}>{title}</Text>
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

function Sparkline({ tone = C.blue }: { tone?: string }) {
  return (
    <Svg width="104" height="38" viewBox="0 0 104 38">
      <Path d="M2 30 C13 27, 15 18, 25 22 S42 29, 52 17 S70 19, 80 10 S95 12, 102 4" fill="none" stroke={tone} strokeWidth="2.5" strokeLinecap="round" />
    </Svg>
  );
}

function Kpi({ value, label, delta }: { value: string; label: string; delta: string }) {
  return (
    <Card style={styles.kpi}>
      <Text style={styles.kpiValue}>{value}</Text>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={[styles.kpiDelta, { color: delta.startsWith("↓") ? C.red : C.green }]}>{delta}</Text>
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
  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <Header title="Главная" />
      <Card style={styles.hero}>
        <Text style={styles.eyebrow}>СЕТЬ КАНАЛОВ</Text>
        <Text style={styles.heroValue}>35 каналов</Text>
        <Text style={styles.heroSub}>32 работают штатно · 3 требуют внимания</Text>
        <View style={styles.heroStats}>
          <View><Text style={styles.heroStatValue}>3.8M</Text><Text style={styles.heroStatLabel}>просмотров / 28д</Text></View>
          <View><Text style={styles.heroStatValue}>+8 420</Text><Text style={styles.heroStatLabel}>подписчиков</Text></View>
          <View><Text style={styles.heroStatValue}>92%</Text><Text style={styles.heroStatLabel}>в норме</Text></View>
        </View>
      </Card>

      <View style={styles.sectionHead}><Text style={styles.sectionTitle}>Сейчас</Text><Text style={styles.sectionAction}>Live</Text></View>
      <View style={styles.grid2}>
        <Card style={styles.compact}><Ionicons name="cloud-upload-outline" size={20} color={C.cyan} /><Text style={styles.compactValue}>4</Text><Text style={styles.compactLabel}>публикации сегодня</Text></Card>
        <Card style={styles.compact}><Ionicons name="flash-outline" size={20} color={C.purple} /><Text style={styles.compactValue}>3</Text><Text style={styles.compactLabel}>рендерятся</Text></Card>
        <Card style={styles.compact}><Ionicons name="checkmark-circle-outline" size={20} color={C.green} /><Text style={styles.compactValue}>27</Text><Text style={styles.compactLabel}>готово</Text></Card>
        <Card style={styles.compact}><Ionicons name="warning-outline" size={20} color={C.red} /><Text style={styles.compactValue}>2</Text><Text style={styles.compactLabel}>ошибки</Text></Card>
      </View>

      <View style={styles.sectionHead}><Text style={styles.sectionTitle}>Требует внимания</Text><Text style={styles.sectionAction}>3</Text></View>
      <Card>
        <View style={styles.rowBetween}><View><Text style={styles.cardTitle}>Midnight Cruise</Text><Text style={styles.muted}>Запас контента заканчивается</Text></View><StatusBadge label="6 дней" tone={C.amber} /></View>
      </Card>
      <Card>
        <View style={styles.rowBetween}><View><Text style={styles.cardTitle}>After 2AM</Text><Text style={styles.muted}>Ошибка последней загрузки</Text></View><StatusBadge label="Ошибка" tone={C.red} /></View>
      </Card>

      <View style={styles.sectionHead}><Text style={styles.sectionTitle}>ENDLUME</Text><Text style={[styles.sectionAction,{color:C.green}]}>● Онлайн</Text></View>
      <Card>
        <View style={styles.rowBetween}><View><Text style={styles.cardTitle}>MacBook Air M1</Text><Text style={styles.muted}>Rendering VIDEO_242</Text></View><Text style={[styles.kpiDelta,{color:C.purple}]}>68%</Text></View>
        <View style={styles.progressTrack}><LinearGradient colors={[C.blue,C.purple]} style={[styles.progressFill,{width:"68%"}]} /></View>
      </Card>
    </ScrollView>
  );
}

function ChannelsScreen() {
  const [filter, setFilter] = useState("Все");
  const [q, setQ] = useState("");
  const filtered = channels.filter(c => c.name.toLowerCase().includes(q.toLowerCase()) && (filter === "Все" || (filter === "Нужен контент" && c.tone === C.amber) || (filter === "Ошибки" && c.tone === C.red) || (filter === "Активные" && c.tone !== C.red)));
  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <Header title="Каналы" />
      <Pressable style={({pressed})=>[styles.primaryButton,pressed&&{transform:[{scale:.98}]}]} onPress={()=>Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}>
        <Ionicons name="add" size={20} color="#fff" /><Text style={styles.primaryButtonText}>Добавить канал</Text>
      </Pressable>
      <View style={styles.search}><Ionicons name="search" size={18} color={C.tertiary}/><TextInput value={q} onChangeText={setQ} placeholder="Поиск каналов…" placeholderTextColor={C.tertiary} style={styles.searchInput}/></View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
        {["Все","Активные","Нужен контент","Ошибки"].map(x=><Pressable key={x} onPress={()=>{setFilter(x);Haptics.selectionAsync()}} style={[styles.filter,filter===x&&styles.filterActive]}><Text style={[styles.filterText,filter===x&&styles.filterTextActive]}>{x}</Text></Pressable>)}
      </ScrollView>
      {filtered.map((c,i)=>(
        <Pressable key={c.name} style={({pressed})=>pressed&&{transform:[{scale:.98}]}}>
          <Card>
            <View style={styles.channelTop}>
              <LinearGradient colors={[C.blue,C.violet]} style={styles.avatar}><Text style={styles.avatarText}>{String(i+1).padStart(2,"0")}</Text></LinearGradient>
              <View style={{flex:1}}><Text style={styles.cardTitle}>{c.name}</Text><Text style={styles.muted}>{c.subs} подписчиков <Text style={{color:c.delta.startsWith("-")?C.red:C.green}}>{c.delta}</Text></Text></View>
              <Sparkline tone={c.tone}/>
            </View>
            <View style={styles.metricsRow}>
              <View><Text style={styles.metricValue}>{c.today}</Text><Text style={styles.metricLabel}>сегодня</Text><Text style={[styles.metricDelta,{color:C.green}]}>{c.growth}</Text></View>
              <View><Text style={styles.metricValue}>{c.period}</Text><Text style={styles.metricLabel}>за 28 дней</Text><Text style={[styles.metricDelta,{color:C.green}]}>↑32%</Text></View>
            </View>
            <View style={styles.rule}/>
            <View style={styles.rowBetween}><Text style={styles.muted}>{c.videos} видео готово</Text><Text style={styles.muted}>Запас: <Text style={{color:c.tone,fontWeight:"700"}}>{c.days} дней</Text></Text></View>
            <View style={{marginTop:12}}><StatusBadge label={c.status} tone={c.tone}/></View>
          </Card>
        </Pressable>
      ))}
    </ScrollView>
  );
}

function ProjectsScreen() {
  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <Header title="Проекты" />
      <Text style={styles.subtitle}>Управляйте своими видеопроектами</Text>
      <View style={styles.grid2}>
        <Kpi value="12" label="готовы" delta="↑2"/>
        <Kpi value="3" label="рендерятся" delta="↑1"/>
        <Kpi value="27" label="завершено" delta="↑8"/>
        <Kpi value="2" label="ошибки" delta="↓1"/>
      </View>
      <View style={styles.search}><Ionicons name="search" size={18} color={C.tertiary}/><TextInput placeholder="Поиск проектов…" placeholderTextColor={C.tertiary} style={styles.searchInput}/></View>
      {projects.map(p=>(
        <Card key={p.id}>
          <View style={styles.rowBetween}><View><Text style={styles.cardTitle}>{p.id} — {p.channel}</Text><Text style={styles.muted}>{p.meta}</Text></View><StatusBadge label={p.status} tone={p.tone}/></View>
          <View style={styles.projectMeta}><Text style={styles.tiny}>{p.time}</Text><Text style={styles.tiny}>{p.device}</Text></View>
          {p.progress ? <><View style={styles.progressTrack}><LinearGradient colors={[C.blue,C.purple]} style={[styles.progressFill,{width:`${p.progress}%`}]} /></View><Text style={[styles.tiny,{color:C.purple,marginTop:7}]}>{p.progress}%</Text></> : null}
          {p.status==="ERROR" ? <Pressable onPress={()=>Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)} style={styles.retry}><Ionicons name="refresh" size={16} color={C.text}/><Text style={styles.retryText}>Повторить</Text></Pressable> : null}
        </Card>
      ))}
    </ScrollView>
  );
}

function BigChart() {
  return (
    <Card style={{paddingBottom:14}}>
      <View style={styles.rowBetween}><View><Text style={styles.eyebrow}>РОСТ ПРОСМОТРОВ</Text><Text style={styles.heroValue}>3.8M</Text></View><Text style={[styles.kpiDelta,{color:C.green}]}>↑16%</Text></View>
      <Svg width="100%" height="170" viewBox="0 0 340 170">
        <Defs><SvgGradient id="g" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor={C.blue} stopOpacity=".30"/><Stop offset="1" stopColor={C.blue} stopOpacity="0"/></SvgGradient></Defs>
        <Path d="M0 148 C35 135 40 115 72 122 S118 140 146 96 S204 112 228 70 S278 78 340 24 L340 170 L0 170 Z" fill="url(#g)"/>
        <Path d="M0 148 C35 135 40 115 72 122 S118 140 146 96 S204 112 228 70 S278 78 340 24" fill="none" stroke={C.blue} strokeWidth="3" strokeLinecap="round"/>
      </Svg>
    </Card>
  );
}

function AnalyticsScreen() {
  const [period,setPeriod]=useState("28 дней");
  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <Header title="Аналитика" />
      <View style={styles.grid2}>
        <Kpi value="3.8M" label="Просмотры" delta="↑16%"/>
        <Kpi value="+8 420" label="Подписчики" delta="↑24%"/>
        <Kpi value="28.4K ч" label="Watch time" delta="↑32%"/>
        <Kpi value="6.2%" label="CTR" delta="↑1.3%"/>
      </View>
      <View style={styles.segment}>{["7 дней","28 дней","90 дней"].map(x=><Pressable key={x} onPress={()=>{setPeriod(x);Haptics.selectionAsync()}} style={[styles.segmentItem,period===x&&styles.segmentActive]}><Text style={[styles.segmentText,period===x&&styles.segmentTextActive]}>{x}</Text></Pressable>)}</View>
      <BigChart/>
      <View style={styles.sectionHead}><Text style={styles.sectionTitle}>Топ каналов</Text><Text style={styles.sectionAction}>{period}</Text></View>
      {channels.slice(0,3).map((c,i)=><Card key={c.name} style={styles.rankCard}><Text style={styles.rank}>{i+1}</Text><View style={{flex:1}}><Text style={styles.cardTitle}>{c.name}</Text><Text style={styles.muted}>{c.period} просмотров</Text></View><Sparkline tone={i===0?C.green:C.blue}/></Card>)}
      <Card>
        <Text style={styles.sectionTitle}>Источники трафика</Text>
        <View style={styles.trafficWrap}>
          <Svg width="120" height="120" viewBox="0 0 120 120">
            <Circle cx="60" cy="60" r="44" stroke="#192335" strokeWidth="14" fill="none"/>
            <Circle cx="60" cy="60" r="44" stroke={C.blue} strokeWidth="14" fill="none" strokeDasharray="185 92" strokeLinecap="round" transform="rotate(-90 60 60)"/>
          </Svg>
          <View style={{gap:10}}><Text style={styles.muted}>● Рекомендации 67%</Text><Text style={styles.muted}>● Поиск 18%</Text><Text style={styles.muted}>● Внешние 9%</Text><Text style={styles.muted}>● Другое 6%</Text></View>
        </View>
      </Card>
    </ScrollView>
  );
}

function SettingsRow({icon,label,value,tone=C.cyan}:{icon:any;label:string;value?:string;tone?:string}) {
  return <Pressable onPress={()=>Haptics.selectionAsync()} style={({pressed})=>[styles.settingsRow,pressed&&{opacity:.72}]}><View style={[styles.settingsIcon,{backgroundColor:tone+"18"}]}><Ionicons name={icon} size={20} color={tone}/></View><Text style={styles.settingsLabel}>{label}</Text>{value?<Text style={styles.settingsValue}>{value}</Text>:null}<Ionicons name="chevron-forward" size={18} color={C.tertiary}/></Pressable>;
}

function SettingsScreen() {
  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <Header title="Настройки" />
      <Card style={styles.profileCard}>
        <LinearGradient colors={[C.blue,C.violet]} style={styles.profileAvatar}><Text style={styles.profileAvatarText}>КП</Text></LinearGradient>
        <View><Text style={styles.profileName}>Кирилл Пейсов</Text><Text style={styles.muted}>35 каналов под управлением</Text></View>
      </Card>
      <Card style={{paddingVertical:4}}>
        <SettingsRow icon="sync-outline" label="Синхронизация" value="● Онлайн" tone={C.green}/>
        <SettingsRow icon="notifications-outline" label="Уведомления" value="Включены"/>
        <SettingsRow icon="moon-outline" label="Тёмная тема" value="Всегда"/>
        <SettingsRow icon="phone-portrait-outline" label="Подключённые устройства" value="2"/>
        <SettingsRow icon="logo-youtube" label="YouTube аккаунты" value="35" tone={C.red}/>
        <SettingsRow icon="flash-outline" label="ENDLUME" value="● Подключено" tone={C.purple}/>
        <SettingsRow icon="server-outline" label="Хранилище" value="TOSHIBA"/>
        <SettingsRow icon="shield-checkmark-outline" label="Безопасность"/>
      </Card>
      <Text style={styles.sectionTitle}>Устройства</Text>
      <Card><View style={styles.rowBetween}><View><Text style={styles.cardTitle}>MacBook Air M1</Text><Text style={[styles.muted,{color:C.green}]}>● Сейчас в сети</Text></View><Ionicons name="laptop-outline" size={24} color={C.cyan}/></View></Card>
      <Card><View style={styles.rowBetween}><View><Text style={styles.cardTitle}>iPhone 14 Pro</Text><Text style={[styles.muted,{color:C.green}]}>● Сейчас в сети</Text></View><Ionicons name="phone-portrait-outline" size={24} color={C.cyan}/></View></Card>
      <Pressable style={styles.logout}><Ionicons name="log-out-outline" size={19} color={C.red}/><Text style={styles.logoutText}>Выйти</Text></Pressable>
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

export default function App() {
  return <SafeAreaProvider><AppShell/></SafeAreaProvider>;
}

const styles=StyleSheet.create({
  safe:{flex:1,backgroundColor:C.bg},
  screen:{flex:1,backgroundColor:C.bg},
  content:{paddingHorizontal:16,paddingBottom:110,gap:12},
  header:{paddingTop:8,paddingBottom:8,flexDirection:"row",alignItems:"flex-start",justifyContent:"space-between"},
  brand:{color:C.text,fontSize:28,fontWeight:"900",letterSpacing:3.2},
  pageTitle:{color:C.text,fontSize:32,fontWeight:"800",marginTop:12,letterSpacing:-.6},
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
  nav:{position:"absolute",left:0,right:0,bottom:0,minHeight:82,paddingTop:10,paddingBottom:18,paddingHorizontal:8,flexDirection:"row",backgroundColor:"rgba(8,13,22,0.96)",borderTopWidth:1,borderTopColor:C.border},
  navItem:{flex:1,minHeight:50,alignItems:"center",justifyContent:"center",gap:5},
  navGlow:{shadowColor:C.blue,shadowOpacity:.75,shadowRadius:12,shadowOffset:{width:0,height:0}},
  navLabel:{color:C.tertiary,fontSize:8.5,fontWeight:"700"},
  navLabelActive:{color:C.blue},
});
