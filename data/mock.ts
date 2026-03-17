// ── Types ─────────────────────────────────────────────────────────────────────
export interface Group {
  id: string;
  name: string;
  emoji: string;
  palette: number;
  desc: string;
  superAdmin: string;
  isAdmin: boolean;
  members: string[];
}

export interface Rsvp {
  name: string;
  status: 'going' | 'maybe' | 'notGoing';
  memo: string;
}

export interface Comment {
  id: string;
  name: string;
  text: string;
  photos: string[];
  ts: Date;
}

export interface Event {
  id: string;
  groupId: string;
  title: string;
  subtitle?: string;
  description?: string;
  coverPhotos: string[];
  start: Date;
  end: Date;
  isAllDay?: boolean;
  location?: string;
  minAttendees?: number;
  deadline?: Date;
  allowMaybe?: boolean;
  tags?: string[];
  rsvps: Rsvp[];
  noResponse: string[];
  comments: Comment[];
}

export interface Notification {
  id: string;
  type: string;
  read: boolean;
  ts: Date;
  icon: string;
  title: string;
  body: string;
  groupId?: string | null;
  eventId?: string;
  navigable: boolean;
  dest: 'event' | 'group' | null;
}

export interface PublicGroup {
  id: string;
  name: string;
  emoji: string;
  palette: number;
  desc: string;
  memberCount: number;
}

// ── Current User ──────────────────────────────────────────────────────────────
export const ME = { name: 'Jenny', handle: 'jenny.ktown.92' };
export const MY_NAME = 'Jenny · KTown · 92';

// ── Tags ──────────────────────────────────────────────────────────────────────
export const TAGS = ['번개','food','drinks','hiking','sports','kids','culture','networking','KBBQ','brunch'];

// ── Helpers ───────────────────────────────────────────────────────────────────
function dt(offsetDays: number, h = 19, m = 0): Date {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  d.setHours(h, m, 0, 0);
  return d;
}
export function uid(): string { return Math.random().toString(36).slice(2, 9); }
function cmt(name: string, text: string, minsAgo: number): Comment {
  return { id: uid(), name, text, photos: [], ts: new Date(Date.now() - minsAgo * 60000) };
}

// ── Groups ────────────────────────────────────────────────────────────────────
export const GROUPS: Group[] = [
  {
    id: 'g1', name: 'KTown Hangout', emoji: '🏙️', palette: 0,
    desc: 'Friday nights, pocha runs, random KTown adventures. Everyone welcome!',
    superAdmin: 'Jenny · KTown · 92', isAdmin: true,
    members: ['Jenny · KTown · 92','지훈 · LA · 90','Mike · KTown · 88','수연 · LA · 93','David · SGV · 89','Haru · Lamirada · 80','Jay · LA · 83','가후 · OC · 88'],
  },
  {
    id: 'g2', name: 'SGV Foodies', emoji: '🍜', palette: 1,
    desc: 'Exploring the best of SGV — dim sum, KBBQ, and everything in between.',
    superAdmin: '민지 · SGV · 88', isAdmin: false,
    members: ['Jenny · KTown · 92','민지 · SGV · 88','Chris · LA · 90','Amy · OC · 91','상훈 · SGV · 87','Jay · LA · 83','Hannah · SGV · 92'],
  },
  {
    id: 'g4', name: 'LA Hiking Crew', emoji: '⛰️', palette: 3,
    desc: 'Weekend hikes across LA — Griffith, Mt. Baldy, Runyon. All levels welcome.',
    superAdmin: 'Jenny · KTown · 92', isAdmin: true,
    members: ['Jenny · KTown · 92','준혁 · LA · 91','Lisa · Glendale · 89','태현 · LA · 88','Brian · Burbank · 90','Chloe · LA · 93'],
  },
];

export const PUBLIC_GROUPS: PublicGroup[] = [
  { id:'pg1', name:'Koreatown Running Club', emoji:'🏃', palette:0, desc:'Morning runs every Tuesday and Saturday.', memberCount:34 },
  { id:'pg2', name:'K-Drama Watch Party', emoji:'🎬', palette:1, desc:'Weekly watch parties — currently on Squid Game S3.', memberCount:21 },
  { id:'pg3', name:'LA Korean Entrepreneurs', emoji:'💼', palette:2, desc:'Networking, mentorship, and startup support.', memberCount:58 },
  { id:'pg4', name:'KTown Volleyball', emoji:'🏐', palette:3, desc:'Sunday volleyball at Koreatown Rec Center.', memberCount:19 },
];

