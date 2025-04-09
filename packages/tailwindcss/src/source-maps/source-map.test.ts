import remapping from '@ampproject/remapping'
import dedent from 'dedent'
import MagicString, { Bundle } from 'magic-string'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { SourceMapConsumer, SourceMapGenerator, type RawSourceMap } from 'source-map-js'
import { test } from 'vitest'
import { compile } from '..'
import { DefaultMap } from '../utils/default-map'
import type { DecodedSource, DecodedSourceMap } from './source-map'
const css = dedent

async function run(rawCss: string, candidates: string[] = []) {
  let source = new MagicString(rawCss)

  let bundle = new Bundle()

  bundle.addSource({
    filename: 'source.css',
    content: source,
  })

  let originalMap = bundle.generateMap({
    hires: 'boundary',
    file: 'source.css.map',
    includeContent: true,
  })

  let compiler = await compile(source.toString(), {
    from: 'source.css',
    async loadStylesheet(id, base) {
      return {
        base,
        content: await fs.readFile(
          path.resolve(__dirname, '../..', id === 'tailwindcss' ? 'index.css' : id),
          'utf-8',
        ),
      }
    },
  })

  let css = compiler.build(candidates)
  let decoded = compiler.buildSourceMap()
  let rawMap = toRawSourceMap(decoded)

  let combined = remapping(rawMap, () => null)
  let map = JSON.parse(combined.toString()) as RawSourceMap

  let sources = combined.sources
  let annotations = formattedMappings(map)

  return { css, map, sources, annotations }
}

function toRawSourceMap(map: DecodedSourceMap): string {
  let generator = new SourceMapGenerator()

  let id = 1
  let sourceTable = new DefaultMap<
    DecodedSource | null,
    {
      url: string
      content: string
    }
  >((src) => {
    return {
      url: src?.url ?? `<unknown ${id}>`,
      content: src?.content ?? '<none>',
    }
  })

  for (let mapping of map.mappings) {
    let original = sourceTable.get(mapping.originalSource)

    generator.addMapping({
      generated: { line: mapping.generatedLine, column: mapping.generatedColumn },
      original: { line: mapping.originalLine, column: mapping.originalColumn },
      source: original.url,
      name: mapping.name ?? undefined,
    })

    generator.setSourceContent(original.url, original.content)
  }

  return generator.toString()
}

/**
 * An string annotation that represents a source map
 *
 * It's not meant to be exhaustive just enough to
 * verify that the source map is working and that
 * lines are mapped back to the original source
 *
 * Including when using @apply with multiple classes
 */
function formattedMappings(map: RawSourceMap) {
  const smc = new SourceMapConsumer(map)
  const annotations: Record<
    number,
    {
      original: { start: [number, number]; end: [number, number] }
      generated: { start: [number, number]; end: [number, number] }
      source: string
    }
  > = {}

  smc.eachMapping((mapping) => {
    let annotation = (annotations[mapping.generatedLine] = annotations[mapping.generatedLine] || {
      ...mapping,

      original: {
        start: [mapping.originalLine, mapping.originalColumn],
        end: [mapping.originalLine, mapping.originalColumn],
      },

      generated: {
        start: [mapping.generatedLine, mapping.generatedColumn],
        end: [mapping.generatedLine, mapping.generatedColumn],
      },

      source: mapping.source,
    })

    annotation.generated.end[0] = mapping.generatedLine
    annotation.generated.end[1] = mapping.generatedColumn

    annotation.original.end[0] = mapping.originalLine
    annotation.original.end[1] = mapping.originalColumn
  })

  return Object.values(annotations).map((annotation) => {
    return `${annotation.source}: ${formatRange(annotation.generated)} <- ${formatRange(annotation.original)}`
  })
}

function formatRange(range: { start: [number, number]; end: [number, number] }) {
  if (range.start[0] === range.end[0]) {
    // This range is on the same line
    // and the columns are the same
    if (range.start[1] === range.end[1]) {
      return `${range.start[0]}:${range.start[1]}`
    }

    // This range is on the same line
    // but the columns are different
    return `${range.start[0]}:${range.start[1]}-${range.end[1]}`
  }

  // This range spans multiple lines
  return `${range.start[0]}:${range.start[1]}-${range.end[0]}:${range.end[1]}`
}

