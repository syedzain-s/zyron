import {
  cleanMailText,
  readableSender,
  upcomingEvents,
  recentMail,
  type CalendarEvent,
  type MailSummary,
} from '@/lib/connectors/google';

const IMPORTANT_WORDS = /urgent|important|action required|deadline|due|invoice|payment|interview|offer|contract|approval|tomorrow|today/i;

export interface Briefing {
  message: string;
  events: CalendarEvent[];
  importantMail: MailSummary[];
  generatedAt: number;
}

export async function buildBriefing(): Promise<Briefing> {
  const [events, mail] = await Promise.all([upcomingEvents(7), recentMail(20)]);
  const importantMail = mail
    .filter((item) => item.important || item.unread || IMPORTANT_WORDS.test(`${item.subject} ${item.snippet}`))
    .slice(0, 8);

  const lines: string[] = ['Here is your live briefing.'];
  const nextEvents = events.filter((event) => !event.allDay).slice(0, 6);

  if (nextEvents.length > 0) {
    lines.push('', 'Calendar:');
    for (const event of nextEvents) {
      lines.push(`- ${formatWhen(event.start)}: ${event.summary}${event.location ? ` at ${event.location}` : ''}`);
    }
  } else {
    lines.push('', 'Calendar: nothing scheduled in the next seven days.');
  }

  if (importantMail.length > 0) {
    lines.push('', 'Priority email:');
    importantMail.forEach((item, index) => {
      const status = item.unread ? 'Unread' : item.important ? 'Important' : 'For review';
      lines.push(`${index + 1}. [${status}] ${cleanMailText(item.subject, 100)}`);
      lines.push(`   ${readableSender(item.from)}${item.snippet ? ` — ${cleanMailText(item.snippet)}` : ''}`);
    });
  } else {
    lines.push('', 'Priority email: nothing requiring attention was found in the recent primary inbox.');
  }

  lines.push('', 'I can draft replies and prepare actions, but I will ask for your approval before anything is sent or changed.');

  return { message: lines.join('\n'), events, importantMail, generatedAt: Date.now() };
}

function formatWhen(value: string): string {
  if (!value) return 'Unscheduled';
  return new Date(value).toLocaleString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}