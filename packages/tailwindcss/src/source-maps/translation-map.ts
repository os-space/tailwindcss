import type { AstNode } from '../ast'
import { type Position, createLineTable } from './line-table'

export type Translation = [Position, Position, Position | null, Position | null]

/**
 * The translation map is a special structure that lets us analyze individual
 * nodes in the AST and determine how various pieces of them map back to the
 * original source.
 *
 * It's used for testing and is not directly used by the source map generation.
 */
export function createTranslationMap({
  original,
  generated,
}: {
  original: string
  generated: string
}) {
  let originalTable = createLineTable(original)
  let generatedTable = createLineTable(generated)

  return (node: AstNode) => {
    let translations: Record<string, Translation> = {}

    for (let [name, offsets] of Object.entries(node.offsets)) {
      translations[name] = [
        originalTable.find(offsets.src[0]),
        originalTable.find(offsets.src[1]),

        offsets.dst ? generatedTable.find(offsets.dst[0]) : null,
        offsets.dst ? generatedTable.find(offsets.dst[1]) : null,
      ]
    }

    return translations
  }
}