// TODO: Test full pipeline through compile(…)
test('source maps trace back to @import location', async ({ expect }) => {
  let { sources, annotations } = await run(css`
    @import 'tailwindcss';

    .foo {
      @apply underline;
    }
  `)

  // All CSS should be mapped back to the original source file
  expect(sources).toEqual([
    //
    'tailwindcss',
    './preflight.css',
    'source.css',
  ])
  expect(sources.length).toBe(3)

  // The output CSS should include annotations linking back to:
  // 1. The class definition `.foo`
  // 2. The `@apply underline` line inside of it
  expect(annotations).toEqual([
    'tailwindcss: 1:1-42 <- 1:1-42',
    'preflight.css: 4:17-108 <- 7:1-13:3',
    'preflight.css: 5:1-20 <- 13:9-14:13',
    'preflight.css: 6:2-101 <- 15:3-32:3',
    'preflight.css: 7:3-12 <- 32:11-33:3',
    'preflight.css: 8:8-10 <- 33:14-15',
    'preflight.css: 13:37-43 <- 42:4-43:3',
    'preflight.css: 14:3-5 <- 43:24-25',
    'preflight.css: 16:6-12 <- 43:74-44:3',
    'preflight.css: 17:19-21 <- 44:26-27',
    'preflight.css: 21:4-10 <- 44:78-45:3',
    'preflight.css: 22:1-14 <- 45:30-43',
    'preflight.css: 23:2-151 <- 46:1-66:3',
    'preflight.css: 24:5-71 <- 66:18-79:13',
    'preflight.css: 25:5-67 <- 79:21-89:3',
    'preflight.css: 26:13-45 <- 89:26-90:19',
    'preflight.css: 28:2-7 <- 90:27-91:1',
    'preflight.css: 29:3-12 <- 97:1-98:8',
    'preflight.css: 30:4-17 <- 99:3-15',
    'preflight.css: 31:3-11 <- 99:22-109:1',
    'preflight.css: 32:4 <- 112:5',
    'preflight.css: 33:1-20 <- 112:5-113:15',
    'preflight.css: 38:10-16 <- 123:4-124:3',
    'preflight.css: 39:13-15 <- 124:24-25',
    'preflight.css: 43:8-37 <- 124:79-125:26',
    'preflight.css: 44:1 <- 125:27',
    'preflight.css: 47:4-24 <- 125:83-126:17',
    'preflight.css: 48:4 <- 127:1',
    'preflight.css: 49:3-24 <- 133:1-134:12',
    'preflight.css: 50:1-148 <- 134:13-150:18',
    'preflight.css: 51:3-67 <- 151:1-165:3',
    'preflight.css: 52:1-80 <- 165:15-174:11',
    'preflight.css: 53:2-18 <- 174:16-181:10',
    'preflight.css: 55:1 <- 182:3',
    'preflight.css: 56:5-20 <- 182:17-183:1',
    'preflight.css: 57:3 <- 189:1',
    'preflight.css: 58:6-13 <- 189:9-190:3',
    'preflight.css: 59:7-18 <- 190:10-21',
    'preflight.css: 60:3-18 <- 191:1-199:6',
    'preflight.css: 61:5-21 <- 200:3-19',
    'preflight.css: 62:2-5 <- 201:1-209:1',
    'preflight.css: 65:16 <- 216:8',
    'preflight.css: 66:2 <- 217:3',
    'preflight.css: 67:5-7 <- 217:10-11',
    'preflight.css: 68:4-10 <- 217:17-218:3',
    'preflight.css: 70:3-5 <- 218:17-18',
    'preflight.css: 71:1-19 <- 218:25-226:7',
    'preflight.css: 72:6-27 <- 227:3-228:3',
    'preflight.css: 73:6-20 <- 228:9-238:1',
    'preflight.css: 78:7 <- 243:24',
    'preflight.css: 79:1-20 <- 244:3-245:3',
    'preflight.css: 81:7-9 <- 245:24-25',
    'preflight.css: 82:4-10 <- 245:33-246:3',
    'preflight.css: 84:5-14 <- 246:26-35',
    'preflight.css: 85:3-19 <- 247:3-18',
    'preflight.css: 86:4 <- 247:26',
    'preflight.css: 87:6-48 <- 248:3-250:3',
    'preflight.css: 88:6-19 <- 250:19-32',
    'preflight.css: 89:5-23 <- 251:3-258:1',
    'preflight.css: 93:1-8 <- 258:48-259:3',
    'preflight.css: 94:1-3 <- 259:14-15',
    'preflight.css: 95:5-66 <- 259:22-266:55',
    'preflight.css: 96:3 <- 267:3',
    'preflight.css: 97:4-18 <- 267:23-274:1',
    'preflight.css: 98:4-38 <- 274:24-276:1',
    'preflight.css: 99:3-23 <- 282:1-283:3',
    'preflight.css: 100:1-12 <- 283:10-291:1',
    'preflight.css: 101:1 <- 291:10',
    'preflight.css: 105:4-24 <- 292:50-293:17',
    'preflight.css: 106:20-25 <- 294:5-10',
    'preflight.css: 107:2 <- 294:11',
    'preflight.css: 108:48 <- 294:62',
    'preflight.css: 109:4-32 <- 293:17-303:9',
    'preflight.css: 110:2 <- 303:10',
    'preflight.css: 111:6-14 <- 303:19-310:1',
    'preflight.css: 112:14-21 <- 310:29-311:3',
    'preflight.css: 114:7-18 <- 311:21-312:1',
    'preflight.css: 115:3 <- 319:1',
    'preflight.css: 117:12-90 <- 319:31-328:25',
    'preflight.css: 118:3-12 <- 329:3-11',
    'preflight.css: 119:3-11 <- 329:23-336:1',
    'preflight.css: 120:22-47 <- 336:40-340:1',
    'preflight.css: 136:16-23 <- 348:40-349:3',
    'preflight.css: 138:6-40 <- 349:16-357:3',
    'preflight.css: 139:7-13 <- 357:13-19',
    'preflight.css: 140:2 <- 358:1',
    'preflight.css: 141:1-309 <- 364:1-5:1',
  ])
})

