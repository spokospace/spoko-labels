/** One element with its properties, a `part` name and children, created in `doc`. */
export function el<T extends HTMLElement>(
  doc: Document,
  tag: string,
  props: Partial<Omit<T, "part">> & { partName?: string } = {},
  ...children: (Node | string)[]
): T {
  const node = doc.createElement(tag) as T;
  const { partName, ...rest } = props;
  Object.assign(node, rest);
  if (partName) node.setAttribute("part", partName);
  node.append(...children);
  return node;
}
