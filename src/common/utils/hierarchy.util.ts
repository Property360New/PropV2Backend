// ============================================================
// src/common/utils/hierarchy.util.ts
// Utilities for hierarchy scope resolution
// ============================================================
export function getAllSubordinateIds(
  employeeId: string,
  allEmployees: { id: string; reportingManagerId: string | null }[],
): string[] {
  const result: string[] = [];
  const queue = [employeeId];
 
  while (queue.length > 0) {
    const current = queue.shift()!;
    const directReports = allEmployees.filter(
      (e) => e.reportingManagerId === current,
    );
    for (const emp of directReports) {
      result.push(emp.id);
      queue.push(emp.id);
    }
  }
 
  return result;
}
 
// Returns IDs that a given employee can "see" (self + all subordinates)
export function getScopeIds(user: {
  employeeId: string;
  subordinateIds: string[];
  designation: string;
}): string[] | null {
  if (user.designation === 'ADMIN') return null; // null = all
  return [user.employeeId, ...(user.subordinateIds ?? [])];
}