import { walk, type AstNode } from '../ast'
import { DefaultMap } from '../utils/default-map'
import { createLineTable, type LineTable, type Position } from './line-table'
import { type Offsets, type Source } from './offsets'

/**
 * A "decoded" sourcemap
 *
 * @see https://tc39.es/ecma426/#decoded-source-map
 */
export interface DecodedSourceMap {
  file: string | null
  sources: DecodedSource[]
  mappings: DecodedMapping[]
}

/**
 * A "decoded" source
 *
 * @see https://tc39.es/ecma426/#decoded-source
 */
export interface DecodedSource {
  url: string | null
  content: string | null
  ignore: boolean
}

/**
 * A "decoded" mapping
 *
 * @see https://tc39.es/ecma426/#decoded-mapping
 */
export interface DecodedMapping {
  generatedLine: number
  generatedColumn: number

  originalLine: number
  originalColumn: number

  originalSource: DecodedSource | null

  name: string | null
}

/**
 * Build a source map from the given AST.
 *
 * Our AST is build from flat CSS strings but there are many because we handle
 * `@import`. This means that different nodes can have a different source.
 *
 * Instead of taking an input source map, we take the input CSS string we were
 * originally given, as well as the source text for any imported files, and
 * use that to generate a source map.
 *
 * We then require the use of other tools that can translate one or more
 * "input" source maps into a final output source map. For example,
 * `@ampproject/remapping` can be used to handle this.
 *
 * This also ensures that tools that expect "local" source maps are able to
 * consume the source map we generate.
 *
 * The source map type we generate is a bit different from "raw" source maps
 * that the `source-map-js` package uses. It's a "decoded" source map that is
 * represented by an object graph. It's identical to "decoded" source map from
 * the ECMA-426 spec for source maps.
 *
 * This can easily be converted to a "raw" source map by any tool that needs to.
 **/
export function createSourceMap({ ast }: { ast: AstNode[] }) {
  // Compute line tables for both the original and generated source lazily so we
  // don't have to do it during parsing or printing.
  let lineTables = new DefaultMap<Source, LineTable>((src) => createLineTable(src.code))

  // Convert each mapping to a set of positions
  let map: DecodedSourceMap = {
    file: null,
    sources: [{ url: null, content: null, ignore: false }],
    mappings: [],
  }

  // Get all the indexes from the mappings
  let groups: (Offsets | undefined)[] = []

  walk(ast, (node) => {
    if (node.kind === 'declaration') {
      groups.push(node.offsets.property)
      groups.push(node.offsets.value)
    } else if (node.kind === 'rule') {
      groups.push(node.offsets.selector)
      groups.push(node.offsets.body)
    } else if (node.kind === 'at-rule') {
      groups.push(node.offsets.name)
      groups.push(node.offsets.params)
      groups.push(node.offsets.body)
    } else if (node.kind === 'comment') {
      groups.push(node.offsets.value)
    } else if (node.kind === 'at-root') {
      groups.push(node.offsets.body)
    }
  })

  for (let group of groups) {
    if (!group) continue
    if (!group.dst) continue

    let originalTable = lineTables.get(group.original!)
    let generatedTable = lineTables.get(group.generated!)

    let originalStart = originalTable.find(group.src[0])
    let generatedStart = generatedTable.find(group.dst[0])

    map.mappings.push({
      name: null,
      originalSource: null,

      originalLine: originalStart.line,
      originalColumn: originalStart.column,

      generatedLine: generatedStart.line,
      generatedColumn: generatedStart.column,
    })

    let originalEnd = originalTable.find(group.src[1])
    let generatedEnd = generatedTable.find(group.dst[1])

    map.mappings.push({
      name: null,
      originalSource: null,

      originalLine: originalEnd.line,
      originalColumn: originalEnd.column,

      generatedLine: generatedEnd.line,
      generatedColumn: generatedEnd.column,
    })
  }

  // Sort the mappings by their new position
  map.mappings.sort((a, b) => {
    if (a.generatedLine === b.generatedLine) {
      return a.generatedColumn - b.generatedColumn
    }

    return a.generatedLine - b.generatedLine
  })

  // Remove duplicate mappings
  // TODO: can we do this earlier?
  let last: DecodedMapping | null = null

  map.mappings = map.mappings.filter((mapping) => {
    if (
      last &&
      last.generatedLine === mapping.generatedLine &&
      last.generatedColumn === mapping.generatedColumn
    ) {
      return false
    }

    last = mapping
    return
  })

  return map
}

export function createTranslationMap({
  original,
  generated,
}: {
  original: string
  generated: string
}) {
  // Compute line tables for both the original and generated source lazily so we
  // don't have to do it during parsing or printing.
  let originalTable = createLineTable(original)
  let generatedTable = createLineTable(generated)

  type Translation = [Position, Position, Position | null, Position | null]

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
