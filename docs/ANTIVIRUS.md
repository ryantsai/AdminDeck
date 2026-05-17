# KKTerm and Antivirus / EDR Software

KKTerm includes optional network administration tools (ping, TCP port check, port scan, DNS lookup, WHOIS, Wake-on-LAN) for the convenience of network administrators. This document describes what these features do at the OS level so that corporate antivirus, EDR, or security teams can review and allowlist them.

## Network operations performed

When enabled by the user (on for widget tools per-widget opt-in), the application may perform the following:

| Operation | Protocol | Network behavior |
|---|---|---|
| Ping | ICMP (Windows: `IcmpSendEcho2` from `iphlpapi.dll`, same API as `ping.exe`) | Send 1–256 echo requests to a user-specified host with the default TTL. Falls back to a TCP connect on port 80 if ICMP is denied. |
| TCP port check / port scan | TCP | Full three-way handshake to user-specified host/port. Max 1024 ports per call, max 64 concurrent connections, 5 ms inter-connection delay. No SYN scans, no half-open scans, no fingerprinting. |
| DNS lookup | UDP/TCP 53 | Standard DNS query via OS resolver (or Cloudflare/Google fallback if no system resolvers). |
| WHOIS | TCP/43 | Query to `whois.iana.org` and the referred WHOIS server. |
| Wake-on-LAN | UDP/9 broadcast | Send a single magic packet to the broadcast address. |

## What KKTerm does NOT do

- No raw socket usage on Windows (we use `IcmpSendEcho2`).
- No SYN scans, half-open scans, or stealth port scans.
- No service fingerprinting or OS detection.
- No automated network discovery on startup.
- No packet capture (libpcap).
- No outbound traffic to attacker-controlled infrastructure.

## Permission gates

Two independent settings must both allow a widget network operation before it runs:
1. Widget-level: `permissions.networkTools: true` on a specific widget body.
2. Global: "Allow network tools in widgets" toggle in dashboard settings.

The widget-level permission is opt-in per widget, so no automated network activity occurs without explicit widget configuration.

## Allowlisting guidance

If your AV/EDR flags KKTerm based on heuristic port-scan detection while a user is running an authorized scan, please consider allowlisting the signed installer hash. The application is open about its capabilities and intended use.

For questions, open an issue at the project repository.
