import { assert, expect, test } from 'vitest'
import { toCss, type AstNode } from '../ast'
import * as CSS from '../css-parser'
import { createTranslationMap } from './translation-map'

async function analyze(input: string) {
  let ast = CSS.parse(input, { from: 'input.css' })
  let css = toCss(ast, true)
  let translate = createTranslationMap({
    original: input,
    generated: css,
  })

  function format(node: AstNode) {
    let result: Record<string, string> = {}

    for (let [kind, [oStart, oEnd, gStart, gEnd]] of Object.entries(translate(node))) {
      let src = `${oStart.line}:${oStart.column}-${oEnd.line}:${oEnd.column}`

      let dst = '(none)'

      if (gStart && gEnd) {
        dst = `${gStart.line}:${gStart.column}-${gEnd.line}:${gEnd.column}`
      }

      result[kind] = `${dst} <- ${src}`
    }

    return result
  }

  return { ast, css, format }
}

// Parse CSS and make sure source locations are tracked correctly
test('comment, single line', async () => {
  // Works, no changes needed
  let { ast, format } = await analyze(`/*! foo */`)

  assert(ast[0].kind === 'comment')
  expect(format(ast[0])).toMatchInlineSnapshot(`
    {
      "value": "1:1-1:11 <- 1:1-1:11",
    }
  `)
})

test('comment, multi line', async () => {
  // Works, no changes needed
  let { ast, format } = await analyze(`/*! foo \n bar */`)

  assert(ast[0].kind === 'comment')
  expect(format(ast[0])).toMatchInlineSnapshot(`
    {
      "value": "1:1-2:8 <- 1:1-2:8",
    }
  `)
})

test('declaration, normal property, single line', async () => {
  // Works, no changes needed
  let { ast, css, format } = await analyze(`.foo { color: red; }`)

  assert(ast[0].kind === 'rule')
  assert(ast[0].nodes[0].kind === 'declaration')
  expect(format(ast[0].nodes[0])).toMatchInlineSnapshot(`
    {
      "property": "2:3-2:8 <- 1:8-1:13",
      "value": "2:10-2:13 <- 1:14-1:18",
    }
  `)

  expect(css).toMatchInlineSnapshot(`
    ".foo {
      color: red;
    }
    "
  `)
})

test('declaration, normal property, multi line', async () => {
  // Works, no changes needed
  let { ast, css, format } = await analyze(`
      .foo {
        grid-template-areas:
          "a b c"
          "d e f"
          "g h i";
      }
    `)

  assert(ast[0].kind === 'rule')
  assert(ast[0].nodes[0].kind === 'declaration')
  expect(format(ast[0].nodes[0])).toMatchInlineSnapshot(`
    {
      "property": "2:3-2:22 <- 3:9-3:28",
      "value": "2:24-2:47 <- 3:29-6:18",
    }
  `)

  expect(css).toMatchInlineSnapshot(`
    ".foo {
      grid-template-areas: "a b c" "d e f" "g h i";
    }
    "
  `)
})

test('declaration, custom property, single line', async () => {
  // Works, no changes needed
  let { ast, css, format } = await analyze(`.foo { --foo: bar; }`)

  assert(ast[0].kind === 'rule')
  assert(ast[0].nodes[0].kind === 'declaration')
  expect(format(ast[0].nodes[0])).toMatchInlineSnapshot(`
    {
      "property": "2:3-2:8 <- 1:8-1:13",
      "value": "2:10-2:13 <- 1:14-1:18",
    }
  `)
  expect(css).toMatchInlineSnapshot(`
    ".foo {
      --foo: bar;
    }
    "
  `)
})

test('declaration, custom property, multi line', async () => {
  // Works, no changes needed
  let { ast, format } = await analyze(`
    .foo {
      --foo: bar\nbaz;
    }
  `)

  assert(ast[0].kind === 'rule')
  assert(ast[0].nodes[0].kind === 'declaration')
  expect(format(ast[0].nodes[0])).toMatchInlineSnapshot(`
    {
      "property": "2:3-2:8 <- 3:7-3:12",
      "value": "2:10-3:4 <- 3:13-4:4",
    }
  `)
})

test('at rules, bodyless, single line', async () => {
  // Works, no changes needed
  let { ast, css, format } = await analyze(`@layer foo,     bar;`)

  assert(ast[0].kind === 'at-rule')
  expect(format(ast[0])).toMatchInlineSnapshot(`
    {
      "name": "1:1-1:7 <- 1:1-1:7",
      "params": "1:8-1:16 <- 1:7-1:20",
    }
  `)

  expect(css).toMatchInlineSnapshot(`
    "@layer foo, bar;
    "
  `)
})

test('at rules, bodyless, multi line', async () => {
  // Works, no changes needed
  let { ast, format } = await analyze(`
    @layer
      foo,
      bar
    ;
  `)

  assert(ast[0].kind === 'at-rule')
  expect(format(ast[0])).toMatchInlineSnapshot(`
    {
      "name": "1:1-1:7 <- 2:5-2:11",
      "params": "1:8-1:16 <- 2:11-5:5",
    }
  `)
})

test('at rules, body, single line', async () => {
  let { ast, css, format } = await analyze(`@layer foo { color: red; }`)

  assert(ast[0].kind === 'at-rule')
  expect(format(ast[0])).toMatchInlineSnapshot(`
    {
      "body": "1:12-3:2 <- 1:12-1:26",
      "name": "1:1-1:7 <- 1:1-1:7",
      "params": "1:8-1:11 <- 1:7-1:12",
    }
  `)
  expect(css).toMatchInlineSnapshot(`
    "@layer foo {
      color: red;
    }
    "
  `)
})

test('at rules, body, multi line', async () => {
  let { ast, css, format } = await analyze(`
    @layer
      foo
    {
      color: baz;
    }
  `)

  assert(ast[0].kind === 'at-rule')
  expect(format(ast[0])).toMatchInlineSnapshot(`
    {
      "body": "1:12-3:2 <- 4:5-6:5",
      "name": "1:1-1:7 <- 2:5-2:11",
      "params": "1:8-1:11 <- 2:11-4:5",
    }
  `)
  expect(css).toMatchInlineSnapshot(`
    "@layer foo {
      color: baz;
    }
    "
  `)
})

test('style rules, body, single line', async () => {
  let { ast, css, format } = await analyze(`.foo:is(.bar) { color: red; }`)

  assert(ast[0].kind === 'rule')
  expect(format(ast[0])).toMatchInlineSnapshot(`
    {
      "body": "1:15-3:2 <- 1:15-1:29",
      "selector": "1:1-1:14 <- 1:1-1:1",
    }
  `)
  expect(css).toMatchInlineSnapshot(`
    ".foo:is(.bar) {
      color: red;
    }
    "
  `)
})

test('style rules, body, multi line', async () => {
  let { ast, css, format } = await analyze(`
    .foo:is(
      .bar
    ) {
      color: red;
    }
  `)

  assert(ast[0].kind === 'rule')
  expect(format(ast[0])).toMatchInlineSnapshot(`
    {
      "body": "1:17-3:2 <- 4:7-6:5",
      "selector": "1:1-1:16 <- 2:5-2:5",
    }
  `)

  expect(css).toMatchInlineSnapshot(`
    ".foo:is( .bar ) {
      color: red;
    }
    "
  `)
})
