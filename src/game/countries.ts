// Country names from two-letter codes, in the browser's own English names (no list to maintain).

let names: Intl.DisplayNames | null = null;

/** "GB" → "United Kingdom"; the code itself if the browser doesn't know it. */
export function countryName(code: string | null | undefined): string {
  if (!code) return "Unknown";
  try {
    names ??= new Intl.DisplayNames(["en-GB"], { type: "region" });
    return names.of(code) ?? code;
  } catch {
    return code;
  }
}
