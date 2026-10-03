import type { ReviewSource, ReviewToolName } from '@escrow/shared';
import { z } from 'zod';
import type { RepoSnapshot } from './repo-snapshot';
import { isReviewTool, toolInputs, type ToolInput } from './review-tools';

/** Largest single tool result, in characters, before it is cut with a note. */
export const MAX_RESULT_CHARS = 12_000;
/** Characters of tool output one reviewer may read in one review. */
export const MAX_TOTAL_RESULT_CHARS = 120_000;
export const MAX_SEARCH_MATCHES = 50;
export const MAX_LIST_ENTRIES = 300;
/** Files above this size are not searched (generated bundles, data). */
export const MAX_SEARCH_FILE_BYTES = 1_000_000;
const MAX_MATCH_LINE_CHARS = 200;

/** A tool call as the model asked for it; the input is unvalidated model output. */
export interface ToolCall {
  id: string;
  name: string;
  input: unknown;
}

/** What goes back to the model for one call. */
export interface ToolResult {
  id: string;
  name: string;
  content: string;
  isError: boolean;
}

/** A failure the model should be told about, such as a missing file. Anything else is a bug and propagates. */
class ToolError extends Error {}

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));
const isBinary = (data: Buffer) => data.subarray(0, 8000).includes(0);

/** A model-supplied path made relative to the repository root, or a ToolError when it tries to leave it. */
function normalizePath(raw: string): string {
  if (raw.includes('\0')) throw new ToolError('The path contains a NUL character.');
  const trimmed = raw.trim();
  if (trimmed.startsWith('/')) throw new ToolError('Use a path relative to the repository root, without a leading "/".');
  const parts = trimmed.split('/').filter((part) => part !== '' && part !== '.');
  if (parts.includes('..')) throw new ToolError('Paths cannot contain "..": only files inside the repository can be read.');
  return parts.join('/');
}

function targetOf(name: ReviewToolName, input: unknown): string {
  const fields = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>;
  const value = name === 'search' ? fields.query : fields.path;
  if (typeof value !== 'string') return '(invalid input)';
  if (name === 'search') return typeof fields.pathPrefix === 'string' ? `${value} in ${fields.pathPrefix}` : value;
  if (name === 'read_file' && (fields.startLine !== undefined || fields.endLine !== undefined)) {
    return `${value}:${String(fields.startLine ?? 1)}-${String(fields.endLine ?? 'end')}`;
  }
  return value || '.';
}

/**
 * Runs one reviewer's read-only tool calls against the repository snapshot.
 * It can only read the snapshot, so no tool can change anything. Every result is
 * delimited with the review's random id and treated by the prompt as untrusted data,
 * and every call is recorded so the maintainer can see what the verdict rests on.
 */
export class ReviewToolExecutor {
  private readonly log: ReviewSource[] = [];
  private outputChars = 0;

  constructor(
    private readonly snapshot: () => Promise<RepoSnapshot>,
    private readonly nonce: string,
  ) {}

  /** The calls made so far, in order. */
  get sources(): ReviewSource[] {
    return [...this.log];
  }

  async run(call: ToolCall): Promise<ToolResult> {
    const { text, isError } = await this.execute(call);
    // A file that happens to contain the id must not be able to close the result early.
    const safe = text.replaceAll(this.nonce, '[section id removed]');
    const content = `BEGIN tool_result ${this.nonce}\n${safe}\nEND tool_result ${this.nonce}`;
    return { id: call.id, name: call.name, content, isError };
  }

  private async execute(call: ToolCall): Promise<{ text: string; isError: boolean }> {
    if (!isReviewTool(call.name)) {
      return { text: `Unknown tool "${call.name}". The tools are read_file, list_dir and search.`, isError: true };
    }
    const tool = call.name;
    const record = (ok: boolean) => this.log.push({ tool, target: targetOf(tool, call.input), ok });

    const parsed = toolInputs[tool].safeParse(call.input);
    if (!parsed.success) {
      record(false);
      return { text: `Invalid input for ${tool}: ${z.prettifyError(parsed.error)}`, isError: true };
    }
    if (this.outputChars >= MAX_TOTAL_RESULT_CHARS) {
      record(false);
      return { text: 'The tool output budget for this review is used up. Give your verdict from what you have read.', isError: true };
    }
    try {
      const snapshot = await this.loadSnapshot();
      const text = this.cap(this.dispatch(snapshot, tool, parsed.data));
      record(true);
      return { text, isError: false };
    } catch (error) {
      if (!(error instanceof ToolError)) throw error;
      record(false);
      return { text: error.message, isError: true };
    }
  }

