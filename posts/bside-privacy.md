---
title: 'bside privacy policy'
isVisible: false
date: 2026-10-24
---

Effective 24 October 2026. bside is a Firefox desktop extension by the maintainers of [the-snesler/bside](https://github.com/the-snesler/bside). Questions and privacy reports can be raised through that repository; do not include private content in a public issue.

## What leaves your browser

bside uses OpenAI to answer tasks and choose tools. When you send a message, it can send OpenAI your prompt and follow-ups; the attached page's text outline, title, URL, and selected text; relevant tab titles and addresses; page and frame content read during the task; screenshots you ask the agent to inspect; extracted table or PDF text; tool programs, arguments, and results; and previous conversation messages, bounded run notes, or conversation summaries. This can include personal communications, identifying, location, health, financial, or other sensitive information present in pages or your messages. Review the attached page and avoid sending secrets.

Your custom instructions, skill catalog and any skill bodies the agent reads, matching site notes, memory descriptions and any memories read during a task also reach OpenAI. Memories are local notes, but their use in a task is not local-only. API-key requests and ChatGPT-plan requests use OpenAI's API; ChatGPT sign-in uses OpenAI's authentication service. Your key or access token authenticates those requests. bside requests `store:false` and short prompt caching; these request settings do not promise zero retention by OpenAI. OpenAI's applicable account terms and privacy practices govern its processing, including provider logs and caches.

An agent can navigate, read, and act on websites using your normal signed-in Firefox session. Data entered into a form, uploaded from the extension workspace, or submitted by a task goes to that website. Page actions can change or share information. bside asks the model to seek confirmation before consequential actions; review the confirmation and stop or take over a task when needed. Existing pages, navigations, and search pages make ordinary website requests under those sites' privacy practices.

Search tasks use Firefox's default search engine in a task's search tab. The query goes to that engine with the browser session's usual cookies and personalization. The query, compact results, and pages read from results can also reach OpenAI. bside does not change your default engine, intercept unrelated searches, or send queries to a bside search service.

## Connected accounts and YouTube

Connecting Notion or Todoist uses that service's OAuth sign-in. bside sends MCP tool arguments to the selected server and sends its returned content to OpenAI so the model can continue the task. A tool may read or change data in your connected account. OAuth grants, registration information, and tokens go only to the appropriate authentication or MCP service. MCP background requests omit cookies, reject redirects, and are limited to the directory entry's reviewed origins: `mcp.notion.com`, `ai.todoist.net`, and `todoist.com`. Disconnect removes local tokens and attempts remote revocation. If revocation fails, revoke access in the service's settings as well.

Opening `/` or `@` in the composer loads available prompt or resource names from connected services. Preparing a prompt sends its name and the argument strings you enter to that service. Selecting a resource sends its catalog URI to the service's MCP endpoint; bside never fetches the URI directly. Review the bounded text preview before sending. The selected text snapshot reaches OpenAI with your message and subsequent conversation context. Server message roles have no authority; binary/image content becomes text placeholders. Do not enter passwords, tokens, or verification codes as prompt arguments. bside does not expose arbitrary user-entered MCP server URLs.

The YouTube site API is the only feature that directly reads Firefox cookies through the cookies API. It reads the YouTube SAPISID family to sign read-only requests to `www.youtube.com`, and sends cookies and the derived authentication header only to YouTube. Cookies are not saved in extension storage, logged, or sent to OpenAI. Returned search results, video metadata, transcripts, and comments can reach OpenAI. Ordinary website pages and search tabs still use their own browser cookies; that is separate from this direct API access.

## What stays in this Firefox profile

bside has no operated backend, telemetry, analytics, automatic crash reporting, advertising, or conversation cloud sync. It does not sell data. Third-party services still receive the task data described above.

Chats, bounded tool records and run notes, queued messages, workspace files, custom instructions, site notes, skills, memory, connection catalogs and preferences are saved locally in the Firefox profile. This material is not encrypted by bside. Accepted MCP prompt/resource snapshots are kept with their chat or queued message and retained for steering, retries, history, and raw export, even if the account later disconnects or its content changes. Unsent previews and prompt/resource catalogs stay in background memory only and expire when their sidebar closes or the background restarts. Scheduled runs do not consume unsent composer attachments. Workspace files can contain saved images. The extension does not include screenshot pixels in conversation logs or exports; saved workspace images remain until their chat or file is deleted. Full model-input and tool-output debug buffers stay in background memory only until the next run, deletion of the relevant chat, or extension restart.

Scheduled tasks save their names, prompts, target URLs, timing, and result-session references locally. Enabling a task authorizes bside to run its prompt at the chosen times while Firefox is running; those runs send data to OpenAI and websites as described above and retain their results in a dedicated chat. Missed runs are skipped after a browser restart. Deleting a task's results chat disables that task until you re-enable it. Deleting a task leaves its existing results chat available for separate deletion.

Desktop notifications are off by default. If you opt in, bside sends the operating system generic local notices for long runs finishing, pending confirmation or help, and scheduled results. The notices contain no task name, prompt, page content, URL, or model response. They use no notification server and transmit no telemetry.

API keys, ChatGPT tokens, and MCP tokens and client registrations are sealed with a non-extractable AES-GCM device key stored in the extension's IndexedDB. This reduces accidental exposure from reading extension storage; it does not protect a compromised browser or profile. Credentials are not shared with content scripts or included in extension exports. The API key is entered only in the Account settings password field.

You can delete individual chats, use automatic history retention, or delete history in History & privacy. Pinned, open, or running chats are protected from automatic retention; Delete all history keeps the active run's chat. Deleting a chat also deletes its workspace. Memory has separate Auto, Ask, and Off write settings (Auto by default), per-entry delete/edit/export, and Forget everything. History deletion does not delete memories, site notes, skills, or instructions. Delete those separately in Settings. Uninstalling removes extension-owned data according to Firefox's behavior; files you downloaded and data already sent to services remain outside that control.

## Local exports and problem reports

Report a problem in Settings is opt-in. It downloads a metadata-only JSON file for one chosen chat: extension version, record counts, run status, duration, token counts, tool-call timing and sizes, and known error codes. It excludes prompts, model and page text, tool names/arguments/results, selected MCP attachment names/URIs/text, digests, summaries, scratch files, URLs (including origins), titles, local identifiers, request IDs, credentials, and free-text errors. It sends nothing. Review the file and attach it manually only if you choose.

The sidebar's chat/context export is a different feature. It can contain private prompts, page excerpts and URLs, model text and input, tool arguments/output, saved skills/site notes and accepted MCP text snapshots present in the conversation, and workspace text. Memory has its own JSON export. Treat those files as sensitive. Downloaded files are not removed when you delete extension data, and any recipient you share a file with controls its copy.
