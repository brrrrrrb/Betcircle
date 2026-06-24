# BetCircle 🎯

> Bet with your crew. Actually keep track.

A full-stack social betting tracker — private circles, invite links, friends, real odds, and a leaderboard. No real money moves; BetCircle just keeps score.

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | Vanilla HTML/CSS/JS SPA (`public/index.html`) |
| API | Vercel Serverless Functions (`api/*.js`) |
| Database | **Vercel KV** (Redis, included free on Vercel) |
| Auth | JWT (signed, 30-day expiry) + bcrypt passwords |
| Deploy | Vercel (zero-config) |

---

## Deploy to Vercel in 5 minutes

### 1. Push to GitHub

```bash
cd betcircle
git init
git add .
git commit -m "Initial BetCircle"
gh repo create betcircle --public --push
```

### 2. Import on Vercel

1. Go to [vercel.com/new](https://vercel.com/new)
2. Import your `betcircle` repo
3. Framework preset: **Other**
4. Root directory: **.** (leave as-is)
5. Click **Deploy** — it will fail the first time because KV isn't set up yet. That's fine.

### 3. Create Vercel KV

1. In your Vercel dashboard → project → **Storage** tab
2. Click **Connect Store** → **KV** → **Create New**
3. Name it `betcircle-kv`
4. Click **Connect** — Vercel auto-injects the KV env vars

### 4. Add JWT secret

In Vercel dashboard → project → **Settings** → **Environment Variables**:

| Name | Value |
|---|---|
| `JWT_SECRET` | Any long random string, e.g. `openssl rand -hex 32` |

### 5. Redeploy

```bash
git commit --allow-empty -m "Trigger redeploy"
git push
```

Or click **Redeploy** in the Vercel dashboard.

---

## Local development

```bash
npm install -g vercel
cd betcircle
npm install
vercel dev
```

`vercel dev` pulls your KV env vars from Vercel automatically. App runs at `http://localhost:3000`.

---

## Invite links

When a circle owner opens the **🔗** tab inside a circle, they get:

- **A 6-char code** like `AB12CD` — share it verbally or in a group chat
- **A full link** like `https://yourapp.vercel.app/?invite=AB12CD`

Anyone who opens that link:
- If logged in → joins instantly
- If logged out → lands on a sign-up screen, then joins automatically after creating an account

The owner can **refresh the invite code** at any time to revoke the old one.

---

## Features

### Auth
- Sign up with display name, username, email, password
- JWT stored in localStorage, sent as `Authorization: Bearer` on every API call
- Edit display name and avatar color from profile

### Circles
- Create circles with custom names and emoji
- Invite members via code or link (`/?invite=XXXXXX`)
- Tabs: **Bets**, **History**, **Balances**, **Odds**, **Invite**
- Balance tracker with settlement optimizer (who pays whom)

### Bets
- Three types: **Pool** (winner takes all), **H2H** (two-sided), **Fixed** (custom payout)
- Per-member stakes, optional due date, optional odds multiplier
- Settle a bet by picking the winner — updates everyone's profile stats automatically
- Odds calculator with %, Decimal, and American formats

### Friends
- Search by username or email
- Send/accept/decline friend requests
- Notification bell with badge for pending requests

### Leaderboard & Achievements
- Across all your circles: net win/loss, W/L record
- 6 achievements that unlock automatically as you play

### XP & Level system
- 6 levels: Rookie → Hustler → Sharpie → Bookie → High Roller → The House
- XP for creating circles (+30), adding bets (+20), winning (+50)
- BetCoins for wins and level-ups (cosmetic)

---

## API reference

All routes require `Authorization: Bearer <token>` except `/api/auth?action=register` and `/api/auth?action=login`.

### Auth
| Method | Path | Body | Description |
|---|---|---|---|
| POST | `/api/auth?action=register` | `{displayName, username, email, password}` | Create account |
| POST | `/api/auth?action=login` | `{email, password}` | Sign in |
| GET | `/api/auth?action=me` | — | Get current user |
| PATCH | `/api/auth?action=profile` | `{displayName?, color?}` | Update profile |

### Circles
| Method | Path | Description |
|---|---|---|
| GET | `/api/circles?action=list` | List your circles |
| POST | `/api/circles?action=create` | Create a circle |
| GET | `/api/circles?action=get&circleId=X` | Get circle + bets |
| POST | `/api/circles?action=join` | Join via `{code}` |
| DELETE | `/api/circles?action=leave&circleId=X` | Leave a circle |
| POST | `/api/circles?action=addbet&circleId=X` | Add a bet |
| POST | `/api/circles?action=settle&circleId=X&betId=Y` | Settle a bet |
| DELETE | `/api/circles?action=deletebet&circleId=X&betId=Y` | Delete open bet |
| POST | `/api/circles?action=refreshcode&circleId=X` | Rotate invite code |

### Users / Friends
| Method | Path | Description |
|---|---|---|
| GET | `/api/users?action=search&q=X` | Search by username/email |
| GET | `/api/users?action=me` | Get profile + history |
| GET | `/api/users?action=friends` | List friends |
| GET | `/api/users?action=friendrequests` | Incoming requests |
| POST | `/api/users?action=friendrequest&targetId=X` | Send request |
| POST | `/api/users?action=acceptfriend&targetId=X` | Accept request |
| POST | `/api/users?action=declinefriend&targetId=X` | Decline request |
| DELETE | `/api/users?action=unfriend&targetId=X` | Remove friend |

---

## KV schema

```
user:{id}              → user object (no passwordHash exposed to client)
email:{email}          → userId
username:{username}    → userId
user:{id}:circles      → [circleId, ...]
user:{id}:friends      → [userId, ...]
user:{id}:friendReqs   → [{from, to, createdAt}, ...]
user:{id}:history      → [{id, desc, winner, type, delta, pool, when, circleId, betId}]
circle:{id}            → circle object (members, inviteCode, balances, etc.)
circle:{id}:bets       → [bet, ...]
invite:{CODE}          → circleId
```

---

## Roadmap ideas

- Push notifications (Web Push API)
- Circle chat / comments on bets
- Photo receipts for bet evidence
- Scheduled bet resolution
- Multiple winners / partial payouts
- Export to CSV
