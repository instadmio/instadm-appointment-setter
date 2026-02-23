import axios from 'axios';
import type { ManyChatSubscriber } from '@/types';

export class ManyChatService {
    private apiKey: string;
    private baseUrl = 'https://api.manychat.com/fb';

    constructor(apiKey: string) {
        this.apiKey = apiKey;
    }

    private get headers() {
        return {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
        };
    }

    async sendContent(subscriberId: string, messages: string[]): Promise<void> {
        try {
            for (let i = 0; i < messages.length; i++) {
                const msg = messages[i];
                console.log(`[ManyChat] Sending to ${subscriberId}: ${msg}`);
                await axios.post(
                    `${this.baseUrl}/sending/sendContent`,
                    {
                        subscriber_id: subscriberId,
                        data: {
                            version: 'v2',
                            content: {
                                type: 'instagram',
                                messages: [
                                    {
                                        type: 'text',
                                        text: msg.trim(),
                                    }
                                ]
                            }
                        }
                    },
                    { headers: this.headers }
                );

                // Realistic delay between messages
                if (i < messages.length - 1) {
                    await new Promise(res => setTimeout(res, 2500));
                }
            }
        } catch (error: unknown) {
            const errData = axios.isAxiosError(error) ? error.response?.data : (error instanceof Error ? error.message : error);
            console.error('ManyChat Send Content Failed:', errData);
        }
    }

    async setCustomFields(subscriberId: string, fields: Record<string, string | number | boolean>): Promise<void> {
        try {
            for (const [key, value] of Object.entries(fields)) {
                await axios.post(
                    `${this.baseUrl}/subscriber/setCustomFieldByName`,
                    {
                        subscriber_id: subscriberId,
                        field_name: key,
                        field_value: value,
                    },
                    { headers: this.headers }
                );
            }
        } catch (error: unknown) {
            const errData = axios.isAxiosError(error) ? error.response?.data : (error instanceof Error ? error.message : error);
            console.error('ManyChat Set Fields Failed:', errData);
        }
    }

    async addTag(subscriberId: string, tagId: string | number): Promise<void> {
        try {
            await axios.post(
                `${this.baseUrl}/subscriber/addTag`,
                {
                    subscriber_id: subscriberId,
                    tag_id: tagId,
                },
                { headers: this.headers }
            );
        } catch (error: unknown) {
            const errData = axios.isAxiosError(error) ? error.response?.data : (error instanceof Error ? error.message : error);
            console.error('ManyChat Add Tag Failed:', errData);
        }
    }

    async getSubscriber(subscriberId: string): Promise<ManyChatSubscriber | null> {
        try {
            const response = await axios.get(
                `${this.baseUrl}/subscriber/getInfo?subscriber_id=${subscriberId}`,
                { headers: this.headers }
            );
            return response.data.data as ManyChatSubscriber;
        } catch (error: unknown) {
            const errData = axios.isAxiosError(error) ? error.response?.data : (error instanceof Error ? error.message : error);
            console.error('ManyChat Get Subscriber Failed:', errData);
            return null;
        }
    }

    async removeTag(subscriberId: string, tagId: string | number): Promise<void> {
        try {
            await axios.post(
                `${this.baseUrl}/subscriber/removeTag`,
                {
                    subscriber_id: subscriberId,
                    tag_id: tagId,
                },
                { headers: this.headers }
            );
        } catch (error: unknown) {
            const errData = axios.isAxiosError(error) ? error.response?.data : (error instanceof Error ? error.message : error);
            console.error('ManyChat Remove Tag Failed:', errData);
        }
    }
}
