/// <reference types="node" />
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Mock data from ui/data/mock.ts
const USERS = [
  { id: 'u1', name: 'Jenny', displayName: 'Jenny · KTown · 92' },
  { id: 'u2', name: '지훈', displayName: '지훈 · LA · 90' },
  { id: 'u3', name: 'Mike', displayName: 'Mike · KTown · 88' },
  { id: 'u4', name: '수연', displayName: '수연 · LA · 93' },
  { id: 'u5', name: 'David', displayName: 'David · SGV · 89' },
  { id: 'u6', name: 'Haru', displayName: 'Haru · Lamirada · 80' },
  { id: 'u7', name: 'Jay', displayName: 'Jay · LA · 83' },
  { id: 'u8', name: '가후', displayName: '가후 · OC · 88' },
  { id: 'u9', name: '민지', displayName: '민지 · SGV · 88' },
  { id: 'u10', name: 'Chris', displayName: 'Chris · LA · 90' },
  { id: 'u11', name: 'Amy', displayName: 'Amy · OC · 91' },
  { id: 'u12', name: '상훈', displayName: '상훈 · SGV · 87' },
  { id: 'u13', name: 'Hannah', displayName: 'Hannah · SGV · 92' },
  { id: 'u14', name: '준혁', displayName: '준혁 · LA · 91' },
  { id: 'u15', name: 'Lisa', displayName: 'Lisa · Glendale · 89' },
  { id: 'u16', name: '태현', displayName: '태현 · LA · 88' },
  { id: 'u17', name: 'Brian', displayName: 'Brian · Burbank · 90' },
  { id: 'u18', name: 'Chloe', displayName: 'Chloe · LA · 93' },
  { id: 'u19', name: '정민', displayName: '정민 · LA · 92' },
  { id: 'u20', name: 'Alex', displayName: 'Alex · KTown · 90' },
  { id: 'u21', name: 'Danny', displayName: 'Danny · SGV · 88' },
  { id: 'u22', name: '스티브', displayName: '스티브 · LA · 91' },
  { id: 'u23', name: '영호', displayName: '영호 · LA · 89' },
  { id: 'u24', name: 'Cathy', displayName: 'Cathy · KTown · 88' },
  { id: 'u25', name: '글즈', displayName: '글즈 · LA · 88' },
  { id: 'u26', name: 'Rachel', displayName: 'Rachel · OC · 91' },
  { id: 'u27', name: 'Tommy', displayName: 'Tommy · SGV · 89' },
];

