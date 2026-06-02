# Key Prompts

This is how SplitEasy got built with an AI coding assistant. First I used it to pull
apart the brief and clear up anything vague, then I made it interview me before writing
anything, kept `AI_CONTEXT.md` as the source of truth, and drove the implementation in
chunks. Below are the prompts that mattered: the kickoff, the questions I asked to pin
down the assignment, the full requirements interview, the bigger prompts I wrote, and the
debugging and deploy steps.

Answers are short because that's how I typed them. The reasoning behind each is in
`AI_CONTEXT.md`.

## Kickoff prompt

This is the exact prompt the assignment told me to start with, pasted verbatim:

```
You are a junior engineer helping me complete an internship assignment.

The assignment is to reverse engineer Splitwise, scope a realistic 3-day version,
and build a working deployed app.

Important instructions:
1. Do not assume product requirements.
2. Do not jump directly into implementation.
3. Ask me detailed questions about product scope, UX, workflows, edge cases, and
engineering decisions.
4. Ask about every implementation detail needed to build the app.
5. After each answer I give, update a Markdown file called AI_CONTEXT.md.
6. AI_CONTEXT.md must become the source of truth for the entire project.
7. The final app must be buildable from AI_CONTEXT.md.
8. Another evaluator should be able to paste AI_CONTEXT.md into the same AI tool
and recreate a similar app.
9. Before writing code, produce a build plan based only on the agreed context.
10. During implementation, keep updating AI_CONTEXT.md whenever requirements,
architecture, schema, UI, or logic changes.
11. Do not recommend technical solutions. Your job is to let me think through the
technical solution.

Start by interviewing me.

Ask questions across:
- product goals
- Splitwise research
- core workflows
- user personas
- MVP scope
- out-of-scope features
- data model !IMPORTANT!
- authentication
- groups
- expenses
- settlements
- balance calculation
- UI screens
- routing
- frontend architecture
- backend architecture
- database choice
- API design
- deployment
- testing
- known risks
- tradeoffs

Do not give me a final plan until you have asked enough questions.
```

## Pinning down the assignment first

Before I let the AI interview me, I read the brief closely and used the AI to pull apart
the bits that were vague, so I wasn't building on guesses. These are the questions I put
to it about the assignment itself, and what I concluded.

Q: The brief lists "invite users" and "add users" separately. Are those two different
flows? A: Yes, treat them apart. "Add" is an existing account; "invite" is someone with
no account yet, who joins when they sign up.
Q: What does "manage groups" cover beyond creating one? A: Rename, delete, and the member
operations (add, invite, remove, leave).
Q: What are the four split types exactly, and what input does each take? A: Equal (no
input), unequal (exact amount each), percentage (percents adding to 100), share (weights
like 2:1:1).
Q: "Chat with real-time updates" - does that mean full WebSockets, or is push enough?
A: New messages have to appear without a refresh. One-way push covers it; sending is just
a request.
Q: The brief mentions group balances and a balance summary. Are those two different
views? A: Yes. Per-group balances, plus a personal "you owe / you're owed" summary.
Q: "Settle debts / record payments" - partial payments, or settle-in-full only? A: Any
positive amount. Partial is allowed.
Q: "Relational DB only" - is that a hard line that rules things out? A: Yes. Postgres, no
document store standing in for it.
Q: It says a realistic 3-day version. What's explicitly out of scope? A: Multi-currency,
receipts, recurring expenses, notifications, OAuth, password reset.
Q: Is there a roles or permissions expectation? A: The creator (admin) manages
membership; any member can add expenses and record payments.
Q: Does "manage expenses" imply editing, or just create and delete? A: Include edit.
Q: The deliverable says an evaluator should rebuild the app from AI_CONTEXT.md. What bar
does that set? A: Every decision written down, with the schema, endpoints and core logic
all explicit, not just described.
Q: Is the starting prompt mandatory to use as written? A: Yes. Paste it verbatim, it's
part of what's being evaluated.

## The interview

It went through everything. Quick-fire, its question and my answer.

### Product and scope
Q: One line, what are we building? A: A simplified Splitwise.
Q: Optimizing for breadth or correctness? A: Correctness, especially the money.
Q: What's the rule that must always hold? A: Group balances net to zero.
Q: Who are the users? A: A group admin and members.
Q: Any "friends without a group" idea? A: No. Everything is a group.
Q: Required features? A: Login, groups, expenses, chat, balances, settle up.
Q: Out of scope, multi-currency? A: No, USD only.
Q: Receipts or photos? A: No.
Q: Recurring expenses? A: No.
Q: Editing an expense? A: Yes, you should be able to edit one.
Q: Notifications or email? A: No.
Q: Password reset or OAuth? A: Not for now.

