// TypeScript mirrors of the pimpumpam backend models.

export interface Account {
  id: string;
  server: string;
  username: string;
  display_name: string | null;
  created_at: string;
}

export interface AccountCreate {
  server: string;
  username: string;
  password: string;
  display_name?: string | null;
}

export interface Calendar {
  id: string;
  display_name: string | null;
  description: string | null;
  color: string | null;
  components: string[];
  url: string;
}

export interface CalendarCreate {
  display_name: string;
  components: string[];
  color?: string | null;
}

export interface CalendarUpdate {
  display_name?: string | null;
  color?: string | null;
}

export interface Attendee {
  email: string;
  name?: string | null;
  status?: string | null;
  role?: string | null;
}

export interface Alarm {
  trigger: string; // e.g. "-PT15M"
  action?: string;
  description?: string | null;
}

export interface Occurrence {
  uid: string;
  recurrence_id: string | null;
  summary: string | null;
  description: string | null;
  location: string | null;
  start: string | null;
  end: string | null;
  all_day: boolean;
  status: string | null;
  alarms: Alarm[];
}

export interface EventInput {
  uid?: string | null;
  summary: string;
  start: string;
  end?: string | null;
  all_day?: boolean;
  description?: string | null;
  location?: string | null;
  status?: string | null;
  rrule?: string | null;
  attendees?: Attendee[];
  alarms?: Alarm[];
}

export interface EventOut extends Required<Omit<EventInput, "uid">> {
  uid: string;
}

export interface Todo {
  uid: string;
  summary: string;
  description: string | null;
  status: string | null;
  start: string | null;
  due: string | null;
  completed: string | null;
  priority: number | null;
  percent_complete: number | null;
}

export interface AddressBook {
  id: string;
  display_name: string | null;
  description: string | null;
  url: string;
}

export interface TypedValue {
  type?: string | null;
  value: string;
}

export interface Contact {
  uid: string;
  full_name: string;
  first_name: string | null;
  last_name: string | null;
  organization: string | null;
  title: string | null;
  emails: TypedValue[];
  phones: TypedValue[];
  note: string | null;
  birthday: string | null;
  url: string | null;
}

export interface ContactInput {
  uid?: string | null;
  full_name: string;
  first_name?: string | null;
  last_name?: string | null;
  organization?: string | null;
  title?: string | null;
  emails?: TypedValue[];
  phones?: TypedValue[];
  note?: string | null;
  birthday?: string | null;
  url?: string | null;
}
