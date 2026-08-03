export const DEPLOYMENT_VERSION = process.env.NEXT_PUBLIC_DEPLOYMENT_VERSION || 'local-dev';

export const SERVICE_WORKER_URL = `/sw.js?v=${encodeURIComponent(DEPLOYMENT_VERSION)}`;
