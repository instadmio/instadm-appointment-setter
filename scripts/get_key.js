
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function getKey() {
    console.log('Connecting to Supabase...');
    const { data, error } = await supabase
        .from('agent_configs')
        .select('openai_key')
        .neq('openai_key', '')
        .limit(1);

    if (error) {
        console.error('Error fetching key:', error);
    } else if (data && data.length > 0) {
        console.log('FOUND_KEY:', data[0].openai_key);
    } else {
        console.log('No key found in DB');
    }
}

getKey();
