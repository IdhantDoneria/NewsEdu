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


<!-- Add tasks below using the "- [ ] ..." checkbox format. Examples (the ">"
     prefix is only so these samples aren't picked up as real tasks — your real
     tasks should start with "- [ ]"):

-->

<!-- The agent appends a short note under each item it completes. -->
