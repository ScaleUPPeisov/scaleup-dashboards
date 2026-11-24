/** Count selected IDs that exist in the current batch, preserving duplicates. */
export function countSelectedProjects(selectedIds:readonly string[],projectIds:ReadonlySet<string>):number{
 let count=0;
 for(const id of selectedIds)if(projectIds.has(id))count++;
 return count;
}
