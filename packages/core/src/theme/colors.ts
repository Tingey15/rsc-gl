import { color as d3color, hsl } from 'd3-color';
import {
  interpolateViridis,
  interpolateMagma,
  interpolateBlues,
  interpolateGreens,
  interpolateRdBu,
  interpolatePuOr,
  interpolateRdYlBu,
  interpolateInferno,
  interpolateCividis,
} from 'd3-scale-chromatic';

export type RGBA = [number, number, number, number];
export type ColorScheme = 'light' | 'dark';

/* ================================================================ legacy colour tokens
 *
 * Exact colour token values of the legacy library, generated from its themes package. Each family packs
 * `level:hex` pairs (`gray: '50:ffffff 75:fdfdfd …'` is `gray-50`, `gray-75`, …); a part without a level is the
 * bare family token (`static-blue`). The dark tables only list the values that differ from light.
 *
 * LEGACY_* are the default token set (`gray-800`, `blue-500`, `static-blue-500`, `categorical-100`, …).
 * S2_* are the newer token set, reached with the `s2-` prefix (`s2-gray-800`) and used by the `s2Categorical*`
 * palettes. Values are lowercase `#rrggbb`; the legacy library spells some as `rgb(…)`, which is the same colour.
 */

type Packed = Record<string, string>;