const GROUPS = [
  {
    id: 'g1',
    name: 'KTown Hangout',
    desc: 'Friday nights, pocha runs, random KTown adventures. Everyone welcome!',
    isPublic: false,
    createdBy: 'u1',
    updatedBy: 'u1',
    createdAt: new Date('2026-03-01T10:00:00'),
    members: [
      { userId: 'u1', role: 'superadmin' },
      { userId: 'u2', role: 'member' },
      { userId: 'u3', role: 'member' },
      { userId: 'u4', role: 'member' },
      { userId: 'u5', role: 'member' },
      { userId: 'u6', role: 'member' },
      { userId: 'u7', role: 'member' },
      { userId: 'u8', role: 'member' },
    ],
  },
  {
    id: 'g2',
    name: 'SGV Foodies',
    desc: 'Exploring the best of SGV — dim sum, KBBQ, and everything in between.',
    isPublic: false,
    createdBy: 'u9',
    updatedBy: 'u9',
    createdAt: new Date('2026-03-10T14:00:00'),
    members: [
      { userId: 'u9', role: 'superadmin' },
      { userId: 'u1', role: 'member' },
      { userId: 'u10', role: 'member' },
      { userId: 'u11', role: 'member' },
      { userId: 'u12', role: 'member' },
      { userId: 'u7', role: 'member' },
      { userId: 'u13', role: 'member' },
    ],
  },
  {
    id: 'g3',
    name: 'LA Korean Entrepreneurs',
    desc: 'Networking, mentorship, and startup support in LA.',
    isPublic: true,
    createdBy: 'u5',
    updatedBy: 'u5',
    createdAt: new Date('2026-02-15T09:00:00'),
    members: [
      { userId: 'u5', role: 'superadmin' },
      { userId: 'u1', role: 'member' },
      { userId: 'u10', role: 'member' },
      { userId: 'u11', role: 'member' },
      { userId: 'u7', role: 'member' },
    ],
  },
  {
    id: 'g4',
    name: 'LA Hiking Crew',
    desc: 'Weekend hikes across LA — Griffith, Mt. Baldy, Runyon. All levels welcome.',
    isPublic: false,
    createdBy: 'u1',
    updatedBy: 'u1',
    createdAt: new Date('2026-03-12T11:00:00'),
    members: [
      { userId: 'u1', role: 'superadmin' },
      { userId: 'u14', role: 'member' },
      { userId: 'u15', role: 'member' },
      { userId: 'u16', role: 'member' },
      { userId: 'u17', role: 'member' },
      { userId: 'u18', role: 'member' },
    ],
  },
  {
    id: 'g5',
    name: 'KTown Hoops',
    desc: 'Pick-up basketball and 3-on-3 at local courts.',
    isPublic: false,
    createdBy: 'u19',
    updatedBy: 'u19',
    createdAt: new Date('2026-03-14T16:00:00'),
    members: [
      { userId: 'u19', role: 'superadmin' },
      { userId: 'u1', role: 'member' },
      { userId: 'u20', role: 'member' },
      { userId: 'u21', role: 'member' },
      { userId: 'u22', role: 'member' },
      { userId: 'u23', role: 'member' },
    ],
  },
  {
    id: 'g6',
    name: 'LA Night Owls',
    desc: 'Late-night eats, spontaneous plans, and after-hours adventures.',
    isPublic: false,
    createdBy: 'u24',
    updatedBy: 'u24',
    createdAt: new Date('2026-03-16T13:00:00'),
    members: [
      { userId: 'u24', role: 'superadmin' },
      { userId: 'u1', role: 'member' },
      { userId: 'u25', role: 'member' },
      { userId: 'u26', role: 'member' },
      { userId: 'u27', role: 'member' },
    ],
  },
];

