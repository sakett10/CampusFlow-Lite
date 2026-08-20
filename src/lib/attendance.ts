export function calculateAttendancePercentage(attended: number, total: number): number {
  if (total === 0) return 100;
  return (attended / total) * 100;
}

export function calculateClassesNeeded(attended: number, total: number, threshold: number): number {
  if (threshold <= 0) return 0;
  if (threshold > 100) return -1;
  
  const currentPercentage = calculateAttendancePercentage(attended, total);
  if (currentPercentage >= threshold) return 0;

  if (threshold === 100 && attended < total) {
    return -1; // mathematically impossible
  }

  let needed = 0;
  let tempAttended = attended;
  let tempTotal = total;
  
  while ((tempAttended / tempTotal) * 100 < threshold) {
    needed++;
    tempAttended++;
    tempTotal++;
    if (needed > 1000) return 1000; // fail-safe
  }
  
  return needed;
}
