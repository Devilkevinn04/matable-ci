export function parseCsv(text: string): string[][] {
  const input = text.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  let closedQuotedField = false;

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (quoted) {
      if (character === '"') {
        if (input[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          quoted = false;
          closedQuotedField = true;
        }
      } else {
        cell += character;
      }
      continue;
    }

    if (closedQuotedField && character !== ',' && character !== '\n' && character !== '\r') {
      throw new Error('Le fichier CSV contient du texte après la fermeture d’un champ entre guillemets.');
    }
    if (character === '"' && cell.length === 0) {
      quoted = true;
    } else if (character === ',') {
      row.push(cell);
      cell = '';
      closedQuotedField = false;
    } else if (character === '\n' || character === '\r') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      closedQuotedField = false;
      if (character === '\r' && input[index + 1] === '\n') index += 1;
    } else if (character === '"') {
      throw new Error('Le fichier CSV contient un guillemet non échappé.');
    } else {
      cell += character;
    }
  }

  if (quoted) throw new Error('Le fichier CSV contient un champ entre guillemets qui n’est pas terminé.');
  if (cell.length > 0 || row.length > 0 || rows.length === 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

export function stringifyCsv(rows: readonly (readonly (string | number | boolean | null | undefined)[])[]): string {
  return rows.map((row) => row.map((value) => {
    let cell = String(value ?? '');
    if (typeof value === 'string' && /^[\t\r\n ]*[=+\-@]/.test(cell)) cell = `'${cell}`;
    return `"${cell.replace(/"/g, '""')}"`;
  }).join(',')).join('\r\n');
}
