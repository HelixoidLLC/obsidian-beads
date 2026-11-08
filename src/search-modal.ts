import { App, SuggestModal } from "obsidian";
import type BeadsPlugin from "./main";
import type { BeadIssue } from "./types";
import { BdError, bdQueryAll, bdSearch } from "./bd";
import { PaneFilter, describeFilter, isFilterActive, matchesFilter } from "./filter";
import { renderIssueRow } from "./row";
import { searchBeads, searchWords } from "./search";

const DEBOUNCE_MS = 200;
const TYPE_TO_SEARCH = "Type to search by ID, title, description or notes.";

/**
 * "Search" in the command palette: the pane's search, opening the chosen bead.
 * It uses the open pane's filter and says so, so a bead the filter hides isn't
 * a mystery.
 */
export class BeadSearchModal extends SuggestModal<BeadIssue> {
	/** Only the newest keystroke's search may land. */
	private seq = 0;
	private shown: BeadIssue[] = [];
	private abort: AbortController | null = null;

	constructor(
		app: App,
		private plugin: BeadsPlugin,
		private filter: PaneFilter,
	) {
		super(app);
		this.setPlaceholder("Search beads…");
		this.emptyStateText = TYPE_TO_SEARCH;
		if (isFilterActive(filter)) {
			this.setInstructions([{ command: "Filtered by", purpose: describeFilter(filter) }]);
		}
	}

	async getSuggestions(text: string): Promise<BeadIssue[]> {
		const seq = ++this.seq;
		await new Promise((resolve) => window.setTimeout(resolve, DEBOUNCE_MS));
		if (seq !== this.seq) return this.shown;

		this.abort?.abort();
		this.abort = null;
		if (searchWords(text).length === 0) {
			this.emptyStateText = TYPE_TO_SEARCH;
			return (this.shown = []);
		}
		const opts = this.plugin.bdOptions();
		if (!opts) {
			this.emptyStateText = "No project set.";
			return (this.shown = []);
		}
		const abort = new AbortController();
		this.abort = abort;
		const signalled = { ...opts, signal: abort.signal };
		try {
			const issues = await searchBeads(text, (i) => matchesFilter(i, this.filter), {
				query: (expr) => bdQueryAll(signalled, expr),
				search: (word) => bdSearch(signalled, word),
			});
			if (seq !== this.seq) return this.shown;
			this.emptyStateText = "No matching beads.";
			return (this.shown = issues);
		} catch (e) {
			if (seq !== this.seq) return this.shown;
			this.emptyStateText = e instanceof BdError ? e.message : String(e);
			return (this.shown = []);
		}
	}

	renderSuggestion(issue: BeadIssue, el: HTMLElement): void {
		// The modal handles the click (onChooseSuggestion), not the row.
		renderIssueRow(el, issue, { onOpen: () => undefined, showStatus: true });
	}

	onChooseSuggestion(issue: BeadIssue): void {
		void this.plugin.openBead(issue.id);
	}

	onClose(): void {
		super.onClose();
		this.seq++;
		this.abort?.abort();
	}
}
