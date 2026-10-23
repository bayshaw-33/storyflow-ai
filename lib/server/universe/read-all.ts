/** Complete scoped reads for Universe counts and entity lists. */
export async function readAllUniverseRows<T>(
  fetcher: <R = unknown>(path: string) => Promise<R>,
  path: string,
): Promise<T[]> {
  const [pathname, query = ""] = path.split("?");
  const filters = query.split("&").filter(part => part && !/^(limit|offset)=/.test(part));
  if (!filters.some(part => part.startsWith("order="))) filters.push("order=id.asc");
  const scope = `${pathname}?${filters.join("&")}`;
  const pageSize = 500;
  const rows: T[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const page = await fetcher<T[]>(`${scope}&limit=${pageSize}&offset=${offset}`);
    if (!Array.isArray(page)) throw new Error("Invalid Universe page response.");
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}
