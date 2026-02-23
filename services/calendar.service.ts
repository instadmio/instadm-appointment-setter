import type { CalendarBusySlot, CalendarEvent } from '@/types';

export class CalendarService {
    private refreshToken: string;

    constructor(refreshToken: string) {
        this.refreshToken = refreshToken;
    }

    private async getAccessToken(): Promise<string> {
        const response = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                client_id: process.env.GOOGLE_CLIENT_ID!,
                client_secret: process.env.GOOGLE_CLIENT_SECRET!,
                refresh_token: this.refreshToken,
                grant_type: 'refresh_token',
            }),
        });

        const data = await response.json();
        if (data.error) throw new Error(`Could not refresh access token: ${data.error_description}`);
        return data.access_token;
    }

    async checkAvailability(timeMin: string, timeMax: string): Promise<CalendarBusySlot[]> {
        try {
            const accessToken = await this.getAccessToken();

            const response = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    timeMin,
                    timeMax,
                    items: [{ id: 'primary' }],
                }),
            });

            const data = await response.json();
            if (data.error) throw new Error(data.error.message);

            const calendars = data.calendars;
            if (calendars && calendars.primary) {
                return calendars.primary.busy || [];
            }
            return [];
        } catch (error: unknown) {
            const errMsg = error instanceof Error ? error.message : 'Unknown error';
            console.error('Error checking calendar availability:', errMsg);
            throw new Error('Could not check calendar availability.');
        }
    }

    async createBooking(summary: string, startTime: string, endTime: string, description?: string): Promise<CalendarEvent> {
        try {
            const accessToken = await this.getAccessToken();

            const event = {
                summary,
                description,
                start: { dateTime: startTime },
                end: { dateTime: endTime },
                reminders: { useDefault: true },
            };

            const response = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(event),
            });

            const data = await response.json();
            if (data.error) throw new Error(data.error.message);

            return data as CalendarEvent;
        } catch (error: unknown) {
            const errMsg = error instanceof Error ? error.message : 'Unknown error';
            console.error('Error creating calendar event:', errMsg);
            throw new Error('Could not create calendar event.');
        }
    }

    async findEventByQuery(query: string): Promise<CalendarEvent | null> {
        try {
            const accessToken = await this.getAccessToken();

            // Search upcoming events (next 30 days) matching the query
            const now = new Date().toISOString();
            const thirtyDaysOut = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

            const params = new URLSearchParams({
                q: query,
                timeMin: now,
                timeMax: thirtyDaysOut,
                singleEvents: 'true',
                orderBy: 'startTime',
                maxResults: '5',
            });

            const response = await fetch(
                `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
                {
                    headers: { 'Authorization': `Bearer ${accessToken}` },
                }
            );

            const data = await response.json();
            if (data.error) throw new Error(data.error.message);

            const events = data.items || [];
            if (events.length === 0) return null;

            return events[0] as CalendarEvent;
        } catch (error: unknown) {
            const errMsg = error instanceof Error ? error.message : 'Unknown error';
            console.error('Error finding calendar event:', errMsg);
            throw new Error('Could not search calendar events.');
        }
    }

    async deleteEvent(eventId: string): Promise<void> {
        try {
            const accessToken = await this.getAccessToken();

            const response = await fetch(
                `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`,
                {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${accessToken}` },
                }
            );

            if (!response.ok && response.status !== 204) {
                const data = await response.json();
                throw new Error(data.error?.message || 'Delete failed');
            }
        } catch (error: unknown) {
            const errMsg = error instanceof Error ? error.message : 'Unknown error';
            console.error('Error deleting calendar event:', errMsg);
            throw new Error('Could not cancel the calendar event.');
        }
    }

    async updateEvent(eventId: string, updates: { startTime?: string; endTime?: string; summary?: string; description?: string }): Promise<CalendarEvent> {
        try {
            const accessToken = await this.getAccessToken();

            const patch: Record<string, unknown> = {};
            if (updates.summary) patch.summary = updates.summary;
            if (updates.description) patch.description = updates.description;
            if (updates.startTime) patch.start = { dateTime: updates.startTime };
            if (updates.endTime) patch.end = { dateTime: updates.endTime };

            const response = await fetch(
                `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`,
                {
                    method: 'PATCH',
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(patch),
                }
            );

            const data = await response.json();
            if (data.error) throw new Error(data.error.message);

            return data as CalendarEvent;
        } catch (error: unknown) {
            const errMsg = error instanceof Error ? error.message : 'Unknown error';
            console.error('Error updating calendar event:', errMsg);
            throw new Error('Could not reschedule the calendar event.');
        }
    }
}