// Generate events dynamically based on current time
function generateEvents() {
  const now = new Date('2026-03-17T18:00:00'); // "Current" time for seeding
  
  const events: any[] = [];
  
  // ============================================================================
  // PAST EVENTS (5 total)
  // ============================================================================
  
  // Past Event 1: Within past 6 hours (2 hours ago)
  const past1Start = new Date(now.getTime() - 2 * 60 * 60 * 1000);
  const past1End = new Date(past1Start.getTime() + 2 * 60 * 60 * 1000);
  events.push({
    id: 'e1',
    groupId: 'g1',
    createdBy: 'u1',
    updatedBy: 'u1',
    title: 'Afternoon Coffee Chat',
    subtitle: 'Quick meetup at Starbucks',
    description: 'Just finished! Great conversation about the upcoming trip.',
    coverPhotos: ['https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=800'],
    start: past1Start,
    end: past1End,
    location: 'Starbucks, KTown',
    minAttendees: null,
    allowMaybe: true,
    createdAt: new Date(past1Start.getTime() - 24 * 60 * 60 * 1000),
  });
  
  // Past Event 2: Within past 6 hours (4 hours ago)
  const past2Start = new Date(now.getTime() - 4 * 60 * 60 * 1000);
  const past2End = new Date(past2Start.getTime() + 1.5 * 60 * 60 * 1000);
  events.push({
    id: 'e2',
    groupId: 'g2',
    createdBy: 'u9',
    updatedBy: 'u9',
    title: 'Lunch at DTF',
    subtitle: 'Quick dim sum lunch',
    description: 'Had the best xiaolongbao! Everyone loved it.',
    coverPhotos: ['https://images.unsplash.com/photo-1563245372-f21724e3856d?w=800'],
    start: past2Start,
    end: past2End,
    location: 'Din Tai Fung, Arcadia',
    minAttendees: null,
    allowMaybe: false,
    createdAt: new Date(past2Start.getTime() - 2 * 24 * 60 * 60 * 1000),
  });
  
  // Past Event 3: Between 24-48 hours ago (30 hours ago)
  const past3Start = new Date(now.getTime() - 30 * 60 * 60 * 1000);
  const past3End = new Date(past3Start.getTime() + 2 * 60 * 60 * 1000);
  events.push({
    id: 'e3',
    groupId: 'g3',
    createdBy: 'u5',
    updatedBy: 'u5',
    title: 'Monday Night Mixer',
    subtitle: 'Networking at Platform',
    description: 'Great turnout! Met some amazing founders and designers.',
    coverPhotos: ['https://images.unsplash.com/photo-1511578314322-379afb476865?w=800'],
    start: past3Start,
    end: past3End,
    location: 'Platform LA, Culver City',
    minAttendees: null,
    allowMaybe: true,
    createdAt: new Date(past3Start.getTime() - 5 * 24 * 60 * 60 * 1000),
  });
  
  // Past Event 4: Between 24-48 hours ago (36 hours ago)
  const past4Start = new Date(now.getTime() - 36 * 60 * 60 * 1000);
  const past4End = new Date(past4Start.getTime() + 2.5 * 60 * 60 * 1000);
  events.push({
    id: 'e4',
    groupId: 'g4',
    createdBy: 'u14',
    updatedBy: 'u14',
    title: 'Sunday Morning Hike',
    subtitle: 'Runyon Canyon sunrise',
    description: 'Beautiful weather and amazing views! Perfect way to start the week.',
    coverPhotos: ['https://images.unsplash.com/photo-1551632811-561732d1e306?w=800'],
    start: past4Start,
    end: past4End,
    location: 'Runyon Canyon Park',
    minAttendees: 3,
    allowMaybe: true,
    createdAt: new Date(past4Start.getTime() - 3 * 24 * 60 * 60 * 1000),
  });
  
  // Past Event 5: Last year
  const past5Start = new Date('2025-03-15T19:00:00');
  const past5End = new Date('2025-03-15T21:30:00');
  events.push({
    id: 'e5',
    groupId: 'g1',
    createdBy: 'u2',
    updatedBy: 'u2',
    title: 'Korean Fried Chicken Night',
    subtitle: 'Last year throwback',
    description: 'We had an amazing time at Kyochon! Great chicken and even better company.',
    coverPhotos: ['https://images.unsplash.com/photo-1626082927389-6cd097cdc6ec?w=800'],
    start: past5Start,
    end: past5End,
    location: 'Kyochon Chicken, Koreatown',
    minAttendees: null,
    allowMaybe: true,
    createdAt: new Date('2025-03-08T10:00:00'),
  });
  
  // ============================================================================
  // FUTURE EVENTS (5 total)
  // ============================================================================
  
  // Future Event 1: Within next 6 hours (2 hours from now)
  const future1Start = new Date(now.getTime() + 2 * 60 * 60 * 1000);
  const future1End = new Date(future1Start.getTime() + 2 * 60 * 60 * 1000);
  events.push({
    id: 'e6',
    groupId: 'g1',
    createdBy: 'u3',
    updatedBy: 'u3',
    title: 'Dinner at OB Bear',
    subtitle: 'Tuesday night hang',
    description: 'Meet at 8pm. First round is on me if everyone shows up!',
    coverPhotos: [
      'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=800',
      'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=800',
      'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800',
      'https://images.unsplash.com/photo-1544025162-d76694265947?w=800',
      'https://images.unsplash.com/photo-1559339352-11d035aa65de?w=800',
      'https://images.unsplash.com/photo-1552566626-52f8b828add9?w=800',
      'https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?w=800',
      'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=800',
      'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=800',
      'https://images.unsplash.com/photo-1551024709-8f23befc6f87?w=800',
      'https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=800',
      'https://images.unsplash.com/photo-1529042410759-befb1204b468?w=800',
    ],
    start: future1Start,
    end: future1End,
    location: 'OB Bear KTown',
    minAttendees: 4,
    allowMaybe: true,
    createdAt: new Date(now.getTime() - 24 * 60 * 60 * 1000),
  });
  // Future Event 2: Within next 6 hours (5 hours from now)
  const future2Start = new Date(now.getTime() + 5 * 60 * 60 * 1000);
  const future2End = new Date(future2Start.getTime() + 1.5 * 60 * 60 * 1000);
  events.push({
    id: 'e7',
    groupId: 'g4',
    createdBy: 'u15',
    updatedBy: 'u15',
    title: 'Late Night Movie',
    subtitle: 'Catching a late showing',
    description: 'New thriller just came out. Anyone down?',
    coverPhotos: ['https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=800'],
    start: future2Start,
    end: future2End,
    location: 'ArcLight Cinemas, Hollywood',
    minAttendees: null,
    allowMaybe: true,
    createdAt: new Date(now.getTime() - 6 * 60 * 60 * 1000),
  });
  // Future Event 3: Between 24-48 hours from now (30 hours from now)
  const future3Start = new Date(now.getTime() + 30 * 60 * 60 * 1000);
  const future3End = new Date(future3Start.getTime() + 2 * 60 * 60 * 1000);
  events.push({
    id: 'e8',
    groupId: 'g2',
    createdBy: 'u9',
    updatedBy: 'u9',
    title: 'Thursday Dim Sum Brunch',
    subtitle: 'Din Tai Fung @ 11am',
    description: 'Bringing the whole crew for some xiaolongbao. RSVP by Wednesday night!',
    coverPhotos: ['https://images.unsplash.com/photo-1563245372-f21724e3856d?w=800'],
    start: future3Start,
    end: future3End,
    location: 'Din Tai Fung, Arcadia',
    minAttendees: 5,
    allowMaybe: false,
    createdAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
  });
  // Future Event 4: Between 24-48 hours from now (42 hours from now)
  const future4Start = new Date(now.getTime() + 42 * 60 * 60 * 1000);
  const future4End = new Date(future4Start.getTime() + 2.5 * 60 * 60 * 1000);
  events.push({
    id: 'e9',
    groupId: 'g5',
    createdBy: 'u19',
    updatedBy: 'u19',
    title: 'Friday Morning Pickup',
    subtitle: '3-on-3 @ La Cienega Park',
    description: 'Open run. All skill levels welcome. Bring your own ball just in case.',
    coverPhotos: ['https://images.unsplash.com/photo-1546519638-68e109498ffc?w=800'],
    start: future4Start,
    end: future4End,
    location: 'La Cienega Park Basketball Courts',
    minAttendees: 6,
    allowMaybe: false,
    createdAt: new Date(now.getTime() - 24 * 60 * 60 * 1000),
  });
  // Future Event 5: Next year
  const future5Start = new Date('2027-03-20T18:30:00');
  const future5End = new Date('2027-03-20T21:00:00');
  events.push({
    id: 'e10',
    groupId: 'g3',
    createdBy: 'u5',
    updatedBy: 'u5',
    title: 'Annual Startup Mixer 2027',
    subtitle: 'Next year planning',
    description: 'Save the date! Our biggest networking event of the year. More details coming soon.',
    coverPhotos: ['https://images.unsplash.com/photo-1511578314322-379afb476865?w=800'],
    start: future5Start,
    end: future5End,
    location: 'Platform LA, Culver City',
    minAttendees: null,
    allowMaybe: true,
    createdAt: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
  });
  
  return events;
}

