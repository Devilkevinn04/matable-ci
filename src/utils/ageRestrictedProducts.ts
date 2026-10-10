import type { Product } from '../types';

const ageRestrictedProductTerms = /\b(?:puffs?|vapes?|vapoteuses?|cigarettes?\s*electroniques?|e-?cigarettes?|e-?liquides?|tabacs?|nicotine)\b/;

export function isAgeRestrictedProduct(product: Pick<Product, 'title' | 'description'>): boolean {
  const searchableText = `${product.title} ${product.description || ''}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  return ageRestrictedProductTerms.test(searchableText);
}

export function isAtLeastAge(
  birthDate: string,
  minimumAge: number,
  today = new Date(),
): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate);
  if (!match || !Number.isInteger(minimumAge) || minimumAge < 0) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return false;

  let age = today.getFullYear() - year;
  const birthdayHasPassed = today.getMonth() > month - 1
    || today.getMonth() === month - 1 && today.getDate() >= day;
  if (!birthdayHasPassed) age -= 1;
  return age >= minimumAge;
}
