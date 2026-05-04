import * as XLSX from 'xlsx'

/**
 * Read an .xlsx/.xls/.csv file and return:
 *  - rows: 2D array of cells (raw, useful for debugging)
 *  - csv: CSV string (compact, decent for AI input)
 *  - markdown: rendered grid with row/column markers — easier for LLMs to
 *    track names that span columns or rows in messy rotas
 */
export async function readSpreadsheet(
  file: File
): Promise<{ rows: string[][]; csv: string; markdown: string }> {
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

  const rows = trimEmptyEdges(rawRows)
  const csv = rowsToCsv(rows)
  const markdown = renderMarkdownGrid(rows)
  return { rows, csv, markdown }
}

/** Drop trailing/leading fully-empty rows and columns to keep the prompt small. */
function trimEmptyEdges(rows: string[][]): string[][] {
  if (rows.length === 0) return rows
  const isEmpty = (v: unknown) => v === undefined || v === null || String(v).trim() === ''

  // Trim leading & trailing empty rows
  let top = 0
  let bottom = rows.length - 1
  while (top <= bottom && rows[top].every(isEmpty)) top++
  while (bottom >= top && rows[bottom].every(isEmpty)) bottom--
  const sliced = rows.slice(top, bottom + 1).map((r) => r.map((c) => String(c).trim()))

  if (sliced.length === 0) return sliced
  const maxCols = Math.max(...sliced.map((r) => r.length))

  // Find leading & trailing empty columns
  let left = 0
  let right = maxCols - 1
  while (left <= right && sliced.every((r) => isEmpty(r[left]))) left++
  while (right >= left && sliced.every((r) => isEmpty(r[right]))) right--

  return sliced.map((r) => r.slice(left, right + 1))
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
