import axios from 'axios';

export class ScrapeService {
    private apiKey: string;
    private baseUrl = 'https://platform.dataprism.dev/api/v1/tools/instagram/scrape';

    constructor(apiKey: string) {
        this.apiKey = apiKey;
    }

    async scrapeProfile(username: string) {
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

            return response.data;
        } catch (error: any) {
            console.error('Scrape Failed:', error.response?.data || error.message);
            return null; // Fail gracefully
        }
    }
}
