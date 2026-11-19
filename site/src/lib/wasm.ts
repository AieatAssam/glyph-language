// Rough instruction count: walks the code section and counts opcodes, skipping
// immediates by their encoding. Not exact for every SIMD or GC opcode; it is a display figure.

export function countInstructions(b: Uint8Array): number {
  let p = 8;
  let count = 0;
  const u = (): number => {
    let r = 0;
    let s = 1;
    let byte: number;
    do {
      byte = b[p++];
      r += (byte & 0x7f) * s;
      s *= 128;
    } while (byte & 0x80 && p < b.length);
    return r;
  };
  const skip = () => {
    let byte: number;
    do {
      byte = b[p++];
    } while (byte & 0x80 && p < b.length);
  };
  const body = (end: number) => {
    while (p < end) {
      const op = b[p++];
      count++;
      switch (op) {
        case 0x02:
        case 0x03:
        case 0x04: {
          const bt = b[p];
          if (bt === 0x40 || (bt >= 0x6f && bt <= 0x7f)) p++;
          else skip();
          break;
        }
        case 0x0c: case 0x0d: case 0x10: case 0x20: case 0x21: case 0x22:
        case 0x23: case 0x24: case 0x25: case 0x26: case 0xd2:
          u();
          break;
        case 0x0e: {
          const n = u();
          for (let k = 0; k <= n; k++) u();
          break;
        }
        case 0x11: u(); u(); break;
        case 0x1c: p += u(); break;
        case 0x3f: case 0x40: case 0xd0: p++; break;
        case 0x41: case 0x42: skip(); break;
        case 0x43: p += 4; break;
        case 0x44: p += 8; break;
        case 0xfc: {
          const sub = u();
          if (sub === 8 || sub === 12 || sub === 14) { u(); u(); if (sub === 8) p++; }
          else if (sub === 9 || sub === 13 || sub === 15 || sub === 16 || sub === 17) u();
          else if (sub === 10) p += 2;
          else if (sub === 11) p++;
          break;
        }
        case 0xfd: {
          const sub = u();
          if (sub <= 11 || (sub >= 84 && sub <= 93)) { u(); u(); if (sub >= 84) p++; }
          else if (sub === 12 || sub === 13) p += 16;
          else if (sub >= 21 && sub <= 34) p++;
          break;
        }
        default:
          if (op >= 0x28 && op <= 0x3e) { u(); u(); }
      }
    }
  };
  while (p < b.length) {
    const id = b[p++];
    const size = u();
    const end = p + size;
    if (id === 10) {
      const n = u();
      for (let f = 0; f < n; f++) {
        const bsize = u();
        const bend = p + bsize;
        const nloc = u();
        for (let l = 0; l < nloc; l++) {
          u();
          p++;
        }
        body(bend);
        p = bend;
      }
    }
    p = end;
  }
  return count;
}