const LEGACY_LIGHT: Packed = {
  gray: '50:ffffff 75:fdfdfd 100:f8f8f8 200:e6e6e6 300:d5d5d5 400:b1b1b1 500:909090 600:6d6d6d 700:464646 800:222222 900:000000',
  blue: '100:e0f2ff 200:cae8ff 300:b5deff 400:96cefd 500:78bbfa 600:59a7f6 700:3892f3 800:147af3 900:0265dc 1000:0054b6 1100:004491 1200:003571 1300:002754',
  green: '100:cef8e0 200:adf4ce 300:89ecbc 400:67dea8 500:49cc93 600:2fb880 700:15a46e 800:008f5d 900:007a4d 1000:00653e 1100:005132 1200:053f27 1300:0a2e1d',
  orange: '100:ffeccc 200:ffdfad 300:fdd291 400:ffbb63 500:ffa037 600:f68511 700:e46f00 800:cb5d00 900:b14c00 1000:953d00 1100:7a2f00 1200:612300 1300:491901',
  red: '100:ffebe7 200:ffddd6 300:ffcdc3 400:ffb7a9 500:ff9b88 600:ff7c65 700:f75c46 800:ea3829 900:d31510 1000:b40000 1100:930000 1200:740000 1300:590000',
  celery: '100:cdfcbf 200:aef69d 300:96ee85 400:72e06a 500:4ecf50 600:27bb36 700:07a721 800:009112 900:007c0f 1000:00670f 1100:00530d 1200:00400a 1300:003007',
  chartreuse: '100:dbfc6e 200:cbf443 300:bce92a 400:aad816 500:98c50a 600:87b103 700:769c00 800:678800 900:577400 1000:486000 1100:3a4d00 1200:2c3b00 1300:212c00',
  cyan: '100:c5f8ff 200:a4f0ff 300:88e7fa 400:60d8f3 500:33c5e8 600:12b0da 700:019cc8 800:0086b4 900:00719f 1000:005d89 1100:004a73 1200:00395d 1300:002a46',
  fuchsia: '100:ffe9fc 200:ffdafa 300:fec7f8 400:fbaef6 500:f592f3 600:ed74ed 700:e055e2 800:cd3ace 900:b622b7 1000:9d039e 1100:800081 1200:640664 1300:470e46',
  indigo: '100:edeeff 200:e0e2ff 300:d3d5ff 400:c1c4ff 500:acafff 600:9599ff 700:7e84fc 800:686df4 900:5258e4 1000:4046ca 1100:3236a8 1200:262986 1300:1b1e64',
  magenta: '100:ffeaf1 200:ffdce8 300:ffcadd 400:ffb2ce 500:ff95bd 600:fa77aa 700:ef5a98 800:de3d82 900:c82269 1000:ad0955 1100:8e0045 1200:700037 1300:54032a',
  purple: '100:f6ebff 200:eeddff 300:e6d0ff 400:dbbbfe 500:cca4fd 600:bd8bfc 700:ae72f9 800:9d57f4 900:893de7 1000:7326d3 1100:5d13b7 1200:470c94 1300:33106a',
  seafoam: '100:cef7f3 200:aaf1ea 300:8ce9e2 400:65dad2 500:3fc9c1 600:0fb5ae 700:00a19a 800:008c87 900:007772 1000:00635f 1100:0c4f4c 1200:123c3a 1300:122c2b',
  yellow: '100:fbf198 200:f8e750 300:f8d904 400:e8c600 500:d7b300 600:c49f00 700:b08c00 800:9b7800 900:856600 1000:705300 1100:5b4300 1200:483300 1300:362500',
  'static-white': 'ffffff',
  'static-black': '000000',
  'static-blue': '1473e6 100:edf8ff 200:d6eeff 300:c1e4ff 400:a1d4fd 500:82c1fb 600:62adf7 700:4297f4 800:1b7ff5 900:0469e3 1000:0057be 1100:004899 1200:003978 1300:002b5c 1400:002147',
  'static-gray': '50:fefefe 75:fefefe 100:fefefe 200:ebebeb 300:d9d9d9 400:b3b3b3 500:929292 600:6e6e6e 700:474747 800:222222 900:000000',
  'static-red': '100:fff2f0 200:ffe6e1 300:ffd6ce 400:ffbfb2 500:ffa493 600:ff856f 700:fa644e 800:ed4030 900:d91c15 1000:bb0202 1100:9a0000 1200:7c0000 1300:610000 1400:4d0000',
  'static-orange': '100:fff5e3 200:ffe9c5 300:fedaa2 400:ffc372 500:ffa844 600:fa8b1a 700:e97500 800:d16100 900:b65000 1000:9b4000 1100:803200 1200:672600 1300:501c00 1400:3e1501',
  'static-yellow': '100:fdf7c4 200:faed7b 300:fae017 400:eecd00 500:ddb900 600:c9a400 700:b59000 800:a07d00 900:8a6a00 1000:745700 1100:604600 1200:4d3600 1300:3c2900 1400:2f1e00',
  'static-chartreuse': '100:ebffaa 200:d3f958 300:c3ef36 400:b0de1b 500:9dcb0d 600:8bb604 700:7aa200 800:6a8d00 900:5a7800 1000:4b6400 1100:3d5100 1200:304000 1300:243100 1400:1c2500',
  'static-celery': '100:e2fdda 200:c0fab0 300:a4f392 400:7ee572 500:57d456 600:30c13d 700:0fac26 800:009614 900:00800f 1000:006b0f 1100:00570d 1200:00450b 1300:003508 1400:002806',
  'static-green': '100:e4fbec 200:c3f7da 300:9cf0c6 400:71e3ae 500:50d199 600:36bd85 700:1da973 800:009461 900:007e50 1000:006941 1100:005635 1200:044329 1300:093320 1400:0a2618',
  'static-seafoam': '100:e4faf7 200:bff5ef 300:9deee7 400:72dfd8 500:4bcec7 600:20bbb4 700:00a6a0 800:00918b 900:007c76 1000:006763 1100:0a5350 1200:12413f 1300:123130 1400:102524',
  'static-cyan': '100:ddfbff 200:b7f5ff 300:96ecfc 400:6bddf5 500:41cbec 600:1ab6df 700:04a1cd 800:008bb9 900:0076a4 1000:00618e 1100:004e78 1200:003d62 1300:002f4d 1400:00243b',
  'static-indigo': '100:f5f5fe 200:e8e9ff 300:dbddff 400:c8caff 500:b2b5ff 600:9b9fff 700:8489fd 800:6d73f6 900:575de8 1000:444ad0 1100:353ab0 1200:282d8e 1300:1e226e 1400:171a55',
  'static-pruple': '100:fbf3ff 200:f3e6ff 300:ebd8ff 400:dfc2fe 500:d1abfd 600:c292fc 700:b279fa 800:a15df6 900:8e43ea 1000:782bd8 1100:6217be 1200:4d0d9d 1300:390f78 1400:2a1058',
  'static-fuchsia': '100:fff2fd 200:ffe3fb 300:ffd0f9 400:fcb8f7 500:f79bf4 600:f07bef 700:e45de6 800:d33fd4 900:bc27bb 1000:a30aa3 1100:870088 1200:6b036b 1300:500d4f 1400:3c0e3a',
  'static-magenta': '100:fff3f7 200:ffe5ee 300:ffd3e3 400:ffbcd4 500:ff9fc2 600:fd7faf 700:f2629d 800:e24487 900:cd286f 1000:b30f59 1100:950048 1200:77003a 1300:5d012e 1400:470523',
  'divergent-orange-yellow-seafoam': '100:580000 200:79260b 300:9c4511 400:bd651a 500:dd8629 600:f5ad52 700:fed693 800:ffffe0 900:bbe4d1 1000:76c7be 1100:3ea8a6 1200:208288 1300:076769 1400:00494b 1500:002c2d',
  'divergent-red-yellow-blue': '100:49021e 200:741433 300:a32948 400:c45257 500:e27a65 600:efa885 700:f9d4af 800:ffffe1 900:bde2d0 1000:8bc0c4 1100:5a9fb8 1200:3c7ba6 1300:205994 1400:183970 1500:111b4c',
  'divergent-red-blue': '100:49021e 200:721532 300:9e2b46 400:ca435c 500:de6f86 600:ec9bb0 700:f7c4d9 800:faf0ff 900:c7d1f1 1000:93b3dd 1100:6095c9 1200:3376b1 1300:29538f 1400:18386f 1500:0c1b4b',
  'sequential-viridis': '100:fde725 200:d2e21b 300:a5db36 400:7ad151 500:54c568 600:35b779 700:22a884 800:1f988b 900:23888e 1000:2a788e 1100:31688e 1200:39568c 1300:414487 1400:472f7d 1500:481a6c 1600:440154',
  'sequential-magma': '100:fcfdbf 200:fddea0 300:febf84 400:fe9f6d 500:fa7f5e 600:f1605d 700:de4968 800:c43c75 900:a8327d 1000:8c2981 1100:721f81 1200:57157e 1300:3b0f70 1400:20114b 1500:0b0924 1600:000004',
  'sequential-rose': '100:fff4de 200:ffddd8 300:ffc6d2 400:fcafcb 500:f898c4 600:f380bc 700:8967b4 800:e64bac 900:d03ea0 1000:b93495 1100:a12a8b 1200:892282 1300:701c7a 1400:551672 1500:37126c 1600:001066',
  'sequential-cerulean': '100:eafff1 200:c9f1e4 300:a7e3d7 400:71d5ca 500:6cc5c0 600:58b4b9 700:44a2b1 800:3091aa 900:2880a0 1000:246e96 1100:215d8b 1200:1d4c81 1300:1c3b77 1400:1b296d 1500:1a1662 1600:180055',
  'sequential-forest': '100:ffffe0 200:e2f5bd 300:c5ea99 400:a6df73 500:8fd16c 600:79c365 700:62b55e 800:4ca658 900:3b9752 1000:31884f 1100:28794c 1200:1e6a48 1300:155b45 1400:0e4d41 1500:073f3e 1600:00313a',
  categorical: '100:0fb5ae 200:4046ca 300:f68511 400:de3d82 500:7e84fa 600:72e06a 700:147af3 800:7326d3 900:e8c600 1000:cb5d00 1100:008f5d 1200:bce931 1300:5aa9fa 1400:c038cc 1500:f56bb7 1600:ffe22e',
};
const LEGACY_DARK_DIFF: Packed = {
  gray: '50:000000 75:0e0e0e 100:1d1d1d 200:303030 300:4b4b4b 400:6a6a6a 500:8d8d8d 600:b0b0b0 700:d0d0d0 800:ebebeb 900:ffffff',
  blue: '100:002651 200:00326a 300:004087 400:004ea6 500:005cc8 600:066ce7 700:1d80f5 800:4096f3 900:5eaaf7 1000:7cbdfa 1100:98cefd 1200:b3defe 1300:ceeaff',
  green: '100:0a2c1c 200:073b24 300:004c2e 400:005d39 500:006f45 600:008252 700:009562 800:1ca872 900:34bb84 1000:4bcd95 1100:67dea8 1200:89ecbc 1300:b1f4d1',
  orange: '100:481801 200:5c2000 300:732b00 400:8a3700 500:a24400 600:ba5200 700:d26200 800:e87400 900:f98917 1000:ffa23b 1100:ffbc66 1200:fdd291 1300:ffe2b5',
  red: '100:570000 200:6e0000 300:8a0000 400:a70000 500:c40706 600:dd2118 700:ee4331 800:f9634c 900:ff816b 1000:ff9e8c 1100:ffb7a9 1200:ffcdc3 1300:ffdfd9',
  celery: '100:002f07 200:003d09 300:004d0c 400:005f0f 500:00710f 600:00840f 700:009714 800:0dab25 900:2dbf3a 1000:50d052 1100:73e06b 1200:93ed83 1300:b4f7a2',
  chartreuse: '100:202b00 200:2a3800 300:364800 400:425800 500:4f6900 600:5d7b00 700:6b8e00 800:7aa100 900:8ab403 1000:9ac60b 1100:aad816 1200:bbe829 1300:cdf648',
  cyan: '100:002944 200:003658 300:00456c 400:005680 500:006793 600:0079a7 700:008cba 800:04a0cd 900:17b4dd 1000:39c7ea 1100:60d8f3 1200:86e6fa 1300:aaf2ff',
  fuchsia: '100:460e44 200:5d095c 300:780078 400:920093 500:a913aa 600:bf2bbf 700:d341d5 800:e45be5 900:ef78ee 1000:f695f3 1100:fbaff6 1200:fec7f8 1300:ffdcfa',
  indigo: '100:1a1d61 200:23277d 300:2e329e 400:3a3fbd 500:494ed8 600:5a60eb 700:6e73f6 800:8488fd 900:999dff 1000:aeb1ff 1100:c2c4ff 1200:d4d5ff 1300:e3e4ff',
  magenta: '100:530329 200:6a0034 300:850041 400:a1004e 500:ba165d 600:d12b72 700:e34589 800:f1619c 900:fc7cad 1000:ff98bf 1100:ffb3cf 1200:ffcadd 1300:ffdde9',
  purple: '100:321068 200:430d8c 300:5610ad 400:6a1dc8 500:7e31de 600:9146ec 700:a25ef6 800:b277fa 900:c08ffc 1000:cea6fd 1100:dbbcfe 1200:e6cfff 1300:f0e0ff',
  seafoam: '100:122b2a 200:133937 300:104946 400:035b58 500:006c68 600:007f79 700:00928c 800:00a59f 900:1ab9b2 1000:42cac3 1100:66dad3 1200:8be8e1 1300:b3f2ed',
  yellow: '100:352400 200:442f00 300:563e00 400:674d00 500:7a5c00 600:8d6c00 700:a17e00 800:b49000 900:c7a200 1000:d8b500 1100:e9c700 1200:f7d804 1300:f9e961',
  categorical: '1700:12b0da',
};
const S2_LIGHT: Packed = {
  gray: '25:ffffff 50:f8f8f8 75:f3f3f3 100:e9e9e9 200:e1e1e1 300:dadada 400:c6c6c6 500:8f8f8f 600:717171 700:505050 800:292929 900:131313 1000:000000',
  silver: '100:f7f7f7 200:efefef 300:dfdfdf 400:cccccc 500:b7b7b7 600:a0a0a0 700:8f8f8f 800:808080 900:727272 1000:606060 1100:515151 1200:424242 1300:343434 1400:272727 1500:1c1c1c 1600:0c0c0c',
  cinnamon: '100:fdf7f3 200:f9ece5 300:f4dacb 400:edc4ac 500:e5aa88 600:d4916c 700:c67e58 800:b86d46 900:aa5e38 1000:934d2b 1100:803e20 1200:6e3015 1300:5c230b 1400:481906 1500:341204 1600:180802',
  red: '100:fff6f5 200:ffebe8 300:ffd6d1 400:ffbcb4 500:ff9d91 600:ff7665 700:ff513d 800:f03823 900:d73220 1000:b72818 1100:9c2113 1200:811b0e 1300:68150a 1400:501006 1500:3b0b04 1600:1d0502',
  orange: '100:fff6e7 200:ffeccf 300:ffda9e 400:ffc15e 500:ffa213 600:fc7d00 700:e86a00 800:d45b00 900:c24e00 1000:a73e00 1100:903300 1200:762900 1300:5f2000 1400:491800 1500:341200 1600:190800',
  yellow: '100:fff8cc 200:fff197 300:ffde2c 400:f5c700 500:e6af00 600:d29500 700:c18300 800:af7400 900:9e6600 1000:865500 1100:724800 1200:5d3b00 1300:4b2f00 1400:382300 1500:281900 1600:120b00',
  brown: '100:fcf7f2 200:f7eee1 300:efddc3 400:e5c89d 500:d6b17b 600:be9b68 700:ab8a5a 800:9a7b4d 900:8b6d42 1000:775b32 1100:674c23 1200:583d15 1300:463111 1400:34250d 1500:261a09 1600:100c04',
  chartreuse: '100:f6fbde 200:eaf6ad 300:d0ec46 400:b6db00 500:a3c400 600:8fac00 700:809900 800:728900 900:667a00 1000:566700 1100:495700 1200:3c4700 1300:2f3900 1400:232b00 1500:191e00 1600:0b0e00',
  celery: '100:ebffdc 200:c5ff9c 300:9df75c 400:81e43a 500:6ece2a 600:5db41f 700:52a119 800:489014 900:408111 1000:346d0c 1100:2c5c09 1200:234b06 1300:1b3c03 1400:132e00 1500:0c2100 1600:040f00',
  green: '100:edfcf1 200:d7f7e1 300:adeec5 400:6be3a2 500:2bd17d 600:12b867 700:0ba45d 800:079355 900:05834e 1000:036e45 1100:025d3c 1200:014c34 1300:003d2c 1400:002e22 1500:002119 1600:000f0c',
  seafoam: '100:ebfbf6 200:d3f6ea 300:a9edd8 400:5ce1c2 500:10cfa9 600:0db595 700:0ba286 800:099078 900:07816d 1000:056c5c 1100:035c50 1200:014b43 1300:003c36 1400:002e28 1500:00211d 1600:000f0e',
  turquoise: '100:eefbfb 200:d1f5f5 300:a9eced 400:6fdde4 500:27cad8 600:0fb1c0 700:0c9eab 800:0a8d99 900:087e89 1000:056b74 1100:035a62 1200:014a51 1300:003b41 1400:002c31 1500:002023 1600:000f11',
  cyan: '100:eefafe 200:d9f4fd 300:b7e7fc 400:8ad5ff 500:5cc0ff 600:30a7fe 700:1d95e7 800:1286cd 900:0b78b3 1000:046691 1100:005779 1200:004762 1300:00394e 1400:002b3b 1500:001f2b 1600:000e14',
  blue: '100:f5f9ff 200:e5f0fe 300:cbe2fe 400:accffd 500:8eb9fc 600:729efd 700:5d89ff 800:4b75ff 900:3b63fb 1000:274dea 1100:1d3ecf 1200:1532ad 1300:10288c 1400:0c1f69 1500:0e1843 1600:070b1e',
  indigo: '100:f7f8ff 200:ebeeff 300:d8deff 400:c0c9ff 500:a7b2ff 600:9197fe 700:8480fe 800:7a6afd 900:7155fa 1000:6338ee 1100:5424db 1200:4513bf 1300:3706a0 1400:2a0081 1500:1f0062 1600:110036',
  purple: '100:fbf7fe 200:f4ebfc 300:ebdaf9 400:ddc1f6 500:d0a7f3 600:bf8aee 700:b272eb 800:a65ce7 900:9a47e2 1000:8628d9 1100:730dcc 1200:5d00b1 1300:4b0090 1400:3b006f 1500:2c0054 1600:17002d',
  fuchsia: '100:fef6ff 200:fde9ff 300:fad3ff 400:f7b5ff 500:f393ff 600:ec69ff 700:df4df5 800:c844dc 900:b539c8 1000:9c28af 1100:871b9a 1200:710f83 1300:5c046d 1400:480058 1500:360042 1600:1d0023',
  pink: '100:fff6fc 200:ffe8f7 300:ffd3f0 400:ffb5e6 500:ff94db 600:ff67cc 700:f24cb8 800:e434a3 900:ce2a92 1000:b01f7b 1100:981668 1200:800c55 1300:690344 1400:530035 1500:3e0027 1600:210015',
  magenta: '100:fff5f8 200:ffe8f0 300:ffd5e3 400:ffb9d0 500:ff98bb 600:ff709f 700:ff4885 800:f02d6e 900:d92361 1000:ba1650 1100:a3053e 1200:880033 1300:6f0028 1400:56001e 1500:400016 1600:23000c',
  categorical: '100:5424db 200:d92361 300:e86a00 400:5d89ff 500:9a47e2 600:f24cb8 700:0ba286 800:9c28af 900:036e45 1000:52a119 1100:ff513d 1200:046691 1300:424242 1400:056b74 1500:c67e58 1600:865500 1700:274dea 1800:056c5c 1900:ff94db 2000:811b0e',
};
const S2_DARK_DIFF: Packed = {
  gray: '25:111111 50:1b1b1b 75:222222 100:2c2c2c 200:323232 300:393939 400:444444 500:6d6d6d 600:8a8a8a 700:afafaf 800:dbdbdb 900:f2f2f2 1000:ffffff',
  silver: '100:1a1a1a 200:212121 300:2c2c2c 400:3b3b3b 500:4c4c4c 600:5c5c5c 700:6c6c6c 800:767676 900:898989 1000:989898 1100:a9a9a9 1200:bebebe 1300:d3d3d3 1400:e5e5e5 1500:f4f4f4 1600:ffffff',
  cinnamon: '100:301104 200:3b1505 300:4f1c07 400:64290f 500:7a391c 600:8f4a28 700:a35834 800:b0623b 900:c07750 1000:ce8863 1100:dc9a76 1200:e8b395 1300:efcbb7 1400:f6e1d6 1500:fcf4ef 1600:ffffff',
  red: '100:360a03 200:440d05 300:571107 400:73180b 500:931f11 600:b12617 700:cd2e1d 800:df3422 900:fc432e 1000:ff6756 1100:ff8678 1200:ffa79d 1300:ffc4bd 1400:ffdedb 1500:fff2f0 1600:ffffff',
  orange: '100:311000 200:3d1500 300:501b00 400:6a2400 500:872f00 600:a23b00 700:b94900 800:c75200 900:e06400 1000:f37500 1100:ff8900 1200:ffad2d 1300:ffc974 1400:ffe1b2 1500:fff3e1 1600:ffffff',
  yellow: '100:251700 200:2f1d00 300:3d2700 400:533400 500:6b4300 600:825200 700:976100 800:a46a00 900:ba7c00 1000:cb8d00 1100:da9f00 1200:ebb700 1300:f9ce00 1400:ffe656 1500:fff6c3 1600:ffffff',
  brown: '100:231808 200:2c1f0b 300:3a280e 400:4e3713 500:62471e 600:73582f 700:84683d 800:8f7245 900:a38454 1000:b59362 1100:c7a370 1200:deb982 1300:e8cfa9 1400:f2e3ce 1500:faf4ec 1600:ffffff',
  chartreuse: '100:171c00 200:1e2400 300:272f00 400:353f00 500:445200 600:536400 700:617400 800:6a7f00 900:7a9300 1000:88a400 1100:97b500 1200:a9cb00 1300:bbe100 1400:dbf075 1500:f2f9ce 1600:ffffff',
  celery: '100:0b1f00 200:0f2600 300:153301 400:1f4304 500:295608 600:32690b 700:3c7a0f 800:428612 900:4e9a17 1000:58ac1c 1100:64be23 1200:74d52e 1300:88ea41 1400:aafb70 1500:deffc6 1600:ffffff',
  green: '100:001e17 200:00261d 300:003326 400:004430 500:02573a 600:036a43 700:047c4b 800:068850 900:099d59 1000:0eaf62 1100:18c16e 1200:39d786 1300:7ee7ac 1400:bdf1d0 1500:e5faec 1600:ffffff',
  seafoam: '100:001e1b 200:002723 300:00322c 400:00433b 500:02564b 600:046959 700:067a67 800:088670 900:0a9a80 1000:0cad8e 1100:0ebe9c 1200:1dd6b0 1300:7ae5cb 1400:baf1de 1500:e5f9f3 1600:ffffff',
  turquoise: '100:001e21 200:002529 300:003136 400:004248 500:03545c 600:056770 700:077883 800:09838e 900:0b97a4 1000:0da8b6 1100:10baca 1200:40d0dc 1300:80e1e7 1400:b7f0f0 1500:e4f9f9 1600:ffffff',
  cyan: '100:001d27 200:002431 300:003041 400:004058 500:005271 600:03638c 700:0873a8 800:0d7dba 900:188edc 1000:269ff4 1100:3fb1ff 1200:6bc7ff 1300:98dbff 1400:c3ecfc 1500:e6f8fd 1600:ffffff',
  blue: '100:0e173f 200:0f1c52 300:0c2175 400:122d9a 500:1a3ac3 600:2549e5 700:345bf8 800:4069fd 900:5681ff 1000:6995fe 1100:7ca9fc 1200:98c0fc 1300:b5d5fd 1400:d5e7fe 1500:eef5ff 1600:ffffff',
  indigo: '100:1e005d 200:23006e 300:2f008c 400:3e0cae 500:4f1ed1 600:5f34eb 700:6d4bf8 800:745bfc 900:8077fe 1000:8b8dfe 1100:99a1ff 1200:b0baff 1300:c7d0ff 1400:dfe4ff 1500:f3f4ff 1600:ffffff',
  purple: '100:29004f 200:320060 300:40007a 400:53009f 500:6b06c3 600:8222d7 700:943ee0 800:9d4ee4 900:ad69e9 1000:ba7fed 1100:c595f0 1200:d4b0f4 1300:e1c9f7 1400:eee0fa 1500:f8f3fd 1600:ffffff',
  fuchsia: '100:32003d 200:3d004a 300:4f005f 400:660978 500:7f1792 600:9726aa 700:ad33c0 800:ba3cce 900:d549eb 1000:e85bfd 1100:f07aff 1200:f59fff 1300:f8bfff 1400:fbdbff 1500:fdf1ff 1600:ffffff',
  pink: '100:3a0025 200:47002c 300:5a0039 400:73074b 500:8f1261 600:ab1d77 700:c4278a 800:d52d97 900:ec43af 1000:fb5ac4 1100:ff7ad2 1200:ff9fdf 1300:ffbfea 1400:ffdbf3 1500:fff1fa 1600:ffffff',
  magenta: '100:3b0016 200:4a001b 300:5d0022 400:7b002d 500:98073c 600:b5134c 700:cf1f5c 800:e02665 900:ff3377 1000:ff6095 1100:ff80ab 1200:ffa3c2 1300:ffc1d6 1400:ffdce8 1500:fff1f6 1600:ffffff',
  categorical: '100:99a1ff 200:ff3377 300:b94900 400:345bf8 500:ad69e9 600:c4278a 700:067a67 800:e85bfd 900:0eaf62 1000:3c7a0f 1100:cd2e1d 1200:269ff4 1300:bebebe 1400:0da8b6 1500:a35834 1600:cb8d00 1700:6995fe 1800:0cad8e 1900:8f1261 2000:ffa79d',
};