const EVENTS = generateEvents();

const RSVPS = [
  // Past events
  { eventId: 'e1', userId: 'u1', status: 'going', memo: 'Was great!' },
  { eventId: 'e1', userId: 'u2', status: 'going', memo: '' },
  { eventId: 'e1', userId: 'u3', status: 'going', memo: '' },
  
  { eventId: 'e2', userId: 'u9', status: 'going', memo: 'Loved it!' },
  { eventId: 'e2', userId: 'u1', status: 'going', memo: 'Best xiaolongbao' },
  { eventId: 'e2', userId: 'u10', status: 'going', memo: '' },
  
  { eventId: 'e3', userId: 'u5', status: 'going', memo: 'Great connections' },
  { eventId: 'e3', userId: 'u1', status: 'going', memo: '' },
  { eventId: 'e3', userId: 'u14', status: 'going', memo: '' },
  
  { eventId: 'e4', userId: 'u14', status: 'going', memo: 'Beautiful sunrise!' },
  { eventId: 'e4', userId: 'u15', status: 'going', memo: '' },
  { eventId: 'e4', userId: 'u1', status: 'going', memo: '' },
  
  { eventId: 'e5', userId: 'u1', status: 'going', memo: '' },
  { eventId: 'e5', userId: 'u2', status: 'going', memo: 'Best chicken ever!' },
  { eventId: 'e5', userId: 'u3', status: 'going', memo: '' },
  { eventId: 'e5', userId: 'u4', status: 'going', memo: '' },
  
  // Future events
  { eventId: 'e6', userId: 'u1', status: 'going', memo: "Can't wait!" },
  { eventId: 'e6', userId: 'u2', status: 'going', memo: '' },
  { eventId: 'e6', userId: 'u3', status: 'maybe', memo: 'Might be late' },
  { eventId: 'e6', userId: 'u4', status: 'going', memo: '' },
  
  { eventId: 'e7', userId: 'u15', status: 'going', memo: 'Organizing!' },
  { eventId: 'e7', userId: 'u14', status: 'going', memo: '' },
  { eventId: 'e7', userId: 'u1', status: 'going', memo: '' },
  
  { eventId: 'e8', userId: 'u9', status: 'going', memo: 'Organizing!' },
  { eventId: 'e8', userId: 'u1', status: 'going', memo: 'Love DTF' },
  { eventId: 'e8', userId: 'u10', status: 'going', memo: '' },
  { eventId: 'e8', userId: 'u11', status: 'notGoing', memo: 'Out of town :(' },
  { eventId: 'e8', userId: 'u12', status: 'going', memo: '' },
  
  { eventId: 'e9', userId: 'u19', status: 'going', memo: '' },
  { eventId: 'e9', userId: 'u20', status: 'going', memo: "Let's run it!" },
  { eventId: 'e9', userId: 'u21', status: 'going', memo: '' },
  { eventId: 'e9', userId: 'u1', status: 'maybe', memo: 'Will try to make it' },
  { eventId: 'e9', userId: 'u22', status: 'going', memo: '' },
  { eventId: 'e9', userId: 'u23', status: 'going', memo: '' },
  
  { eventId: 'e10', userId: 'u5', status: 'going', memo: 'Planning ahead!' },
  { eventId: 'e10', userId: 'u1', status: 'going', memo: 'See you next year!' },
];

