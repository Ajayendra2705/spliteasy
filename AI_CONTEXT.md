# AI_CONTEXT.md

This is the working context for SplitEasy. I kept it updated as I built the app, so it
matches what actually shipped. The idea is that someone could read this and rebuild the
same app, or at least something very close to it.

Live app: https://spliteasy-xi.vercel.app
Repo: https://github.com/Ajayendra2705/spliteasy
Demo login: alice@demo.com / password123

## 1. Product understanding

Splitwise solves a pretty common annoyance. A group of people spend money on shared
stuff, different people pay at different times, and at the end nobody wants to sit down
and work out who owes who. The app keeps a running tally instead.

The way I understand it:

- People are in groups (a trip, a flat, whatever).
- Anyone can log an expense: what it was, how much, who paid, and how to split it.
- Each expense creates debts between people ("Bob owes Alice $30").
- All those debts roll up into one balance per person, kept current.
- People settle up by recording real payments, which cancel out debt.
- Instead of showing a mess of small debts, it suggests the smallest set of payments
  to clear everyone.

The one rule that has to hold is that everyone's balance in a group adds up to zero. If
it doesn't, something's wrong with the math. Most of my data and money decisions came
out of protecting that rule.

The main flows are: sign up or log in, make a group, add members, add an expense
(choose payer, amount, split, who's in), look at balances, chat on an expense, and
settle up.

There are really two kinds of user. The person who made the group (admin) tends to add
everyone and log most of the expenses, and everyone else mostly checks what they owe
and settles.

## 2. Product scope

What's in:

- Login with email and password.
- Groups: create, rename, add or invite members (invite works even if they don't have
  an account yet), remove members, leave.
- Expenses: create, edit, delete, split equally / unequally / by percentage / by share.
- Chat on each expense, updating in real time.
- Group balances and a personal "you owe / you're owed" summary.
- Settle up by recording payments.
- A relational database (Postgres).

What I left out on purpose: multiple currencies, receipt photos, recurring expenses,
notifications, actually emailing invites out (the invite itself works, no email is
sent), an activity feed, a mobile app, password reset, and OAuth. These are noted as
trade-offs further down, not things I forgot.

## 3. Decisions and why

- One Next.js app for both the UI and the API. It's one repo and one deploy, and the
  types are shared from the database all the way to the components.
- TypeScript everywhere.
- Postgres with Prisma. The brief asks for a relational database, and Prisma gives me
  typed queries and an easy way to push the schema.
- Auth I wrote myself: email and password, hashed with bcrypt, with a JWT in an
  httpOnly cookie. I didn't want to pull in a whole auth provider for this, and it
  shows I understand how sessions actually work.
- Money is handled in integer cents internally and stored as Decimal(12,2). Floats
  can't represent something like 0.10 exactly, so cents keep the splits correct.
- Balances aren't stored. They're computed from the expenses and settlements whenever
  they're asked for, so they can't get out of sync.
- Chat uses server-sent events. It's real-time push without needing a separate
  WebSocket server, which matters on serverless.
- Every API request is validated with Zod. The server never trusts what the client
  sends.
- Tailwind for styling so I wasn't writing a pile of CSS.

## 4. Engineering rules I stuck to

- Every route checks the login cookie. Group routes also check that you're a member.
- The server decides the money. The client can show a preview of a split, but the
  server recomputes it and rejects anything that doesn't add up.
- The split math lives in one place (`src/lib/splits.ts`) and is the same code the
  tests run against.
- Balances are derived from the data, never written to a table.
- The password hash never leaves the server. The session only exposes id, name, email.
- Errors are typed. There's one wrapper that turns my `ApiError` and Zod errors into
  proper JSON with the right status code, and anything unexpected becomes a 500.

## 5. Tech stack

- Next.js 14 (App Router), React 18, TypeScript 5
- Tailwind CSS 3
- Prisma 5 and PostgreSQL 16
- bcryptjs, jsonwebtoken, zod
- Server-sent events for chat (no extra library)
- tsx for running the seed and test scripts
- Vercel for hosting, Neon for the database (added via the Vercel marketplace)
- GitHub Actions for CI, and the repo is wired to Vercel for auto-deploys

## 6. Database

Postgres through Prisma (`prisma/schema.prisma`). Eight tables.

```
        User
         |  (creator, payer, member, author, settler, inviter)
   ------+-------------------------------------------
   |          |                       |             |
 Group --- GroupMember            Settlement    Invitation
   |        (user <-> group)      (from -> to)   (pending email)
   |
 Expense --- ExpenseSplit  (one row per person = what they owe)
   |
 Message  (chat, per expense)
```

| Table | Fields | Notes |
| --- | --- | --- |
| User | id, name, email (unique), passwordHash, createdAt | |
| Group | id, name, createdById, createdAt | |
| GroupMember | id, groupId, userId, role, joinedAt | role is admin or member; unique on (groupId, userId) |
| Expense | id, groupId, description, amount Decimal(12,2), splitType, paidById, createdById, createdAt | splitType is an enum |
| ExpenseSplit | id, expenseId, userId, amount Decimal(12,2), weight Decimal(12,4)? | unique on (expenseId, userId); amount is what they owe, weight keeps the raw % or share they entered |
| Message | id, expenseId, userId, body, createdAt | the chat |
| Settlement | id, groupId, fromUserId, toUserId, amount Decimal(12,2), note?, createdAt | a recorded payment |
| Invitation | id, groupId, email, invitedById, status, createdAt | unique on (groupId, email); status is pending or accepted |

The split type enum is EQUAL, UNEQUAL, PERCENTAGE, SHARE.

I went with a row per person for the splits rather than a JSON blob because it's easy to
query (summing what someone owes is one aggregate), the unique constraint stops the same
person being added twice, and keeping the original input (weight) means I can show or
re-edit it later.

Deletes cascade: removing a group removes its members, expenses, settlements and
invites; removing an expense removes its splits and messages.

## 7. Balances and settling up

Balances are calculated, not stored. For each member of a group:

```
net = (total of expenses they paid)
    - (total of their split amounts, i.e. what they owe)
    + (settlements they paid out)
    - (settlements they received)
```

Positive means the group owes them, negative means they owe the group, and the whole
group adds up to zero.

For settling up, instead of listing every pairwise debt the app suggests the fewest
payments. It's a greedy match: take the person who owes the most and the person who's
owed the most, settle as much as possible between them, repeat. That isn't guaranteed
to be the mathematical minimum (that problem is NP-hard) but it's the smallest in
practice for normal group sizes.

A quick example. Posting this to `POST /api/groups/:id/expenses`:

```json
{
  "description": "Hotel", "amount": 200, "paidById": "alice", "splitType": "PERCENTAGE",
  "participants": [
    { "userId": "alice", "value": 50 },
    { "userId": "bob",   "value": 25 },
    { "userId": "carol", "value": 25 }
  ]
}
```

stores splits of Alice 100, Bob 50, Carol 50. If that's the only expense, the balances
come back as Alice +100, Bob -50, Carol -50, with suggested payments of Bob -> Alice 50
and Carol -> Alice 50. Record a payment of 50 from Carol to Alice and Alice drops to
+50, Carol goes to 0, and only Bob still owes 50. I checked all of this on the live app.

The actual splitting (`computeSplits`) works in cents and hands any leftover cent to the
largest-weighted people, so the parts always add back to the exact total. 100 split
three ways comes out 33.34 / 33.33 / 33.33.

## 8. API

REST under `/api`, JSON in and out. Errors look like `{ "error": "..." }` with the
right status (400 for bad input, 401 not logged in, 403 not a member or not allowed,
404 missing, 409 conflict).

Auth:

- POST `/api/auth/signup` (name, email, password) - sets the cookie, returns the user
- POST `/api/auth/login` (email, password) - sets the cookie, returns the user
- POST `/api/auth/logout`
- GET `/api/auth/me`

Groups, members and invites:

- GET `/api/groups` - groups you're in, with counts
- POST `/api/groups` - create one, you become admin
- GET `/api/groups/:id` - the group and its members
- PATCH `/api/groups/:id` - rename (any member)
- DELETE `/api/groups/:id` - admin only
- GET `/api/groups/:id/members`
- POST `/api/groups/:id/members` - adds the user if they have an account, otherwise
  creates a pending invite
- DELETE `/api/groups/:id/members/:userId` - admin removes anyone, a member can leave,
  blocked if they're tied up in expenses or settlements
- GET `/api/groups/:id/invitations` - pending invites
- DELETE `/api/groups/:id/invitations/:invId` - cancel one

Expenses, balances, settlements:

- GET `/api/groups/:id/expenses` - with splits and chat counts
- POST `/api/groups/:id/expenses` - (description, amount, paidById, splitType,
  participants: [{ userId, value? }])
- GET `/api/expenses/:id`
- PATCH `/api/expenses/:id` - edit it, the splits get recomputed
- DELETE `/api/expenses/:id`
- GET `/api/groups/:id/balances` - returns balances and the suggested payments
- GET `/api/groups/:id/settlements`
- POST `/api/groups/:id/settlements` - (fromUserId, toUserId, amount, note?)

Chat:

- GET `/api/expenses/:id/messages/stream` - the SSE stream, pushes each new message,
  supports Last-Event-ID so it can resume after a reconnect
- GET `/api/expenses/:id/messages?after=<iso>` - a plain one-shot fetch
- POST `/api/expenses/:id/messages` - (body)

For `participants[].value`: it's ignored for EQUAL, an exact amount for UNEQUAL, a
percent (totalling 100) for PERCENTAGE, and a share weight for SHARE.

## 9. Frontend

Next.js App Router. The server components only do one job, which is check the login
cookie and redirect to `/login` if you're not signed in. Everything interactive is a
client component that talks to the API through a small fetch helper (`src/lib/client.ts`).

- `/login`, `/signup` - the auth forms
- `/dashboard` - lists your groups and creates new ones
- `/groups/[id]` - the main page: your balance banner, the balances list with one-click
  settle up, the members panel (add or invite by email, remove, leave, pending invites,
  rename the group), the expenses list, and the add-expense form with a live preview of
  what each person owes
- `/expenses/[id]` - the breakdown of who owes what, an edit button, and the chat panel
  that streams new messages

There's a shared NavBar, and the Tailwind component classes (`.btn-primary`, `.card`,
`.input` and so on) live in `globals.css`.

