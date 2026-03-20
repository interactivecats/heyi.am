// Optional dependencies — dynamically imported, may not be installed
declare module "better-sqlite3" {
  const Database: any;
  export default Database;
}

declare module "puppeteer" {
  export function launch(options?: any): Promise<any>;
}
