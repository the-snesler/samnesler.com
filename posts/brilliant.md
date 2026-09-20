---
title: 'Sets, symbolic math, and animated graphs at Brilliant'
subtitle: 'I burned $400 of Fable credits on a refactor, and still spent three weeks fixing it.'
isVisible: false
date: 2026-09-20
excerpt: "This past summer, I was an intern at an edtech company called Brilliant. One of my major tasks was refactoring the core equation graph to a new data representation. Learn what I did, how I did it, and what didn't work."
---

This summer, I extended Brilliant’s symbolic math system to support sets and intervals, migrated its equation graph to a new math representation, and built animated graphs for its Derivatives course. The hardest part was making a foundational change in a system that other engineers were actively developing. If you just want to see the fruits of my labor, my animated graphs are used throughout the [new Derivatives course](https://brilliant.org/courses/derivatives/derivatives-1/aroc-1/) and the migrated equation graph is used throughout the platform!

More specifically: I was an intern at an edtech company called [Brilliant](https://brilliant.org/). Or, as they are more commonly known among Gen Z, "Today's sponsor, Brilliant" (they sponsored lots of YouTube creators in the education space). Their primary product is interactive lessons in STEM topics, especially math and programming, with an AI tutor and gamified feedback loop around them. I was assigned to the "interactives" team, which meant I got to work with the interactive bits of the lessons!

# Setting Sail

## Parser work

My main project for the summer was building a handful of new problem types based on numerical sets and intervals. This could be further divided into a couple subtasks: I needed to extend our internal math representation to parse these concepts from strings (for the lesson authors), I needed to be able to operate on them symbolically, and I needed to update the graphing and number-line packages to render them in a way that makes sense.

Thankfully, parsing math isn't terribly different from parsing code! I had just finished taking a course on [compilers](https://pages.cs.wisc.edu/~hasti/cs536/) and was able to splice in syntax for sets and intervals. I was initially concerned that intervals that looked like $(0, 1)$ (the set of all numbers between 0 and 1, but not including 0 and 1) would be indistinguishable from coordinates like $(0, 1)$ (the point where $x = 0$ and $y = 1$). I found that the parser only parsed coordinates in situations where there were no other symbols in the expression _and_ the parentheses weren't editable by the user. By consulting with our learning engineers, I discovered that this would essentially never occur in practice, so I documented the ambiguity and moved on. 

I set up operations on sets and intervals after a few false starts. The parser already had a set-like concept included due to the nature of the $\pm$ operator ($1\pm2$ should evaluate to $\{-1,3\}$)! Because of $\pm$, every mathematical operation already implicitly accepted the "old" set concept (a finite array of contents). My job was, in theory, just to add the requisite operators $\cup, \cap, \times, \subset,$ etc.

There was an unexpected amount of nuance here that I didn't foresee at first: Sets are much more complex than a simple array of items, because _intervals are sets_ (with infinite contents). Intervals can have bounds at $\infty$, and sets can themselves contain sets. I had to re-do every mathematical operation to understand the "new" set structure, and the concept of the `\infty` token. Ultimately, by leaning heavily on both pre-existing and new unit tests, I was able to complete this undertaking in a few weeks of concerted work.

Now that the parser understood sets and intervals, and the parser was the backbone of every other interactive element that used math, I should be in the home stretch!

## Equation graph pains

...is what I thought before I started on the remaining work in my project. I had just spent the last three weeks adding sets and intervals to our _new_ parser, while most components (including the equation graph) still relied on a _legacy_ parser. The equation graph's core file was 17,000 lines long when I started the summer (thankfully, another engineer started working at paring it down), and there was _no way_ I was reading all that. 

The parser is integral to the graph: the symbolic representation from the parser is how we evaluate what the function's value is for a given input, and render equations out as LaTeX-like forms. When different packages communicate (for example, graphing an equation from a keyboard input package with the graph package), they do so by passing these representations to each other. These representations were fundamentally incompatible: if one system generated "legacy" math blocks, it had to be converted to a string (a lossy process) before another system using the new parser could understand it.

There's a good reason this migration hadn't been completed yet: the new and old parser were fundamentally very different. The old parser mixed LaTeX rendering concerns with the actual math logic, which led to a very unwieldy data type, while the new parser had two distinct data types: one for operating on the math symbolically, and another for rendering the equation itself. It wasn't a mechanical substitution, since neither of the new data types could fully do the job of the old one.

I tried a couple different tacks: I first tried to one-shot the problem with GPT-5.6-Sol by just throwing a spec at it, and got understandably terrible results (despite a "legacy-to-exploration" migration skill existing in the repo). Even if the code worked (which it didn't), it was unmergeable:

- I couldn't ask my teammates to perform any meaningful review on a diff with 5 digits of changed lines, out of empathy. The diff mixed too many interacting changes to review reliably, and following a single thread was near-impossible.
- Any regressions would be extremely challenging to spot prior to merging, and probably result in a revert after merging. This package is used in thousands of lessons, so there's no way I would catch everything on my first try. 
- Migrating the equation graph had also meant migrating the packages it used as inputs, which inflated the diff further. 
- Any time a change landed in the graphing package (which happened relatively often- remember, a teammate was working on paring down that long file at the same time), the whole PR had a merge conflict.

My mentor informed me of the [Strangler Fig pattern](https://learn.microsoft.com/en-us/azure/architecture/patterns/strangler-fig) for large migrations, which I initially started to use. The pattern, as described at the link above, works well for migrating a system one feature at a time, but my challenge was that the graph package used legacy math in many places along the main path; it seemed like the migration had to be all-or-nothing.

> [!question]- What's the Strangler Fig pattern?
> It's a pattern used when migrating legacy systems, gradually replacing specific functionalities with new applications and services, which allows for a phased decommissioning of the old system.
> It has 4 phases:
> 1. Introduce a router to manage requests. All requests to the system go through the router.
> 2. As the new system becomes capable of handling them, shift requests to it.
> 3. After full migration, decommission the legacy system.
> 4. Replace the router with the new system.

## In Which I Let It Rip

I realized that the ultimate solution would involve migrating parts of the equation graphing package one at a time, so Claude and I spent some time analyzing data flow through the package- where were legacy blocks coming in, where were we holding them in state, and where they were being passed between components. Because the package received blocks from inputs, and its output was the graph, this resembled a DAG. I landed on creating a compatibility layer that could translate the legacy blocks to the new structure by walking the tree; since both systems were trying to replicate "correct" math, in theory it shouldn't be so hard. Since this was a bounded task that ultimately ended up creating one heavily-tested file, AI was very effective here.

With a rough order to migrate files (powered by the data flow DAG), and a function to call on the boundary to convert one data type into another, I decided to burn some of Brilliant's Cursor cloud credits on having Fable do the migration grunt work for me. Instead of trying to one-shot it like I had before, I made sure it had the tools to check its work, and I told it to separate its progress into as many independently-reviewable commits as possible. It took more than 5 hours, and, to my surprise, produced a passable result! The rendering was a little broken, and the asymptote detection had an infinite loop, but it was a good amount of the way there.

When I used Graphite to split the branch by commit, I ended up with a stack of 15 PRs. Not all of them passed CI, but the diffs weren't threateningly huge. More importantly, since it was a stack, I could merge lower layers and release that part of the package so my colleagues could make changes without necessarily causing me merge conflicts.

I spent the next month going through the Megastack, layer by layer, reading through it on my own, testing it myself, improving it in various ways (and responding to PR feedback), before merging. While Fable was an incredible time-saver, this was still a very labor-intensive collaboration. Most of its code was difficult to read, even if it technically worked, making it more of a "valuable baseline" than "ready to ship". It saved me the tedious work of wrangling the two new representations and updating all the call sites.

Ultimately, the only production regression we identified was a bug where we displayed the form of a generic quadratic expression as $(ax)^2+bx+c$ for a few hours, because the old parser's tree parsed it that way and my compatibility layer automatically inserted parentheses wherever precedence was different between the old and new parsers. The issue resolved itself when an upstack PR was merged, and it was hours later when reviewing bug reports that we discovered what caused it.


# MotionGraph

<!-- new package; API design for non-engineers, animations, state machines and extendable skins -->

# Takeaways

<!-- Takeaways — what you'd do differently, what the experience taught you about agentic coding and migrations. This is the part that shows senior thinking. -->

## Using AI

Despite theoretically being allowed to just "let it rip" with any OpenAI or Anthropic model I wished, I struggled to get good results out of AI tools during my time at Brilliant. Brilliant's interactive elements (and the parser) are written in a functional programming language called [Elm](https://elm-lang.org/), which I ended up having to learn from scratch during my time there.

Agents can still write and review Elm just fine, but I noticed they struggled much more with architecture and data flow than they do in TypeScript. Oftentimes the code would work, but was littered with duplicated helpers and was very difficult to read. Due to the "interactive" nature of these interactives, getting an AI agent to effectively review its own work was challenging, and lots of manual tweaking of various designs was almost a necessity.

Because all of my work mentioned thus far required deep changes to the guts of the system, I couldn't take shortcuts. I had to move slowly and deliberately, and make sure I knew exactly what I was doing. No agent code would make it to a PR without my own eyes and several passes of AI review...
