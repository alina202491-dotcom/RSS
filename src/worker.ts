import { extractFromHtml } from "./extractor";
import { buildRss } from "./rss";
import type { Env, FeedRule } from "./types";

function json(data: unknown, init?: ResponseInit) {
	return new Response(JSON.stringify(data, null, 2), {
		headers: { "content-type": "application/json; charset=utf-8" },
		...init,
	});
}

function text(data: string, init?: ResponseInit) {
	return new Response(data, { headers: { "content-type": "text/plain; charset=utf-8" }, ...init });
}

function html(data: string, init?: ResponseInit) {
	return new Response(data, { headers: { "content-type": "text/html; charset=utf-8" }, ...init });
}

function badRequest(message: string) {
	return json({ error: message }, { status: 400 });
}

function unauthorized() {
	return json({ error: "Unauthorized" }, { status: 401 });
}

function notFound(message = "Not Found") {
	return json({ error: message }, { status: 404 });
}

function toRuleFromQuery(search: URLSearchParams): Omit<FeedRule, "sourceUrl" | "site"> & { site?: FeedRule["site"] } {
	const item = search.get("item") || "article, .post, li, .entry";
	const title = search.get("title") || ".title, h1, h2, h3";
	const link = search.get("link") || "a@href";
	const content = search.get("content") || ".content, .summary, p";
	const date = search.get("date") || undefined;
	const limit = Number(search.get("limit") || "20");
	const userAgent = search.get("ua") || undefined;
	const siteTitle = search.get("site_title") || undefined;
	const siteLink = search.get("site_link") || undefined;
	const siteDesc = search.get("site_desc") || undefined;
	return {
		item,
		title,
		link,
		content,
		date,
		limit: Number.isFinite(limit) ? limit : 20,
		userAgent,
		site: { title: siteTitle ?? undefined, link: siteLink ?? undefined, description: siteDesc ?? undefined },
	};
}

async function fetchPage(sourceUrl: string, userAgent?: string): Promise<string> {
	const headers: Record<string, string> = { "accept": "text/html,application/xhtml+xml" };
	if (userAgent) headers["user-agent"] = userAgent;
	const res = await fetch(sourceUrl, { headers });
	if (!res.ok) {
		throw new Error(`Upstream returned ${res.status}`);
	}
	return await res.text();
}

function buildCacheKey(request: Request): Request {
	const url = new URL(request.url);
	// Only cache GET requests
	if (request.method !== "GET") return request;
	// Normalize headers that should not affect cache
	const cacheKey = new Request(url.toString(), request);
	return cacheKey;
}

function buildRssResponse(xml: string): Response {
	const headers = new Headers();
	headers.set("content-type", "application/rss+xml; charset=utf-8");
	headers.set("cache-control", "public, max-age=300");
	return new Response(xml, { status: 200, headers });
}

function formatDateYYYYMMDD(dateString?: string): string | undefined {
	if (!dateString) return undefined;
	const parsed = Date.parse(dateString);
	if (Number.isNaN(parsed)) return undefined;
	const d = new Date(parsed);
	const y = d.getUTCFullYear();
	const m = String(d.getUTCMonth() + 1).padStart(2, "0");
	const day = String(d.getUTCDate()).padStart(2, "0");
	return `${y}-${m}-${day}`;
}

