// Format teks bersama server dan UI (tanpa dependensi engine).

/** "Simpang Pemuda (Monkasel)" → "Pemuda". */
export function shortName(name: string): string {
  return name.replace(/^Simpang\s+/i, "").replace(/\s*\(.*\)\s*$/, "");
}
