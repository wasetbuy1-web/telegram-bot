import 'dotenv/config';

export const env = {
  BOT_TOKEN: process.env.BOT_TOKEN || '',
  OWNER_ID: Number(process.env.OWNER_ID || 0),
  API_BASE_URL: process.env.API_BASE_URL || '',
  SUPABASE_URL: process.env.SUPABASE_URL || '',
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  /**
   * The warehouse every indirect shipping lookup uses. The bot no longer asks
   * the operator to pick one. 7 = MyUS (US), the only warehouse carrying a
   * full set of carriers in `shipping_rates`.
   */
  DEFAULT_WAREHOUSE_ID: Number(process.env.DEFAULT_WAREHOUSE_ID || 7),
};