function unpack(p: Packed, into: Record<string, string> = {}): Record<string, string> {
  for (const family in p) {
    for (const part of p[family].split(' ')) {
      const i = part.indexOf(':');
      if (i < 0) into[family] = `#${part}`;
      else into[`${family}-${part.slice(0, i)}`] = `#${part.slice(i + 1)}`;
    }
  }
  return into;
}

const legacyLight = unpack(LEGACY_LIGHT);
const legacyDark = unpack(LEGACY_DARK_DIFF, { ...legacyLight });
const s2Light = unpack(S2_LIGHT);
const s2Dark = unpack(S2_DARK_DIFF, { ...s2Light });

/** Legacy token value for a scheme, or undefined when the string is not a legacy token. */
function legacyToken(token: string, scheme: ColorScheme): string | undefined {
  if (token.startsWith('s2-')) {
    const key = token.slice(3);
    return (scheme === 'dark' ? s2Dark : s2Light)[key] ?? (scheme === 'dark' ? s2Light : s2Dark)[key];
  }
  // The legacy library spells the static purple family `static-pruple`; accept both spellings.
  const key = token.startsWith('static-purple') ? `static-pruple${token.slice(13)}` : token;
  // A token defined for one scheme only (e.g. `categorical-1700`) uses that value in both.
  return (scheme === 'dark' ? legacyDark : legacyLight)[key] ?? (scheme === 'dark' ? legacyLight : legacyDark)[key];
}