  private dispatch(snapshot: RepoSnapshot, tool: ReviewToolName, input: unknown): string {
    switch (tool) {
      case 'read_file':
        return readFile(snapshot, input as ToolInput<'read_file'>);
      case 'list_dir':
        return listDir(snapshot, input as ToolInput<'list_dir'>);
      case 'search':
        return search(snapshot, input as ToolInput<'search'>);
    }
  }

  /** The tools are worthless without the repository; the model hears why and judges from the diff. */
  private async loadSnapshot(): Promise<RepoSnapshot> {
    try {
      return await this.snapshot();
    } catch (error) {
      throw new ToolError(`The repository could not be loaded, so no tool can run: ${errorMessage(error)}`);
    }
  }

  private cap(text: string): string {
    const limit = Math.min(MAX_RESULT_CHARS, MAX_TOTAL_RESULT_CHARS - this.outputChars);
    const shown = text.length > limit ? text.slice(0, limit) : text;
    this.outputChars += shown.length;
    if (shown === text) return text;
    return `${shown}\n[Cut: showed ${limit} of ${text.length} characters. Ask for less, e.g. a line range or a narrower path.]`;
  }
}

function readFile(snapshot: RepoSnapshot, input: ToolInput<'read_file'>): string {
  const path = normalizePath(input.path);
  const data = snapshot.file(path);
  if (!data) {
    const hint = snapshot.directory(path) ? ' It is a directory; use list_dir.' : '';
    throw new ToolError(`No file "${path}" in the reviewed commit.${hint}`);
  }
  if (isBinary(data)) throw new ToolError(`"${path}" is a binary file.`);

  const lines = data.toString('utf8').split('\n');
  if (lines.at(-1) === '') lines.pop();
  const start = input.startLine ?? 1;
  const end = Math.min(input.endLine ?? lines.length, lines.length);
  if (lines.length === 0) return `${path} (empty file)`;
  if (start > lines.length) throw new ToolError(`"${path}" has only ${lines.length} lines.`);
  if (end < start) throw new ToolError('endLine is before startLine.');

  const width = String(end).length;
  const body = lines.slice(start - 1, end).map((line, i) => `${String(start + i).padStart(width)}  ${line}`);
  return [`${path} (lines ${start}-${end} of ${lines.length})`, ...body].join('\n');
}

function listDir(snapshot: RepoSnapshot, input: ToolInput<'list_dir'>): string {
  const path = normalizePath(input.path);
  const entries = snapshot.directory(path);
  if (!entries) {
    if (snapshot.file(path)) throw new ToolError(`"${path}" is a file; use read_file.`);
    throw new ToolError(`No directory "${path}" in the reviewed commit.`);
  }
  const lines = entries
    .slice(0, MAX_LIST_ENTRIES)
    .map((e) => (e.type === 'dir' ? `${e.name}/  (${e.size} files)` : `${e.name}  (${e.size} bytes)`));
  const more = entries.length > MAX_LIST_ENTRIES ? [`[${entries.length - MAX_LIST_ENTRIES} more entries not shown]`] : [];
  return [`${path || '.'}/ (${entries.length} entries)`, ...lines, ...more].join('\n');
}

function search(snapshot: RepoSnapshot, input: ToolInput<'search'>): string {
  const prefix = input.pathPrefix === undefined ? '' : normalizePath(input.pathPrefix);
  const matches: string[] = [];
  let total = 0;
  let scanned = 0;
  let skipped = 0;

  for (const [path, data] of snapshot.entries()) {
    if (prefix && path !== prefix && !path.startsWith(`${prefix}/`)) continue;
    if (data.length > MAX_SEARCH_FILE_BYTES || isBinary(data)) {
      skipped++;
      continue;
    }
    scanned++;
    const text = data.toString('utf8');
    if (!text.includes(input.query)) continue;
    text.split('\n').forEach((line, i) => {
      if (!line.includes(input.query)) return;
      total++;
      if (matches.length < MAX_SEARCH_MATCHES) matches.push(`${path}:${i + 1}: ${line.trim().slice(0, MAX_MATCH_LINE_CHARS)}`);
    });
  }

  const where = prefix ? ` below ${prefix}` : '';
  const notSearched = skipped > 0 ? `; ${skipped} binary or large files not searched` : '';
  const header = `${total} matches for "${input.query}" in ${scanned} files${where}${notSearched}`;
  const more = total > matches.length ? [`[Showing the first ${matches.length}; narrow the search with pathPrefix.]`] : [];
  return [header, ...matches, ...more].join('\n');
}
