const STYLES = [
  ["brick", [2, 3, 4, 5, 6, 7]],
  ["brown", [3, 4, 5, 6]],
  ["tan", [2, 3, 4, 5, 6]],
  ["cream", [2, 3, 4, 5]],
  ["office", [5, 7, 8, 10, 12]],
  ["slate", [6, 8, 9, 11]],
  ["glass", [7, 9, 11, 13]],
];

const SHAPES = ["A", "B", "C", "D", "E"];

export const BUILDING_CATALOG = [];

for (const [style, heights] of STYLES) {
  for (const floors of heights) {
    for (let variant = 0; variant < 4; variant++) {
      BUILDING_CATALOG.push({
        key: `bldg_${style}_${floors}_${variant}_1x1`,
        style,
        floors,
        variant,
        spanX: 1,
        spanY: 1,
        shape: SHAPES[variant % SHAPES.length],
      });
    }
  }
}

for (const style of ["brick", "tan", "office", "brown"]) {
  for (const floors of style === "office" ? [5, 8] : [3, 5]) {
    for (let variant = 0; variant < 2; variant++) {
      BUILDING_CATALOG.push({
        key: `bldg_${style}_${floors}_${variant}_2x1`,
        style,
        floors,
        variant,
        spanX: 2,
        spanY: 1,
        shape: variant === 0 ? "A" : "C",
      });
      BUILDING_CATALOG.push({
        key: `bldg_${style}_${floors}_${variant + 2}_1x2`,
        style,
        floors,
        variant: variant + 2,
        spanX: 1,
        spanY: 2,
        shape: variant === 0 ? "B" : "E",
      });
    }
  }
}

export const STYLE_COLORS = {
  brick: { wall: "#b04e3c", wallLt: "#c86650", wallDk: "#84382c", roof: "#5a626c", mortar: "#c4a090" },
  brown: { wall: "#8a4030", wallLt: "#a85440", wallDk: "#64281c", roof: "#3a424a", mortar: "#c4a090" },
  tan: { wall: "#c8a67a", wallLt: "#dcc09a", wallDk: "#96744e", roof: "#5a626c", mortar: "#ece4d0" },
  cream: { wall: "#d8ccb0", wallLt: "#ece4d0", wallDk: "#a89878", roof: "#b06a42", mortar: "#ece4d0" },
  office: { wall: "#7e8c98", wallLt: "#9aaab6", wallDk: "#5a6874", roof: "#767e88", mortar: "#a8b0b6" },
  slate: { wall: "#6a7684", wallLt: "#8a98a6", wallDk: "#4a5460", roof: "#5a626c", mortar: "#8e949a" },
  glass: { wall: "#3a5a7c", wallLt: "#5a82a8", wallDk: "#1e334c", roof: "#a8b0b6", mortar: "#9aaab6" },
};