/**
 * The CSS colour for a legacy colour token in a scheme, or the input unchanged when it is not a token (CSS colours
 * pass through). Same contract as the legacy library's `getColorValue`; token values come back as `#rrggbb`.
 */
export function getColorValue(color: string, colorScheme: ColorScheme = 'light'): string {
  return legacyToken(color.trim(), colorScheme) ?? color;
}

/* ================================================================ palettes */

/** Default categorical palette (16 hues, ordered for maximal adjacent contrast). */
export const CATEGORICAL_16 = [
  '#3b6fe0', '#e0663b', '#22a884', '#c2408f', '#8a63d2', '#d9a400', '#2fa3c7', '#d9475b',
  '#6e9e2e', '#9c6b3e', '#5b5fc7', '#e07fb0', '#4c9c9a', '#b5762c', '#7f8c99', '#a33a3a',
];

const levels = (family: string, list: string, table: Record<string, string> = legacyLight): string[] => list.split(' ').map((l) => table[`${family}-${l}`]);
const STEPS_16 = '100 200 300 400 500 600 700 800 900 1000 1100 1200 1300 1400 1500 1600';
const STEPS_15 = '100 200 300 400 500 600 700 800 900 1000 1100 1200 1300 1400 1500';
const SEQ_9 = '100 200 400 600 800 1000 1200 1400 1600';
// The legacy library's 5-step sequential palettes start 400, 100 (all but viridis); kept as is.
const SEQ_5 = '400 100 800 1200 1600';
const DIV_9 = '100 300 500 700 800 900 1100 1300 1500';
const DIV_5 = '100 500 800 1100 1500';
const s2Categorical = (n: number, table: Record<string, string>) => Array.from({ length: n }, (_, i) => table[`categorical-${(i + 1) * 100}`]);

