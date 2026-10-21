# VYRON Mobile

Design-locked iPhone control center for VYRON / ENDLUME.

## Design source of truth
- Dark graphite background only
- Electric blue / violet brand accent
- Premium analytics cards
- Bottom nav: Главная / Каналы / Проекты / Аналитика / Настройки
- iPhone 14 Pro target: 393×852 pt
- No Material UI, no light theme, no redesign

## Realtime Phase 1
Production UI uses authenticated VYRON data. It does not silently fall back to demo statistics.

Data flow:

VYRON Desktop -> persistent local sync outbox -> Supabase PostgreSQL -> Supabase Realtime -> VYRON Mobile

Mobile launch flow:

1. authenticate
2. restore last successful local snapshot
3. fetch current server snapshot
4. subscribe to Realtime
5. merge newer rows
6. patch only affected entities

Offline mode preserves the last successful snapshot.

## Pair desktop
In Mobile open:

Настройки -> Подключённые устройства

Tap the row to generate a one-time pairing code. The code is valid for 10 minutes and can be claimed once.

Run the signed acceptance VYRON candidate on macOS with:

```bash
/Applications/VYRON.app/Contents/MacOS/VYRON --pair-mobile YOUR-CODE
```

The pairing code is not a long-lived credential. VYRON exchanges it for a dedicated sync credential and stores that credential through the existing canonical secure-storage layer.

## Local development
```bash
cd vyron-mobile
npm install
npm run ios
```

Required public mobile configuration is documented in `.env.example`. Never place a Supabase service-role key or desktop credential in the mobile app.
