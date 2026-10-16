import { backupContents, restoreSummary, databaseRestoreSummary } from '../backupSummary';

describe('backupContents', () => {
  test('counts what the file holds', () => {
    expect(backupContents({ counts: { recipients: 1, events: 5, gifts: 2, budgets: 0 } }))
      .toBe('1 recipient, 5 events, 2 gifts, 0 budgets');
  });

  test('says nothing when the server sent no counts', () => {
    expect(backupContents({})).toBe('');
  });
});

describe('restoreSummary', () => {
  test('lists what was restored', () => {
    expect(restoreSummary({ restoredData: { recipients: 2, events: 1, gifts: 3, budgets: 1, overallBudgets: 1 } }))
      .toBe('Backup restored: 2 recipients, 1 event, 3 gifts, 1 budget, 1 overall budget.');
  });

  test('says what was left out and what an older backup needed', () => {
    const text = restoreSummary({
      legacy: true,
      restoredData: { recipients: 1, events: 2, gifts: 1, budgets: 0, overallBudgets: 0 },
      skipped: { events: 0, gifts: 2, budgets: 0 },
      fixes: { textFieldsDecoded: 3, pricesRounded: 1, purchaseDatesAdded: 1, eventsWithImportedType: 2 }
    });
    expect(text).toContain('Left out (their recipient or event was not in the file): 2 gifts.');
    expect(text).toContain('Updated from an older backup: 3 text fields decoded, 1 price rounded to the cent, '
      + '1 purchase given a date, 2 events given the type "Imported".');
  });
});

describe('restoreSummary for a current backup', () => {
  test('says when events were given the type "Imported"', () => {
    const text = restoreSummary({
      legacy: false,
      restoredData: { recipients: 1, events: 4, gifts: 0, budgets: 0, overallBudgets: 0 },
      fixes: { eventsWithImportedType: 4 }
    });
    expect(text).toContain('4 events were given the type "Imported" because their type was not in the file.');
  });
});

describe('databaseRestoreSummary', () => {
  test('names the backup', () => {
    expect(databaseRestoreSummary('b1', {})).toBe("Database restored from backup 'b1'.");
  });

  test('warns when updating the restored data failed', () => {
    expect(databaseRestoreSummary('b1', { upgrade: { error: 'boom. Restart the server to retry.' } }))
      .toBe("Database restored from backup 'b1'. Updating its data failed: boom. Restart the server to retry.");
  });
});

describe('warnings', () => {
  test('a restore passes on what the server could not do', () => {
    expect(restoreSummary({ restoredData: {}, warnings: ['Your preferences could not be restored.'] }))
      .toContain('Your preferences could not be restored.');
  });

  test('a database restore warns when an upgrade step failed or was interrupted', () => {
    const text = databaseRestoreSummary('b1', { upgrade: { moneyModel: 'failed', textRepair: 'interrupted' } });
    expect(text).toContain('Updating the money data failed; restart the server to retry.');
    expect(text).toContain('Decoding old text was interrupted earlier and is not retried automatically; see the server log.');
  });
});