## 10. Deployment and CI/CD

- The app runs on Vercel (it detects Next.js). Build command is
  `prisma generate && next build`.
- The database is Neon Postgres, added through the Vercel marketplace, which sets
  `DATABASE_URL` (pooled) and `DATABASE_URL_UNPOOLED` (direct).
- The only app-specific env vars are `DATABASE_URL` and `JWT_SECRET`.
- I created the tables with `prisma db push` (using the direct URL).
- Pushing to `main` deploys to production, and pull requests get preview deploys.
- CI (`.github/workflows/ci.yml`) runs the type check, the tests and a build on every
  push and PR.
- It's portable. Any managed Postgres works with those same two env vars.

Env vars:

| Variable | Needed | Used by | Notes |
| --- | --- | --- | --- |
| DATABASE_URL | yes | Prisma | the Postgres connection string; Neon sets it on Vercel |
| JWT_SECRET | yes | auth | a long random string for signing sessions |
| DATABASE_URL_UNPOOLED | optional | one-off db push | the direct URL Neon also provides |

## 11. Testing

`scripts/test-logic.ts` has 13 checks over the split types (that they add up, that bad
input is rejected, and that a duplicate participant is rejected) and the balance and debt
math including settlements. Run it with `npm test`, no database needed.

On top of that I ran the whole API end to end with curl, against a local Docker Postgres
while building and again against the live deployment: sign up, the 401 guard, an expense
of each split type, rejecting an invalid split, chat across two users, balances
recomputing, debt simplification, settlements, inviting a non-user and watching them
auto-join on sign-up, editing an expense, renaming a group, and the member-removal
rules. All passed.

