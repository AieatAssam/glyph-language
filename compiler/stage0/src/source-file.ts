// Source-file rule (RFC 0011): a path names a Glyph source file when the part after its last "/"
// ends in ".gl" and has at least one character before the ".gl". The match is case-sensitive.
// A path ending in "/" has an empty last part, so it is not a source file. No file is read here.

const SUFFIX = '.gl';

export function isSourceFile(path: string): boolean {
  const name = path.slice(path.lastIndexOf('/') + 1);
  return name.length > SUFFIX.length && name.endsWith(SUFFIX);
}
