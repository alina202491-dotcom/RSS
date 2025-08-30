import { parseHTML } from "linkedom";
import type { ExtractResult, ExtractedItem, FeedRule } from "./types";

function resolveUrl(baseUrl: string, href: string | undefined | null): string | undefined {
	if (!href) return undefined;
	try {
		return new URL(href, baseUrl).toString();
	} catch {
		return undefined;
	}
}

function pickElement(base: Element, selector: string | undefined | null): Element | null {
	if (!selector) return null;
	if (selector === "self" || selector === ":self" || selector === "." || selector === "&") return base;
	return base.querySelector(selector);
}

function extractField(base: Element, selector?: string): string | undefined {
	if (!selector) return undefined;
	const atIndex = selector.lastIndexOf("@");
	let css = selector;
	let attr: string | undefined;
	if (atIndex > -1) {
		css = selector.slice(0, atIndex).trim();
		attr = selector.slice(atIndex + 1).trim();
	}
	const el = css ? pickElement(base, css) : base;
	if (!el) return undefined;
	if (attr) {
		return (el as Element).getAttribute(attr) || undefined;
	}
	// If this looks like a block content field, prefer innerHTML; otherwise textContent
	const textLike = el.textContent?.trim() || undefined;
	return textLike;
}

export function extractFromHtml(html: string, baseUrl: string, rule: FeedRule): ExtractResult {
	const { document } = parseHTML(html);
	const pageTitle = document.querySelector("title")?.textContent || undefined;
	const itemNodes = Array.from(document.querySelectorAll(rule.item));
	const limit = Math.max(0, Math.min(rule.limit ?? 50, 200));
	const items: ExtractedItem[] = [];
	for (const node of itemNodes) {
		const element = node as Element;
		const title = extractField(element, rule.title);
		const linkRaw = extractField(element, rule.link);
		const link = resolveUrl(baseUrl, linkRaw);
		const content = extractField(element, rule.content);
		let dateString = extractField(element, rule.date);
		let pubDate: string | undefined;
		if (dateString) {
			const trimmed = dateString.trim();
			if (/^\d+$/.test(trimmed)) {
				const num = Number(trimmed);
				const ms = num > 1e12 ? num : num * 1000;
				pubDate = new Date(ms).toUTCString();
			} else {
				const parsed = Date.parse(trimmed);
				if (!Number.isNaN(parsed)) pubDate = new Date(parsed).toUTCString();
			}
		}
		items.push({ title, link, content, date: pubDate });
		if (items.length >= limit) break;
	}
	return { items, pageTitle };
}