// ── Events ────────────────────────────────────────────────────────────────────
export const ALL_EVENTS: Event[] = ([
  // past
  { id:'p1', groupId:'g4', title:'Mt. Baldy Day Hike 🏔️', subtitle:'발디산 당일 등산',
    description:'Sunrise hike at Griffith — meet at the Observatory parking lot.\n\n🥾 Difficulty: Easy-Moderate (3.5 miles)\n🧴 Bring water, sunscreen, layers\n⏰ We leave at 5:30 sharp!\n\nTrail map: https://www.laparks.org/griffithpark',
    coverPhotos:[], start:dt(-8,7,0), end:dt(-8,15,0), location:'Mt. Baldy Trailhead · Mt. Baldy Village',
    minAttendees:4, allowMaybe:true, tags:['hiking'],
    rsvps:[{name:'준혁 · LA · 91',status:'going',memo:''},{name:'Lisa · Glendale · 89',status:'going',memo:''},{name:'태현 · LA · 88',status:'going',memo:''},{name:'Brian · Burbank · 90',status:'going',memo:''}],
    noResponse:[], comments:[cmt('Brian · Burbank · 90','that was epic!',5760)] },

  { id:'p2', groupId:'g1', title:'아침 해장국 번개 🍲', subtitle:'Hangover cure Sunday',
    coverPhotos:[], start:dt(-5,10,0), end:dt(-5,12,0), location:'Chunju Han-il Kwan · Koreatown',
    minAttendees:3, allowMaybe:false, tags:['번개','food'],
    rsvps:[{name:'Jenny · KTown · 92',status:'going',memo:''},{name:'지훈 · LA · 90',status:'going',memo:''},{name:'Mike · KTown · 88',status:'going',memo:'needed this lol'}],
    noResponse:[], comments:[] },

  // today / upcoming
  { id:'e1', groupId:'g1', title:'금요일 포차 번개 🍻', subtitle:'Friday night @ Pocha 32',
    description:'이번주 금요일 포차 32에서 모여요!\n\n🍺 포차 특선 안주 세트 인당 15불 예정\n📍 주차는 건물 뒤 골목에 있어요\n\nMore info: https://pocha32.com',
    coverPhotos:[], start:dt(0,20,0), end:dt(0,23,0), location:'Pocha 32 · 3211 W 6th St, Koreatown',
    minAttendees:5, deadline:dt(0,18,0), allowMaybe:true, tags:['번개','drinks'],
    rsvps:[
      {name:'Jenny · KTown · 92',status:'going',memo:''},
      {name:'지훈 · LA · 90',status:'going',memo:'조금 늦을 수도'},
      {name:'Mike · KTown · 88',status:'going',memo:''},
      {name:'수연 · LA · 93',status:'going',memo:'8시 반쯤'},
      {name:'David · SGV · 89',status:'notGoing',memo:'이번엔 못 가요 ㅠ'},
    ],
    noResponse:['Haru · Lamirada · 80','Jay · LA · 83','가후 · OC · 88','글즈 · LA · 88'],
    comments:[
      cmt('지훈 · LA · 90','이번주 드디어다 🔥',180),
      cmt('수연 · LA · 93','나 좀 늦을게',160),
      cmt('Jenny · KTown · 92','all good i\'ll grab a table',150),
      cmt('David · SGV · 89','주차 어디가 좋아요?',80),
      cmt('Jenny · KTown · 92','side alley behind the restaurant',75),
    ] },

  { id:'e2', groupId:'g2', title:'SGV Dim Sum Run 🥟', subtitle:'딤섬 먹으러 가요',
    coverPhotos:[], start:dt(0,11,0), end:dt(0,13,0), location:'Sea Harbour Seafood · Rosemead',
    minAttendees:4, deadline:dt(0,9,0), allowMaybe:false, tags:['food'],
    rsvps:[{name:'민지 · SGV · 88',status:'going',memo:''},{name:'Chris · LA · 90',status:'going',memo:'first time!'},{name:'Amy · OC · 91',status:'going',memo:''},{name:'상훈 · SGV · 87',status:'going',memo:''}],
    noResponse:['Jay · LA · 83'],
    comments:[cmt('Chris · LA · 90','what should i order?',60),cmt('민지 · SGV · 88','하가우랑 창펀 꼭!',45)] },

  { id:'e4', groupId:'g4', title:'그리피스 일출 하이킹 🌄', subtitle:'Griffith Park sunrise hike',
    description:'Sunrise hike at Griffith — meet at the Observatory parking lot.\n\n🥾 Difficulty: Easy-Moderate\n🧴 Bring water, sunscreen, layers\n\nTrail map: https://www.laparks.org/griffithpark',
    coverPhotos:[], start:dt(2,5,30), end:dt(2,9,0), location:'Griffith Observatory · Los Angeles',
    minAttendees:4, deadline:dt(1,20,0), allowMaybe:true, tags:['hiking'],
    rsvps:[{name:'Jenny · KTown · 92',status:'going',memo:'커피 사갈게요'},{name:'Lisa · Glendale · 89',status:'going',memo:'so early but worth it'}],
    noResponse:['Brian · Burbank · 90','Chloe · LA · 93'],
    comments:[] },

  { id:'e5', groupId:'g5' as any, title:'3-on-3 농구 🏀', subtitle:'Sunday pick-up at Wilson courts',
    coverPhotos:[], start:dt(3,18,0), end:dt(3,20,0), location:'Wilson High School Courts · Hacienda Heights',
    minAttendees:6, deadline:dt(2,18,0), allowMaybe:false, tags:['sports'],
    rsvps:[{name:'정민 · LA · 92',status:'going',memo:''},{name:'Alex · KTown · 90',status:'going',memo:"i'll bring the ball"}],
    noResponse:['Danny · SGV · 88','스티브 · LA · 91','영호 · LA · 89'],
    comments:[] },

  { id:'e6', groupId:'g1', title:'Norebang Night 🎤', subtitle:'노래방 가자~ Pharaoh\'s',
    coverPhotos:[], start:dt(4,21,30), end:dt(5,0,0), location:"Pharaoh's Karaoke · 3680 Wilshire Blvd",
    minAttendees:4, deadline:dt(3,20,0), allowMaybe:true, tags:['번개','drinks'],
    rsvps:[
      {name:'Jenny · KTown · 92',status:'going',memo:''},
      {name:'지훈 · LA · 90',status:'going',memo:'18번 연습함 ㅋ'},
      {name:'수연 · LA · 93',status:'going',memo:''},
      {name:'Cathy · KTown · 88',status:'going',memo:'never done this lol'},
    ],
    noResponse:['Mike · KTown · 88'],
    comments:[cmt('Cathy · KTown · 88','do i need to know korean songs?',300),cmt('Jenny · KTown · 92','nope! tons of english too',280)] },

  { id:'e7', groupId:'g2', title:'KBBQ + 소주 한 잔 🥩', subtitle:'Team dinner — Genwa on Wilshire',
    coverPhotos:[], start:dt(6,19,0), end:dt(6,22,0), location:'Genwa Korean BBQ · 5115 Wilshire Blvd',
    minAttendees:6, allowMaybe:false, tags:['KBBQ','food'],
    rsvps:[{name:'민지 · SGV · 88',status:'going',memo:'삼겹살 무조건'},{name:'상훈 · SGV · 87',status:'going',memo:''}],
    noResponse:['Chris · LA · 90','Amy · OC · 91','Jay · LA · 83'],
    comments:[] },
] as Event[]).sort((a, b) => a.start.getTime() - b.start.getTime());

