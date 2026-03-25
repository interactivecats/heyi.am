import type { Server } from 'node:http';
export declare function createApp(sessionsBasePath?: string): import("express-serve-static-core").Express;
export declare function startServer(port?: number): Promise<Server>;
