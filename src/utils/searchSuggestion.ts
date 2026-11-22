import { toSearchWords } from './directorySearch';

const MIN_WORD_LENGTH = 4;

/** Une lettre ajoutée, oubliée, remplacée, ou deux lettres voisines inversées. */
function isOneEditAway(left: string, right: string): boolean {
  if (Math.abs(left.length - right.length) > 1 || left === right) return false;
  let start = 0;
  while (start < left.length && left[start] === right[start]) start += 1;
  let leftEnd = left.length;
  let rightEnd = right.length;
  while (leftEnd > start && rightEnd > start && left[leftEnd - 1] === right[rightEnd - 1]) {
    leftEnd -= 1;
    rightEnd -= 1;
  }
  const leftMiddle = left.slice(start, leftEnd);
  const rightMiddle = right.slice(start, rightEnd);
  return leftMiddle.length <= 1 && rightMiddle.length <= 1
    || leftMiddle.length === 2 && rightMiddle.length === 2 && leftMiddle === `${rightMiddle[1]}${rightMiddle[0]}`;
}

/** Corrige une recherche sans résultat avec les mots du catalogue. Renvoie null si rien n’est assez proche. */
export function suggestSearch(query: string, catalogue: readonly string[]): string | null {
  const known = new Set(catalogue.flatMap(toSearchWords).filter((word) => word.length >= MIN_WORD_LENGTH));
  let corrected = false;
  const words = toSearchWords(query).map((word) => {
    if (word.length < MIN_WORD_LENGTH || known.has(word)) return word;
    const match = [...known].find((candidate) => isOneEditAway(word, candidate));
    if (match) corrected = true;
    return match || word;
  });
  return corrected ? words.join(' ') : null;
}
