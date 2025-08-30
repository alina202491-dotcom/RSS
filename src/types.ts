export interface FeedSiteInfo {
	title?: string;
	link?: string;
	description?: string;
}

export interface FeedRule {
	// Page to fetch
	sourceUrl: string;
	// CSS selector for each item container
	item: string;
	// Field selectors are resolved within each item. You can use "selector@attr" to extract an attribute
	title?: string;
	link?: string;
	content?: string;
	date?: string;
	// Optional metadata
	site?: FeedSiteInfo;
	limit?: number;
	userAgent?: string;
}

export interface ExtractedItem {
	title?: string;
	link?: string;
	content?: string;
	date?: string;
}

export interface ExtractResult {
	items: ExtractedItem[];
	pageTitle?: string;
}

export interface Env {
	FEED_RULES: KVNamespace;
	ADMIN_TOKEN: string;
}