# Design: Expanded Intent Example Pools with Random Selection

**Date:** 2026-05-19  
**Status:** Approved

## Overview

Expand `ai.createWidgetExamples` and `ai.watchdogExamples` from 3 fixed items to 50-item pools, showing 3 randomly selected items every time the user activates an intent (Create Widget or Watchdog). Refresh on every activation click.

## Architecture

No new files. Two touch points:

1. **`src/i18n/locales/en.json`** — replace 3-item arrays with 50-item arrays under `ai.createWidgetExamples` and `ai.watchdogExamples`
2. **`src/ai/AssistantPanel.tsx`** — add `displayedIntentExamples` state; populate it with 3 randomly sampled items from the full pool each time `handleSelectAssistantIntent` is called
3. **All 13 non-English locale files** — replace 3-item arrays with translated 50-item arrays

## Randomization Logic

Add a `sampleRandom<T>(arr: T[], n: number): T[]` pure helper (top of AssistantPanel.tsx or a shared util). Uses Fisher-Yates partial shuffle to pick `n` items without repetition.

Replace the `activeComposerIntentExamples` derived variable with a `displayedIntentExamples` state:

```ts
const [displayedIntentExamples, setDisplayedIntentExamples] = useState<string[]>([]);
```

In `handleSelectAssistantIntent`, after setting `assistantIntent`:
```ts
const all = assistantIntentExamples(intent, t);
setDisplayedIntentExamples(sampleRandom(all, 3));
```

Replace all uses of `activeComposerIntentExamples` with `displayedIntentExamples`.

## Widget Pool (50 items — ~50% games/fun)

### Utility (25)
1. round clock
2. CPU & RAM mini monitor
3. SSH quick-connect list
4. memory & swap bar
5. disk usage by partition
6. system uptime
7. network in/out graph
8. ping latency monitor
9. Docker container list
10. git branch & status
11. systemd service list
12. log tail viewer
13. weather widget
14. SSL certificate expiry
15. HTTP endpoint health check
16. next cron run display
17. custom shell metric display
18. API health status badges
19. world clock (multi-timezone)
20. top processes by CPU
21. failed login counter
22. pending package updates
23. countdown timer
24. stopwatch
25. kernel & OS info

### Games & Fun (25)
26. Snake game
27. Tetris
28. Breakout
29. 2048
30. Minesweeper
31. Pong
32. Flappy Bird clone
33. Space Invaders clone
34. Wordle clone
35. Simon Says
36. Conway's Game of Life
37. bouncing physics balls
38. Matrix rain animation
39. spinning 3D cube
40. fireworks display
41. pixel art canvas
42. idle cookie clicker
43. reaction time tester
44. magic 8-ball
45. dice roller
46. dad joke of the day
47. "is it Friday yet?" display
48. fidget spinner
49. lava lamp / blob animation
50. random cat fact

## Watchdog Pool (50 items)

1. alert if process stops
2. alert if SSH service fails
3. alert when disk over 85%
4. alert if CPU over 90% for 5 min
5. alert when memory over 80%
6. watch log file for errors
7. alert if host unreachable
8. alert if HTTP endpoint not 200
9. alert if Docker container stops
10. alert when disk usage critical
11. alert if load average spikes
12. warn 14 days before SSL expires
13. alert on repeated failed logins
14. alert when swap nearly full
15. alert on unexpected new files
16. alert when systemd service fails
17. alert if network interface drops
18. alert if DB connection fails
19. alert if zombie processes accumulate
20. watch log for exception traces
21. alert if backup job fails
22. alert when CPU over 80°C
23. alert if port 443 not listening
24. alert on cron job failure
25. alert when packet loss over 5%
26. alert if API response over 2s
27. alert on unauthorized file changes
28. alert if log stops growing
29. alert if DNS resolution fails
30. alert when file descriptors near limit
31. alert on any sudo usage
32. watch for OOM events in kernel log
33. alert if NTP out of sync
34. alert on container restart count increase
35. alert when new user account created
36. watch for permission denied errors
37. alert if backup file is stale
38. alert when queue depth too high
39. alert on 5xx errors in access log
40. alert on cert renewal failure
41. alert on bandwidth spike
42. alert if scheduled task missed
43. alert if config file modified
44. watch syslog for segfaults
45. alert when session count spikes
46. alert on unexpected reboot
47. watch for disk read errors
48. alert if firewall rules change
49. alert if listening port closes
50. alert if service dependency fails

## i18n Strategy

- Add all 50 items to `en.json` (source of truth)
- Translate all 50 items for each of the 13 other locales: de, es-MX, es, fr, id, it, ja, ko, pt-BR, th, vi, zh-CN, zh-TW
- Translations for technical terms (process names, metrics) kept in English within translated strings where appropriate
- Run the existing i18n key-checking script to verify no missing keys

## Constraints Verified

- Widget ideas are achievable via: `KK.getPerformanceCounters()`, `network: true` fetch, `KK.callMcpTool()`, or JS-only (games/timers)
- Watchdog ideas are implementable as polling script widgets with `pollSeconds`; no process restart/email capabilities assumed
- No new widget types, schemas, or APIs required
- No breaking changes to existing 3-item behavior for other code paths
