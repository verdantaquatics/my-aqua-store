interface CategoryNode {
  id: string
  parent_id?: string | null
}

/** All descendant category ids (children, grandchildren, …) of a category */
export function getDescendantIds(categoryId: string, categories: CategoryNode[]): string[] {
  const result: string[] = []
  const queue = [categoryId]
  while (queue.length > 0) {
    const current = queue.shift()!
    for (const c of categories) {
      if (c.parent_id === current && !result.includes(c.id) && c.id !== categoryId) {
        result.push(c.id)
        queue.push(c.id)
      }
    }
  }
  return result
}

/** All ancestor category ids (parent, grandparent, …) of a category */
export function getAncestorIds(categoryId: string, categories: CategoryNode[]): string[] {
  const result: string[] = []
  let current = categories.find((c) => c.id === categoryId)
  while (current?.parent_id && !result.includes(current.parent_id)) {
    result.push(current.parent_id)
    current = categories.find((c) => c.id === current!.parent_id)
  }
  return result
}
