---
title: 'Draft: Sets, symbolic math, and animated graphs at Brilliant'
subtitle: 'Migrating a core graphing package, then building animated graphs for lesson authors.'
isVisible: false
date: 2026-09-20
excerpt: "This past summer, I was an intern at an edtech company called Brilliant. I worked on symbolic math, migrated the core equation graph, and built a new animated graphing package. Here's a reflection on that!"
---

tl;dr: This summer, I extended [Brilliant](https://brilliant.org/)'s symbolic math system to support sets and intervals, migrated its equation graph to a new math representation, and built animated graphs for its Derivatives course. The hardest part was making a foundational change in a system that other engineers were actively developing, and was actually being used in the product. If you just want to see the fruits of my labor, my animated graphs are used in the [new Derivatives course](https://brilliant.org/courses/derivatives/derivatives-1/aroc-1/) and the migrated equation graph is used throughout the platform!

If you aren't familiar with Brilliant, you may also know them as "[Today's](https://www.youtube.com/watch?v=JstW96GM1TQ&t=1s) [sponsor](https://www.youtube.com/watch?v=wo_e0EvEZn8), [Brilliant.org](https://www.youtube.com/watch?v=RpslsMqPFWA&pp=ygUPc3R1ZmYgbWFkZSBoZXJl)" from your YouTube creator of choice. Their primary product is interactive lessons in STEM topics, especially math and programming, with an AI tutor and gamified feedback loop around them. I was assigned to the "interactives" team, which meant I got to work with the interactive bits of the lessons!

# Setting Sail

## Parser work

My main project for the summer was building a handful of new problem types based on numerical sets and intervals. This could be further divided into a couple subtasks: I needed to extend our internal math representation to parse these concepts from strings (for the lesson authors), I needed to be able to operate on them symbolically, and I needed to update the graphing and number-line packages to render them in a way that makes sense.

Thankfully, parsing math isn't terribly different from parsing code! I had just finished taking a course on [compilers](https://pages.cs.wisc.edu/~hasti/cs536/) and was able to splice in syntax for sets and intervals. I was initially concerned that intervals that looked like $(0, 1)$ (the set of all numbers between 0 and 1, but not including 0 and 1) would be indistinguishable from coordinates like $(0, 1)$ (the point where $x = 0$ and $y = 1$). I found that the parser only parsed coordinates in situations where there were no other symbols in the expression _and_ the parentheses weren't editable by the user. By consulting with our learning engineers, I discovered that this would essentially never occur in practice, so I documented the ambiguity and moved on. 

I set up operations on sets and intervals after a few false starts. The parser already had a set-like concept included due to the nature of the $\pm$ operator ($1\pm2$ should evaluate to $\{-1,3\}$)! Because of $\pm$, every mathematical operation already implicitly accepted the "old" set concept (a finite array of contents). My job was, in theory, just to add the requisite operators $\cup, \cap, \times, \subset,$ etc.

There was an unexpected amount of nuance here that I didn't foresee at first: Sets are much more complex than a simple array of items, because _intervals are sets_ (with infinite contents). Intervals can have bounds at $\infty$, and sets can themselves contain sets. I had to re-do every mathematical operation to understand the "new" set structure, and the concept of the `\infty` token. Ultimately, by leaning heavily on both pre-existing and new unit tests, I was able to complete this undertaking in a few weeks of concerted work.

One discussion that took longer than I expected was how to represent a set *containing* an interval. $\{1, [2, 3]\}$ and $\{1\} \cup [2, 3]$ are different: the first contains two elements, a number and a set, while the second contains the number 1 and every number in the interval. Our initial representation collapsed both into a set containing a number and an interval, so it couldn't tell them apart.

The fix was to have interval syntax produce a set containing an internal interval value. That extra layer mattered! The first expression could then retain the nested set, while the union could combine the number and interval within one set. It was a small-looking representation choice that determined whether we could preserve what an author actually meant.

Even unioning two intervals depended on their endpoints. $(1, 2] \cup (2, 3)$ simplifies to $(1, 3)$, because the first interval includes 2. But $(1, 2) \cup (2, 3)$ has a hole at 2, so its evaluated representation had to remain a set containing two intervals. The representation needed to handle both without accidentally filling in that missing point.

Now that the parser understood sets and intervals, and the parser was the backbone of every other interactive element that used math, I should be in the home stretch!

## Equation graph pains

...is what I thought before I started on the remaining work in my project. I had just spent the last three weeks adding sets and intervals to our _new_ parser, while most components (including the equation graph) still relied on a _legacy_ parser. The equation graph's core file was extremely long when I started the summer (another engineer was already working on paring it down). I needed to understand where the old representation flowed through the package before I could split the migration into manageable pieces. 

The parser is integral to the graph: the symbolic representation from the parser is how we evaluate what the function's value is for a given input, and render equations out as LaTeX-like forms. When different packages communicate (for example, graphing an equation from a keyboard input package with the graph package), they do so by passing these representations to each other. These representations were fundamentally incompatible: if one system generated "legacy" math blocks, it had to be converted to a string (a lossy process) before another system using the new parser could understand it.

There's a good reason this migration hadn't been completed yet: the new and old parser were fundamentally very different. The old parser mixed LaTeX rendering concerns with the actual math logic, which led to a very unwieldy data type, while the new parser had two distinct data types: one for operating on the math symbolically, and another for rendering the equation itself. It wasn't a mechanical substitution, since neither of the new data types could fully do the job of the old one.

I tried a couple different tacks: I first tried to one-shot the problem with GPT-5.6-Sol by just throwing a spec at it, and got understandably terrible results (despite a "legacy-to-exploration" migration skill existing in the repo). Even if the code worked (which it didn't), it was unmergeable:

- I couldn't ask my teammates to perform any meaningful review on a diff with 5 digits of changed lines, out of empathy. The diff mixed too many interacting changes to review reliably, and following a single thread was near-impossible.
- Any regressions would be extremely challenging to spot prior to merging, and probably result in a revert after merging. This package is used in thousands of lessons, so there's no way I would catch everything on my first try. 
- Migrating the equation graph had also meant migrating the packages it used as inputs, which inflated the diff further. 
- Any time a change landed in the graphing package (which happened relatively often- remember, a teammate was working on paring down that long file at the same time), the whole PR had a merge conflict.

My mentor suggested the [Strangler Fig pattern](https://learn.microsoft.com/en-us/azure/architecture/patterns/strangler-fig) for the migration: gradually replace parts of the old system while keeping the rest working. I initially dismissed it because legacy math appeared all along the graph's main path. I couldn't see a feature I could cleanly peel off, so the migration seemed all-or-nothing. This turned out to be a misunderstanding on my part.

## In Which I Let It Rip

I realized that the ultimate solution would involve migrating parts of the equation graphing package one at a time, so Claude and I spent some time analyzing data flow through the package- where were legacy blocks coming in, where were we holding them in state, and where they were being passed between components. Elm doesn't allow circular imports between files, so the module dependencies gave me an acyclic graph to start from. I also traced how math representations moved through the system: from the keyboard input, through the main graph module, and into components like the label renderer. That helped me work out which pieces could migrate separately and which were too intertwined to split across PRs. I migrated those together, using the compatibility layer at the boundaries.

I landed on creating a compatibility layer that could translate the legacy blocks to the new structure by walking the tree; since both systems were trying to replicate "correct" math, in theory it shouldn't be so hard. The translation layer let old and new code coexist while I migrated the package in pieces. In other words, my mentor had been right all along: I'd found a way to apply Strangler Fig after initially deciding it wouldn't work. Since the translation was a bounded task that ultimately ended up creating one heavily-tested file, AI was very effective here.

With a rough order to migrate files (based on that data flow), and a function to call on the boundary to convert one data type into another, I decided to burn some of Brilliant's Cursor cloud credits on having Fable do the migration grunt work for me. Instead of trying to one-shot it like I had before, I made sure it had the tools to check its work, and I told it to separate its progress into as many independently-reviewable commits as possible. It took more than 5 hours, and, to my surprise, produced a passable result! The rendering was a little broken, and the asymptote detection had an infinite loop, but it was a good amount of the way there.

When I used Graphite to split the branch by commit, I ended up with a stack of 15 PRs. Not all of them passed CI initially, but the diffs weren't threateningly huge. More importantly, since it was a stack, I could merge lower layers and release that part of the package so my colleagues could make changes without necessarily causing me merge conflicts.

I spent the following weeks going through the Megastack, layer by layer, reading through it on my own, testing it myself, improving it in various ways (and responding to PR feedback), before merging. While Fable was an incredible time-saver, this was still a very labor-intensive collaboration. Most of its code was difficult to read, even if it technically worked, making it more of a "valuable baseline" than "ready to ship". It saved me the tedious work of wrangling the two new representations and updating all the call sites.

A lot of that polish work was getting each layer through CI and review. The team already had "audit tests" that ran thousands of example interactives in a browser and compared screenshots, catching things like incorrect labels and rendering problems. There were also validation tests that checked every live interactive for compile-time and runtime failures for a given PR. I leaned heavily on both. CI was especially useful for the stack: testing each layer locally was sequential, while CI could test different layers in parallel. Every PR passed CI and manual review by my colleagues before merging.

The screenshot comparisons did have a blind spot: performance. The infinite loop in asymptote detection was caught almost by accident, because it made a different test suite time out. I updated the audit tests to collect and compare timing and memory usage alongside the screenshots they were already collecting. A graph could look right and still have a problem the screenshots would never show.

There was also a whole sidequest around incomplete equations. What should the graph show while a learner has entered `y = 2x + ?`? The legacy implementation filled missing parts with the identity for their operation, like 0 for addition or 1 for multiplication. That was relatively straightforward when working on the string itself, but we didn't have great utilities for getting the surrounding context of a slot in the new abstract syntax tree (AST).

As I remember it, we settled on filling missing numeric slots with 0 and leaving other missing parts empty. Trying to infer more wasn't necessarily helpful for the learner, and could even give the answer away. This was one place where reproducing the old behavior wasn't automatically the right goal: we also had to consider what the graph should communicate while someone was still working out an answer.

Ultimately, the only production regression we identified was a bug where we displayed the form of a generic quadratic expression as $(ax)^2+bx+c$ for a few hours, because the old parser's tree parsed it that way and my compatibility layer automatically inserted parentheses wherever precedence was different between the old and new parsers. The issue resolved itself when an upstack PR was merged, and it was hours later when reviewing bug reports that we discovered what caused it.

## Where it landed

The migration finished with about two weeks left in my internship. The graph no longer imported the legacy parser. Other interactives that still used the old representation could call the compatibility layer on their side before passing math into the graph, so that layer is still in the codebase.

Lesson authors supplied equation strings, not our internal representations, so most live interactives didn't need any changes. The exceptions were equations that weren't valid under the new parser. The migration also reduced the amount of code: having separate structures for rendering and evaluating math made each concern simpler for callers.

As for the sets and intervals that started all this: those problem types haven't shipped yet, to my knowledge. A teammate handled the number-line migration, and the equation graph now has the new set and interval objects available for that future work. The migration shipped, even though the feature that motivated it is still in the oven.

# MotionGraph

With about two weeks left, I worked on MotionGraph, a new package for animated graphs. We didn't previously have a graph authors could easily animate, and the Derivatives course needed one!

![An animated MotionGraph interactive from Brilliant's Derivatives course.](/images/posts/brilliant/motiongraph.gif)

Before building the package, I wrote an API design doc and asked my colleagues and lesson authors for feedback. This caught some fairly basic things early: several of my names weren't standard terminology, and parts of the API were more verbose than they needed to be. Since other people would have to author lessons with it, that was useful to discover before I had an implementation to defend.

The API combined standard graph primitives, static lines, and self-contained "skins" for different presentations. Each skin exported a skin object that composed with the rest of the graph; adding a new one meant putting its logic in the skin itself. Inputs were separate components that declared their capabilities and could draw their own lines when needed.

Region highlights and line-drawing inputs were fairly straightforward. General keyboard input was harder: an equation alone didn't tell me what kind of question an author wanted to ask. Instead of exposing one generic keyboard input and trying to infer the intended problem from the equation text, I constrained the API to a set of supported problem types. That meant less freedom, but it let authors specify the kind of interaction they wanted explicitly.

I built six inputs and five skins. My understanding is that all of them shipped in some form in the Derivatives course, though the release happened after I handed the package off. I kept my progress in Linear and wrote a handoff document covering the minor polish work I couldn't finish in those two weeks, so my teammates had a record of what remained.

# Takeaways

## Tests that gave us room to change things

I think the biggest reason the migration succeeded was the team's investment in testing infrastructure. Our "audit tests" were effectively end-to-end tests within a package: they exercised interactives in a browser and checked what came out. That gave me peace of mind while changing the internals, made the PRs easier to review, and gave the agent a way to check its own work while I wasn't watching it.

The unit tests were more of a mixed bag. They had been useful when adding sets and intervals, but during the migration, many tested implementation details or data structures directly. Those could become a hindrance when the implementation was exactly what I was trying to change. The audit tests gave us a way to check whether the interactives still behaved and looked right across that change.

They weren't a complete safety net, as the asymptote bug demonstrated. Adding timing and memory measurements made me appreciate how much more useful a test becomes when it tells you what's happening beyond whether it passed. That experience inspired me to improve observability in my own projects, too.

## Aim before firing

Brilliant's interactive elements are written in [Elm](https://elm-lang.org/), which I learned from scratch during the internship. Agents could write Elm, but in my experience they struggled more with its architecture and data flow than they did with TypeScript. Code that worked could still be full of duplicated helpers and difficult to read. I needed to understand the system well enough to decide what to ask for and judge what came back.

"Aiming before firing" feels more important than ever with agents. You can leave one working for hours, but if you underspecified the task or didn't think through the implications of the prompt, it can spend all that time pursuing the wrong thing. My first attempt at the migration was a pretty good demonstration! The later attempt had a translation boundary, an order to work through, tests the agent could run, and a requirement to split the work into reviewable pieces. Figuring those out was part of the process.

You also can't expect an agent to read your mind. People who've spent time at a company develop a general vibe for what a good solution looks like: what authors will find confusing, what reviewers will accept, and what behavior makes sense for a learner. We probably couldn't verbalize all of that well enough to fit it into a prompt even if we tried, and an agent's context window only holds so much.

I think this is a lot of what people mean by "taste." Design fundamentals are part of it, but so is all that accumulated context about who you're building for and what matters to them. Spending a lot of time on Twitter doesn't necessarily give you that. The incomplete-equation behavior was a good example: deciding how much to infer depended on what would help a learner, not just what we could get the parser to evaluate.

Next time, I'd spend more time up front identifying those decisions, deciding what the tests need to establish, and making the boundaries of the task explicit. I suspect this is a similar takeaway to what junior engineers would've had from pre-AI internships, which is a small comfort. The agent saved me a lot of mechanical work once I had those pieces in place. Understanding what we actually wanted to ship still took conversations with my mentor, colleagues, and lesson authors.
