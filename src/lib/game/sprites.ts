export interface Sprite {
  rows: string[];
  palette: Record<string, string>;
}

/** 스텔라 알 */
export const EGG: Sprite = {
  rows: [
    "...oooo...",
    "..owwwwo..",
    ".owwwwwwo.",
    ".owwswwwo.",
    "owwsssswwo",
    "owwwsswwwo",
    "owwwwwwwwo",
    "owwwwwwwwo",
    ".owwwwwwo.",
    ".owwwwwwo.",
    "..owwwwo..",
    "...oooo...",
  ],
  palette: { o: "#3fbf9f", w: "#f6f1dc", s: "#f4b860" },
};

/** 아기 스텔라펫 (지상) */
export const BABY: Sprite = {
  rows: [
    ".....aa.....",
    ".....a......",
    "...oooooo...",
    "..obbbbbbo..",
    ".obbebbebbo.",
    ".obbbbbbbbo.",
    ".obbbbbbbbo.",
    ".obbbmmbbbo.",
    "..obbbbbbo..",
    "...oooooo...",
    "..oo....oo..",
  ],
  palette: { a: "#f4b860", o: "#1e6f54", b: "#7ee8a2", e: "#0d1b2a", m: "#ef6f6f" },
};

/** 1단계: 궤도 유영체 — 태양전지판 날개 */
const O1: Sprite = {
  rows: [
    "......aa......",
    "......a.......",
    "....oooooo....",
    "...obbbbbbo...",
    "pp.obebbebo.pp",
    "ppfobbbbbbofpp",
    "ppfobbbbbbofpp",
    "pp.obbmmbbo.pp",
    "...obbbbbbo...",
    "....oooooo....",
  ],
  palette: {
    a: "#f4b860",
    o: "#1e6f54",
    b: "#7ee8a2",
    e: "#0d1b2a",
    m: "#ef6f6f",
    p: "#5b8dd9",
    f: "#2c4e82",
  },
};

/** 2단계: 데브리스 이터 — 큰 입으로 잔해를 삼킨다 */
const O2: Sprite = {
  rows: [
    "..a..........a..",
    "..a..........a..",
    ".oooooooooooooo.",
    ".obbbbbbbbbbbbo.",
    ".obeebbbbbbeebo.",
    ".obeebbbbbbeebo.",
    ".obbbbbbbbbbbbo.",
    ".obddddddddddbo.",
    ".obdtdtdtdtdtbo.",
    ".obddddddddddbo.",
    ".obbbbbbbbbbbbo.",
    ".oooooooooooooo.",
    "..ff........ff..",
  ],
  palette: {
    a: "#f4b860",
    o: "#1e6f54",
    b: "#5fd6a0",
    e: "#0d1b2a",
    d: "#26202e",
    t: "#fff8e7",
    f: "#8b93b5",
  },
};

/** 3단계: 클리너 노바 — 견인 촉수와 빛 무리 */
const O3: Sprite = {
  rows: [
    ".......aa.......",
    "......yaay......",
    "....oooooooo....",
    "...obbbbbbbbo...",
    "t..obeebbeebo..t",
    "tt.obbbbbbbbo.tt",
    ".ttobbbbbbbbott.",
    "..tobmmmmmmbot..",
    "...obbbbbbbbo...",
    "....oooooooo....",
    "...y........y...",
  ],
  palette: {
    a: "#f4b860",
    y: "#ffe08a",
    o: "#1d5d8a",
    b: "#7dd3fc",
    e: "#0d1b2a",
    m: "#2b3f68",
    t: "#3fbf9f",
  },
};

/** 4단계: 가디언 오브 오빗 — 황금 왕관 */
const O4: Sprite = {
  rows: [
    "....c..cc..c....",
    "....cccccccc....",
    "....oooooooo....",
    "...obbbbbbbbo...",
    "y..obeebbeebo..y",
    "yy.obbbbbbbbo.yy",
    ".yyobbbbbbbboyy.",
    "..yobmmmmmmboy..",
    "...obbbbbbbbo...",
    "....oooooooo....",
    "...y........y...",
  ],
  palette: {
    c: "#ffd166",
    y: "#ffe08a",
    o: "#5b4a9e",
    b: "#c4b5fd",
    e: "#0d1b2a",
    m: "#3d2f6e",
  },
};

export const ORBIT_SPRITES: Sprite[] = [O1, O2, O3, O4];

/** 발사 로켓 */
export const ROCKET: Sprite = {
  rows: [
    "...r...",
    "..rrr..",
    "..rwr..",
    "..rrr..",
    "..rrr..",
    ".rrrrr.",
    "r.rrr.r",
    "..rrr..",
  ],
  palette: { r: "#e8e6e3", w: "#7dd3fc" },
};

export function drawSprite(
  ctx: CanvasRenderingContext2D,
  sprite: Sprite,
  x: number,
  y: number,
  scale = 1,
) {
  for (let ry = 0; ry < sprite.rows.length; ry++) {
    const row = sprite.rows[ry];
    for (let rx = 0; rx < row.length; rx++) {
      const c = sprite.palette[row[rx]];
      if (!c) continue;
      ctx.fillStyle = c;
      ctx.fillRect(x + rx * scale, y + ry * scale, scale, scale);
    }
  }
}

export const spriteW = (s: Sprite) => Math.max(...s.rows.map((r) => r.length));
export const spriteH = (s: Sprite) => s.rows.length;
