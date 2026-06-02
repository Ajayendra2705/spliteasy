# BUILD_PLAN.md

How I planned and built SplitEasy. `AI_CONTEXT.md` has the full technical detail; this
file is the higher-level story of the research, the architecture, how I worked with the
AI, and what I traded off.

## 1. Product research

### How I studied Splitwise

I used Splitwise the normal way and then worked backwards from the screens to the data
behind them. I wrote down the objects I could see (users, groups, members, an expense,
the per-person split inside an expense, settlements, and the comment thread on an
expense) and then asked myself the one question that mattered: what has to be true at
all times? The answer was that everyone's balance in a group has to add up to zero.
That became the thing I designed around.

### What I learned

The create/read/update part is the easy bit. The real substance is two things: getting
the split math exactly right across four different split types, and keeping the balances
correct as expenses and payments pile up. I also realised the "simplify debts" feature
isn't a nice-to-have. Without it, a group of N people ends up staring at a tangle of
small IOUs, so reducing it to the fewest payments is part of the actual product. And the
"chat with real-time updates" line in the brief is small but it forces a real decision
about how the client gets new messages.

### Workflows I identified

Sign up or log in, make a group, add or invite members, add an expense (pick the payer,
the amount, the split, and who's in it), look at the group balances and your own
summary, talk about an expense in its thread, and settle up by recording a payment.
Those map almost one to one onto the pages and the API.

### Product assumptions I made

- One currency is fine, shown as USD.
- You add members by email. If they don't have an account yet, they get a pending invite
  and join when they sign up. No email actually gets sent.
- Any member can add expenses and record payments; the admin manages who's in the group.
- Editing an expense should just recompute its splits rather than try to be clever about
  diffing them.

## 2. Architecture

### Tech stack

One Next.js 14 app (App Router, TypeScript) doing both the UI and the API, Postgres with
Prisma, my own JWT-cookie auth with bcrypt, Zod for validation, and Tailwind for the UI.
Deployed on Vercel with a Neon database. One repo, one deploy, and the types run from the
database all the way to the components.

### Database schema

Eight tables: User, Group, GroupMember, Expense, ExpenseSplit, Message, Settlement and
Invitation, plus a SplitType enum. Money is Decimal(12,2). Each expense fans out into one
ExpenseSplit row per person (the amount they owe, plus the raw percent/share they typed,
kept for editing and auditing). There is no balances table. Balances are worked out from
the expenses and settlements on read, which is what keeps the zero-sum rule from ever
breaking. The full schema is in `AI_CONTEXT.md`.

### API design

Plain REST under `/api` for auth, groups, members, invitations, expenses, balances,
settlements and chat. Every route checks the login cookie, and the group routes also
check membership. Everything is validated with Zod, and one wrapper turns errors into
clean JSON with the right status code. The full list of endpoints is in `AI_CONTEXT.md`.

### Frontend structure

Server components only guard auth and pass in the logged-in user. Everything interactive
is a client component that calls the API through a small fetch helper. The group page is
the hub (balances, members, expenses, settle up, rename), and the expense page adds the
edit form and the chat. The add-expense form shows a live preview of what each person
owes so there are no surprises when you submit.

### Deployment approach

Vercel for the app and Neon Postgres added through the Vercel marketplace, which sets the
`DATABASE_URL` for me. Only two env vars are app-specific. The repo is connected to
Vercel so pushing to main deploys to production and pull requests get preview URLs, and a
GitHub Actions workflow type-checks, runs the tests and builds on every push.

## 3. AI collaboration process

### How I instructed the AI

I started it off as a junior engineer with one firm rule: don't assume requirements,
interview me first. It wasn't allowed to choose the stack or write feature code until the
scope and the data model were agreed and written into `AI_CONTEXT.md`.

### What the AI asked

A lot, across product goals, scope, the data model (this is where it dug in the most),
auth, the four split types, how balances are calculated, how the chat should update,
deployment, and edge cases like removing a member who's part way through settling. The
full back-and-forth is in `PROMPTS.md`.

### How I answered

Short and decisive. The answers that drove everything: store the splits but compute the
balances; do the money in integer cents; roll my own JWT auth; use server-sent events for
the chat; and block removing a member who's already in expenses.

### How the plan evolved

The scope was set early from the brief, so there were no big U-turns, just small
corrections while building: marking a cookie route as dynamic, adding the split weight
field, choosing Neon, turning off Vercel's deployment protection, fixing an invalid split
to return a 400 instead of a 500, and later upgrading the chat from polling to
server-sent events and adding the invite flow, expense editing and group rename. Each one
is logged in `AI_CONTEXT.md`.

### How AI_CONTEXT.md was maintained

I wrote it as I went, not at the end. Every time a decision was made it went into the
file, which is why the deployed app actually matches it. That was the point: the brief
says an evaluator should be able to take the context and rebuild the app, so it had to
stay honest the whole way through.

### Build order

Project setup, then the schema, then the core libraries (splits, balances, auth), then
the API routes, then the frontend, then the seed data and tests, then verifying it
(running the tests and a full curl run against a real database), then deploying, then the
docs.

## 4. Tradeoffs

### What I simplified

- Chat uses server-sent events rather than full WebSockets. It's still real-time, it just
  pushes one way, which is all the chat needs.
- Debt simplification is greedy, so it's small in practice but not provably the minimum.
- One currency, no pagination.

### What I hardcoded

- USD formatting in the UI.
- The JWT lifetime (7 days) and the SSE timings as constants.
- The demo seed users all share the password `password123`.

### What I avoided

- Any email infrastructure. Invites are resolved by email inside the app instead.
- A second backend service and a WebSocket server. It's all one deployable.
- OAuth, password reset and email verification.

### What I'd improve with more time

- Full WebSockets so I could add typing indicators and presence to the chat.
- Real emailed invites backed by the pending-invitation rows that already exist.
- Multiple currencies with conversion, and receipt photos.
- Committed Prisma migrations (the CI that runs the tests is already there).
- Rate limiting and password reset on the auth routes.