function buildFriendsJsonResponse(
	items: { title?: string; link?: string; content?: string; date?: string }[],
	options: {
		authorFallback: string;
		dateAsYMD: boolean;
		wrapKey?: string;
	}
): Response {
	const payload = items.map((it) => {
		const date = options.dateAsYMD ? formatDateYYYYMMDD(it.date) : it.date;
		return {
			title: it.title || "",
			auther: options.authorFallback,
			date: date || "",
			link: it.link || "",
			content: it.content || "",
		};
	});
	const headers = new Headers();
	headers.set("content-type", "application/json; charset=utf-8");
	headers.set("cache-control", "public, max-age=300");
	headers.set("access-control-allow-origin", "*");
	const body = options.wrapKey ? { [options.wrapKey]: payload } : payload;
	return new Response(JSON.stringify(body, null, 2), { status: 200, headers });
}

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);
		const pathname = url.pathname;
		if (request.method === "GET" && pathname === "/") {
			return html(`<!doctype html><meta charset="utf-8"/><title>Cloudflare-FreeRSS</title><style>body{font-family:system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;max-width:820px;margin:40px auto;padding:0 16px;line-height:1.6}code,kbd{background:#f4f4f5;padding:.1rem .3rem;border-radius:.25rem}pre{background:#0b1021;color:#e5e7eb;padding:12px;border-radius:8px;overflow:auto}a{color:#2563eb;text-decoration:none}a:hover{text-decoration:underline}</style><h1>Cloudflare-FreeRSS</h1><p>Convert any website into an RSS 2.0 feed using CSS selectors.</p><h2>Quick start</h2><ol><li>Ad-hoc feed: <code>/feed?url=https://example.com/blog&item=.post&title=.title&link=a@href&content=.summary</code></li><li>Saved rule feed: <code>/f/your-id</code> (after creating a rule via admin API)</li></ol><h2>Admin</h2><pre>curl -X PUT "$origin/admin/rule/your-id" \\n -H "Authorization: Bearer $ADMIN_TOKEN" \\
 -H "Content-Type: application/json" \\
 --data '{"sourceUrl":"https://example.com/blog","item":".post","title":".title","link":"a@href","content":".summary","site":{"title":"Example Blog","link":"https://example.com"}}'</pre><p>Source: <a href="https://github.com/">GitHub</a></p>`);
		}
		if (request.method === "GET" && pathname === "/health") {
			return text("ok");
		}

		// Feed via query parameters
		if (request.method === "GET" && pathname === "/feed") {
			const sourceUrl = url.searchParams.get("url");
			if (!sourceUrl) return badRequest("Missing ?url");
			const format = (url.searchParams.get("format") || "").toLowerCase();
			const partial = toRuleFromQuery(url.searchParams);
			const rule: FeedRule = { sourceUrl, ...partial };

			const cache = caches.default;
			const cacheKey = buildCacheKey(request);
			const cached = await cache.match(cacheKey);
			if (cached) return cached;

			try {
				const htmlText = await fetchPage(sourceUrl, rule.userAgent);
				const { items, pageTitle } = extractFromHtml(htmlText, sourceUrl, rule);
				const channel = {
					title: rule.site?.title || pageTitle || new URL(sourceUrl).host,
					link: rule.site?.link || new URL(sourceUrl).origin,
					description: rule.site?.description || "Generated by Cloudflare-FreeRSS",
				};
				let response: Response;
				if (format === "json" || format === "friends" || format === "friend" || format === "array") {
					const authorFallback = url.searchParams.get("auther") || url.searchParams.get("author") || channel.title;
					const dateAsYMD = (url.searchParams.get("date_fmt") || "").toLowerCase() === "ymd";
					const wrapKey = url.searchParams.get("root") || url.searchParams.get("wrap") || undefined;
					response = buildFriendsJsonResponse(items, { authorFallback, dateAsYMD, wrapKey });
				} else {
					const xml = buildRss(channel, items);
					response = buildRssResponse(xml);
				}
				ctx.waitUntil(cache.put(cacheKey, response.clone()));
				return response;
			} catch (err) {
				return json({ error: (err as Error).message }, { status: 502 });
			}
		}

		// Feed via saved rule id
		const feedRuleMatch = pathname.match(/^\/f\/(.+)$/);
		if (request.method === "GET" && feedRuleMatch) {
			const id = decodeURIComponent(feedRuleMatch[1]);
			const cache = caches.default;
			const cacheKey = buildCacheKey(request);
			const cached = await cache.match(cacheKey);
			if (cached) return cached;

			const stored = await env.FEED_RULES.get(id, { type: "json" });
			if (!stored) return notFound("Rule not found");
			const rule = stored as FeedRule;
			const format = (url.searchParams.get("format") || "").toLowerCase();
			try {
				const htmlText = await fetchPage(rule.sourceUrl, rule.userAgent);
				const { items, pageTitle } = extractFromHtml(htmlText, rule.sourceUrl, rule);
				const channel = {
					title: rule.site?.title || pageTitle || new URL(rule.sourceUrl).host,
					link: rule.site?.link || new URL(rule.sourceUrl).origin,
					description: rule.site?.description || "Generated by Cloudflare-FreeRSS",
				};
				let response: Response;
				if (format === "json" || format === "friends" || format === "friend" || format === "array") {
					const authorFallback = url.searchParams.get("auther") || url.searchParams.get("author") || channel.title;
					const dateAsYMD = (url.searchParams.get("date_fmt") || "").toLowerCase() === "ymd";
					const wrapKey = url.searchParams.get("root") || url.searchParams.get("wrap") || undefined;
					response = buildFriendsJsonResponse(items, { authorFallback, dateAsYMD, wrapKey });
				} else {
					const xml = buildRss(channel, items);
					response = buildRssResponse(xml);
				}
				ctx.waitUntil(cache.put(cacheKey, response.clone()));
				return response;
			} catch (err) {
				return json({ error: (err as Error).message }, { status: 502 });
			}
		}

		// Admin API
		const isAdminPath = pathname.startsWith("/admin/");
		if (isAdminPath) {
			const auth = request.headers.get("authorization") || "";
			const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : url.searchParams.get("token");
			if (!token || token !== env.ADMIN_TOKEN) return unauthorized();

			// PUT /admin/rule/:id
			const putMatch = pathname.match(/^\/admin\/rule\/(.+)$/);
			if (request.method === "PUT" && putMatch) {
				const id = decodeURIComponent(putMatch[1]);
				const body = await request.json<FeedRule>().catch(() => null);
				if (!body || !body.sourceUrl || !body.item) return badRequest("Invalid rule: requires sourceUrl and item");
				await env.FEED_RULES.put(id, JSON.stringify(body));
				return json({ ok: true, id });
			}

			// GET /admin/rule/:id
			const getMatch = pathname.match(/^\/admin\/rule\/(.+)$/);
			if (request.method === "GET" && getMatch) {
				const id = decodeURIComponent(getMatch[1]);
				const stored = await env.FEED_RULES.get(id, { type: "json" });
				if (!stored) return notFound("Rule not found");
				return json(stored);
			}

			// DELETE /admin/rule/:id
			const delMatch = pathname.match(/^\/admin\/rule\/(.+)$/);
			if (request.method === "DELETE" && delMatch) {
				const id = decodeURIComponent(delMatch[1]);
				await env.FEED_RULES.delete(id);
				return json({ ok: true, id });
			}

			// GET /admin/rules
			if (request.method === "GET" && pathname === "/admin/rules") {
				const list = await env.FEED_RULES.list();
				return json(list);
			}

			return notFound();
		}

		return notFound();
	},
};