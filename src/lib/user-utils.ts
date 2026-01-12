/**
 * Get the display name for a user
 * Priority: displayName > fullName > name
 */
export function getUserDisplayName(user: {
  name?: string | null;
  displayName?: string | null;
  fullName?: string | null;
}): string {
  return user.displayName || user.fullName || user.name || "Member";
}