/** The legacy library's named palettes, with its exact (light) values. */
export const colorSchemes = {
  categorical6: levels('categorical', '100 200 300 400 500 600'),
  categorical12: levels('categorical', STEPS_16).slice(0, 12),
  categorical16: levels('categorical', STEPS_16),
  s2Categorical6: s2Categorical(6, s2Light),
  s2Categorical12: s2Categorical(12, s2Light),
  s2Categorical16: s2Categorical(16, s2Light),
  s2Categorical20: s2Categorical(20, s2Light),
  divergentOrangeYellowSeafoam5: levels('divergent-orange-yellow-seafoam', DIV_5),
  divergentOrangeYellowSeafoam9: levels('divergent-orange-yellow-seafoam', DIV_9),
  divergentOrangeYellowSeafoam15: levels('divergent-orange-yellow-seafoam', STEPS_15),
  divergentRedBlue5: levels('divergent-red-blue', DIV_5),
  divergentRedBlue9: levels('divergent-red-blue', DIV_9),
  divergentRedBlue15: levels('divergent-red-blue', STEPS_15),
  divergentRedYellowBlue5: levels('divergent-red-yellow-blue', DIV_5),
  divergentRedYellowBlue9: levels('divergent-red-yellow-blue', DIV_9),
  divergentRedYellowBlue15: levels('divergent-red-yellow-blue', STEPS_15),
  sequentialViridis5: levels('sequential-viridis', '100 400 800 1200 1600'),
  sequentialViridis9: levels('sequential-viridis', SEQ_9),
  sequentialViridis16: levels('sequential-viridis', STEPS_16),
  sequentialMagma5: levels('sequential-magma', SEQ_5),
  sequentialMagma9: levels('sequential-magma', SEQ_9),
  sequentialMagma16: levels('sequential-magma', STEPS_16),
  sequentialRose5: levels('sequential-rose', SEQ_5),
  sequentialRose9: levels('sequential-rose', SEQ_9),
  sequentialRose16: levels('sequential-rose', STEPS_16),
  sequentialCerulean5: levels('sequential-cerulean', SEQ_5),
  sequentialCerulean9: levels('sequential-cerulean', SEQ_9),
  sequentialCerulean16: levels('sequential-cerulean', STEPS_16),
  sequentialForest5: levels('sequential-forest', SEQ_5),
  sequentialForest9: levels('sequential-forest', SEQ_9),
  sequentialForest16: levels('sequential-forest', STEPS_16),
};

