/** Search without accents or case: "cafe" finds "CAFÉ". */
export const plain = (text: string | null | undefined): string =>
  (text ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

/** Every word of the query must appear in the text (any order). */
export function matches(haystack: string, query: string): boolean {
  const words = plain(query).split(/\s+/).filter(Boolean);
  const text = plain(haystack);
  return words.every((word) => text.includes(word));
}