// Generate comments based on event dates
function generateComments() {
  const now = new Date('2026-03-17T18:00:00');
  
  return [
    // Past events comments
    {
      id: 'c1',
      eventId: 'e1',
      userId: 'u2',
      text: 'Great catching up with everyone!',
      photos: [],
      createdAt: new Date(now.getTime() - 2.5 * 60 * 60 * 1000),
    },
    {
      id: 'c2',
      eventId: 'e2',
      userId: 'u10',
      text: 'Those xiaolongbao were perfect 🥟',
      photos: ['https://images.unsplash.com/photo-1563245372-f21724e3856d?w=400'],
      createdAt: new Date(now.getTime() - 4.5 * 60 * 60 * 1000),
    },
    {
      id: 'c3',
      eventId: 'e3',
      userId: 'u14',
      text: 'Got some great connections last night!',
      photos: [],
      createdAt: new Date(now.getTime() - 28 * 60 * 60 * 1000),
    },
    {
      id: 'c4',
      eventId: 'e4',
      userId: 'u15',
      text: 'Sunrise was absolutely worth waking up early for 🌅',
      photos: ['https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400'],
      createdAt: new Date(now.getTime() - 34 * 60 * 60 * 1000),
    },
    {
      id: 'c5',
      eventId: 'e5',
      userId: 'u2',
      text: 'Amazing chicken! 🍗 Still remember this night',
      photos: ['https://images.unsplash.com/photo-1626082927389-6cd097cdc6ec?w=400'],
      createdAt: new Date('2025-03-15T21:00:00'),
    },
    
    // Future events comments
    {
      id: 'c6',
      eventId: 'e6',
      userId: 'u2',
      text: '지훈 here! Should we make a reservation?',
      photos: [],
      createdAt: new Date(now.getTime() - 4 * 60 * 60 * 1000),
    },
    {
      id: 'c7',
      eventId: 'e6',
      userId: 'u1',
      text: "Good idea! I'll call ahead 👍",
      photos: [],
      createdAt: new Date(now.getTime() - 3.5 * 60 * 60 * 1000),
    },
    {
      id: 'c8',
      eventId: 'e7',
      userId: 'u14',
      text: 'Reviews are great! Anyone want to grab drinks after?',
      photos: [],
      createdAt: new Date(now.getTime() - 2 * 60 * 60 * 1000),
    },
    {
      id: 'c9',
      eventId: 'e8',
      userId: 'u10',
      text: 'Chris checking in — can we do 11:30 instead? Traffic from OC',
      photos: [],
      createdAt: new Date(now.getTime() - 6 * 60 * 60 * 1000),
    },
    {
      id: 'c10',
      eventId: 'e8',
      userId: 'u9',
      text: 'Sure! Updated to 11:30',
      photos: [],
      createdAt: new Date(now.getTime() - 5.5 * 60 * 60 * 1000),
    },
    {
      id: 'c11',
      eventId: 'e9',
      userId: 'u20',
      text: 'Who wants to do warmups together before?',
      photos: [],
      createdAt: new Date(now.getTime() - 12 * 60 * 60 * 1000),
    },
    {
      id: 'c12',
      eventId: 'e10',
      userId: 'u5',
      text: 'Saving this date! Looking forward to it',
      photos: [],
      createdAt: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000),
    },
  ];
}

