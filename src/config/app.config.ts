export const ENV_FILE_PATHS = [
  '.env.development.local',
  '.env.development',
  '.env',
];

export const NODE_ENV_KEY = 'NODE_ENV';
export const PORT_KEY = 'PORT';
export const PRODUCTION = 'production';
export const DEFAULT_PORT = 3000;

// Database (PostgreSQL)
export const DB_HOST_KEY = 'DB_HOST';
export const DB_PORT_KEY = 'DB_PORT';
export const DB_USERNAME_KEY = 'DB_USERNAME';
// sunlint-disable-next-line C041 -- this is the env variable name, not a secret value
export const DB_PASSWORD_KEY = 'DB_PASSWORD';
export const DB_NAME_KEY = 'DB_NAME';
export const DEFAULT_DB_HOST = 'localhost';
export const DEFAULT_DB_PORT = 5432;

// Redis
export const REDIS_HOST_KEY = 'REDIS_HOST';
export const REDIS_PORT_KEY = 'REDIS_PORT';
// sunlint-disable-next-line C041 -- this is the env variable name, not a secret value
export const REDIS_PASSWORD_KEY = 'REDIS_PASSWORD';
export const DEFAULT_REDIS_HOST = 'localhost';
export const DEFAULT_REDIS_PORT = 6379;

// JWT (expiry values are in seconds)
// sunlint-disable-next-line C041 -- this is the env variable name, not a secret value
export const JWT_ACCESS_SECRET_KEY = 'JWT_ACCESS_SECRET';
export const JWT_ACCESS_EXPIRES_IN_KEY = 'JWT_ACCESS_EXPIRES_IN';
// sunlint-disable-next-line C041 -- this is the env variable name, not a secret value
export const JWT_REFRESH_SECRET_KEY = 'JWT_REFRESH_SECRET';
export const JWT_REFRESH_EXPIRES_IN_KEY = 'JWT_REFRESH_EXPIRES_IN';
export const DEFAULT_JWT_ACCESS_EXPIRES_IN = 86400;
export const DEFAULT_JWT_REFRESH_EXPIRES_IN = 604800;

// Rate limiting of /auth/* (per client IP and per endpoint)
export const AUTH_THROTTLE_TTL_KEY = 'AUTH_THROTTLE_TTL';
export const AUTH_THROTTLE_LIMIT_KEY = 'AUTH_THROTTLE_LIMIT';
export const DEFAULT_AUTH_THROTTLE_TTL = 60; // seconds
export const DEFAULT_AUTH_THROTTLE_LIMIT = 10; // requests per window

// Uploaded files 
export const UPLOAD_DIR_KEY = 'UPLOAD_DIR';
export const DEFAULT_UPLOAD_DIR = 'uploads';
