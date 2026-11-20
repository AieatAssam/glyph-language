// A source file is a path whose last component ends in `.gl`, with at least
// one character before the suffix. The match is case-sensitive. A path that
// ends in `/` has an empty last component and is not a source file.
export function isSourceFile(path: string): boolean {
  const name = path.slice(path.lastIndexOf('/') + 1);
  return name.length > '.gl'.length && name.endsWith('.gl');
}