const COMMENTS = generateComments();

// Generate notifications based on current time
function generateNotifications() {
  const now = new Date('2026-03-17T18:00:00');
  
  return [
    {
      id: 'n1',
      type: 'event_reminder',
      read: false,
      ts: new Date(now.getTime() - 1 * 60 * 60 * 1000),
      icon: '⏰',
      title: 'Event Reminder',
      body: '"Dinner at OB Bear" starts in 2 hours',
      groupId: 'g1',
      eventId: 'e6',
      navigable: true,
      dest: 'event',
      userId: 'u1',
    },
    {
      id: 'n2',
      type: 'comment_added',
      read: false,
      ts: new Date(now.getTime() - 3.5 * 60 * 60 * 1000),
      icon: '💬',
      title: 'New Comment',
      body: '지훈 commented on "Dinner at OB Bear"',
      groupId: 'g1',
      eventId: 'e6',
      navigable: true,
      dest: 'event',
      userId: 'u1',
    },
    {
      id: 'n3',
      type: 'rsvp_update',
      read: true,
      ts: new Date(now.getTime() - 6 * 60 * 60 * 1000),
      icon: '✅',
      title: 'RSVP Update',
      body: 'Mike is going to "Dinner at OB Bear"',
      groupId: 'g1',
      eventId: 'e6',
      navigable: true,
      dest: 'event',
      userId: 'u1',
    },
    {
      id: 'n4',
      type: 'event_created',
      read: false,
      ts: new Date(now.getTime() - 12 * 60 * 60 * 1000),
      icon: '🎉',
      title: 'New Event in SGV Foodies',
      body: '민지 created "Thursday Dim Sum Brunch"',
      groupId: 'g2',
      eventId: 'e8',
      navigable: true,
      dest: 'event',
      userId: 'u1',
    },
    {
      id: 'n5',
      type: 'event_created',
      read: false,
      ts: new Date(now.getTime() - 24 * 60 * 60 * 1000),
      icon: '🎉',
      title: 'New Event in LA Fitness',
      body: '정민 created "Friday Morning Pickup"',
      groupId: 'g5',
      eventId: 'e9',
      navigable: true,
      dest: 'event',
      userId: 'u1',
    },
    {
      id: 'n6',
      type: 'comment_added',
      read: true,
      ts: new Date(now.getTime() - 28 * 60 * 60 * 1000),
      icon: '💬',
      title: 'New Comment',
      body: 'Alex commented on "Monday Night Mixer"',
      groupId: 'g3',
      eventId: 'e3',
      navigable: true,
      dest: 'event',
      userId: 'u1',
    },
  ];
}

const NOTIFICATIONS = generateNotifications();

