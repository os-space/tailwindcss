/**
 * A range between to points in in some text
 */
export type Span = [start: number, end: number]

/**
 * The source code for a given node in the AST
 */
export interface Source {
  /**
   * The path to the file that contains the referenced source code
   *
   * If this references the *output* source code, this is `null`.
   */
  file: string | null

  /**
   * The referenced source code
   */
  code: string
}

/**
 * Represents a range in a source file or string and the range in the
 * transformed output.
 *
 * e.g. `src` represents the original source position and `dst` represents the
 * transformed position after reprinting.
 *
 * These numbers are indexes into the source code rather than line/column
 * numbers. We compute line/column numbers lazily only when generating
 * source maps.
 */
export interface Offsets {
  original?: Source
  generated?: Source

  src: Span
  dst: Span | null
}

export function createInputSource(file: string, code: string): Source {
  return {
    file,
    code,
  }
}