export type ColorSchemeName = keyof typeof colorSchemes;

/** Dark variants: only the `s2Categorical*` palettes change with the scheme in the legacy library. */
const DARK_SCHEMES: Partial<Record<ColorSchemeName, string[]>> = {
  s2Categorical6: s2Categorical(6, s2Dark),
  s2Categorical12: s2Categorical(12, s2Dark),
  s2Categorical16: s2Categorical(16, s2Dark),
  s2Categorical20: s2Categorical(20, s2Dark),
};

/** A legacy named palette's colours for a scheme (the legacy library's `getColorSchemeColors`). */
export function getColorSchemeColors(name: ColorSchemeName, colorScheme: ColorScheme = 'light'): string[] {
  return (colorScheme === 'dark' ? DARK_SCHEMES[name] : undefined) ?? colorSchemes[name];
}

export const PALETTES: Record<string, string[]> = {
  ...colorSchemes,
  rsc16: CATEGORICAL_16,
  ocean: ['#0b3c5d', '#1d6996', '#38a6a5', '#0f8554', '#73af48', '#edad08', '#e17c05', '#cc503e'],
  ember: ['#7a0403', '#c42503', '#f07e1a', '#fbb61a', '#fde725', '#a8db34', '#35b779', '#2a788e'],
  pastel: ['#8fb8ff', '#ffb38a', '#8fe0c5', '#f5a3d0', '#c4b0f5', '#ffe08a', '#9ad7ec', '#f5a3ad'],
  monoBlue: ['#0d2b6b', '#1b4597', '#2f62c4', '#4f80e0', '#7ea2ec', '#adc5f4', '#d6e2fa'],
};