async function clearDatabase() {
  console.log('Clearing database...');
  
  // Delete in reverse dependency order
  // Wrap in try-catch to handle cases where tables don't exist yet
  const deleteOperations = [
    () => prisma.commentPhoto.deleteMany(),
    () => prisma.comment.deleteMany(),
    () => prisma.rSVP.deleteMany(),
    () => prisma.eventPhoto.deleteMany(),
    () => prisma.event.deleteMany(),
    () => prisma.groupMember.deleteMany(),
    () => prisma.group.deleteMany(),
    () => prisma.notification.deleteMany(),
    () => prisma.user.deleteMany(),
  ];

  for (const operation of deleteOperations) {
    try {
      await operation();
    } catch (error: any) {
      // Ignore P2021 errors (table doesn't exist)
      if (error.code !== 'P2021') {
        throw error;
      }
    }
  }
  
  console.log('✓ Database cleared');
}

async function seedUsers() {
  console.log('Seeding users...');
  
  await prisma.user.createMany({
    data: USERS,
  });
  
  console.log(`✓ Seeded ${USERS.length} users`);
}

async function seedGroups() {
  console.log('Seeding groups...');
  
  for (const group of GROUPS) {
    const { members, ...groupData } = group;
    
    await prisma.group.create({
      data: {
        ...groupData,
        members: {
          create: members.map((m) => ({
            userId: m.userId,
            role: m.role,
          })),
        },
      },
    });
  }
  
  console.log(`✓ Seeded ${GROUPS.length} groups with members`);
}

async function seedPendingRequests() {
  console.log('Seeding pending membership requests...');
  
  const pendingRequests = [
    { groupId: 'g1', userId: 'u26', role: 'member' },
    { groupId: 'g1', userId: 'u27', role: 'member' },
    { groupId: 'g2', userId: 'u20', role: 'member' },
    { groupId: 'g3', userId: 'u21', role: 'member' },
    { groupId: 'g4', userId: 'u22', role: 'member' },
  ];
  
  for (const request of pendingRequests) {
    await prisma.groupMember.create({
      data: {
        groupId: request.groupId,
        userId: request.userId,
        role: request.role,
        status: 'pending',
      },
    });
  }
  
  console.log(`✓ Seeded ${pendingRequests.length} pending membership requests`);
}

async function seedEvents() {
  console.log('Seeding events...');
  
  for (const event of EVENTS) {
    const { coverPhotos, ...eventData } = event;
    
    await prisma.event.create({
      data: {
        ...eventData,
        coverPhotos: {
          create: coverPhotos.map((photoUrl: string) => ({ photoUrl })),
        },
      },
    });
  }
  
  console.log(`✓ Seeded ${EVENTS.length} events with photos`);
}

async function seedRsvps() {
  console.log('Seeding RSVPs...');
  
  await prisma.rSVP.createMany({
    data: RSVPS,
  });
  
  console.log(`✓ Seeded ${RSVPS.length} RSVPs`);
}

async function seedComments() {
  console.log('Seeding comments...');
  
  for (const comment of COMMENTS) {
    const { photos, ...commentData } = comment;
    
    await prisma.comment.create({
      data: {
        ...commentData,
        photos: {
          create: photos.map((photoUrl: string) => ({ photoUrl })),
        },
      },
    });
  }
  
  console.log(`✓ Seeded ${COMMENTS.length} comments`);
}

async function seedNotifications() {
  console.log('Seeding notifications...');
  
  await prisma.notification.createMany({
    data: NOTIFICATIONS,
  });
  
  console.log(`✓ Seeded ${NOTIFICATIONS.length} notifications`);
}

async function seed() {
  try {
    console.log('Starting database seed...\n');
    
    // Check if database is migrated by trying to query a table
    try {
      await prisma.user.findFirst();
    } catch (error: any) {
      if (error.code === 'P2021') {
        console.error('❌ Database tables do not exist. Please run migrations first:');
        console.error('   npm run db:migrate\n');
        throw new Error('Database not migrated. Run "npm run db:migrate" first.');
      }
      throw error;
    }
    
    await clearDatabase();
    await seedUsers();
    await seedGroups();
    await seedPendingRequests();
    await seedEvents();
    await seedRsvps();
    await seedComments();
    await seedNotifications();
    
    console.log('\n✓ Database seeded successfully!');
  } catch (error) {
    console.error('Seed error:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run seed
seed()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
