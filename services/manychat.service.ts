import axios from 'axios';

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

    async sendContent(subscriberId: string, messages: string[]) {
        try {
            // ManyChat often takes one message block at a time or an array
            // We will send messages sequentially if multiple to ensure order
            for (const msg of messages) {
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
                                        text: msg,
                                    }
                                ]
                            }
                        }
                    },
                    { headers: this.headers }
                );
            }
        } catch (error: any) {
            console.error('ManyChat Send Content Failed:', error.response?.data || error.message);
        }
    }

    async setCustomFields(subscriberId: string, fields: Record<string, string | number | boolean>) {
        try {
            for (const [key, value] of Object.entries(fields)) {
                // Note: ManyChat API requires field_id usually, but sometimes field_name works if enabled
                // Here we assume field_name for simplicity based on the n8n logic
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
        } catch (error: any) {
            console.error('ManyChat Set Fields Failed:', error.response?.data || error.message);
        }
    }

    async addTag(subscriberId: string, tagId: string | number) {
        try {
            await axios.post(
                `${this.baseUrl}/subscriber/addTag`,
                {
                    subscriber_id: subscriberId,
                    tag_id: tagId,
                },
                { headers: this.headers }
            );
        } catch (error: any) {
            console.error('ManyChat Add Tag Failed:', error.response?.data || error.message);
        }
    }

    async getSubscriber(subscriberId: string) {
        try {
            const response = await axios.get(
                `${this.baseUrl}/subscriber/getInfo?subscriber_id=${subscriberId}`,
                { headers: this.headers }
            );
            return response.data.data;
        } catch (error: any) {
            console.error('ManyChat Get Subscriber Failed:', error.response?.data || error.message);
            return null;
        }
    }

    async removeTag(subscriberId: string, tagId: string | number) {
        try {
            await axios.post(
                `${this.baseUrl}/subscriber/removeTag`,
                {
                    subscriber_id: subscriberId,
                    tag_id: tagId,
                },
                { headers: this.headers }
            );
        } catch (error: any) {
            console.error('ManyChat Remove Tag Failed:', error.response?.data || error.message);
        }
    }
}
