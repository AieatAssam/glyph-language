// base64url over UTF-8, for share links. Safe for non-ASCII source text.

export function b64urlEncode(s: string): string {
  let bin = "";
  for (const b of new TextEncoder().encode(s)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function b64urlDecode(s: string): string {
  const std = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(std + "===".slice((std.length + 3) % 4));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}