/** Linear RGB interpolation through a list of CSS colours. */
function piecewise(colors: string[]): (t: number) => string {
  const rgb = colors.map(parseCss);
  return (t) => {
    if (rgb.length === 1) return rgbaToCss(rgb[0]);
    const x = Math.min(1, Math.max(0, Number.isFinite(t) ? t : 0)) * (rgb.length - 1);
    const i = Math.min(rgb.length - 2, Math.floor(x));
    const f = x - i;
    const a = rgb[i];
    const b = rgb[i + 1];
    return `rgb(${Math.round((a[0] + (b[0] - a[0]) * f) * 255)}, ${Math.round((a[1] + (b[1] - a[1]) * f) * 255)}, ${Math.round((a[2] + (b[2] - a[2]) * f) * 255)})`;
  };
}

const SEQUENTIAL: Record<string, (t: number) => string> = {
  viridis: interpolateViridis,
  magma: interpolateMagma,
  inferno: interpolateInferno,
  cividis: interpolateCividis,
  blues: interpolateBlues,
  greens: interpolateGreens,
  redBlue: (t) => interpolateRdBu(1 - t),
  purpleOrange: interpolatePuOr,
  redYellowBlue: (t) => interpolateRdYlBu(1 - t),
  // Legacy ramps with no d3 equivalent, interpolated through their full legacy stops.
  rose: piecewise(colorSchemes.sequentialRose16),
  cerulean: piecewise(colorSchemes.sequentialCerulean16),
  forest: piecewise(colorSchemes.sequentialForest16),
  orangeYellowSeafoam: piecewise(colorSchemes.divergentOrangeYellowSeafoam15),
};

const paletteInterpolators = new Map<string, (t: number) => string>();

/** A continuous colour ramp by name: a generic ramp (`viridis`) or any named palette (`sequentialMagma16`). */
export function getInterpolator(name: string): ((t: number) => string) | undefined {
  if (SEQUENTIAL[name]) return SEQUENTIAL[name];
  let interp = paletteInterpolators.get(name);
  if (!interp) {
    const colors = PALETTES[name];
    if (!colors) return undefined;
    interp = piecewise(colors);
    paletteInterpolators.set(name, interp);
  }
  return interp;
}

