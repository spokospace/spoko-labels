// Made-up Niimbot data. The shapes mimic what the NIIMBOT desktop app stores (keys, value types, the
// misspelled `textAlignHorizonral`, the extra app keys); every value is invented. No real template, data
// source id, sheet name, URL or roll serial belongs here.

type Raw = Record<string, unknown>;

/** Keys the app adds to every element; the importer must ignore them. */
const APP_NOISE = {
  id: "00000000000000000000000000000000",
  isLock: 0,
  mirrorId: "",
  isOpenMirror: 0,
  paperColorIndex: 0,
  colorChannel: 0,
  elementColor: [255, 0, 0, 0],
  hasVipRes: false,
};

/** A bound element's `dataBind`: [data source id, sheet name], both made up. */
export const BOUND = ["made-up-source", "Sheet-made-up"];

export const niimbotText = (extra: Raw = {}): Raw => ({
  ...APP_NOISE,
  type: "text",
  x: 2,
  y: 2,
  width: 30,
  height: 6,
  rotate: 0,
  value: "Blue crate",
  dataBind: [],
  fontCode: "ZT001",
  fontFamily: "made-up",
  fontSize: 4,
  fontStyle: [],
  letterSpacing: 0,
  wordSpacing: 0,
  lineSpacing: 0,
  textAlignHorizonral: 0,
  textAlignVertical: 0,
  lineBreakMode: 0,
  lineMode: 2,
  textStyle: ["minimized"],
  boxStyle: "fixed-width-height",
  typesettingMode: 1,
  colorReverse: 0,
  ...extra,
});

export const niimbotQr = (extra: Raw = {}): Raw => ({
  ...APP_NOISE,
  type: "qrcode",
  x: 34,
  y: 12,
  width: 14,
  height: 14,
  rotate: 0,
  value: "B0",
  dataBind: BOUND,
  codeType: 31,
  correctLevel: 0,
  isLive: false,
  isForm: false,
  colorReverse: 0,
  ...extra,
});

export const niimbotLine = (extra: Raw = {}): Raw => ({
  ...APP_NOISE,
  type: "line",
  x: 2,
  y: 10,
  width: 46,
  height: 1,
  rotate: 0,
  lineWidth: 0.4,
  lineType: 1,
  dashwidth: [0.75, 0.75],
  colorReverse: 0,
  ...extra,
});

export const niimbotTemplate = (extra: Raw = {}): Raw => ({
  name: "Storage box",
  rollNames: ["T50*30-230WHITE"],
  elements: [niimbotText(), niimbotLine(), niimbotQr()],
  ...extra,
});

/** A small made-up set covering every supported feature, every skip and one failure; pinned by a snapshot. */
export const FIXTURE_SET: Raw[] = [
  niimbotTemplate(),
  niimbotTemplate({
    name: "  Shelf label  ",
    rollNames: ["made-up", "T40*12-160"],
    elements: [
      niimbotText({ value: "A0", dataBind: BOUND, fontCode: "ZT347", fontSize: 5.6, letterSpacing: 0.3, wordSpacing: 0.3, textAlignHorizonral: 1, textAlignVertical: 1 }),
      niimbotText({ value: "Półka 3\nRegał B", fontCode: "ZT021", fontStyle: ["bold", "underline"], lineBreakMode: 1, lineSpacing: -0.2, textStyle: ["norm"], colorReverse: 1, textAlignVertical: 3 }),
      niimbotText({ value: "Vertical", rotate: 270 }),
      { ...niimbotText(), type: "barcode", codeType: 20 },
      { ...niimbotText(), type: "image", imageUrl: "https://example.invalid/made-up.png" },
      niimbotQr({ correctLevel: 2 }),
    ],
  }),
  niimbotTemplate({ name: "No size", rollNames: ["made-up"] }),
  niimbotTemplate({ name: "Unknown font", width: 30, height: 20, rollNames: undefined, elements: [niimbotText({ fontCode: "ZT999", fontSize: 71.8 })] }),
];
