/** Copy for the downgrade notice. The server decides which case applies. */
export function downgradeWarningBody(choosing: boolean, graceStarted: boolean): string {
  const keptLimit = graceStarted
    ? 'Groups under Kept are limited to 1 GB now. New uploads stop once a group is over 1 GB, and older files over that limit are removed on this date.'
    : 'On this date, groups you keep are trimmed to 1 GB, oldest files first.';
  if (choosing) {
    return `Only the two groups under Kept stay. Everything under Will be deleted is permanently removed, including its files. Drag a group across the split. ${keptLimit} You can still download, delete files, or transfer a group.`;
  }
  if (graceStarted) {
    return 'Groups you own are limited to 1 GB now. New uploads stop once a group is over 1 GB. Older files over that limit are removed on this date. You can still download, delete files, or transfer a group.';
  }
  return 'Groups you own become Small (1 GB). Files over that limit are removed, oldest first.';
}
