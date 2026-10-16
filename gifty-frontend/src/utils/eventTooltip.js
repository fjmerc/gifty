// Calendar tooltip content, built as DOM nodes so names are always shown as
// text: tippy renders strings as HTML only with allowHTML, which would let a
// recipient or event name inject markup.
export const buildEventTooltip = (event) => {
  const recipient = event.extendedProps?.recipientDetails;
  let recipientInfo = 'No recipient';
  if (recipient?.isSystemAccount) {
    recipientInfo = 'Holiday';
  } else if (recipient) {
    recipientInfo = `Recipient: ${recipient.firstName} ${recipient.lastName}`;
  }

  let reminderInfo = 'No reminder set';
  const reminder = event.extendedProps?.reminder;
  if (reminder && reminder.isSet) {
    const reminderDate = new Date(reminder.time);
    const formattedDate = reminderDate.toLocaleDateString();
    const formattedTime = reminderDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    reminderInfo = `Reminder: ${formattedDate} at ${formattedTime} (${reminder.method})`;
  }

  const root = document.createElement('div');
  const title = document.createElement('strong');
  title.textContent = event.title;
  root.appendChild(title);
  for (const line of [recipientInfo, `Date: ${new Date(event.start).toLocaleDateString()}`, reminderInfo]) {
    root.appendChild(document.createElement('br'));
    root.appendChild(document.createTextNode(line));
  }
  return root;
};
