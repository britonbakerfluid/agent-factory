# Station tickets

Tickets reward active agent work, not having a browser open. Each completed active minute earns one ticket, with partial minutes carried across sessions and stations belonging to the same owner. Thinking, planning and tool activity count once the agent reaches its station. Walking, idle, waiting for input, errors, manual control, grabbed agents, car driving and waiting for a car to pass do not count. Five minutes without a real work hook stops further accrual; a process-liveness check does not renew it.

The server owns the clock and ledger. Authenticated agents share a wallet by owner ID; older unauthenticated agents use a separate username fallback. There is no client command to award or spend tickets. Wallets and unfinished work persist in the existing world snapshot. Restoring a snapshot starts a new observation clock so server downtime earns nothing. Payouts consume a visit once; reconnecting or opening another browser cannot repeat them. Unfinished work is checkpointed every 30 seconds, so a hard crash can lose up to that much uncheckpointed progress.

When automatic work ends, the data/attention state updates immediately. The character remains at the reserved station for 2.4 seconds while its tickets dispense and it collects them, then follows the normal departure route. Direct user control can interrupt that animation; the awarded balance is already safe. All workstations share the rate: main room cabinets use warm perforated strips, patio stations use pale receipts, garage desks use mint service slips. The Mini laptop also awards the same tickets.

Balances appear in agent hover details and the front-desk people list, separate from contribution levels. Cosmetic purchases are not implemented. The existing terminal/avatar customization remains available.

Local visual demo: `prototype-25d-slice.html?controlsPreview=tickets`, then **sample ticket payout**. It stages a three-ticket payout for sample workers in each room and never sends earnings to the live server. Real accounting is exercised by `station-tickets.test.ts` and `station-ticket-world.test.ts`.
