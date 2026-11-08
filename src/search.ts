import type { BeadIssue } from "./types";

/**
 * Free-form bead search. Pure (no Obsidian imports, bd injected) so the pane
 * and the palette share one path and it's unit-testable.
 *
 * Every word must appear somewhere, in any order and in any field:
 * - `bd query` matches ID, title, description and notes. Only it can OR across
 *   those fields, but its ID match is exact.
 * - `bd search` finds a piece of an ID (`i99`, `kus.1`). It's only asked for a
 *   single word: it treats several as one phrase, and an ID has no spaces.
 *
 * `bd search` treats `%` and `_` as wildcards and can't escape them, so
 * `matchesWords` keeps only literal hits. That only ever narrows bd's answer.
 * `bd query` has no filter flags, so callers pass the pane filter as `inScope`
 * (`matchesFilter`, which the integration suite pins to bd's flags).
 */

/** The bd calls a search needs — injected so it stays pure and testable. */
export interface SearchSources {
	/** `bd query -a --limit 0 -- <expr>` */
	query(expr: string): Promise<BeadIssue[]>;
	/** `bd search --limit 0 --query=<word>` */
	search(word: string): Promise<BeadIssue[]>;
}

export function searchWords(text: string): string[] {
	return text.split(/\s+/).filter(Boolean);
}

function quoted(value: string): string {
	return `"${value.replace(/[\\"]/g, "\\$&")}"`;
}

/** `id="*"` is bd's "every bead"; `*` is a wildcard for id= alone. */
const ANY_BEAD = 'id="*"';

/** Each word as an OR across the fields, ANDed together. */
export function searchExpr(words: readonly string[]): string {
	return words
		.map((word) => {
			// `description="none"` means "has no description", with no way to ask
			// for the word itself, so read every bead and let matchesWords decide.
			if (word.toLowerCase() === "none") return `(${ANY_BEAD})`;
			const v = quoted(word);
			const id = word.includes("*") ? "" : ` OR id=${v}`;
			return `(title=${v} OR description=${v} OR notes=${v}${id})`;
		})
		.join(" AND ");
}

/** Does every word literally appear (ignoring case) in the bead's searched fields? */
export function matchesWords(issue: BeadIssue, words: readonly string[]): boolean {
	const text = [issue.id, issue.title, issue.description, issue.notes].join("\n").toLowerCase();
	return words.every((w) => text.includes(w.toLowerCase()));
}

/** ID matches first (the search was probably for that bead), then by priority. */
function ranked(issues: BeadIssue[], words: readonly string[]): BeadIssue[] {
	const tier = (i: BeadIssue) => (words.every((w) => i.id.toLowerCase().includes(w.toLowerCase())) ? 0 : 1);
	return issues
		.slice()
		.sort((a, b) => tier(a) - tier(b) || (a.priority ?? 9) - (b.priority ?? 9) || a.id.localeCompare(b.id));
}

/** All matching beads in every status (closed too) that `inScope` lets through. */
export async function searchBeads(
	text: string,
	inScope: (issue: BeadIssue) => boolean,
	src: SearchSources,
): Promise<BeadIssue[]> {
	const words = searchWords(text);
	if (words.length === 0) return [];
	const [fromQuery, fromSearch] = await Promise.all([
		src.query(searchExpr(words)),
		// LIKE reads a backslash as an escape, and no ID contains one anyway.
		words.length === 1 && !words[0].includes("\\") ? src.search(words[0]) : Promise.resolve([]),
	]);
	const byId = new Map<string, BeadIssue>();
	for (const issue of [...fromQuery, ...fromSearch]) {
		if (!byId.has(issue.id)) byId.set(issue.id, issue);
	}
	const hits = [...byId.values()].filter((i) => matchesWords(i, words) && inScope(i));
	return ranked(hits, words);
}
