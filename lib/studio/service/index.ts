/**
 * Studio service: everything that reads or changes job state goes through here.
 * The MCP tools and the dashboard are thin wrappers around these functions.
 */
export { StudioError, authenticate, hashToken, type Agent } from "./core";
export * from "./pipeline";
export * from "./execution";
export * from "./publishing";
export * from "./research";
export * from "./research-insights";
export * from "./reels-publishing";
export * from "./automation";
