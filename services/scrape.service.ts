import axios from 'axios';

export class ScrapeService {
    private apiKey: string;
    private baseUrl = 'https://platform.dataprism.dev/api/v1/tools/instagram/scrape';

    constructor(apiKey: string) {
        this.apiKey = apiKey;
    }

    async scrapeProfile(username: string): Promise<Record<string, unknown> | null> {
        if (!this.apiKey) {
            console.warn('Scraper API Key missing');
            return null;
        }

        try {
            const response = await axios.post(
                this.baseUrl,
                {
                    username,
                    posts: 3,
                    comments: 0,
                },
                {
                    headers: {
                        'X-API-KEY': this.apiKey,
                        'Content-Type': 'application/json',
                    },
                }
            );

            return response.data as Record<string, unknown>;
        } catch (error: unknown) {
            const errData = axios.isAxiosError(error) ? error.response?.data : (error instanceof Error ? error.message : error);
            console.error('Scrape Failed:', errData);
            return null;
        }
    }
}
