# Google Play listing

## Copy to Play Console

- App name: **BotDuetDot**
- Short description: **Control your self-hosted coding agents from your phone.**
- Category: **Productivity** (app).
- Website: https://www.ritikrishu.com/projects/botduetdot/
- Privacy: https://www.ritikrishu.com/projects/botduetdot/privacy-policy
- Support: https://github.com/ritikrishu/botduetdot/issues
- Contact email: **hi@remotestate.com** (decided 2026-11-20; change any time in Play Console → Store settings).

### Full description

BotDuetDot is a remote control for your self-hosted coding agents. Pair it with the BotDuetDot server running on your Mac to continue your work from Android over your LAN or Tailscale network. The phone app requires a paired server; it does not run coding agents by itself.

Work with Claude Code, Codex and other supported agents through your own provider accounts and subscriptions. Send prompts, follow conversations, review code changes and respond when an agent needs your input. Provider subscriptions and usage charges are separate.

Use Arc-style Spaces to keep always-on bot threads separate from development work. Create and edit Spaces on desktop or web, then switch between them on your phone, including foldable screens.

Your projects and conversation history live on your own server. Content sent to an AI provider is subject to that provider's policies. BotDuetDot has no account system, T3 Connect or push notifications. Product analytics is off by default; server operators can configure optional analytics.

BotDuetDot is an independent app based on the open-source T3 Code (MIT License). It is not affiliated with T3 Tools Inc.

## Images

Use the [512px icon](../../assets/brand/standalone/play/icon-512.png) and
[feature graphic](../../assets/brand/standalone/play/feature-graphic-1024x500.png) after owner approval
of placeholder art. Capture at least two real phone screenshots: a paired thread list with Spaces,
and a conversation/code review. Include cover-screen and unfolded views; supply 7-inch/10-inch tablet
captures where Console requires them. Use fictional projects, hide secrets, pairing tokens and
personal paths, and avoid screens with residual T3 copy or marks. Show only available features.

## App access: complete before review

Declare that core functionality requires a connection to a server. Reviewer access is planned through
BotDuetDot Connect (phase 2, not built yet), so production review waits for Connect. There are no
single-use pairing codes. **OWNER DECISION** until then: a demo video alone does not guarantee review
access, so do not submit for production before Connect works.

The demo environment (`infra/demo`) runs a scripted agent: no model, no subscription, fictional data.
Reviewers need nothing paid. Console text, with real values filled in only in Console:

1. Open BotDuetDot and sign in with the demo account: `<demo email>` / `<password>`.
2. Connect to the linked demo environment shown in the list.
3. Open a seeded project and thread, read the conversation and inspect the code changes.
4. Switch between the Spaces "Work" and "Side projects".
5. Start a thread with "Approval demo" and approve or deny the request; try "Question demo" too.
6. Sign out and repeat to verify access.

Verification codes for the demo account go to `<monitored email>`. Keep the demo server available
throughout review, and put network requirements and a monitored contact in Console. Never commit
credentials here.

Complete [Data safety](data-safety.md), ads (no), audience (proposed 18+), content rating and
AI-content declarations against the release. Check guest-sharing and AI-content reporting requirements;
do not claim an in-app report feature exists without verifying it.