### Data model (it dug in here the most)
Q: What does a User need? A: name, email, password. Email unique.
Q: Store the password how? A: A bcrypt hash, never plain.
Q: A Group? A: A name and who created it.
Q: How do users join groups? A: A membership row linking a user and a group.
Q: Roles? A: admin or member.
Q: Same user twice in a group? A: No, unique on (group, user).
Q: An Expense's fields? A: description, amount, who paid, split type, timestamp.
Q: Track who created it vs who paid? A: Both, separately.
Q: Amount type? A: Decimal(12,2). It's money.
Q: How do you store the split? A: One row per participant, what they owe.
Q: Keep the original % or share they entered? A: Yes, as a weight, for auditing.
Q: Same user twice in one expense? A: No, unique on (expense, user).
Q: Chat messages, where do they attach? A: To an expense. body, author, time.
Q: A settlement? A: A payment: from user, to user, amount, optional note, in a group.
Q: Store balances as a table? A: No. Always compute them.
Q: Delete behaviour? A: Delete a group and its stuff goes. Delete an expense and its splits and chat go.

### Auth
Q: Roll your own or a provider? A: Roll it.
Q: Mechanism? A: Email and password, JWT.
Q: Where does the token live? A: An httpOnly cookie.
Q: Cookie settings? A: httpOnly, SameSite=Lax, about 7 day expiry.
Q: What does the client see of the user? A: Just id, name, email.

### Groups and members
Q: Who can add members? A: Any member, by email.
Q: What if that email has no account? A: Invite them, they join when they sign up.
Q: Who can remove people? A: Admin removes anyone, you can remove yourself.
Q: Remove someone who's in expenses already? A: Block it, it would break balances.
Q: Can the creator delete the whole group? A: Yes, admin only.
Q: Rename a group? A: Yes.

### Expenses and splitting
Q: The four split types again? A: Equal, unequal, percentage, share.
Q: Equal with an amount that doesn't divide? A: Spread the leftover cents, sum must match.
Q: Unequal, what's the input? A: Exact amount per person, must total the expense.
Q: If it doesn't total? A: Reject with a clear message.
Q: Percentage? A: A percent each, must add to 100.
Q: Share? A: Weights like 2:1:1, split proportionally.
Q: How do you avoid rounding bugs? A: Do all the math in integer cents.
Q: Who can be a participant? A: Only group members. Validate it on the server.

### Balances and settlements
Q: The exact formula? A: paid minus owed, plus settlements made, minus settlements received.
Q: Positive number means? A: They're owed money.
Q: Show every pairwise debt? A: No, simplify to the fewest payments.
Q: Optimal simplification? A: Greedy (biggest debtor to biggest creditor) is fine.
Q: Settlement between non-members? A: No, both must be in the group.
Q: Pay yourself? A: Rejected.
Q: Settle straight from a suggested debt? A: Yes, one click.

### Chat
Q: Real WebSockets? A: No, too much for serverless.
Q: So how? A: Push new messages with server-sent events.
Q: Resume after a dropped connection? A: Use Last-Event-ID so it picks up where it left off.

### Frontend
Q: What pages? A: login, signup, dashboard, group, expense.
Q: URLs? A: /dashboard, /groups/[id], /expenses/[id].
Q: Server or client components? A: Server guards auth, client does the interactive stuff.
Q: How does the client call the API? A: One small typed fetch helper.
Q: Anything nice on the add-expense form? A: A live preview of what each person owes.
Q: Styling? A: Tailwind.

### Backend and API
Q: Separate API service? A: No, route handlers in the same app.
Q: Auth check per route? A: Yes, read the cookie on every route.
Q: Authorization on group routes? A: Check membership.
Q: Validate request bodies? A: Zod, everywhere.
Q: Error handling? A: One wrapper, clean JSON and proper status codes.
Q: Which status codes? A: 400 bad input, 401 not logged in, 403 not allowed, 404, 409 conflict.

### Stack, DB, deploy, testing
Q: Framework? A: Next.js, App Router, TypeScript.
Q: Database? A: PostgreSQL (relational is required).
Q: ORM? A: Prisma.
Q: Where to host? A: Vercel and a managed Postgres.
Q: Env vars? A: DATABASE_URL and JWT_SECRET.
Q: Testing approach? A: Unit-test the split and balance math, then a live API smoke test.
Q: Seed data? A: Alice, Bob, Carol and a "Goa Trip" group with a couple of expenses.
Q: Biggest risk? A: Rounding in the splits.
Q: Main tradeoff? A: Server-sent events instead of full WebSockets.

Once it had all that, it wrote `AI_CONTEXT.md` and proposed a build plan.

## Locking the plan

> Before any feature code, write me the build plan based only on what's in
> `AI_CONTEXT.md`. I want the phase order, the file and folder layout, the full Prisma
> schema with the exact fields and the unique constraints, the complete list of API
> endpoints with their request bodies, the React component tree, and the deployment and
> testing approach. Don't write the implementation yet, show me the plan and the schema
> first so I can sign off. Keep balances derived, money in cents, and the server as the
> only thing that's allowed to decide a split.

I reviewed it, tweaked a couple of field names, and approved it.

## Scaffold and schema

