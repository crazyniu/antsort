// 图库：关卡用的像素画（docs/02 第 4 节）。一个字符一颗豆，'.' 是空格，'#' 是石块，字母是下面 COLORS 里的颜色。
// 画都是原创的（CLAUDE.md 硬性约束 1）。现在是原型用的前 10 关；正式图库在 M2 做。

/** 颜色：字母 → 色值。同一关里用到的颜色由生成器编号 */
export const COLORS: Record<string, string> = {
  R: '#e5483f', // 红
  O: '#f58a1f', // 橙
  Y: '#f8cb2e', // 黄
  G: '#4cb04a', // 绿
  B: '#3b82e0', // 蓝
  P: '#f590b4', // 粉
  W: '#f6f2e8', // 白
  K: '#3b3b47', // 深灰
  N: '#96602f', // 棕
  C: '#3fc3d6', // 青
  V: '#9a5bd1', // 紫
  T: '#efd6a2', // 米色
};

export interface Picture {
  /** 中文名（调试、以后的收藏册） */
  name: string;
  rows: string[];
}

function pic(name: string, art: string): Picture {
  const rows = art
    .split('\n')
    .map((r) => r.trim())
    .filter((r) => r.length > 0);
  return { name, rows };
}

export const PICTURES: Record<string, Picture> = {
  popsicle: pic(
    '冰棒',
    `
    ..PPPPPP..
    .PPPPPPPP.
    .PPPPPPPP.
    .WWWWWWWW.
    .WWWWWWWW.
    .NNNNNNNN.
    .NNNNNNNN.
    ..NNNNNN..
    ....TT....
    ....TT....
    `,
  ),
  apple: pic(
    '苹果',
    `
    .....N.GG.
    ....N.GGG.
    ..RRRNRRR.
    .RRRRRRRRR
    .RWWRRRRRR
    .RWRRRRRRR
    .RRRRRRRRR
    .RRRRRRRRR
    ..RRRRRRR.
    ...RR.RR..
    `,
  ),
  egg_fried: pic(
    '荷包蛋',
    `
    ..WWWWWW..
    .WWWWWWWW.
    WWWWWWWWWW
    WWWYYYYWWW
    WWYYYYYYWW
    WWYYOOYYWW
    WWYYYYYYWW
    WWWYYYYWWW
    .WWWWWWWW.
    ..WWWWWW..
    `,
  ),
  melon: pic(
    '西瓜',
    `
    RRRRRRRRRR
    RRKRRRRKRR
    RRRRKRRRRR
    WRRRRRRRRW
    GWRRKRRRWG
    GWWRRRRWWG
    GGWWRRWWGG
    .GGWWWWGG.
    ..GGGGGG..
    ...GGGG...
    `,
  ),
  mushroom: pic(
    '蘑菇',
    `
    ....KKKK....
    ..KKRRRRKK..
    .KRRWWRRRRK.
    .KRRWWRRWWK.
    KRRRRRRRWWRK
    KRWWRRRRRRRK
    KRWWRRRWWRRK
    KKKKKKKKKKKK
    ...KTTTTK...
    ...KTTTTK...
    ..GKTTTTKG..
    GGGGKKKKGGGG
    `,
  ),
  eggshell: pic(
    '蛋',
    `
    ...WWWW...
    ..WWWWWW..
    .WWTWWWWW.
    .WWWWWTWW.
    WWWWWWWWWW
    WWTWWWWWWW
    WWWWWWWTWW
    .WWWWWWWW.
    .WWWTWWWW.
    ..WWWWWW..
    `,
  ),
  chick: pic(
    '小鸡',
    `
    ..........
    ...YYYY...
    ..YYYYYY..
    ..YKYYKY..
    .YYYOOYYY.
    .YYYOOYYY.
    .YYYYYYYY.
    ..YYYYYY..
    ...O..O...
    ..........
    `,
  ),
  gift: pic(
    '礼物盒',
    `
    ..YY..YY..
    .YYYYYYYY.
    RRRRYYRRRR
    RRRRYYRRRR
    YYYYYYYYYY
    YYYYYYYYYY
    RRRRYYRRRR
    RRRRYYRRRR
    RRRRYYRRRR
    RRRRYYRRRR
    `,
  ),
  bear: pic(
    '小熊',
    `
    ..........
    ..........
    .NN....NN.
    .NNNNNNNN.
    .NNNNNNNN.
    .NKNNNNKN.
    .NNTTTTNN.
    .NNTKKTNN.
    .NNTTTTNN.
    ..NNNNNN..
    `,
  ),
  cloud: pic(
    '云',
    `
    ..........
    ...WWWW...
    ..WWWWWW..
    .WWWWWWWWW
    WWWWWWWWWW
    WWWWWWWWWW
    WWWWWWWWWW
    .WWWWWWWW.
    ..........
    ..........
    `,
  ),
  rainbow: pic(
    '彩虹',
    `
    ..........
    ..........
    ...RRRR...
    ..RRRRRR..
    .RRYYYYRR.
    .RYYBBYYR.
    .RYBBBBYR.
    .RYB..BYR.
    ..........
    ..........
    `,
  ),
  chest: pic(
    '宝箱',
    `
    ..........
    .NNNNNNNN.
    NNNNNNNNNN
    NYYYYYYYYN
    NNNNYYNNNN
    NNNNYYNNNN
    NYYYYYYYYN
    NNNNNNNNNN
    NNNNNNNNNN
    .NNNNNNNN.
    `,
  ),
  gems: pic(
    '宝石',
    `
    ..........
    ..........
    .CC....VV.
    .CCC..VVV.
    .CCCVVCCC.
    ..CVVVVC..
    ..VVCCVV..
    .VVCCCCVV.
    .VV.CC.VV.
    ..........
    `,
  ),
  cake: pic(
    '蛋糕',
    `
    .....RR.....
    ....RRRR....
    ..PPPPPPPP..
    .PPPPPPPPPP.
    .PWPPWPPWPP.
    .WWWWWWWWWW.
    .NNNNNNNNNN.
    .NNNNNNNNNN.
    PPPPPPPPPPPP
    PWPPWPPWPPWP
    WWWWWWWWWWWW
    NNNNNNNNNNNN
    `,
  ),
  cat: pic(
    '小猫',
    `
    ............
    ............
    ..NN....NN..
    ..NNN..NNN..
    ..NNNNNNNN..
    .NNNNNNNNNN.
    .NKKNNNNKKN.
    .NKKNNNNKKN.
    .NNNWPPWNNN.
    .NNWWWWWWNN.
    .NNNWWWWNNN.
    ..NNNNNNNN..
    `,
  ),
};
