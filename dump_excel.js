import * as XLSX from 'xlsx';
import fs from 'fs';

async function dump() {
  const fileName = '05-05-2026 -Rota - (2).xlsx';
  const buf = fs.readFileSync(fileName);
  const wb = XLSX.read(buf, { type: 'buffer', cellDates: true });
  const firstSheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[firstSheetName];
  
  const rawRows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: false,
    defval: ''
  });

  console.log('--- RAW ROWS ---');
  console.log(JSON.stringify(rawRows, null, 2));
}

dump().catch(console.error);
