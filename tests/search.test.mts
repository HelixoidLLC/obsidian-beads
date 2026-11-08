import { test } from "node:test";
import assert from "node:assert/strict";
import { EMPTY_FILTER, NO_ASSIGNEE, matchesFilter, type PaneFilter } from "../src/filter.ts";
import { matchesWords, searchBeads, searchExpr, searchWords } from "../src/search.ts";
import type { BeadIssue } from "../src/types.ts";

const bead = (id: string, extra: Partial<BeadIssue> = {}): BeadIssue =>
	({ id, title: "", status: "open", priority: 2, issue_type: "task", ...extra }) as BeadIssue;

/** Records what bd was asked and answers with fixed rows. */
function sources(fromQuery: BeadIssue[], fromSearch: BeadIssue[] = []) {
	const calls = { query: [] as string[], search: [] as string[] };
	return {
		calls,
		src: {
			query: (expr: string) => (calls.query.push(expr), Promise.resolve(fromQuery)),
			search: (word: string) => (calls.search.push(word), Promise.resolve(fromSearch)),
		},
	};
}
const ids = (issues: BeadIssue[]) => issues.map((i) => i.id);
const everything = () => true;

test("searchWords splits on any whitespace and drops the empties", () => {
	assert.deepEqual(searchWords("  login\t page \n"), ["login", "page"]);
	assert.deepEqual(searchWords("   "), []);
	assert.deepEqual(searchWords(""), []);
});

test("searchExpr ORs the fields per word and ANDs the words", () => {
	assert.equal(searchExpr(["a"]), '(title="a" OR description="a" OR notes="a" OR id="a")');
	assert.equal(
		searchExpr(["a", "b"]),
		'(title="a" OR description="a" OR notes="a" OR id="a") AND (title="b" OR description="b" OR notes="b" OR id="b")',
	);
});

test("searchExpr escapes a quote, so a word can't end the string", () => {
	assert.equal(
		searchExpr(['x" OR title="y']),
		'(title="x\\" OR title=\\"y" OR description="x\\" OR title=\\"y" OR notes="x\\" OR title=\\"y" OR id="x\\" OR title=\\"y")',
	);
});

test("searchExpr escapes a backslash, including a trailing one", () => {
	assert.equal(searchExpr(["a\\"]), '(title="a\\\\" OR description="a\\\\" OR notes="a\\\\" OR id="a\\\\")');
});

test('searchExpr reads every bead for the word "none", which description= would take as empty', () => {
	assert.equal(searchExpr(["none"]), '(id="*")');
	assert.equal(searchExpr(["NONE"]), '(id="*")');
	assert.equal(searchExpr(["none", "a"]), '(id="*") AND (title="a" OR description="a" OR notes="a" OR id="a")');
	assert.match(searchExpr(["nonexistent"]), /^\(title="nonexistent"/);
});

test("searchExpr drops the id clause for a word with *, which id= would expand", () => {
	assert.equal(searchExpr(["*"]), '(title="*" OR description="*" OR notes="*")');
});

test("matchesWords needs every word, in any field, ignoring case", () => {
	const issue = bead("CTM-i99", { title: "Login page", description: "OAuth redirect", notes: "ask Sam" });
	assert.ok(matchesWords(issue, ["oauth", "LOGIN"]));
	assert.ok(matchesWords(issue, ["sam", "i99"]));
	assert.ok(!matchesWords(issue, ["login", "missing"]));
});

test("matchesWords takes wildcard characters literally", () => {
	assert.ok(matchesWords(bead("a", { title: "100% done" }), ["100%"]));
	assert.ok(!matchesWords(bead("a", { title: "100 percent" }), ["100%"]));
	assert.ok(!matchesWords(bead("a", { title: "doneXok" }), ["done_ok"]));
});

test("an empty search asks bd nothing", async () => {
	const { calls, src } = sources([bead("a")]);
	assert.deepEqual(await searchBeads("   ", everything, src), []);
	assert.deepEqual(calls, { query: [], search: [] });
});

test("one word also runs bd search; several don't", async () => {
	const one = sources([]);
	await searchBeads("i99", everything, one.src);
	assert.deepEqual(one.calls.search, ["i99"]);
	const two = sources([]);
	await searchBeads("i99 login", everything, two.src);
	assert.deepEqual(two.calls.search, []);
	assert.equal(two.calls.query.length, 1);
});

test("a word with a backslash skips bd search, which can't match one", async () => {
	const { calls, src } = sources([]);
	await searchBeads("a\\b", everything, src);
	assert.deepEqual(calls.search, []);
	assert.equal(calls.query.length, 1);
});

test("results from both commands are merged by id", async () => {
	const { src } = sources(
		[bead("x-1", { title: "abc", description: "from query" })],
		[bead("x-1", { title: "abc" }), bead("x-abc")],
	);
	const out = await searchBeads("abc", everything, src);
	assert.deepEqual(ids(out).sort(), ["x-1", "x-abc"]);
	assert.equal(out.find((i) => i.id === "x-1")?.description, "from query");
});

test("wildcard hits that aren't literal matches are dropped", async () => {
	const { src } = sources([bead("a", { title: "100% done" }), bead("b", { title: "100 percent" })]);
	assert.deepEqual(ids(await searchBeads("100%", everything, src)), ["a"]);
});

test("the pane filter applies to results", async () => {
	const rows = [
		bead("a", { title: "abc", assignee: "alice", priority: 0, labels: ["fx"] }),
		bead("b", { title: "abc", priority: 3 }),
	];
	const run = (f: PaneFilter) => searchBeads("abc", (i) => matchesFilter(i, f), sources(rows).src).then(ids);
	assert.deepEqual(await run({ ...EMPTY_FILTER, assignee: "alice" }), ["a"]);
	assert.deepEqual(await run({ ...EMPTY_FILTER, assignee: NO_ASSIGNEE }), ["b"]);
	assert.deepEqual(await run({ ...EMPTY_FILTER, maxPriority: 1 }), ["a"]);
	assert.deepEqual(await run({ ...EMPTY_FILTER, labels: ["fx"] }), ["a"]);
	assert.deepEqual(await run({ ...EMPTY_FILTER, type: "bug" }), []);
});

test("ID matches come first, then priority", async () => {
	const { src } = sources([
		bead("x-1", { title: "abc", priority: 0 }),
		bead("x-abc", { priority: 3 }),
		bead("x-2", { title: "abc", priority: 1 }),
	]);
	assert.deepEqual(ids(await searchBeads("abc", everything, src)), ["x-abc", "x-1", "x-2"]);
});