// TODO: Test candidate generation
// TODO: Test utilities generated by plugins

// IDEA: @theme needs to have source locations preserved for its nodes
//
// Example:
// ```css`
// @theme {
//  --color-primary: #333;
// }
// ````
//
//
// When outputting the CSS:
// ```css
// :root {
//  --color-primary: #333;
//  ^^^^^^^^^^^^^^^
//  (should point to the property name inside `@theme`)
//                   ^^^^
//                  (should point to the value inside `@theme`)
// }
//
// A deletion like `--color-*: initial;` should obviously destroy this
// information since it's no longer present in the output CSS.
//
// Later declarations of the same key take precedence, so the source
// location should point to the last declaration of the key.
//
// This could be in a separate file so we need to make sure that individual
// nodes can be annotated with file metadata.

// test('source locations are tracked during parsing and serializing', async () => {
//   let ast = CSS.parse(`.foo { color: red; }`, true)
//   toCss(ast, true)

//   if (ast[0].kind !== 'rule') throw new Error('Expected a rule')

//   let rule = annotate(ast[0])
//   expect(rule).toMatchInlineSnapshot(`
//     {
//       "node": [
//         "1:1-1:5",
//         "3:1-3:1",
//       ],
//     }
//   `)

//   let decl = annotate(ast[0].nodes[0])
//   expect(decl).toMatchInlineSnapshot(`
//     {
//       "node": [
//         "1:8-1:18",
//         "2:3-2:13",
//       ],
//     }
//   `)
// })

// test('utilities have source maps pointing to the utilities node', async () => {
//   let { sources, annotations } = run(`@tailwind utilities;`, [
//     //
//     'underline',
//   ])

//   // All CSS generated by Tailwind CSS should be annotated with source maps
//   // And always be able to point to the original source file
//   expect(sources).toEqual(['source.css'])
//   expect(sources.length).toBe(1)

//   expect(annotations).toEqual([
//     //
//     '1:1-11 <- 1:1-20',
//     '2:3-34 <- 1:1-20',
//   ])
// })

// test('@apply generates source maps', async () => {
//   let { sources, annotations } = run(`.foo {
//   color: blue;
//   @apply text-[#000] hover:text-[#f00];
//   @apply underline;
//   color: red;
// }`)

//   // All CSS generated by Tailwind CSS should be annotated with source maps
//   // And always be able to point to the original source file
//   expect(sources).toEqual(['source.css'])
//   expect(sources.length).toBe(1)

//   expect(annotations).toEqual([
//     '1:1-5 <- 1:1-5',
//     '2:3-14 <- 2:3-14',
//     '3:3-14 <- 3:3-39',
//     '4:3-10 <- 3:3-39',
//     '5:5-16 <- 3:3-39',
//     '7:3-34 <- 4:3-19',
//     '8:3-13 <- 5:3-13',
//   ])
// })

// test('license comments preserve source locations', async () => {
//   let { sources, annotations } = run(`/*! some comment */`)

//   // All CSS generated by Tailwind CSS should be annotated with source maps
//   // And always be able to point to the original source file
//   expect(sources).toEqual(['source.css'])
//   expect(sources.length).toBe(1)

//   expect(annotations).toEqual(['1:1-19 <- 1:1-19'])
// })

// test('license comments with new lines preserve source locations', async () => {
//   let { sources, annotations, css } = run(`/*! some \n comment */`)

//   // All CSS generated by Tailwind CSS should be annotated with source maps
//   // And always be able to point to the original source file
//   expect(sources).toEqual(['source.css'])
//   expect(sources.length).toBe(1)

//   expect(annotations).toEqual(['1:1 <- 1:1', '2:11 <- 2:11'])
// })
