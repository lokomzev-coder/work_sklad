interface GroupLike {
  id: string;
  name: string;
  parentId: string | null;
}

export interface GroupTreeNode<T extends GroupLike> {
  group: T;
  depth: number;
  path: string;
}

/**
 * Flattens a group list into tree order (parents before their children,
 * depth-first) with each node's depth and full "Parent / Child" path label —
 * used for indented lists and for combobox option labels.
 */
export function flattenGroupTree<T extends GroupLike>(
  groups: T[],
): GroupTreeNode<T>[] {
  const byParent = new Map<string | null, T[]>();
  for (const group of groups) {
    const siblings = byParent.get(group.parentId) ?? [];
    siblings.push(group);
    byParent.set(group.parentId, siblings);
  }

  const result: GroupTreeNode<T>[] = [];
  function visit(parentId: string | null, depth: number, pathPrefix: string) {
    const children = byParent.get(parentId) ?? [];
    for (const group of children) {
      const path = pathPrefix ? `${pathPrefix} / ${group.name}` : group.name;
      result.push({ group, depth, path });
      visit(group.id, depth + 1, path);
    }
  }
  visit(null, 0, "");
  return result;
}
