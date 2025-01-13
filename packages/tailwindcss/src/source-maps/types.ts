export interface DecodedSourceMap {
  file: string | null
  sources: DecodedSource[]
  mappings: DecodedMapping[]
}

export interface DecodedSource {
  url: string | null
  content: string | null
  ignore: boolean
}

export interface DecodedMapping {
  generatedLine: number
  generatedColumn: number

  originalLine: number | null
  originalColumn: number | null

  originalSource: DecodedSource | null

  name: string | null
}