/** Named palette for a scheme: exact named palettes first, else `n` samples of a ramp, e.g. `sequentialViridis7`. */
function namedScheme(name: string, scheme: ColorScheme): string[] | undefined {
  if (name in colorSchemes) return getColorSchemeColors(name as ColorSchemeName, scheme);
  if (PALETTES[name]) return PALETTES[name];
  const m = /^(sequential|divergent|diverging)([A-Z][A-Za-z]*?)(\d+)$/.exec(name);
  if (!m) return undefined;
  const key = m[2][0].toLowerCase() + m[2].slice(1);
  const interp = SEQUENTIAL[key];
  if (!interp) return undefined;
  const n = Number(m[3]);
  return Array.from({ length: n }, (_, i) => interp(n === 1 ? 0.5 : i / (n - 1)));
}

const HUES: Record<string, number> = {
  red: 0, orange: 25, yellow: 50, chartreuse: 80, celery: 100, green: 135, seafoam: 165, turquoise: 175,
  cyan: 190, blue: 215, indigo: 235, purple: 265, fuchsia: 290, magenta: 315, pink: 335, brown: 30,
  cinnamon: 20, silver: 210,
};

const tokenCache = { light: new Map<string, RGBA>(), dark: new Map<string, RGBA>() };

/**
 * Resolves colour tokens and CSS colours to RGBA (0..1, straight alpha).
 *
 * Legacy colour tokens resolve to the legacy library's exact values for the scheme:
 *   gray-50 … gray-900, <hue>-100 … <hue>-1300, static-<hue>-100 …, static-white / -black / -blue,
 *   categorical-100 … -1600, sequential-*, divergent-*, and s2-<token> for the newer token set.
 * Other token-shaped strings keep the synthesised ramps:
 *   gray-<n>                     neutral ramp (inverts in dark mode)
 *   <hue>-<n>                    hue ramps (e.g. brown-900)
 *   categorical-<n>              default categorical palette entries
 *   static-*                     same as the token but never inverted
 * Anything else is parsed as a CSS colour (`transparent` included).
 */
export function resolveColor(input: string | undefined | null, scheme: ColorScheme = 'light'): RGBA {
  if (!input) return [0, 0, 0, 0];
  const raw = input.trim();
  if (raw === 'transparent') return [0, 0, 0, 0];
  const cache = tokenCache[scheme] ?? tokenCache.light;
  const cached = cache.get(raw);
  if (cached) return [...cached];
  const legacy = legacyToken(raw, scheme);
  if (legacy) {
    const c = parseCss(legacy);
    cache.set(raw, c);
    return [...c];
  }
  let token = raw;
  let isStatic = false;
  if (token.startsWith('static-')) {
    isStatic = true;
    token = token.slice(7);
  }
  const m = /^([a-z]+)-(\d+)$/.exec(token);
  if (m) {
    const [, family, levelStr] = m;
    const level = Number(levelStr);
    if (family === 'gray') {
      const t = Math.min(1, Math.max(0, level / 1000));
      const l = scheme === 'dark' && !isStatic ? 0.08 + t * 0.86 : 1 - t * 0.9;
      return [l, l, l, 1];
    }
    if (family === 'categorical') {
      const idx = Math.max(0, Math.round(level / 100) - 1) % CATEGORICAL_16.length;
      return adjustForScheme(parseCss(CATEGORICAL_16[idx]), scheme);
    }
    const hue = HUES[family];
    if (hue !== undefined) {
      const t = Math.min(1, Math.max(0, level / 1600));
      const light = scheme === 'dark' && !isStatic ? 0.15 + t * 0.7 : 0.92 - t * 0.75;
      const sat = family === 'silver' ? 0.12 : family === 'brown' || family === 'cinnamon' ? 0.45 : 0.75;
      const c = hsl(hue, sat, light).rgb();
      return [c.r / 255, c.g / 255, c.b / 255, 1];
    }
  }
  return parseCss(raw);
}

export function parseCss(input: string): RGBA {
  const c = d3color(input);
  if (!c) return [0, 0, 0, 1];
  const rgb = c.rgb();
  return [rgb.r / 255, rgb.g / 255, rgb.b / 255, rgb.opacity];
}

function adjustForScheme(c: RGBA, scheme: ColorScheme): RGBA {
  if (scheme === 'light') return c;
  // Lift categorical colors slightly in dark mode for contrast against dark surfaces.
  return [c[0] + (1 - c[0]) * 0.12, c[1] + (1 - c[1]) * 0.12, c[2] + (1 - c[2]) * 0.12, c[3]];
}

export function rgbaToCss(c: RGBA): string {
  return `rgba(${Math.round(c[0] * 255)}, ${Math.round(c[1] * 255)}, ${Math.round(c[2] * 255)}, ${c[3]})`;
}

export function withAlpha(c: RGBA, a: number): RGBA {
  return [c[0], c[1], c[2], c[3] * a];
}

/** Resolves a palette input (named scheme, array, or function of scheme) to CSS strings. */
export function resolvePalette(input: string | string[] | ((scheme: ColorScheme) => string[]) | undefined, scheme: ColorScheme): string[] {
  if (!input) return CATEGORICAL_16;
  if (typeof input === 'function') return input(scheme);
  if (typeof input === 'string') return namedScheme(input, scheme) ?? CATEGORICAL_16;
  return input;
}

/** Relative luminance, used for auto-contrast label colors. */
export function luminance(c: RGBA): number {
  const f = (v: number) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
}

export function contrastText(bg: RGBA): string {
  return luminance(bg) > 0.4 ? '#1d1d1f' : '#ffffff';
}