export function addEvent(event: Event): void {
  ALL_EVENTS.push(event);
  ALL_EVENTS.sort((a, b) => a.start.getTime() - b.start.getTime());
}

// ── Notifications ─────────────────────────────────────────────────────────────
export const INIT_NOTIFICATIONS: Notification[] = [
  { id:'n1', type:'invite_approved', read:false, ts:new Date(Date.now()-1800000),
    icon:'✅', title:'Invite approved', body:"You've been added to KTown Hangout",
    groupId:'g1', navigable:true, dest:'group' },
  { id:'n2', type:'event_update', read:false, ts:new Date(Date.now()-3600000),
    icon:'📍', title:'Location updated', body:'그리피스 일출 하이킹 — location changed',
    groupId:'g4', eventId:'e4', navigable:true, dest:'event' },
  { id:'n3', type:'new_rsvp', read:false, ts:new Date(Date.now()-7200000),
    icon:'🙋', title:'New RSVP', body:'Lisa is going to 그리피스 일출 하이킹',
    groupId:'g4', eventId:'e4', navigable:true, dest:'event' },
  { id:'n4', type:'needs_more', read:true, ts:new Date(Date.now()-86400000),
    icon:'⚠️', title:'Need more people', body:'그리피스 일출 하이킹 still needs 2 more',
    groupId:'g4', eventId:'e4', navigable:true, dest:'event' },
  { id:'n5', type:'new_comment', read:true, ts:new Date(Date.now()-172800000),
    icon:'💬', title:'New comment', body:'지훈 commented on 금요일 포차 번개',
    groupId:'g1', eventId:'e1', navigable:true, dest:'event' },
  { id:'n6', type:'removed', read:true, ts:new Date(Date.now()-259200000),
    icon:'🚪', title:'Removed from group', body:'You were removed from Koreatown Sports',
    groupId:null, navigable:false, dest:null },
];
