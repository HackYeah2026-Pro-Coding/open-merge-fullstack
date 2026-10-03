import type { ReviewToolName } from '@escrow/shared';
import { z } from 'zod';

const path = z
  .string()
  .max(500)
  .describe('Path relative to the repository root, e.g. "src/auth/login.ts". Use "" for the root directory.');

/** Input schema of each tool. Both models get the same JSON Schema generated from these. */
export const toolInputs = {
  read_file: z.object({
    path,
    startLine: z.number().int().min(1).optional().describe('First line to return, 1-based. Defaults to 1.'),
    endLine: z.number().int().min(1).optional().describe('Last line to return, inclusive. Defaults to the end of the file.'),
  }),
  list_dir: z.object({ path }),
  search: z.object({
    query: z.string().min(2).max(200).describe('Exact text to find, case-sensitive. Not a regular expression.'),
    pathPrefix: z.string().max(500).optional().describe('Only search below this directory, e.g. "src/auth".'),
  }),
} satisfies Record<ReviewToolName, z.ZodObject>;

export type ToolInput<Name extends ReviewToolName> = z.infer<(typeof toolInputs)[Name]>;

export interface ReviewToolDefinition {
  name: ReviewToolName;
  description: string;
  /** JSON Schema of the input, without the `$schema` key, which neither API needs. */
  inputSchema: Record<string, unknown>;
}

const DESCRIPTIONS: Record<ReviewToolName, string> = {
  read_file:
    'Read a text file of the repository at the reviewed commit, with line numbers. Use it for files the change imports or is called from, and for existing tests.',
  list_dir: 'List the files and folders of one directory of the repository at the reviewed commit.',
  search:
    'Find an exact piece of text in every text file of the repository at the reviewed commit, e.g. a function name to find its callers or tests. Returns path:line matches.',
};

function jsonSchemaOf(schema: z.ZodObject): Record<string, unknown> {
  const { $schema: _ignored, ...rest } = z.toJSONSchema(schema) as Record<string, unknown>;
  return rest;
}

/** The read-only tools offered to every reviewer, in a fixed order so prompts stay cacheable. */
export const REVIEW_TOOLS: ReviewToolDefinition[] = (Object.keys(toolInputs) as ReviewToolName[]).map((name) => ({
  name,
  description: DESCRIPTIONS[name],
  inputSchema: jsonSchemaOf(toolInputs[name]),
}));

export const isReviewTool = (name: string): name is ReviewToolName => Object.hasOwn(toolInputs, name);