CI builds and type-checks on every push.

## 12. Trade-offs

- Chat is server-sent events rather than full WebSockets. Receiving is one-way push,
  which is all chat needs (sending is just a POST), and it works on serverless without
  a socket server. Full WebSockets would be the move if I wanted typing indicators or
  presence.
- Invites aren't emailed. Inviting someone with no account creates a pending invite
  that's accepted automatically when they sign up. The flow is real, there's just no
  mail being sent.
- Editing an expense recomputes its splits from scratch (delete and recreate the rows in
  one transaction) rather than diffing them. Simpler and always consistent.
- Debt simplification is greedy, so it's small in practice but not provably minimal.
- Single currency.
- You can't remove a member who's already in expenses or settlements, because it would
  break the balances. They have to settle up first.

## 13. Known limitations

- No password reset, email verification, or OAuth.
- No pagination, which is fine at this scale.
- No rate limiting on the auth routes.
- Chat doesn't have edit, delete, or typing indicators.
- Decimal values come over JSON as strings, so the client wraps them in Number().

## 14. Prompts and AI responses

The build went interview first, then code. The assistant wasn't allowed to assume
requirements or pick the stack, and it kept this file updated as decisions were made.
The full prompt log is in `PROMPTS.md`; the key ones and what came out of them are here.

