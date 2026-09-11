/** Pixelarticons (MIT), https://github.com/halfmage/pixelarticons.
 * Keep interface icons in this family; game objects use colored pixel sprites. */
const paths = {
  "user": "\n  <path d=\"M9 2h6v2H9zm0 8h6v2H9zm6-6h2v6h-2zM7 4h2v6H7zM4 18h2v4H4zm14 0h2v4h-2zM8 14h8v2H8zm-2 2h2v2H6zm10 0h2v2h-2z\"/>\n",
  "robot": "\n  <path d=\"M5 7h14v2H5zm0 12h14v2H5zM3 9h2v10H3zm16 0h2v10h-2zM1 13h2v2H1zm20 0h2v2h-2zM11 5h2v2h-2zM7 3h4v2H7zm1 9h2v4H8zm6 0h2v4h-2z\"/>\n",
  "arrow-left": "\n  <path d=\"M20 11v2H4v-2zM8 13v2H6v-2zm2 2v2H8v-2zm2 2v2h-2v-2zm-4-6V9H6v2z\"/>\n  <path d=\"M10 15V7H8v8zm2 2V5h-2v12z\"/>\n",
  "target": "\n  <path d=\"M5 1h14v2H5zM3 3h2v2H3zm0 16h2v2H3zm16 0h2v2h-2zm0-16h2v2h-2zm2 2h2v14h-2zM5 21h14v2H5zM1 5h2v14H1zm8 0h6v2H9zM5 9h2v6H5zm4 8h6v2H9zm8-8h2v6h-2zm-6 0h2v2h-2zM7 7h2v2H7zm0 8h2v2H7zm8 0h2v2h-2zm0-8h2v2h-2zm-6 4h2v2H9zm2 2h2v2h-2zm2-2h2v2h-2z\"/>\n",
  "login": "\n  <path d=\"M2 11h14v2H2zm10-2h2v2h-2z\"/>\n  <path d=\"M10 7h2v10h-2zm2 6h2v2h-2zM6 2h12v2H6zm0 18h12v2H6zM4 4h2v5H4zm0 11h2v5H4zM18 4h2v16h-2z\"/>\n",
  "stop": "<path d=\"M20 20H4V4H20V20ZM6 18H18V6H6V18ZM14 14H10V10H14V14Z\"/>",
  "circle-question": "<path d=\"M18 22H6V20H18V22ZM6 20H4V18H6V20ZM20 20H18V18H20V20ZM4 18H2V6H4V18ZM13 18H11V16H13V18ZM22 18H20V6H22V18ZM15 13H13V15H11V11H15V13ZM17 11H15V8H17V11ZM9 10H7V8H9V10ZM15 8H9V6H15V8ZM6 6H4V4H6V6ZM20 6H18V4H20V6ZM18 4H6V2H18V4Z\"/>",
  "building": "\n  <path d=\"M5 2h14v2H5zm0 18h14v2H5zM3 4h2v16H3zm16 0h2v16h-2zM7 6h2v2H7zm4 0h2v2h-2zm4 0h2v2h-2zm-8 4h2v2H7zm4 0h2v2h-2zm4 0h2v2h-2zm-8 4h2v2H7zm4 0h2v2h-2zm-1 4h4v2h-4zm5-4h2v2h-2z\"/>\n",
  "tree-pine": "\n  <path d=\"M11 2h2v2h-2zM9 4h2v2H9zm4 0h2v2h-2zm2 2h2v2h-2zM7 6h2v2H7zm0 4h2v2H7zm-2 2h2v2H5zm2 2h2v2H7zm-2 2h2v2H5zm-2 2h18v2H3zM13 8h2v2h-2zm2 2h2v2h-2zM9 8h2v2H9zm8 4h2v2h-2zm-2 2h2v2h-2zm2 2h2v2h-2zm-6 4h2v2h-2z\"/>\n",
  "home": "\n  <path d=\"M4 20h16v2H4zm16-10h2v10h-2zM2 10h2v10H2zm2-2h2v2H4zm2-2h2v2H6zm2-2h2v2H8zm2-2h4v2h-4zm4 2h2v2h-2zm2 2h2v2h-2zm2 2h2v2h-2zM8 14h2v6H8zm2-2h4v2h-4zm4 2h2v6h-2z\"/>\n",
  "chevrons-vertical": "\n  <path d=\"M13 20h-2v-2h2v2Zm-2-2H9v-2h2v2Zm4 0h-2v-2h2v2Zm-6-2H7v-2h2v2Zm8-2v2h-2v-2h2Zm-8-4H7V8h2v2Zm8 0h-2V8h2v2Zm-6-2H9V6h2v2Zm4 0h-2V6h2v2Zm-2-2h-2V4h2v2Z\"/>\n",
  "volume-2": "\n  <path d=\"M13 22h-2v-2H9v-2h2V6H9V4h2V2h2v20Zm-4-4H7v-2h2v2Zm10 0h-4v-2h4v2ZM7 10H5v4h2v2H3V8h4v2Zm14 6h-2V8h2v8Zm-4-2h-2v-4h2v4ZM9 8H7V6h2v2Zm10 0h-4V6h4v2Z\"/>\n",
  "volume-x": "<path d=\"M13 22h-2v-2H9v-2h2V6H9V4h2V2h2v20Zm-4-4H7v-2h2v2Zm-2-8H5v4h2v2H3V8h4v2Zm10.001 5.224h-2v-2H17v-2h-1.999v-2h2v2H19v2h-1.999v2Zm3.999 0h-2v-2h2v2Zm0-4h-2v-2h2v2ZM9 8H7V6h2v2Z\"/>",
  "reload": "\n  <path d=\"M16 4h2v6h-2zm-2-2h2v2h-2zm0 2h2v8h-2zM4 8H2v5h2z\"/>\n  <path d=\"M4 6h16v2H4zm4 14H6v-6h2zm2 2H8v-2h2zm0-2H8v-8h2zm10-4h2v-5h-2z\"/>\n  <path d=\"M20 18H4v-2h16z\"/>\n",
  "check": "\n  <path d=\"M10 18H8v-2h2v2Zm-2-2H6v-2h2v2Zm4-2v2h-2v-2h2Zm-6 0H4v-2h2v2Zm8 0h-2v-2h2v2Zm2-2h-2v-2h2v2Zm2-2h-2V8h2v2Zm2-2h-2V6h2v2Z\"/>\n"
} as const;
export function pixelIcon(name: keyof typeof paths) {
  return `<svg viewBox="0 0 24 24" fill="currentColor" shape-rendering="crispEdges" aria-hidden="true">${paths[name]}</svg>`;
}
