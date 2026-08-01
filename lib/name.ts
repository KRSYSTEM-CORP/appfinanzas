// Splits a single "nombre y apellido" field into firstName/lastName the way
// the rest of the app expects them stored — the first whitespace-separated
// token becomes firstName, everything after it becomes lastName. Used
// wherever the UI collapses the two into one input (see
// components/auth/LoginForm.tsx and components/employees/EmployeeTable.tsx)
// so browsers/password managers see a single username field instead of two,
// which is what actually lets them offer to save the credentials.
export function splitFullName(fullName: string): { firstName: string; lastName: string } {
  const trimmed = fullName.trim().replace(/\s+/g, " ");
  const spaceIndex = trimmed.indexOf(" ");
  if (spaceIndex === -1) return { firstName: trimmed, lastName: "" };
  return { firstName: trimmed.slice(0, spaceIndex), lastName: trimmed.slice(spaceIndex + 1) };
}

export function joinFullName(firstName: string, lastName: string): string {
  return [firstName, lastName].filter(Boolean).join(" ");
}