Before any of the building, I used the AI to take the brief apart and settle the vague
parts, so I wasn't guessing. That's where I worked out that "invite users" and "add
users" are two different flows, that "manage" means rename and delete and the member
operations, that the balance requirement is really two views (group balances and a
personal summary), that "real-time chat" needs push but not full WebSockets, and what was
fair to leave out of a 3-day version. Those clarifying questions are written out in
`PROMPTS.md`, and the answers are what the rest of this file is built on.

The starting prompt (the one the brief tells you to paste) set the ground rules: don't
assume requirements, don't jump into code, interview me across product and engineering,
write everything into AI_CONTEXT.md, and produce a build plan before writing anything.
The AI's response to that was a long set of questions rather than any code, which is what
I wanted.

The interview is where the real decisions got made. A few examples of what it asked and
how I answered:

- "Do you store balances or compute them?" I said compute them, never store, so they
  can't drift. The AI captured that and the balance formula went into section 7.
- "What do you store for a split?" I said one row per person with the amount they owe,
  plus the raw percent/share they entered. That became the ExpenseSplit table.
- "WebSockets or polling for chat?" I said keep it simple for serverless. We started with
  polling and later moved to server-sent events.
- "What happens if you remove a member who's already in expenses?" I said block it, and
  that rule is in the members route.

Once the plan was agreed, the build prompts were one piece at a time, roughly: set up the
project, write the schema, write the split functions (integer cents, must total exactly),
write the balance and debt-simplification logic, build the API routes with auth and
membership checks and Zod validation, build the UI with a live split preview, then seed
data and tests. After each one I had it prove the result with a test or a real request
rather than just claiming it worked.

The AI's responses were the schema, the libraries, the routes and the components, plus
the verification runs (the unit tests passing, and the curl runs against a real
database). When something was off, like an invalid split returning a 500, I pointed it
out and it fixed it. The rules I held it to throughout: no decision that isn't written
down in this file, no "it works" without proof, and the server is always the thing that
decides the money.

## 15. Changes along the way

- Marked `/api/auth/me` as dynamic, since it reads the cookie and Next was trying to
  prerender it.
- Added the `weight` field on splits to keep the raw percent or share input separate
  from the computed amount.
- Picked Neon over Supabase because it sets up cleanly through the Vercel marketplace.
- Simplified the Vercel build to `prisma generate && next build` (schema goes on with
  `prisma db push`, not a migrate step).
- Turned off Vercel's deployment protection so the production URL is actually public.
- Connected the repo to Vercel and added the GitHub Actions workflow.
- Fixed invalid splits to return a 400 with the real message instead of a generic 500.
- Switched chat from polling to server-sent events.
- Added the invite flow (the Invitation table, pending invites, auto-accept on sign-up),
  expense editing, and group rename, which covers the "invite users" and "manage"
  wording in the brief.
