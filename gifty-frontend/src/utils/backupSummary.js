// Wording for the Settings backup and restore dialogs, from what the server
// reports about a backup file or a finished restore.

const count = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "1 recipient, 5 events, 2 gifts, 0 budgets" (validate-backup backupInfo) */
export const backupContents = ({ counts } = {}) => {
  if (!counts) return '';
  return [
    count(counts.recipients || 0, 'recipient'),
    count(counts.events || 0, 'event'),
    count(counts.gifts || 0, 'gift'),
    count(counts.budgets || 0, 'budget')
  ].join(', ');
};

/** The message after restoring your own backup */
export const restoreSummary = ({ restoredData = {}, skipped = {}, fixes = {}, legacy, warnings = [] } = {}) => {
  const lines = [`Backup restored: ${[
    count(restoredData.recipients || 0, 'recipient'),
    count(restoredData.events || 0, 'event'),
    count(restoredData.gifts || 0, 'gift'),
    count(restoredData.budgets || 0, 'budget'),
    count(restoredData.overallBudgets || 0, 'overall budget')
  ].join(', ')}.`];

  const left = [
    skipped.events && count(skipped.events, 'event'),
    skipped.gifts && count(skipped.gifts, 'gift'),
    skipped.budgets && count(skipped.budgets, 'budget')
  ].filter(Boolean);
  if (left.length) lines.push(`Left out (their recipient or event was not in the file): ${left.join(', ')}.`);

  if (!legacy && fixes.eventsWithImportedType) {
    lines.push(`${count(fixes.eventsWithImportedType, 'event was', 'events were')} given the type "Imported" because their type was not in the file.`);
  }
  if (legacy) {
    const updated = [
      fixes.textFieldsDecoded && `${count(fixes.textFieldsDecoded, 'text field')} decoded`,
      fixes.pricesRounded && `${count(fixes.pricesRounded, 'price')} rounded to the cent`,
      fixes.purchaseDatesAdded && `${count(fixes.purchaseDatesAdded, 'purchase')} given a date`,
      fixes.eventsWithImportedType && `${count(fixes.eventsWithImportedType, 'event')} given the type "Imported"`
    ].filter(Boolean);
    if (updated.length) lines.push(`Updated from an older backup: ${updated.join(', ')}.`);
  }
  return [...lines, ...warnings].join(' ');
};

/** The message after an instance-wide database restore */
export const databaseRestoreSummary = (backupName, { upgrade } = {}) => {
  const lines = [`Database restored from backup '${backupName}'.`];
  if (upgrade?.error) lines.push(`Updating its data failed: ${upgrade.error}`);
  if (upgrade?.moneyModel === 'failed') lines.push('Updating the money data failed; restart the server to retry.');
  if (upgrade?.textRepair === 'failed') lines.push('Decoding old text failed; see the server log.');
  if (upgrade?.textRepair === 'interrupted') {
    lines.push('Decoding old text was interrupted earlier and is not retried automatically; see the server log.');
  }
  return lines.join(' ');
};