> Set up the project: Next.js 14 (App Router) with TypeScript, Tailwind and Prisma, a
> `@/*` path alias, and npm scripts for dev, build, start, `db:push`, `db:seed` and
> `db:studio`. Then write the full Prisma schema for PostgreSQL: User, Group,
> GroupMember (role admin/member, unique on group and user), Expense (Decimal(12,2)
> amount, a SplitType enum, separate paidBy and createdBy), ExpenseSplit (amount owed
> plus a nullable weight for the raw percent or share, unique on expense and user),
> Message (chat per expense), and Settlement (from, to, amount, note in a group).
> Cascade deletes from Group to its children and Expense to its splits and messages.

## Core logic

> Write `src/lib/splits.ts` as pure functions. `computeSplits(amount, type, inputs)`
> must work entirely in integer cents and give any leftover cent to the largest-weighted
> people, so the parts always add up to the exact total. Reject unequal inputs that
> don't sum to the total and percentages that don't add to 100.

> Now `src/lib/balances.ts`: work out each member's paid, owed and net (paid minus owed,
> adjusted by settlements), then a greedy debt-simplification that pairs the biggest
> debtor with the biggest creditor until everyone is at zero.

> And the auth lib: bcrypt hash and verify, JWT sign, set and clear an httpOnly cookie,
> `getCurrentUser()`, a throwing `requireUser()`, and an `ApiError` class. Plus a small
> `handle()` wrapper that turns ApiError and Zod errors into JSON, and a
> `requireMembership()` guard.

## The API

> Build all the API route handlers under `src/app/api`. Auth: signup, login, logout, me.
> Groups: list (only mine, with counts), create (creator becomes admin), get, delete
> (admin only), rename. Members: list, add or invite by email, remove (admin removes
> anyone, a member can leave, blocked if they're in any expense or settlement).
> Invitations: list pending, cancel. Expenses: list, create, get, edit, delete (validate
> every participant is a member and compute the splits on the server). Balances.
> Settlements: list and create (two different members, positive amount). Chat: an SSE
> stream plus a plain fetch and a post. Check the cookie on every route, check membership
> on the group routes, and validate every body with Zod.

## The frontend

> Build the UI. Login and signup pages. `/dashboard` lists my groups and creates new
> ones. `/groups/[id]` is the hub: a banner with my balance, the balances list with a
> one-click record payment on each suggested debt, a members panel (add or invite by
> email, remove, leave, see pending invites, rename the group), the expenses list, and
> payment history. The add-expense form lets me pick payer, amount, split type and
> participants and shows a live preview of what each person owes. `/expenses/[id]` shows
> the breakdown, an edit button, and a chat panel that streams new messages. Use server
> components only to guard auth and pass the logged-in user in.

## Testing and debugging

> Write `prisma/seed.ts` (Alice, Bob, Carol, password `password123`, a "Goa Trip" group
> with an equal dinner and a share-based cab) and `scripts/test-logic.ts` checking all
> four split types add up exactly, invalid inputs are rejected, and balances and
> settlements net correctly.

> Run the tests. (13 of 13 passed, e.g. 100 split 3 ways is 33.34 / 33.33 / 33.33.)

> The build says `/api/auth/me` can't be statically rendered because it reads the cookie.
> Mark that route dynamic.

> Prove the whole thing works end to end: spin up Postgres in Docker, push the schema,
> seed it, start the server, and run a curl test covering login, the 401 guard, a
> percentage expense (200 split 50/25/25), balances recomputing, a chat message, and a
> settlement.

> An invalid split returns a 500 instead of a 400. Catch the split-validation error in
> the expenses route and return a proper 400 with the message.

## Deploy and CI/CD

> Provision a Postgres database for production, push the schema to it, and seed it.
> (I accepted the database provider's terms in the browser once, after that it wired up
> `DATABASE_URL` automatically.)

> The live URL returns 401 with a `_vercel_sso_nonce` cookie, which is Vercel's
> deployment protection. Turn it off so the app is actually public.

> Connect the repo to Vercel so pushes to main auto-deploy and pull requests get
> previews, and add a GitHub Actions workflow that type-checks, runs the tests and builds.

## Real-time chat

> Make the chat properly real-time: add an SSE endpoint that pushes new messages and
> switch the chat client to an EventSource. It needs to survive the serverless function
> recycling, so use Last-Event-ID to reconnect and resume without gaps or duplicates.

## Invite, edit, rename

> The brief lists "invite users" separately from "add users", so add a real invite flow:
> an Invitation table, invite by email even for people without an account, list and
> cancel pending invites, and auto-accept them when that email signs up. Also add expense
> editing (recompute the splits) and group rename, to cover "manage".

## Final docs

> Keep `AI_CONTEXT.md` as the complete source of truth, write a clean `README.md` with
> setup and the AI used, and a `BUILD_PLAN.md` covering product research, architecture,
> the AI process and tradeoffs. This `PROMPTS.md` is the prompt log.

## How I worked with the AI

- Interview first, it wasn't allowed to assume requirements or pick the stack.
- One thing per prompt: schema, then splits, then balances, then routes, then UI.
- Make it prove every claim with a test or a real request, not just "done".
- Keep `AI_CONTEXT.md` current at every decision, so the docs match the deployed app.
