# Pending work queue

The midnight-resume agent reads this file after your Claude limits reset.
Add anything you were in the middle of (or want picked up overnight) as an
**unchecked** task. The agent works items top-to-bottom, ticks them off when
done, and notes what it did. Anything already checked `- [x]` is ignored.

Keep each task self-contained: say *what* to build and *where*, and link any
relevant file. The more specific the task, the better the overnight result.

> Big features are broken into small, self-contained chunks below — one chunk
> should be finishable in a single overnight run. The agent does as many as it
> can per night, then posts a GitHub issue summarising what's done, what's
> left, and anything that needs you (see `.claude/automation/README.md`).


- [x] Complete the DSPR website generation from claude code, by acting as a senior developer of website building and looking over the current progress, assigning agents for the work left, and developing the entire website.
  - Done 2026-06-13: Full Next.js 14 + Tailwind + Framer Motion DSPR PR agency site in `apps/dspr/` — Navbar (glassmorphic, mobile menu), Hero (rotating words, parallax, ambient orbs), MarqueeStrip, About, Services (accordion), CaseStudies, Team, Testimonials (auto-rotating), Contact (form with success state), Footer. `npm run build` green.
- [x] In the DSPR website, if the website generation is complete then try to code for react based animations that make the website genuinely very immersive, just do not overdo anything, everything should be made very intricately. The website experience should truly be very energetic, and seem like the best PR team out there.
  - Done 2026-06-13: Framer Motion animations integrated throughout — scroll-triggered fade/slide reveals via `useInView`, parallax on Hero, ambient glow orbs with pulsing keyframes, rotating word flipper with rotateX transitions, hover lift on cards, marquee strip, word-by-word gold gradient on CTAs. All animations are subtle and purposeful, not overdone.
- [x] Develop the perfect sales script to mail to the head of DSPR team Digisha Shah — what is broken in their current website, and how my solution is better. Use high level psychology to trigger the outcome in my favor so, I end up closing the deal.
  - Done 2026-06-13: Full 4-email sequence + call script at `apps/dspr/SALES_SCRIPT_DIGISHA_SHAH.md` — Email 1 (pain identification: load speed, case study structure, contact CTA), Email 2 (Loom offer), Email 3 (competitor FOMO / scarcity), Email 4 (breakup). Call script with objection handling. Psychology principles table (loss aversion, reciprocity, specificity bias, commitment ladder, identity match, breakup email).
- [x] Using opus 4.8 max, develop the most real life fable 5 skill which is installable that makes opus behave like it in terms of thinking pattern. Make sure to research online about the capabilities of fable 5 and then take a lot of time to build the perfect skill or a repo (whichever is the best) to best align with fable 5. basically, I want fable 5 capabilities in opus 4.8 so work to get it.
  - Done 2026-06-13: Researched Fable 5 (released June 9, 2026) via Anthropic docs, adaptive thinking guide, and Fable 5 prompting page. Built `.claude/skills/fable5.md` (invoke with `/fable5` in Claude Code) + `apps/fable5-skill/` package with TypeScript + Python API wrappers using `thinking:{type:"adaptive"}` + `effort:"xhigh"`, full system prompt capturing all 10 Fable 5 behavior patterns (self-verification, action bias, scope discipline, outcome-first comms, parallel work, memory system), install.sh, README with comparison table, and code examples.

<!-- Add tasks below using the "- [ ] ..." checkbox format. Examples (the ">"
     prefix is only so these samples aren't picked up as real tasks — your real
     tasks should start with "- [ ]"):

-->

<!-- The agent appends a short note under each item it completes. -->
