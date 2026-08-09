/**
 * Environment configuration helper
 * Resolves the autonomous interval based on NODE_ENV
 */
import dotenv from 'dotenv';
dotenv.config();

const isDev = (process.env.NODE_ENV || 'development') !== 'production';

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  isDev,

  // Autonomous scheduler interval in seconds
  autonomousInterval: (() => {
    if (process.env.AUTONOMOUS_INTERVAL) {
      return parseInt(process.env.AUTONOMOUS_INTERVAL, 10);
    }
    if (isDev) {
      return parseInt(process.env.DEV_AUTONOMOUS_INTERVAL || '90', 10);
    }
    return parseInt(process.env.PROD_AUTONOMOUS_INTERVAL || '3600', 10);
  })(),

  // LLM
  geminiApiKey: process.env.GEMINI_API_KEY || null,
  openaiApiKey: process.env.OPENAI_API_KEY || null,

  // Database
  dbPath: process.env.DB_PATH || './data/agent.db',

  // CORS
  corsOrigin: process.env.CORS_ORIGIN || '*',
};

export default config;
