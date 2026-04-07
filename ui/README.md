# Moija — Expo App

LA Korean community event app. Built with Expo Router, React Native, TypeScript.

## Quick Start

```bash
cd ui
npm install
npx expo start
```

Then press:
- `i` for iOS simulator
- `a` for Android emulator
- `w` for web

## Project Structure

```
ui/
├── app/
│   ├── _layout.tsx          # Root layout (fonts, navigation)
│   ├── (tabs)/
│   │   ├── _layout.tsx      # Bottom tab bar
│   │   ├── events.tsx       # Events tab
│   │   ├── groups.tsx       # My groups list
│   │   └── profile.tsx      # Profile & notifications
│   ├── event/[id].tsx       # Event detail
│   ├── group/[id].tsx       # Group detail
│   ├── group/settings.tsx   # Group settings (admin)
│   ├── group/invite.tsx     # Invite screen
│   ├── create-event.tsx     # Create event form
│   └── create-group.tsx     # Create group modal
│
├── components/
│   ├── ui.tsx               # Shared UI (Avatar, Pill, Btn, Sheet, NavBar...)
│   ├── EventRow.tsx         # Event list row
│   └── ListView.tsx         # List view with Today divider
│
├── constants/
│   └── theme.ts             # Colors, fonts, spacing, radius, shadows
│
├── data/
│   └── mock.ts              # All mock data + TypeScript types
│
└── utils/
    └── helpers.ts           # Date formatting, palette helpers
```

## Key Features

- **Feed** — List & calendar view, group filter pills, RSVP/tag/needs-more filter panel
- **Event Detail** — RSVP (Going/Maybe/Can't go), hold for memo, attendance sheet, comments with multi-photo, lightbox, past event gallery
- **Group Detail** — Events & members tabs, Super Admin 👑 system, make/remove admin, context menu, leave group
- **Group Settings** — Pending requests approve/decline, member management, add by username, delete group
- **Invite** — 6-char code, link, iMessage/email share, admin direct-add
- **Create Event** — Bilingual title, all-day toggle, description with photos, tags, allow-maybe
- **Create Group** — Color picker, emoji picker, live preview, private toggle
- **Notifications** — Bell icon with unread badge, tappable per type
- **Profile** — Per-group notification settings with reminder dropdown

## Next Steps (Backend)

See `SYSTEM_DESIGN.md` for full Firebase architecture.

1. `npm install firebase`
2. Create `lib/firebase.ts` with your Firebase config
3. Replace mock data in `data/mock.ts` with Firestore `onSnapshot` calls
4. Add Firebase Auth (Google/Apple/Phone)
5. Add Cloud Functions for push notifications
