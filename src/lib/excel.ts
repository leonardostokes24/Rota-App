import * as XLSX from 'xlsx'

/**
 * Read an .xlsx/.xls/.csv file and return:
 *  - rows: 2D array of cells (raw, useful for debugging)
 *  - csv: CSV string (compact, decent for AI input)
 *  - markdown: rendered grid with row/column markers — easier for LLMs to
 *    track names that span columns or rows in messy rotas
 *  - sparseCsv: highly compressed format (row,col,value) for large, sparse files
 */
export async function readSpreadsheet(
  file: File
): Promise<{ rows: string[][]; csv: string; markdown: string; sparseCsv: string }> {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array', cellDates: true })
  const firstSheetName = wb.SheetNames[0]
  if (!firstSheetName) throw new Error('Spreadsheet has no sheets')
  const sheet = wb.Sheets[firstSheetName]

  const rawRows = XLSX.utils.sheet_to_json<string[]>(sheet, {
    header: 1,
    raw: false,
    defval: ''
  }) as string[][]

  const rows = trimEmptyRowsAndColumns(rawRows)
  const csv = rowsToCsv(rows)
  const markdown = renderMarkdownGrid(rows)
  const sparseCsv = toSparseCsv(rows)
  return { rows, csv, markdown, sparseCsv }
}

/** Removes all completely empty rows and columns to minimize token usage. */
function trimEmptyRowsAndColumns(rows: string[][]): string[][] {
  if (rows.length === 0) return rows

  const isEmpty = (v: unknown) => v === undefined || v === null || String(v).trim() === ''

  // 1. Remove empty rows
  let cleanedRows = rows.filter((row) => !row.every(isEmpty))

  if (cleanedRows.length === 0) return []

  // 2. Remove empty columns
  const maxCols = Math.max(...cleanedRows.map((r) => r.length))
  const nonEmptyColIndices = new Set<number>()

  for (const row of cleanedRows) {
    for (let colIndex = 0; colIndex < row.length; colIndex++) {
      if (!isEmpty(row[colIndex])) {
        nonEmptyColIndices.add(colIndex)
      }
    }
  }

  // Sort indices to ensure we keep them in order
  const sortedColIndices = Array.from(nonEmptyColIndices).sort((a, b) => a - b)

  return cleanedRows.map((row) =>
    sortedColIndices.map((colIndex) => String(row[colIndex] ?? '').trim())
  )
}

/** Highly compressed format for large sparse spreadsheets. Format: row,col,value */
function toSparseCsv(rows: string[][]): string {
  const entries: string[] = []
  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < rows[r].length; c++) {
      const val = rows[r][c].trim()
      if (val !== '') {
        // Escape commas in values
        const escapedVal = val.includes(',') ? `"${val.replace(/"/g, '""')}"` : val
        entries.push(`${r},${c},${escapedVal}`)
      }
    }
  }
  return entries.join('\n')
}

function rowsToCsv(rows: string[][]): string {
  return rows
    .map((r) =>
      r
        .map((c) => {
          const v = c.replace(/\r?\n/g, ' ')
          return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
        })
        .join(',')
    )
    .join('\n')
}

function renderMarkdownGrid(rows: string[][]): string {
  if (rows.length === 0) return ''
  const maxCols = Math.max(...rows.map((r) => r.length))
  const lettersFor = (n: number) => {
    let s = ''
    let i = n
    while (i >= 0) {
      s = String.fromCharCode(65 + (i % 26)) + s
      i = Math.floor(i / 26) - 1
    }
    return s
  }
  const header =
    '| row | ' +
    Array.from({ length: maxCols }, (_, i) => lettersFor(i)).join(' | ') +
    ' |'
  const sep = '| --- | ' + Array.from({ length: maxCols }, () => '---').join(' | ') + ' |'
  const body = rows
    .map((r, idx) => {
      const cells = Array.from({ length: maxCols }, (_, i) =>
        (r[i] ?? '').toString().replace(/\|/g, '\\|').replace(/\n/g, ' ')
      )
      return `| ${idx + 1} | ${cells.join(' | ')} |`
    })
    .join('\n')
  return [header, sep, body].join('\n')
}
